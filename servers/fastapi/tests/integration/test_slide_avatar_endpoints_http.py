from _video_http_helpers import _build_client, _placeholders, _rows, _run, _slide_ui, _upload
from models.sql.slide_video import SlideVideoModel

BASE = "/api/v1/ppt/presentation"


def test_post_placeholder_adds_one_and_the_slide_shows_it(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = client.post(f"{BASE}/{presentation_id}/videos/0/placeholder", json={})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slide_index"] == 0
    assert body["slide_id"] == str(slide_ids[0])
    assert body["placeholder"] == {
        "position": {"x": 936, "y": 516},
        "size": {"width": 320, "height": 180},
    }
    assert len(_placeholders(body["ui"])) == 1

    # Posting again moves it rather than adding a second one.
    moved = client.post(
        f"{BASE}/{presentation_id}/videos/0/placeholder", json={"x": 10, "y": 20}
    )
    assert moved.json()["placeholder"]["position"] == {"x": 10, "y": 20}
    assert len(_placeholders(_slide_ui(client, presentation_id, 0))) == 1


def test_post_placeholder_on_a_non_template_slide_is_422(tmp_path, monkeypatch):
    client, presentation_id, *_ = _build_client(tmp_path, monkeypatch)

    response = client.post(f"{BASE}/{presentation_id}/videos/2/placeholder", json={})

    assert response.status_code == 422


def test_delete_placeholder_after_upload_removes_video_and_placeholder(
    tmp_path, monkeypatch
):
    client, presentation_id, _ids, sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    assert _upload(client, presentation_id, 0).status_code == 200

    response = client.delete(f"{BASE}/{presentation_id}/videos/0/placeholder")

    assert response.status_code == 200
    assert response.json() == {"removed": True}
    assert client.get(f"{BASE}/{presentation_id}/videos/0").status_code == 404
    assert _placeholders(_slide_ui(client, presentation_id, 0)) == []
    assert _rows(sessions, SlideVideoModel) == []
    again = client.delete(f"{BASE}/{presentation_id}/videos/0/placeholder")
    assert again.json() == {"removed": False}


def _png(size=(40, 30)) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, "blue").save(buffer, "PNG")
    return buffer.getvalue()


def _put_portrait(client, presentation_id, data=None, filename="me.png"):
    return client.put(
        f"{BASE}/{presentation_id}/videos/portrait",
        files={"file": (filename, data if data is not None else _png(), "image/png")},
    )


