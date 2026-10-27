import asyncio
import json
import os
import shutil
import tempfile
from unittest.mock import patch

import pytest

from utils.ffmpeg_utils import (
    FFmpegNotAvailableError,
    FFmpegProgress,
    MediaProbe,
    _build_progress,
    ffmpeg_available,
    get_ffmpeg_binary,
    get_ffprobe_binary,
    media_duration_seconds,
    parse_progress_line,
    probe_media,
    run_ffmpeg,
)


def test_parse_progress_line_valid():
    assert parse_progress_line("out_time_ms=1500000") == ("out_time_ms", "1500000")
    assert parse_progress_line("speed=1.02x") == ("speed", "1.02x")
    assert parse_progress_line("progress=end") == ("progress", "end")


def test_parse_progress_line_junk_and_blank():
    assert parse_progress_line("") is None
    assert parse_progress_line("   ") is None
    assert parse_progress_line("not-key-value") is None
    assert parse_progress_line("=novalue") is None


def test_build_progress_fraction_none_when_total_unknown():
    progress = _build_progress(5.0, None, "1.0x", False)
    assert progress.fraction is None
    assert progress.out_time_seconds == 5.0
    assert progress.speed == "1.0x"
    assert progress.done is False


def test_build_progress_clamps_at_one():
    progress = _build_progress(12.0, 10.0, "2.0x", True)
    assert progress.fraction == 1.0
    assert progress.done is True


def test_build_progress_normal_fraction():
    progress = _build_progress(2.5, 10.0, None, False)
    assert progress.fraction == 0.25


def test_get_ffmpeg_binary_env_override(monkeypatch):
    monkeypatch.setenv("FFMPEG_BINARY", "/opt/custom/ffmpeg")
    assert get_ffmpeg_binary() == "/opt/custom/ffmpeg"


def test_get_ffmpeg_binary_raises_when_not_found(monkeypatch):
    monkeypatch.delenv("FFMPEG_BINARY", raising=False)
    with patch("shutil.which", return_value=None):
        with pytest.raises(FFmpegNotAvailableError):
            get_ffmpeg_binary()


def test_get_ffprobe_binary_raises_when_not_found(monkeypatch):
    monkeypatch.delenv("FFPROBE_BINARY", raising=False)
    monkeypatch.delenv("FFMPEG_BINARY", raising=False)
    with patch("shutil.which", return_value=None):
        with pytest.raises(FFmpegNotAvailableError):
            get_ffprobe_binary()


def test_ffmpeg_available_false_when_missing(monkeypatch):
    monkeypatch.delenv("FFMPEG_BINARY", raising=False)
    monkeypatch.delenv("FFPROBE_BINARY", raising=False)
    with patch("shutil.which", return_value=None):
        assert ffmpeg_available() is False


def test_ffmpeg_available_true_when_env_override_set(monkeypatch):
    monkeypatch.setenv("FFMPEG_BINARY", "/opt/custom/ffmpeg")
    monkeypatch.setenv("FFPROBE_BINARY", "/opt/custom/ffprobe")
    assert ffmpeg_available() is True


_FFPROBE_JSON = json.dumps(
    {
        "format": {
            "duration": "4.032000",
            "size": "123456",
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
        },
        "streams": [
            {"codec_type": "video", "width": 1280, "height": 720},
            {"codec_type": "audio"},
        ],
    }
).encode("utf-8")


class _FakeProcess:
    def __init__(self, stdout: bytes, stderr: bytes = b"", returncode: int = 0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode

    async def communicate(self):
        return self._stdout, self._stderr


def test_probe_media_parses_ffprobe_json(monkeypatch):
    monkeypatch.setenv("FFPROBE_BINARY", "/usr/bin/ffprobe")

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(_FFPROBE_JSON)

    with patch(
        "asyncio.create_subprocess_exec", side_effect=fake_create_subprocess_exec
    ):
        probe = asyncio.run(probe_media("/tmp/whatever.mp4"))

    assert isinstance(probe, MediaProbe)
    assert probe.duration_seconds == 4.032
    assert probe.size_bytes == 123456
    assert probe.format_name == "mov,mp4,m4a,3gp,3g2,mj2"
    assert probe.has_audio is True
    assert probe.has_video is True
    assert probe.width == 1280
    assert probe.height == 720


def test_probe_media_duration_falls_back_to_stream(monkeypatch):
    monkeypatch.setenv("FFPROBE_BINARY", "/usr/bin/ffprobe")
    payload = json.dumps(
        {
            "format": {},
            "streams": [{"codec_type": "audio", "duration": "2.5"}],
        }
    ).encode("utf-8")

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(payload)

    with patch(
        "asyncio.create_subprocess_exec", side_effect=fake_create_subprocess_exec
    ):
        probe = asyncio.run(probe_media("/tmp/whatever.mp3"))

    assert probe.duration_seconds == 2.5
    assert probe.has_video is False


def test_probe_media_unparseable_duration_is_none(monkeypatch):
    monkeypatch.setenv("FFPROBE_BINARY", "/usr/bin/ffprobe")
    payload = json.dumps({"format": {}, "streams": []}).encode("utf-8")

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(payload)

    with patch(
        "asyncio.create_subprocess_exec", side_effect=fake_create_subprocess_exec
    ):
        probe = asyncio.run(probe_media("/tmp/whatever.bin"))

    assert probe.duration_seconds is None


def test_media_duration_seconds_rounds(monkeypatch):
    monkeypatch.setenv("FFPROBE_BINARY", "/usr/bin/ffprobe")
    payload = json.dumps(
        {"format": {"duration": "1.23456789"}, "streams": []}
    ).encode("utf-8")

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(payload)

    with patch(
        "asyncio.create_subprocess_exec", side_effect=fake_create_subprocess_exec
    ):
        duration = asyncio.run(media_duration_seconds("/tmp/whatever.mp4"))

    assert duration == 1.235


def _real_ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@pytest.mark.skipif(
    not _real_ffmpeg_available(), reason="ffmpeg/ffprobe binaries not available"
)
def test_run_ffmpeg_encodes_and_probes_real_file():
    async def _run():
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = os.path.join(tmp_dir, "out.mp4")
            progress_events: list[FFmpegProgress] = []

            def on_progress(progress: FFmpegProgress) -> None:
                progress_events.append(progress)

            result = await run_ffmpeg(
                [
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=duration=1:size=64x64:rate=10",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    output_path,
                ],
                total_duration_seconds=1.0,
                on_progress=on_progress,
                timeout_seconds=60,
            )

            assert result.returncode == 0
            assert os.path.isfile(output_path)
            assert os.path.getsize(output_path) > 0
            assert any(event.done for event in progress_events)

            probe = await probe_media(output_path)
            assert probe.has_video is True
            assert probe.duration_seconds is not None
            assert probe.duration_seconds > 0

    asyncio.run(_run())
