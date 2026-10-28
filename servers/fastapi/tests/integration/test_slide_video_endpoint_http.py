import asyncio
import os
import uuid

from sqlalchemy import select

from _video_http_helpers import _build_client, _mp4, _template_ui
from models.sql.presentation_video import PresentationVideoModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.speaker_note_tts_service import note_digest


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


def _seed_audio(
    session_maker, app_data, presentation_id, slide_id, index, language="it", duration=2.5
):
    directory = app_data / "audio" / str(presentation_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{slide_id}-{language}.mp3"
    path.write_bytes(b"\xff\xfb\x90\x00" + b"\x00" * 413)

    async def add(session):
        session.add(
            SpeakerNoteAudioModel(
                presentation=presentation_id,
                slide=slide_id,
                slide_index=index,
                language=language,
                language_name="Italian" if language == "it" else "English",
                model="tts-test",
                voice="alloy",
                text="testo",
                source_note_hash="x",
                path=str(path),
                url=f"/app_data/audio/{presentation_id}/{path.name}",
                duration_seconds=duration,
            )
        )
        await session.commit()

    _run(session_maker, add)
    return path


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
    return [
        element
        for element in ui["elements"]
        if element.get("video_placeholder") is True
    ]


def _video_dir(app_data, presentation_id):
    return app_data / "videos" / str(presentation_id)


def test_upload_stores_the_video_and_adds_a_placeholder(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = _upload(client, presentation_id, 0)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slide_id"] == str(slide_ids[0])
    assert body["slide_index"] == 0
    assert body["url"].startswith(f"/app_data/videos/{presentation_id}/{slide_ids[0]}-")
    assert body["url"].endswith(".mp4")
    assert body["format"] == "mp4"
    assert body["mime_type"] == "video/mp4"
    assert body["original_filename"] == "avatar.mp4"
    assert body["duration_seconds"] == 4.0
    assert (body["width"], body["height"]) == (640, 360)
    assert body["stale"] is False
    # Bottom-right, 320 wide, shaped like the 16:9 video.
    assert body["placeholder"] == {
        "position": {"x": 936, "y": 516},
        "size": {"width": 320, "height": 180},
    }
    assert "path" not in body

    stored = _rows(sessions, SlideVideoModel)
    assert len(stored) == 1
    assert os.path.isfile(stored[0].path)

    placeholders = _placeholders(_slide_ui(client, presentation_id, 0))
    assert len(placeholders) == 1
    placeholder = placeholders[0]
    assert placeholder["type"] == "image"
    assert placeholder["decorative"] is True
    assert placeholder["data"].endswith("/static/images/video-placeholder.png")
    # The other slides are untouched.
    assert _placeholders(_slide_ui(client, presentation_id, 1)) == []


def test_upload_records_the_given_language(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = _upload(client, presentation_id, 0, language="en")

    assert response.status_code == 200, response.text
    assert response.json()["language"] == "en"
    assert [video.language for video in _rows(sessions, SlideVideoModel)] == ["en"]


def test_upload_defaults_to_the_decks_only_narrated_language(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1, language="en")

    response = _upload(client, presentation_id, 0)

    assert response.status_code == 200, response.text
    assert response.json()["language"] == "en"


def test_upload_without_narration_leaves_language_unset(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = _upload(client, presentation_id, 0)

    assert response.status_code == 200, response.text
    assert response.json()["language"] is None


def test_upload_in_a_multilingual_deck_leaves_language_unset(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1, language="en")
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1, language="it")

    response = _upload(client, presentation_id, 0)

    assert response.status_code == 200, response.text
    assert response.json()["language"] is None


def test_upload_rejects_an_unsupported_language(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = _upload(client, presentation_id, 0, language="xx-nope")

    assert response.status_code == 422
    assert _rows(sessions, SlideVideoModel) == []
    assert not _video_dir(app_data, presentation_id).exists()


def test_regenerated_narration_marks_the_avatar_stale_in_its_language(
    tmp_path, monkeypatch
):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    base = f"/api/v1/ppt/presentation/{presentation_id}"
    _upload(client, presentation_id, 0, language="en")
    assert client.get(f"{base}/videos/0").json()["stale_reason"] is None

    # Narration made after the avatar, in another language and then in its own.
    _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0, language="it")
    assert client.get(f"{base}/videos/0").json()["stale"] is False
    _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0, language="en")

    single = client.get(f"{base}/videos/0").json()
    listed = client.get(f"{base}/videos").json()["videos"][0]
    for body in (single, listed):
        assert body["stale"] is True
        assert body["stale_reason"] == "audio_regenerated"
        assert body["language"] == "en"


def test_reupload_replaces_the_file_and_moves_the_placeholder(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    first = _upload(client, presentation_id, 0).json()
    first_path = _rows(sessions, SlideVideoModel)[0].path

    second = _upload(
        client,
        presentation_id,
        0,
        data=_mp4(duration_ms=6500),
        x=40,
        y=40,
        width=400,
        height=225,
    )

    assert second.status_code == 200, second.text
    body = second.json()
    assert body["id"] == first["id"]
    assert body["url"] != first["url"]
    assert body["duration_seconds"] == 6.5
    assert body["placeholder"] == {
        "position": {"x": 40, "y": 40},
        "size": {"width": 400, "height": 225},
    }
    assert not os.path.exists(first_path)
    assert len(os.listdir(_video_dir(app_data, presentation_id))) == 1
    assert len(_placeholders(_slide_ui(client, presentation_id, 0))) == 1


def test_rejects_slides_and_files_it_cannot_use(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )

    # Smart slides have no element tree to hold a placeholder.
    assert _upload(client, presentation_id, 2).status_code == 422
    assert _upload(client, presentation_id, 9).status_code == 404
    assert client.put(
        f"/api/v1/ppt/presentation/{uuid.uuid4()}/videos/0",
        files={"file": ("avatar.mp4", _mp4(), "video/mp4")},
    ).status_code == 404
    assert _upload(client, presentation_id, 0, filename="avatar.mov").status_code == 400
    assert _upload(client, presentation_id, 0, data=b"not a video at all").status_code == 400
    # A placeholder that would hang off the slide.
    assert _upload(client, presentation_id, 0, x=1200, width=320).status_code == 422

    monkeypatch.setenv("SLIDE_VIDEO_MAX_UPLOAD_MB", "0.0001")
    assert _upload(client, presentation_id, 0).status_code == 413

    assert _rows(sessions, SlideVideoModel) == []
    video_dir = _video_dir(app_data, presentation_id)
    assert not video_dir.exists() or os.listdir(video_dir) == []
    assert _placeholders(_slide_ui(client, presentation_id, 0)) == []


def test_video_goes_stale_when_the_note_changes(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    _upload(client, presentation_id, 0)
    base = f"/api/v1/ppt/presentation/{presentation_id}"

    assert client.get(f"{base}/videos/0").json()["stale"] is False

    edited = client.put(
        f"{base}/speaker-notes",
        json={"notes": [{"slide_index": 0, "speaker_note": "Un'altra frase."}]},
    )
    assert edited.status_code == 200, edited.text

    assert client.get(f"{base}/videos/0").json()["stale"] is True


def test_list_get_and_delete_videos(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    base = f"/api/v1/ppt/presentation/{presentation_id}/videos"
    _upload(client, presentation_id, 1)
    _upload(client, presentation_id, 0, data=_mp4(duration_ms=1500))

    listed = client.get(base)
    assert listed.status_code == 200
    assert [video["slide_index"] for video in listed.json()["videos"]] == [0, 1]
    assert listed.json()["total_duration_seconds"] == 5.5
    assert client.get(f"{base}/2").status_code == 404

    deleted = client.delete(f"{base}/1")
    assert deleted.json() == {"deleted": 1}
    assert client.get(f"{base}/1").status_code == 404
    # The placeholder outlives its video.
    assert len(_placeholders(_slide_ui(client, presentation_id, 1))) == 1
    assert len(_rows(sessions, SlideVideoModel)) == 1
    assert len(os.listdir(_video_dir(app_data, presentation_id))) == 1

    assert client.delete(base).json() == {"deleted": 1}
    assert _rows(sessions, SlideVideoModel) == []
    assert len(_placeholders(_slide_ui(client, presentation_id, 0))) == 1
    # The deck's folder goes once its last video does.
    assert not _video_dir(app_data, presentation_id).exists()


def test_deleting_the_deck_removes_its_video_files(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _upload(client, presentation_id, 0)
    path = _rows(sessions, SlideVideoModel)[0].path

    assert client.delete(f"/api/v1/ppt/presentation/{presentation_id}").status_code == 204

    assert not os.path.exists(path)
    assert _rows(sessions, SlideVideoModel) == []


def test_deleting_a_deck_removes_avatars_and_rendered_videos(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _upload(client, presentation_id, 0)
    avatar = _rows(sessions, SlideVideoModel)[0].path

    # A rendered MP4 and its subtitles live beside the avatars.
    folder = _video_dir(app_data, presentation_id)
    render, subtitles = folder / "export.mp4", folder / "export.vtt"
    render.write_bytes(b"mp4")
    subtitles.write_text("WEBVTT\n")

    async def add_render(session):
        session.add(
            PresentationVideoModel(
                presentation=presentation_id,
                language="it",
                language_name="Italian",
                preset="1080p-30-soft",
                path=str(render),
                url=f"/app_data/videos/{presentation_id}/{render.name}",
                subtitles_mode="soft",
                subtitle_path=str(subtitles),
                subtitle_url=f"/app_data/videos/{presentation_id}/{subtitles.name}",
                resolution="1080p",
                width=1920,
                height=1080,
                fps=30,
                slide_count=3,
                duration_seconds=7.5,
                size_bytes=3,
                source_hash="hash",
            )
        )
        await session.commit()

    _run(sessions, add_render)
    assert os.path.exists(avatar) and render.exists() and subtitles.exists()

    assert client.delete(f"/api/v1/ppt/presentation/{presentation_id}").status_code == 204

    assert not os.path.exists(avatar)
    assert not render.exists()
    assert not subtitles.exists()
    assert not folder.exists()
    assert _rows(sessions, SlideVideoModel) == []
    assert _rows(sessions, PresentationVideoModel) == []


def test_playback_describes_the_actor_slide_by_slide(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0)
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1)
    _upload(client, presentation_id, 0)
    url = f"/api/v1/ppt/presentation/{presentation_id}/playback"

    response = client.get(url)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] == "it"
    assert body["stage"] == {"width": 1280, "height": 720}
    assert body["bubble"] == {
        "position": {"x": 1160, "y": 600},
        "size": {"width": 96, "height": 96},
        "is_default": True,
    }
    video_slide, voice_slide, silent_slide = body["slides"]
    assert video_slide["actor"] == "video"
    # The narration sets the slide's length, not the avatar's (4.0s).
    assert video_slide["duration_seconds"] == 2.5
    assert video_slide["placeholder"]["size"] == {"width": 320, "height": 180}
    # Kept for a viewer who switches the avatar off.
    assert video_slide["audio"]["language"] == "it"
    assert voice_slide["actor"] == "voice"
    assert voice_slide["video"] is None
    assert voice_slide["placeholder"] is None
    assert voice_slide["duration_seconds"] == 2.5
    assert silent_slide["actor"] == "none"
    assert silent_slide["duration_seconds"] is None
    assert body["total_duration_seconds"] is None

    # A second narration language makes the choice the caller's.
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1, language="en")
    assert client.get(url).status_code == 409
    english = client.get(url, params={"language": "en"}).json()
    # The avatar was synced to Italian (the deck's only language when it was
    # uploaded), so it is not shown over English narration.
    assert [slide["actor"] for slide in english["slides"]] == ["none", "voice", "none"]
    assert english["slides"][0]["audio"] is None
    assert english["slides"][0]["video"] is None
    assert english["slides"][0]["placeholder"] is None
    assert client.get(url, params={"language": "xx"}).status_code == 422


def test_playback_video_slide_duration_is_the_audio_duration(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0, duration=4.2)
    _upload(client, presentation_id, 0, data=_mp4(duration_ms=5000))

    body = client.get(f"/api/v1/ppt/presentation/{presentation_id}/playback").json()

    video_slide = body["slides"][0]
    assert video_slide["actor"] == "video"
    assert video_slide["video"]["duration_seconds"] == 5.0
    assert video_slide["audio"]["duration_seconds"] == 4.2
    assert video_slide["duration_seconds"] == 4.2


def test_playback_silent_avatar_slide_falls_back_to_the_video_duration(
    tmp_path, monkeypatch
):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1)
    _upload(client, presentation_id, 0, data=_mp4(duration_ms=5000))

    body = client.get(f"/api/v1/ppt/presentation/{presentation_id}/playback").json()

    assert body["slides"][0]["actor"] == "video"
    assert body["slides"][0]["audio"] is None
    assert body["slides"][0]["duration_seconds"] == 5.0


def test_bubble_is_validated_and_kept_on_duplicate(tmp_path, monkeypatch):
    client, presentation_id, _slide_ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    base = f"/api/v1/ppt/presentation/{presentation_id}"

    placed = client.put(
        f"{base}/playback/bubble", json={"x": 24, "y": 600, "width": 96, "height": 96}
    )
    assert placed.status_code == 200, placed.text
    assert placed.json()["is_default"] is False
    assert client.put(
        f"{base}/playback/bubble", json={"x": 1250, "y": 600, "width": 96, "height": 96}
    ).status_code == 422
    assert client.put(
        f"{base}/playback/bubble", json={"x": 0, "y": 0, "width": 0, "height": 96}
    ).status_code == 422

    copy_id = client.post(f"{base}/duplicate").json()["id"]
    bubble = client.get(f"/api/v1/ppt/presentation/{copy_id}/playback").json()["bubble"]
    assert bubble["position"] == {"x": 24, "y": 600}
    assert bubble["is_default"] is False


# PATCH /update replaces a deck's slides when the editor adds, removes or
# reorders them. It must keep the rows hanging off slides that are still there.


def _update(client, presentation_id, slides):
    return client.patch(
        "/api/v1/ppt/presentation/update",
        json={"id": str(presentation_id), "slides": slides},
    )


def test_update_reorder_keeps_videos_and_audio(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0)
    _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1)
    _upload(client, presentation_id, 0)
    slides = client.get(f"/api/v1/ppt/presentation/{presentation_id}").json()["slides"]

    slides[0]["index"], slides[1]["index"] = 1, 0
    response = _update(client, presentation_id, slides)

    assert response.status_code == 200, response.text
    videos = _rows(sessions, SlideVideoModel)
    assert [video.slide for video in videos] == [slide_ids[0]]
    audio_indexes = {audio.slide: audio.slide_index for audio in _rows(sessions, SpeakerNoteAudioModel)}
    assert audio_indexes == {slide_ids[0]: 1, slide_ids[1]: 0}
    listed = client.get(f"/api/v1/ppt/presentation/{presentation_id}/videos").json()
    assert [video["slide_index"] for video in listed["videos"]] == [1]
    one_audio = client.get(
        f"/api/v1/ppt/presentation/{presentation_id}/speaker-notes/tts/1"
    ).json()
    assert one_audio["slide_id"] == str(slide_ids[0])
    # The placeholder travelled with the slide.
    assert len(_placeholders(_slide_ui(client, presentation_id, 1))) == 1


def test_update_removing_a_slide_drops_its_media_and_adds_new_slides(
    tmp_path, monkeypatch
):
    client, presentation_id, slide_ids, sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    removed_audio = _seed_audio(sessions, app_data, presentation_id, slide_ids[0], 0)
    kept_audio = _seed_audio(sessions, app_data, presentation_id, slide_ids[1], 1)
    _upload(client, presentation_id, 0)
    _upload(client, presentation_id, 1)
    removed_video = next(
        video.path for video in _rows(sessions, SlideVideoModel) if video.slide == slide_ids[0]
    )
    slides = client.get(f"/api/v1/ppt/presentation/{presentation_id}").json()["slides"]

    kept = [slide for slide in slides if slide["id"] != str(slide_ids[0])]
    for index, slide in enumerate(kept):
        slide["index"] = index
    new_slide = {
        **kept[0],
        "id": str(uuid.uuid4()),
        "index": len(kept),
        "speaker_note": "Nuova slide.",
        "ui": _template_ui(),
    }
    response = _update(client, presentation_id, kept + [new_slide])

    assert response.status_code == 200, response.text
    stored = client.get(f"/api/v1/ppt/presentation/{presentation_id}").json()["slides"]
    assert [slide["id"] for slide in stored] == [
        str(slide_ids[1]),
        str(slide_ids[2]),
        new_slide["id"],
    ]
    assert [video.slide for video in _rows(sessions, SlideVideoModel)] == [slide_ids[1]]
    assert [audio.slide for audio in _rows(sessions, SpeakerNoteAudioModel)] == [slide_ids[1]]
    assert not os.path.exists(removed_video)
    assert not removed_audio.exists()
    assert kept_audio.exists()
    assert note_digest("Nuova slide.")  # the new slide's note is stored as sent
    assert stored[2]["speaker_note"] == "Nuova slide."