def test_portrait_put_get_and_delete(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    # A literal segment, not swallowed by /{slide_index}.
    assert client.get(f"{BASE}/{presentation_id}/videos/portrait").status_code == 404

    put = _put_portrait(client, presentation_id)
    assert put.status_code == 200, put.text
    assert (put.json()["width"], put.json()["height"]) == (40, 30)

    got = client.get(f"{BASE}/{presentation_id}/videos/portrait")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.content == _png()

    assert client.delete(f"{BASE}/{presentation_id}/videos/portrait").status_code == 200
    assert client.get(f"{BASE}/{presentation_id}/videos/portrait").status_code == 404


def test_portrait_rejects_a_non_image(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    response = _put_portrait(client, presentation_id, data=b"nope", filename="x.png")
    assert response.status_code == 422


def test_videos_listing_carries_portrait_and_generation_flag(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    body = client.get(f"{BASE}/{presentation_id}/videos").json()
    assert body["portrait"] is None
    assert body["generation_available"] is False

    _put_portrait(client, presentation_id)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    body = client.get(f"{BASE}/{presentation_id}/videos").json()
    assert body["portrait"]["mime_type"] == "image/png"
    assert body["generation_available"] is True


def test_deleting_the_deck_removes_the_portrait_file(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _put_portrait(client, presentation_id)
    folder = app_data / "videos" / str(presentation_id)
    assert list(folder.glob("portrait-*"))

    assert client.delete(f"{BASE}/{presentation_id}").status_code == 204
    assert not folder.exists()


def _generation_client(tmp_path, monkeypatch, *, run=None):
    """A deck with a portrait, Italian narration and placeholders on slides 0 and 1.

    The background run uses a fake ElevenLabs client against the test database,
    or `run` when given.
    """
    import functools

    import api.v1.ppt.endpoints.slide_avatars as slide_avatars
    from api.v1.async_tasks.router import API_V1_ASYNC_TASKS_ROUTER
    from services.slide_avatar_generation import run_avatar_generation_task

    from _video_http_helpers import _mp4
    from services.elevenlabs_lipsync import LipsyncStatus

    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    client.app.include_router(API_V1_ASYNC_TASKS_ROUTER)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    assert _put_portrait(client, presentation_id).status_code == 200
    for index in (0, 1):
        assert (
            client.post(f"{BASE}/{presentation_id}/videos/{index}/placeholder", json={})
            .status_code
            == 200
        )
    _narrate(sessions, slide_ids, tmp_path, "it", [0, 1])

    class FakeClient:
        async def create(self, **_kwargs):
            return "gen-1"

        async def get(self, _generation_id):
            return LipsyncStatus("completed", content_url="https://cdn/x.mp4")

        async def download(self, _url, *, max_bytes):
            return _mp4()

        async def aclose(self):
            pass

    monkeypatch.setattr(
        slide_avatars,
        "run_avatar_generation_task",
        run
        or functools.partial(
            run_avatar_generation_task,
            client_factory=FakeClient,
            poll_interval=0,
            session_maker=sessions,
        ),
    )
    return client, presentation_id, slide_ids, sessions


def _narrate(sessions, slide_ids, tmp_path, language, indexes):
    from models.sql.slide import SlideModel
    from models.sql.speaker_note_audio import SpeakerNoteAudioModel
    from services.speaker_note_tts_service import note_digest

    async def add(session):
        for index in indexes:
            slide = await session.get(SlideModel, slide_ids[index])
            path = tmp_path / f"{language}-{index}.mp3"
            path.write_bytes(b"ID3")
            session.add(
                SpeakerNoteAudioModel(
                    presentation=slide.presentation, slide=slide.id, slide_index=index,
                    language=language, language_name=language, model="m",
                    text=slide.speaker_note, source_note_hash=note_digest(slide.speaker_note),
                    path=str(path), url="/a.mp3", format="mp3",
                )
            )
        await session.commit()

    _run(sessions, add)


def test_generate_without_api_key_is_503(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions = _generation_client(tmp_path, monkeypatch)
    monkeypatch.delenv("ELEVENLABS_API_KEY")

    response = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})

    assert response.status_code == 503


def test_generate_without_portrait_is_422(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions = _generation_client(tmp_path, monkeypatch)
    client.delete(f"{BASE}/{presentation_id}/videos/portrait")

    response = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})

    assert response.status_code == 422
    assert "portrait" in response.json()["detail"]


def test_generate_without_narration_is_422(tmp_path, monkeypatch):
    client, presentation_id, *_ = _build_client(tmp_path, monkeypatch)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    _put_portrait(client, presentation_id)

    response = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})

    assert response.status_code == 422
    assert "TTS" in response.json()["detail"]


def test_generate_with_two_languages_needs_one(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions = _generation_client(
        tmp_path, monkeypatch
    )
    _narrate(sessions, slide_ids, tmp_path, "en", [0])

    response = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})
    assert response.status_code == 422
    assert "more than one language" in response.json()["detail"]

    chosen = client.post(
        f"{BASE}/{presentation_id}/videos/generate", json={"language": "English"}
    )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["data"]["language"] == "en"


def test_generate_with_an_unknown_slide_is_404(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions = _generation_client(tmp_path, monkeypatch)

    response = client.post(
        f"{BASE}/{presentation_id}/videos/generate", json={"slide_indices": [0, 9]}
    )

    assert response.status_code == 404


def test_generate_while_one_is_pending_is_409(tmp_path, monkeypatch):
    async def never_runs(*_args, **_kwargs):
        return None

    client, presentation_id, _ids, _sessions = _generation_client(
        tmp_path, monkeypatch, run=never_runs
    )
    first = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})
    assert first.status_code == 200
    assert first.json()["status"] == "pending"

    second = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})

    assert second.status_code == 409
    assert second.json()["detail"]["task_id"] == first.json()["id"]


