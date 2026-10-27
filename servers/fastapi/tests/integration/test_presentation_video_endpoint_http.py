import asyncio
import uuid
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.v1.ppt.endpoints.presentation as presentation_endpoint
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.async_task import AsyncTaskModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from models.sql.presentation_video import PresentationVideoModel
from models.sql.user import User
from services.database import get_async_session
from services.presentation_video_service import (
    PresentationVideoConfigurationError,
    PresentationVideoRenderError,
    PresentationVideoResult,
)
from services.speaker_note_tts_service import SpeakerNoteTTSConfigurationError


def _configure_video(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    monkeypatch.setenv("OPENAI_COMPAT_TTS_BASE_URL", "https://tts.example/v1")
    monkeypatch.setenv("OPENAI_COMPAT_TTS_API_KEY", "test-key")
    monkeypatch.setenv(
        "OPENAI_COMPAT_TTS_MODEL", "google/gemini-3.1-flash-tts-preview"
    )
    monkeypatch.delenv("OPENAI_COMPAT_TTS_VOICE", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_FAST_API", raising=False)
    # ffmpeg availability is exercised as its own test case; everywhere else
    # it is assumed present so tests don't depend on the host having it.
    monkeypatch.setattr(presentation_endpoint, "ffmpeg_available", lambda: True)


def _build_client(tmp_path, monkeypatch, *, with_slides=True, deck_language="Italian"):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'video_http.db'}")

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
            await connection.run_sync(PresentationVideoModel.__table__.create)
            await connection.run_sync(AsyncTaskModel.__table__.create)
        async with session_maker() as session:
            session.add(
                PresentationModel(
                    id=presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Rassegna annuale",
                    n_slides=2 if with_slides else 0,
                    language=deck_language,
                    title="Rassegna Annuale",
                )
            )
            if with_slides:
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

    asyncio.run(seed())
    asyncio.run(engine.dispose())

    async def override_session():
        async with session_maker() as session:
            yield session

    monkeypatch.setattr(presentation_endpoint, "async_session_maker", session_maker)

    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER, prefix="/api/v1/ppt")
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), presentation_id, session_maker


def _fake_video_model(
    presentation_id, *, language="it", language_name="Italian", preset="1080p-30-soft"
):
    return PresentationVideoModel(
        presentation=presentation_id,
        language=language,
        language_name=language_name,
        preset=preset,
        path=f"/tmp/does-not-exist/{uuid.uuid4()}.mp4",
        url=f"/app_data/videos/{presentation_id}/{uuid.uuid4()}.mp4",
        subtitles_mode="soft",
        subtitle_path=None,
        subtitle_url=None,
        resolution="1080p",
        width=1920,
        height=1080,
        fps=30,
        slide_count=2,
        duration_seconds=12.5,
        size_bytes=1024,
        source_hash="hash",
    )


def _install_fake_generate(monkeypatch, *, reused=False):
    """Mock the service call at the endpoint boundary.

    Adds and commits a video row on the same session the endpoint is using,
    so the render is observable exactly like a real one would be, without
    spawning ffmpeg or Chromium.
    """

    async def fake_generate(
        *,
        presentation,
        slides,
        language,
        sql_session,
        options=None,
        regenerate=False,
        cookie_header=None,
        on_progress=None,
    ):
        if on_progress is not None:
            result = on_progress({"phase": "render", "completed": 1, "total": 1})
            if hasattr(result, "__await__"):
                await result
        code = "it" if language in ("it", "Italian") else "en"
        name = {"it": "Italian", "en": "English"}[code]
        video = _fake_video_model(presentation.id, language=code, language_name=name)
        sql_session.add(video)
        await sql_session.commit()
        await sql_session.refresh(video)
        return PresentationVideoResult(video=video, reused=reused, skipped=[], narration=None)

    return patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    )


