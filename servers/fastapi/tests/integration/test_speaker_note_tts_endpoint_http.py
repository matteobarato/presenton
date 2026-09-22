import asyncio
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.v1.ppt.endpoints.presentation as presentation_endpoint
import services.speaker_note_tts_service as tts_service
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.async_task import AsyncTaskModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from models.sql.user import User
from services.database import get_async_session

# MPEG 1 Layer III, 128 kbps, 44100 Hz: 417 bytes per frame.
MP3 = (b"\xff\xfb\x90\x00" + b"\x00" * 413) * 8


def _configure_tts(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    monkeypatch.setenv("OPENAI_COMPAT_TTS_BASE_URL", "https://tts.example/v1")
    monkeypatch.setenv("OPENAI_COMPAT_TTS_API_KEY", "test-key")
    monkeypatch.setenv(
        "OPENAI_COMPAT_TTS_MODEL", "google/gemini-3.1-flash-tts-preview"
    )
    monkeypatch.delenv("OPENAI_COMPAT_TTS_VOICE", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_FAST_API", raising=False)


def _build_client(tmp_path, monkeypatch, *, deck_language="Italian"):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'tts_http.db'}")

    # The app enables this on its own engine; the tests need it too, because
    # deleting a deck relies on the database cascading to its audio rows.
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    presentation_id = uuid.uuid4()

    async def seed():
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)
            await connection.run_sync(SpeakerNoteAudioModel.__table__.create)
            await connection.run_sync(AsyncTaskModel.__table__.create)
        async with session_maker() as session:
            session.add(
                PresentationModel(
                    id=presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Rassegna annuale",
                    n_slides=2,
                    language=deck_language,
                    title="Rassegna Annuale",
                )
            )
            session.add(
                SlideModel(
                    presentation=presentation_id,
                    layout_group="general",
                    layout="title",
                    index=0,
                    content={"title": "Ricavi"},
                    speaker_note="I ricavi sono cresciuti del trentaquattro percento.",
                )
            )
            session.add(
                SlideModel(
                    presentation=presentation_id,
                    layout_group="general",
                    layout="bulleted-list",
                    index=1,
                    content={"title": "Prossimi passi"},
                    speaker_note="Assumeremo otto ingegneri nel prossimo trimestre.",
                )
            )
            await session.commit()

    # Each asyncio.run gets its own loop, so the connections it opened are
    # closed with it rather than finalized later against a dead loop.
    asyncio.run(seed())
    asyncio.run(engine.dispose())

    async def override_session():
        async with session_maker() as session:
            yield session

    # The background task opens its own sessions, so it is pointed at the same
    # test database as the request-scoped ones.
    monkeypatch.setattr(presentation_endpoint, "async_session_maker", session_maker)

    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER, prefix="/api/v1/ppt")
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), presentation_id, session_maker


def _stored_audios(session_maker):
    async def read():
        async with session_maker() as session:
            rows = list(
                await session.scalars(
                    select(SpeakerNoteAudioModel).order_by(
                        SpeakerNoteAudioModel.slide_index
                    )
                )
            )
        await session_maker.kw["bind"].dispose()
        return rows

    return asyncio.run(read())