def test_generate_runs_to_completion_and_is_listed(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions = _generation_client(
        tmp_path, monkeypatch
    )
    assert client.get(f"{BASE}/{presentation_id}/videos/generate").status_code == 404

    response = client.post(
        f"{BASE}/{presentation_id}/videos/generate",
        json={"slide_indices": [0], "resolution": "480p"},
    )
    assert response.status_code == 200, response.text
    task = response.json()
    assert task["data"]["phase"] == "queued"
    assert task["data"]["resolution"] == "480p"
    assert [s["state"] for s in task["data"]["slides"]] == ["queued"]

    status = client.get(f"/api/v1/async-tasks/status/{task['id']}").json()
    assert status["status"] == "completed", status
    [entry] = status["data"]["slides"]
    assert entry["state"] == "done"
    assert entry["slide_id"] == str(slide_ids[0])

    video = client.get(f"{BASE}/{presentation_id}/videos/0").json()
    assert video["source"] == "elevenlabs"
    assert video["id"] == entry["video_id"]

    latest = client.get(f"{BASE}/{presentation_id}/videos/generate")
    assert latest.status_code == 200
    assert latest.json()["id"] == task["id"]

    # A second run finds the avatar fresh and starts nothing.
    again = client.post(f"{BASE}/{presentation_id}/videos/generate", json={})
    assert again.status_code == 200
    reasons = {s["slide_index"]: s.get("reason") for s in again.json()["data"]["slides"]}
    assert reasons == {0: "up_to_date", 1: None}


def test_preview_lists_chips_for_a_mixed_deck(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions = _generation_client(
        tmp_path, monkeypatch
    )
    # Preview needs neither the key nor the portrait, and creates no task.
    monkeypatch.delenv("ELEVENLABS_API_KEY")
    client.delete(f"{BASE}/{presentation_id}/videos/portrait")
    _upload(client, presentation_id, 0, language="it")

    async def edit_note(session):
        from models.sql.slide import SlideModel

        slide = await session.get(SlideModel, slide_ids[1])
        slide.speaker_note = "Cambiato."
        session.add(slide)
        await session.commit()

    _run(sessions, edit_note)

    response = client.get(f"{BASE}/{presentation_id}/videos/generate/preview")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] == "it"
    assert [(s["slide_index"], s["state"], s.get("reason")) for s in body["slides"]] == [
        (0, "skipped", "up_to_date"),
        (1, "skipped", "audio_stale"),
    ]
    assert client.get(f"{BASE}/{presentation_id}/videos/generate").status_code == 404


def test_preview_without_narration_reports_no_audio(tmp_path, monkeypatch):
    client, presentation_id, *_ = _build_client(tmp_path, monkeypatch)
    client.post(f"{BASE}/{presentation_id}/videos/0/placeholder", json={})

    response = client.get(f"{BASE}/{presentation_id}/videos/generate/preview")

    assert response.status_code == 200, response.text
    assert [(s["slide_index"], s.get("reason")) for s in response.json()["slides"]] == [
        (0, "no_audio")
    ]


def test_two_concurrent_generate_requests_create_one_task(tmp_path, monkeypatch):
    import asyncio

    import httpx

    import api.v1.ppt.endpoints.slide_avatars as slide_avatars
    from models.sql.async_task import AsyncTaskModel

    async def never_runs(*_args, **_kwargs):
        return None

    client, presentation_id, _ids, sessions = _generation_client(
        tmp_path, monkeypatch, run=never_runs
    )
    real_plan = slide_avatars._plan_generation

    async def slow_plan(*args, **kwargs):
        # Widen the gap between the running-task check and the commit.
        await asyncio.sleep(0.05)
        return await real_plan(*args, **kwargs)

    monkeypatch.setattr(slide_avatars, "_plan_generation", slow_plan)

    async def both():
        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as http:
            url = f"{BASE}/{presentation_id}/videos/generate"
            return await asyncio.gather(http.post(url, json={}), http.post(url, json={}))

    responses = asyncio.run(both())

    assert sorted(r.status_code for r in responses) == [200, 409]
    assert len(_rows(sessions, AsyncTaskModel)) == 1