def test_sync_post_happy_path_returns_video_response(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    with _install_fake_generate(monkeypatch):
        response = client.post(base, json={"language": "it"})

    assert response.status_code == 200, response.text
    body = response.json()
    video = body["video"]
    assert video["language"] == "it"
    assert video["url"].startswith("/app_data/")
    assert "path" not in video
    # What the run did travels with the render: a sync caller has to be able to
    # see that a slide went out silent, which until now only the async task
    # reported in its task data.
    assert body["reused"] is False
    assert isinstance(body["skipped"], list)


def test_async_post_returns_async_task_model(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    with _install_fake_generate(monkeypatch):
        response = client.post(f"{base}/async", json={"language": "it"})

    assert response.status_code == 200, response.text
    task = response.json()
    assert task["type"] == "presentation.video"


def test_async_post_validates_before_queueing(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    response = client.post(f"{base}/async", json={"language": "Klingon"})

    assert response.status_code == 422

    async def count_tasks():
        async with sessions() as session:
            return len(list(await session.scalars(select(AsyncTaskModel))))

    assert asyncio.run(count_tasks()) == 0


def test_sync_post_ffmpeg_unavailable_is_a_bad_request(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    async def fake_generate(**_kwargs):
        raise PresentationVideoConfigurationError("ffmpeg is not installed")

    with patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    ):
        response = client.post(base, json={"language": "it"})

    assert response.status_code == 400
    assert "ffmpeg" in response.json()["detail"]


def test_async_post_ffmpeg_unavailable_is_a_bad_request(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    monkeypatch.setattr(presentation_endpoint, "ffmpeg_available", lambda: False)

    response = client.post(f"{base}/async", json={"language": "it"})

    assert response.status_code == 400


def test_deck_with_no_slides_is_a_bad_request(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(
        tmp_path, monkeypatch, with_slides=False
    )
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    assert client.post(base, json={"language": "it"}).status_code == 400
    assert client.post(f"{base}/async", json={"language": "it"}).status_code == 400


def test_unknown_presentation_is_404_on_all_endpoints(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, _presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    missing_base = f"/api/v1/ppt/presentation/{uuid.uuid4()}/video"

    assert client.post(missing_base, json={"language": "it"}).status_code == 404
    assert (
        client.post(f"{missing_base}/async", json={"language": "it"}).status_code
        == 404
    )
    assert client.get(missing_base).status_code == 404
    assert client.delete(missing_base).status_code == 404


def test_get_with_no_video_is_404(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    assert client.get(base).status_code == 404


def _seed_video_rows(session_maker, presentation_id, languages):
    async def seed():
        async with session_maker() as session:
            for language, name in languages:
                session.add(
                    _fake_video_model(
                        presentation_id, language=language, language_name=name
                    )
                )
            await session.commit()

    asyncio.run(seed())


def test_get_across_two_languages_without_language_is_409(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    _seed_video_rows(
        sessions, presentation_id, [("it", "Italian"), ("en", "English")]
    )

    response = client.get(base)

    assert response.status_code == 409
    assert "it" in response.json()["detail"]
    assert "en" in response.json()["detail"]


def test_get_with_language_returns_just_that_one(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    _seed_video_rows(
        sessions, presentation_id, [("it", "Italian"), ("en", "English")]
    )

    response = client.get(base, params={"language": "it"})

    assert response.status_code == 200
    videos = response.json()["videos"]
    assert len(videos) == 1
    assert videos[0]["language"] == "it"


def test_delete_returns_count_and_is_idempotent(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    _seed_video_rows(
        sessions, presentation_id, [("it", "Italian"), ("en", "English")]
    )

    first = client.delete(base)
    assert first.status_code == 200
    assert first.json() == {"deleted": 2}

    second = client.delete(base)
    assert second.status_code == 200
    assert second.json() == {"deleted": 0}


def test_invalid_resolution_fps_subtitles_are_422(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"

    assert client.post(
        base, json={"language": "it", "resolution": "4k"}
    ).status_code == 422
    assert client.post(base, json={"language": "it", "fps": 15}).status_code == 422
    assert client.post(
        base, json={"language": "it", "subtitles": "hardcoded"}
    ).status_code == 422


def test_generate_missing_audio_with_unconfigured_tts_is_a_bad_request(
    tmp_path, monkeypatch
):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    monkeypatch.delenv("OPENAI_COMPAT_TTS_API_KEY", raising=False)

    async def fake_generate(**_kwargs):
        raise SpeakerNoteTTSConfigurationError("OPENAI_COMPAT_TTS_API_KEY is not set")

    with patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    ):
        sync_response = client.post(
            base, json={"language": "it", "generate_missing_audio": True}
        )
    assert sync_response.status_code == 400

    async_response = client.post(
        f"{base}/async", json={"language": "it", "generate_missing_audio": True}
    )
    assert async_response.status_code == 400


def test_animate_reaches_the_renderer_and_reports_back(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    seen = {}

    async def fake_generate(*, presentation, sql_session, options=None, **_kwargs):
        seen["options"] = options
        video = _fake_video_model(presentation.id, preset=options.preset)
        sql_session.add(video)
        await sql_session.commit()
        await sql_session.refresh(video)
        return PresentationVideoResult(
            video=video,
            reused=False,
            animation={"requested": True, "applied": True, "animated_slides": 2},
        )

    with patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    ):
        response = client.post(
            f"/api/v1/ppt/presentation/{presentation_id}/video",
            json={"language": "it", "animate": True},
        )

    assert response.status_code == 200, response.text
    assert seen["options"].animate is True
    body = response.json()
    assert body["video"]["preset"].endswith("-anim")
    assert body["animation"] == {"requested": True, "applied": True, "animated_slides": 2}


def test_crossfade_reaches_the_renderer_and_defaults_to_half_a_second(
    tmp_path, monkeypatch
):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    seen = []

    async def fake_generate(*, presentation, sql_session, options=None, **_kwargs):
        seen.append(options)
        video = _fake_video_model(presentation.id, preset=options.preset)
        sql_session.add(video)
        await sql_session.commit()
        await sql_session.refresh(video)
        return PresentationVideoResult(video=video, reused=False)

    base = f"/api/v1/ppt/presentation/{presentation_id}/video"
    with patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    ):
        assert client.post(base, json={"language": "it"}).status_code == 200
        response = client.post(base, json={"language": "it", "crossfade_seconds": 0})

    assert response.status_code == 200, response.text
    assert [options.crossfade_seconds for options in seen] == [0.5, 0]
    assert response.json()["video"]["preset"].endswith("-cut")


def test_crossfade_out_of_range_is_422(tmp_path, monkeypatch):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)

    response = client.post(
        f"/api/v1/ppt/presentation/{presentation_id}/video",
        json={"language": "it", "crossfade_seconds": 2},
    )

    assert response.status_code == 422


def test_avatars_flag_reaches_the_renderer_and_the_summary_comes_back(
    tmp_path, monkeypatch
):
    _configure_video(monkeypatch, tmp_path)
    client, presentation_id, _sessions = _build_client(tmp_path, monkeypatch)
    seen = {}
    summary = {
        "requested": False,
        "applied_slides": [],
        "stale": [],
        "skipped": [{"slide_index": 0, "reason": "disabled"}],
        "duration_mismatch": [],
    }

    async def fake_generate(*, presentation, sql_session, options=None, **_kwargs):
        seen["options"] = options
        video = _fake_video_model(presentation.id, preset=options.preset)
        sql_session.add(video)
        await sql_session.commit()
        await sql_session.refresh(video)
        return PresentationVideoResult(video=video, reused=False, avatars=summary)

    with patch.object(
        presentation_endpoint, "generate_presentation_video", side_effect=fake_generate
    ):
        response = client.post(
            f"/api/v1/ppt/presentation/{presentation_id}/video",
            json={"language": "it", "avatars": False},
        )

    assert response.status_code == 200, response.text
    assert seen["options"].avatars is False
    assert response.json()["avatars"] == summary
