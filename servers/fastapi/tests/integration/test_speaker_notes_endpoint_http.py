import asyncio
import uuid
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.v1.ppt.endpoints.presentation as presentation_endpoint
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from services.database import get_async_session

SMART_HTML = (
    '<section data-slide-type="content" class="relative h-[720px] w-[1280px] '
    "overflow-hidden\"><h1>Revenue</h1><p>ARR up 34%</p></section>"
)


def _build_client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'notes.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    presentation_id = uuid.uuid4()

    async def seed():
        async with engine.begin() as connection:
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)
        async with session_maker() as session:
            session.add(
                PresentationModel(
                    id=presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Annual review",
                    n_slides=2,
                    language="English",
                    title="Annual Review",
                    layout=None,
                    fonts=None,
                    include_title_slide=True,
                )
            )
            session.add(
                SlideModel(
                    presentation=presentation_id,
                    layout_group="smart-html",
                    layout="smart-html",
                    index=0,
                    content={"title": "Revenue"},
                    html_content=SMART_HTML,
                    speaker_note="",
                )
            )
            session.add(
                SlideModel(
                    presentation=presentation_id,
                    layout_group="general",
                    layout="bulleted-list",
                    index=1,
                    content={"title": "Next steps", "items": ["Hire 8 engineers"]},
                    speaker_note="Existing closing note.",
                )
            )
            await session.commit()

    asyncio.run(seed())

    async def override_session():
        async with session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER, prefix="/api/v1/ppt")
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), presentation_id


def test_speaker_notes_endpoint_backfills_a_mixed_deck_over_http(tmp_path):
    client, presentation_id = _build_client(tmp_path)
    calls = []

    async def fake_notes(**kwargs):
        calls.append(kwargs)
        return {0: "Open on the revenue trend."}

    with patch.object(
        presentation_endpoint, "generate_speaker_notes", new=fake_notes
    ):
        response = client.post(
            f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes"
        )

    assert response.status_code == 200
    body = response.json()
    assert [slide["speaker_note"] for slide in body["slides"]] == [
        "Open on the revenue trend.",
        "Existing closing note.",
    ]
    # Only the slide without a note is generated, and the note that already
    # exists is handed over as narration context.
    assert calls[0]["indexes"] == [0]
    assert calls[0]["known_notes"] == {1: "Existing closing note."}
    assert calls[0]["slides"][0]["html"] == SMART_HTML
    assert calls[0]["slides"][1]["content"]["items"] == ["Hire 8 engineers"]

    # The note was persisted, so a second call has nothing left to write.
    with patch.object(
        presentation_endpoint,
        "generate_speaker_notes",
        new=fake_notes,
    ):
        again = client.post(
            f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes"
        )
    assert again.status_code == 200
    assert len(calls) == 1


def test_speaker_notes_endpoint_regenerates_selected_slides_over_http(tmp_path):
    client, presentation_id = _build_client(tmp_path)
    calls = []

    async def fake_notes(**kwargs):
        calls.append(kwargs)
        return {1: "Rewritten closing note."}

    with patch.object(
        presentation_endpoint, "generate_speaker_notes", new=fake_notes
    ):
        response = client.post(
            f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes",
            json={"slide_indexes": [1], "regenerate": True},
        )

    assert response.status_code == 200
    assert calls[0]["indexes"] == [1]
    assert [slide["speaker_note"] for slide in response.json()["slides"]] == [
        "",
        "Rewritten closing note.",
    ]


def test_speaker_notes_endpoint_reports_unknown_slides_over_http(tmp_path):
    client, presentation_id = _build_client(tmp_path)
    response = client.post(
        f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes",
        json={"slide_indexes": [4]},
    )
    assert response.status_code == 422
    assert "4" in response.json()["detail"]


def test_speaker_notes_endpoint_reports_a_missing_presentation_over_http(tmp_path):
    client, _ = _build_client(tmp_path)
    response = client.post(
        f"/api/v1/ppt/presentation/{uuid.uuid4()}/speaker-notes"
    )
    assert response.status_code == 404
