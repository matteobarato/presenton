"""Fixtures shared by the slide video and avatar endpoint tests."""

import asyncio
import struct
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.v1.ppt.endpoints.presentation as presentation_endpoint
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from api.v1.ppt.endpoints.slide_avatars import SLIDE_AVATARS_ROUTER
from models.sql.async_task import AsyncTaskModel
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_video import PresentationVideoModel
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from models.sql.user import User
from services.database import get_async_session


def _box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + kind + payload


def _mp4(width: int = 640, height: int = 360, duration_ms: int = 4000) -> bytes:
    """A minimal MP4: enough boxes for the metadata reader, no media."""
    mvhd = _box(
        b"mvhd",
        b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, 1000, duration_ms) + b"\x00" * 80,
    )
    tkhd = _box(
        b"tkhd",
        b"\x00\x00\x00\x07"
        + struct.pack(">IIIII", 0, 0, 1, 0, duration_ms)
        + b"\x00" * 8
        + b"\x00" * 8
        + b"\x00" * 36
        + struct.pack(">II", width << 16, height << 16),
    )
    return (
        _box(b"ftyp", b"isom\x00\x00\x02\x00isomiso2mp41")
        + _box(b"moov", mvhd + _box(b"trak", tkhd))
        + _box(b"mdat", b"\x00" * 64)
    )


def _template_ui() -> dict:
    return {
        "id": "title",
        "description": "Title slide.",
        "components": [],
        "elements": [
            {
                "type": "text",
                "name": "title",
                "decorative": False,
                "position": {"x": 80, "y": 80},
                "size": {"width": 800, "height": 120},
                "runs": [{"text": "Ricavi"}],
                "max_length": 80,
                "min_length": 1,
            }
        ],
    }


def _build_client(tmp_path, monkeypatch):
    app_data = tmp_path / "app_data"
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(app_data))
    monkeypatch.delenv("NEXT_PUBLIC_FAST_API", raising=False)
    monkeypatch.delenv("SLIDE_VIDEO_MAX_UPLOAD_MB", raising=False)

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'video_http.db'}")

    # Deleting a deck or a slide relies on the database cascading to its
    # audio and video rows, as the app's own engine does.
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    presentation_id = uuid.uuid4()
    slide_ids = [uuid.uuid4() for _ in range(3)]

    async def seed():
        async with engine.begin() as connection:
            for model in (
                User,
                PresentationModel,
                SlideModel,
                SpeakerNoteAudioModel,
                SlideVideoModel,
                PresentationVideoModel,
                AsyncTaskModel,
            ):
                await connection.run_sync(model.__table__.create)
        async with session_maker() as session:
            session.add(
                PresentationModel(
                    id=presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Rassegna annuale",
                    n_slides=3,
                    language="Italian",
                    title="Rassegna Annuale",
                )
            )
            session.add_all(
                [
                    SlideModel(
                        id=slide_ids[0],
                        presentation=presentation_id,
                        layout_group="general",
                        layout="title",
                        index=0,
                        content={"title": "Ricavi"},
                        speaker_note="I ricavi sono cresciuti del trentaquattro percento.",
                        ui=_template_ui(),
                    ),
                    SlideModel(
                        id=slide_ids[1],
                        presentation=presentation_id,
                        layout_group="general",
                        layout="title",
                        index=1,
                        content={"title": "Prossimi passi"},
                        speaker_note="Assumeremo otto ingegneri.",
                        ui=_template_ui(),
                    ),
                    SlideModel(
                        id=slide_ids[2],
                        presentation=presentation_id,
                        layout_group="smart-html",
                        layout="smart",
                        index=2,
                        content={},
                        html_content="<div>Grazie</div>",
                        speaker_note="Grazie a tutti.",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed())
    asyncio.run(engine.dispose())

    async def override_session():
        async with session_maker() as session:
            yield session

    monkeypatch.setattr(presentation_endpoint, "async_session_maker", session_maker)

    app = FastAPI()
    # Avatar routes first, as in the real router: the literal segments they add
    # must win over `/{id}/videos/{slide_index}`.
    app.include_router(SLIDE_AVATARS_ROUTER, prefix="/api/v1/ppt")
    app.include_router(PRESENTATION_ROUTER, prefix="/api/v1/ppt")
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), presentation_id, slide_ids, session_maker, app_data


def _run(session_maker, work):
    async def go():
        async with session_maker() as session:
            result = await work(session)
        await session_maker.kw["bind"].dispose()
        return result

    return asyncio.run(go())


def _rows(session_maker, model):
    async def read(session):
        return list(await session.scalars(select(model)))

    return _run(session_maker, read)



def _upload(client, presentation_id, index, data=None, filename="avatar.mp4", **form):
    return client.put(
        f"/api/v1/ppt/presentation/{presentation_id}/videos/{index}",
        files={"file": (filename, data if data is not None else _mp4(), "video/mp4")},
        data={key: str(value) for key, value in form.items()},
    )


def _slide_ui(client, presentation_id, index):
    deck = client.get(f"/api/v1/ppt/presentation/{presentation_id}").json()
    return next(slide for slide in deck["slides"] if slide["index"] == index)["ui"]


def _placeholders(ui):
    # A placeholder sits in a component of its own; one in the root
    # `elements` is the older shape, lifted on the next write.
    elements = list(ui.get("elements") or [])
    for component in ui.get("components") or []:
        elements.extend(component.get("elements") or [])
    return [element for element in elements if element.get("video_placeholder") is True]