def test_supported_languages_include_italian(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, _presentation_id, _sessions = _build_client(tmp_path, monkeypatch)

    response = client.get("/api/v1/ppt/presentation/speaker-notes/tts/languages")

    assert response.status_code == 200
    languages = {entry["code"]: entry["name"] for entry in response.json()}
    assert languages["it"] == "Italian"


def test_narrates_a_deck_then_serves_it_whole_and_slide_by_slide(
    tmp_path, monkeypatch
):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech", return_value=MP3), \
         patch.object(tts_service, "translate_speaker_notes") as translate:
        generated = client.post(base, json={"language": "Italian"})

    assert generated.status_code == 200, generated.text
    # The deck is already Italian, so nothing is translated.
    translate.assert_not_called()
    body = generated.json()
    assert body["language"] == "it"
    assert body["language_name"] == "Italian"
    assert body["generated_slide_indexes"] == [0, 1]
    assert [audio["slide_index"] for audio in body["audios"]] == [0, 1]
    assert body["total_duration_seconds"] == pytest.approx(2 * 8 * 1152 / 44100, abs=0.01)
    first = body["audios"][0]
    assert first["url"].startswith("/app_data/audio/")
    assert first["format"] == "mp3"
    assert first["translated"] is False
    assert first["text"].startswith("I ricavi")
    # The filesystem path never leaves the server.
    assert "path" not in first

    listed = client.get(base)
    assert listed.status_code == 200
    assert [audio["slide_index"] for audio in listed.json()["audios"]] == [0, 1]

    one = client.get(f"{base}/1", params={"language": "it"})
    assert one.status_code == 200
    assert one.json()["slide_index"] == 1
    assert one.json()["url"].endswith(".mp3")

    assert client.get(f"{base}/9").status_code == 404


def test_a_deck_in_another_language_is_translated_before_it_is_read(
    tmp_path, monkeypatch
):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(
        tmp_path, monkeypatch, deck_language="English"
    )
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    async def fake_translate(*, notes, target_language, **_kwargs):
        assert target_language == "Italian"
        return {index: f"tradotto: {note}" for index, note in notes.items()}

    with patch.object(tts_service, "synthesize_speech", return_value=MP3), \
         patch.object(
             tts_service, "translate_speaker_notes", side_effect=fake_translate
         ):
        response = client.post(base, json={"language": "it"})

    assert response.status_code == 200, response.text
    audios = response.json()["audios"]
    assert all(audio["translated"] is True for audio in audios)
    assert all(audio["text"].startswith("tradotto: ") for audio in audios)


def test_an_unsupported_language_is_refused(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech") as synthesize:
        response = client.post(base, json={"language": "Klingon"})

    assert response.status_code == 422
    assert "Italian (it)" in response.json()["detail"]
    synthesize.assert_not_called()


def test_an_unknown_slide_index_is_refused(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    response = client.post(base, json={"language": "it", "slide_indexes": [0, 7]})

    assert response.status_code == 422
    assert "7" in response.json()["detail"]


def test_an_unconfigured_provider_is_reported_as_a_bad_request(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    monkeypatch.delenv("OPENAI_COMPAT_TTS_API_KEY", raising=False)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    response = client.post(base, json={"language": "it"})

    assert response.status_code == 400
    assert "OPENAI_COMPAT_TTS_API_KEY" in response.json()["detail"]


def test_a_missing_presentation_is_reported(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, _presentation_id, _sessions = _build_client(tmp_path, monkeypatch)

    response = client.post(
        f"/api/v1/ppt/presentation/{uuid.uuid4()}/speaker-notes/tts",
        json={"language": "it"},
    )

    assert response.status_code == 404


def test_narration_can_be_deleted(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech", return_value=MP3):
        client.post(base, json={"language": "it"})

    deleted = client.delete(base)
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": 2}
    assert client.get(base).json()["audios"] == []


def test_the_async_variant_reports_progress_and_finishes(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech", return_value=MP3):
        # TestClient runs background tasks before the response is handed back.
        queued = client.post(f"{base}/async", json={"language": "Italian"})

    assert queued.status_code == 200, queued.text
    task = queued.json()
    assert task["type"] == "presentation.speaker-notes.tts"
    assert task["data"]["total_slides"] == 2
    assert task["data"]["language"] == "it"

    listed = client.get(base)
    assert [audio["slide_index"] for audio in listed.json()["audios"]] == [0, 1]


def test_the_async_variant_refuses_a_bad_request_before_queueing(
    tmp_path, monkeypatch
):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    assert client.post(f"{base}/async", json={"language": "Klingon"}).status_code == 422

    monkeypatch.delenv("OPENAI_COMPAT_TTS_MODEL", raising=False)
    assert client.post(f"{base}/async", json={"language": "it"}).status_code == 400


def test_deleting_a_presentation_takes_its_narration_with_it(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech", return_value=MP3):
        client.post(base, json={"language": "it"})

    paths = [audio.path for audio in _stored_audios(sessions)]
    assert len(paths) == 2
    assert all(os.path.isfile(path) for path in paths)

    deleted = client.delete(f"/api/v1/ppt/presentation/{presentation_id}")

    assert deleted.status_code == 204, deleted.text
    assert _stored_audios(sessions) == []
    assert not any(os.path.exists(path) for path in paths)
    # The deck's audio folder goes too, once the files in it are gone.
    assert not os.path.isdir(os.path.dirname(paths[0]))


def test_a_duplicated_presentation_starts_without_narration(tmp_path, monkeypatch):
    _configure_tts(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts"

    with patch.object(tts_service, "synthesize_speech", return_value=MP3):
        client.post(base, json={"language": "it"})

    duplicated = client.post(f"/api/v1/ppt/presentation/{presentation_id}/duplicate")
    assert duplicated.status_code == 200, duplicated.text
    copy_id = duplicated.json()["id"]
    assert copy_id != str(presentation_id)

    copy_audios = client.get(
        f"/api/v1/ppt/presentation/{copy_id}/speaker-notes/tts"
    )
    assert copy_audios.status_code == 200
    assert copy_audios.json()["audios"] == []
    # The original keeps its narration.
    assert len(client.get(base).json()["audios"]) == 2
