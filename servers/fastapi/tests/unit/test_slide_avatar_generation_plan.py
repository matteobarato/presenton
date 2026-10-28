import asyncio
import uuid
from datetime import datetime, timezone

from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.slide_avatar_generation import (
    lipsync_audio,
    plan_avatar_generation,
)
from services.speaker_note_tts_service import note_digest

_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)
_PLACEHOLDER = {"type": "image", "video_placeholder": True}


def _slide(index=0, *, note="hello", placeholder=True, template=True):
    ui = None
    if template:
        ui = {"id": "l", "elements": [_PLACEHOLDER] if placeholder else []}
    return SlideModel(
        id=uuid.uuid4(), presentation=uuid.uuid4(), layout_group="g", layout="l",
        index=index, content={}, speaker_note=note, ui=ui,
    )


def _audio(slide, *, fmt="mp3", note=None):
    return SpeakerNoteAudioModel(
        id=uuid.uuid4(), presentation=slide.presentation, slide=slide.id,
        slide_index=slide.index, language="en", language_name="en",
        source_note_hash=note_digest(slide.speaker_note if note is None else note),
        path="/tmp/a." + fmt, format=fmt, created_at=_AT, updated_at=_AT,
    )


def _video(slide):
    return SlideVideoModel(
        id=uuid.uuid4(), presentation=slide.presentation, slide=slide.id,
        source_note_hash=note_digest(slide.speaker_note), path="/tmp/v.mp4",
        url="/v.mp4", format="mp4", mime_type="video/mp4", language="en",
        created_at=_AT, updated_at=_AT,
    )


def _plan(slides, videos=(), audios=(), *, indices=None, force=False, can=False):
    return plan_avatar_generation(
        slides, videos, audios, language="en", slide_indices=indices,
        force=force, can_transcode=can,
    )


def _one(slide, **kw):
    [plan] = _plan([slide], indices=[slide.index], **{k: v for k, v in kw.items() if k != "audios" and k != "videos"}, **{k: kw[k] for k in ("audios", "videos") if k in kw})
    return plan


def test_plan_no_placeholder_for_non_template_slide():
    assert _one(_slide(template=False)).reason == "no_placeholder"


def test_plan_no_placeholder_for_template_without_one():
    assert _one(_slide(placeholder=False)).reason == "no_placeholder"


def test_plan_no_audio():
    assert _one(_slide()).reason == "no_audio"


def test_plan_audio_stale():
    s = _slide()
    assert _one(s, audios=[_audio(s, note="other")]).reason == "audio_stale"


def test_plan_unsupported_audio_format_without_ffmpeg():
    s = _slide()
    plan = _one(s, audios=[_audio(s, fmt="ogg")])
    assert (plan.state, plan.reason) == ("skipped", "unsupported_audio_format")


def test_plan_transcodable_ogg_is_queued():
    s = _slide()
    assert _one(s, audios=[_audio(s, fmt="ogg")], can=True).state == "queued"


def test_plan_up_to_date():
    s = _slide()
    plan = _one(s, audios=[_audio(s)], videos=[_video(s)])
    assert (plan.state, plan.reason) == ("skipped", "up_to_date")


def test_plan_force_queues_up_to_date():
    s = _slide()
    plan = _one(s, audios=[_audio(s)], videos=[_video(s)], force=True)
    assert (plan.state, plan.reason) == ("queued", None)


def test_plan_empty_placeholder_is_queued():
    s = _slide()
    assert _one(s, audios=[_audio(s)]).state == "queued"


def test_plan_none_indices_lists_placeholder_slides_only():
    a, b, c = _slide(0), _slide(1, placeholder=False), _slide(2)
    plans = _plan([a, b, c])
    assert [p.slide_index for p in plans] == [0, 2]


def test_plan_explicit_indices_reported_in_slide_order():
    a, b, c = _slide(0), _slide(1, placeholder=False), _slide(2)
    assert [p.slide_index for p in _plan([c, b, a], indices=[2, 1])] == [1, 2]


def test_plan_rule_order():
    s = _slide(template=False)
    assert _one(s, audios=[_audio(s, note="x")]).reason == "no_placeholder"
    s = _slide()
    assert _one(s, videos=[_video(s)]).reason == "no_audio"
    assert _one(s, audios=[_audio(s, fmt="ogg", note="x")]).reason == "audio_stale"


def test_plan_other_language_avatar_is_queued():
    s = _slide()
    v = _video(s)
    v.language = "de"
    assert _one(s, audios=[_audio(s)], videos=[v]).state == "queued"


def test_plan_null_language_avatar_is_up_to_date():
    s = _slide()
    v = _video(s)
    v.language = None
    assert _one(s, audios=[_audio(s)], videos=[v]).reason == "up_to_date"


def test_plan_to_dict():
    s = _slide()
    assert _one(s).to_dict() == {
        "slide_index": 0, "slide_id": str(s.id), "state": "skipped",
        "reason": "no_audio",
    }
    s2 = _slide()
    assert "reason" not in _one(s2, audios=[_audio(s2)]).to_dict()


def test_lipsync_audio_passthrough_mp3(tmp_path):
    path = tmp_path / "a.mp3"
    path.write_bytes(b"ID3data")
    data, mime = asyncio.run(lipsync_audio(str(path), "mp3"))
    assert (data, mime) == (b"ID3data", "audio/mpeg")


class _FakeProc:
    def __init__(self, code, out=b"MP3", err=b"boom"):
        self.returncode, self._o, self._e = code, out, err

    async def communicate(self):
        return self._o, self._e


def _patch_exec(monkeypatch, code):
    calls = []

    async def fake(*argv, **kw):
        calls.append(argv)
        return _FakeProc(code)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake)
    monkeypatch.setattr(
        "services.slide_avatar_generation.get_ffmpeg_binary", lambda: "ffmpeg"
    )
    return calls


def test_lipsync_audio_transcodes_ogg(monkeypatch):
    calls = _patch_exec(monkeypatch, 0)
    assert asyncio.run(lipsync_audio("/tmp/a.ogg", "ogg")) == (b"MP3", "audio/mpeg")
    argv = calls[0]
    assert "/tmp/a.ogg" in argv and "-f" in argv and argv[argv.index("-f") + 1] == "mp3"


def test_lipsync_audio_ffmpeg_failure_raises(monkeypatch):
    import pytest
    from utils.ffmpeg_utils import FFmpegRuntimeError

    _patch_exec(monkeypatch, 1)
    with pytest.raises(FFmpegRuntimeError):
        asyncio.run(lipsync_audio("/tmp/a.ogg", "ogg"))
