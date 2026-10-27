import asyncio
import io
import os
import struct

import pytest
from fastapi import HTTPException, UploadFile

import utils.video_files as video_files
from utils.video_files import (
    DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB,
    StoredVideo,
    VideoMetadata,
    get_slide_video_max_upload_bytes,
    mp4_metadata,
    store_uploaded_video,
    video_metadata,
)

MB = 1024 * 1024
WEBM_HEADER = b"\x1a\x45\xdf\xa3" + b"\x00" * 60


def box(box_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + box_type + payload


def large_box(box_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 1) + box_type + struct.pack(">Q", 16 + len(payload)) + payload


def mvhd(timescale: int, duration: int, version: int = 0) -> bytes:
    if version == 1:
        times = struct.pack(">QQIQ", 0, 0, timescale, duration)
    else:
        times = struct.pack(">IIII", 0, 0, timescale, duration)
    # rate, volume, reserved, matrix, pre_defined, next_track_ID
    rest = b"\x00" * 80
    return box(b"mvhd", bytes([version, 0, 0, 0]) + times + rest)


def tkhd(width: int, height: int, version: int = 0, track_id: int = 1) -> bytes:
    if version == 1:
        times = struct.pack(">QQIIQ", 0, 0, track_id, 0, 1000)
    else:
        times = struct.pack(">IIIII", 0, 0, track_id, 0, 1000)
    layout = b"\x00" * 8 + struct.pack(">hhhH", 0, 0, 0, 0) + b"\x00" * 36
    size = struct.pack(">II", width << 16, height << 16)
    return box(b"tkhd", bytes([version, 0, 0, 7]) + times + layout + size)


def trak(width: int, height: int, version: int = 0) -> bytes:
    return box(b"trak", tkhd(width, height, version) + box(b"mdia", b""))


FTYP = box(b"ftyp", b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41")


def moov(*children: bytes) -> bytes:
    return box(b"moov", b"".join(children))


def _avatar_moov() -> bytes:
    return moov(mvhd(1000, 12345), trak(0, 0), trak(1280, 720))


def _write(tmp_path, data: bytes, name: str = "video.mp4") -> str:
    path = tmp_path / name
    path.write_bytes(data)
    return str(path)


@pytest.mark.parametrize(
    ("version", "timescale", "duration", "expected"),
    [
        (0, 1000, 12345, 12.345),
        (1, 1000, 12345, 12.345),
        (0, 90000, 2700000, 30.0),
        (1, 600, 2**33, round(2**33 / 600, 3)),
    ],
)
def test_mvhd_duration_in_both_versions(tmp_path, version, timescale, duration, expected):
    path = _write(tmp_path, FTYP + moov(mvhd(timescale, duration, version)))
    assert mp4_metadata(path) == VideoMetadata(duration_seconds=expected)


@pytest.mark.parametrize("duration", [0, 0xFFFFFFFF])
def test_unknown_mvhd_duration_is_none(tmp_path, duration):
    path = _write(tmp_path, FTYP + moov(mvhd(1000, duration)))
    assert mp4_metadata(path).duration_seconds is None


@pytest.mark.parametrize("version", [0, 1])
def test_frame_size_comes_from_the_first_visual_track(tmp_path, version):
    data = FTYP + moov(
        mvhd(1000, 12345), trak(0, 0, version), trak(1280, 720, version), trak(64, 64)
    )
    path = _write(tmp_path, data)
    assert mp4_metadata(path) == VideoMetadata(12.345, 1280, 720)


class _CountingFile:
    """Proxy that records how many bytes the parser actually asked for."""

    def __init__(self, handle, bytes_read):
        self._handle = handle
        self._bytes_read = bytes_read

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self._handle.close()

    def read(self, size=-1):
        data = self._handle.read(size)
        self._bytes_read.append(len(data))
        return data

    def __getattr__(self, name):
        return getattr(self._handle, name)


def test_moov_after_a_large_mdat_is_reached_by_seeking(tmp_path, monkeypatch):
    data = FTYP + box(b"mdat", b"\x00" * (2 * MB)) + _avatar_moov()
    path = _write(tmp_path, data)
    bytes_read = []
    monkeypatch.setattr(
        video_files,
        "open",
        lambda *args, **kwargs: _CountingFile(open(*args, **kwargs), bytes_read),
        raising=False,
    )

    assert mp4_metadata(path) == VideoMetadata(12.345, 1280, 720)
    assert 0 < sum(bytes_read) < 1024


def test_64_bit_box_sizes(tmp_path):
    payload = mvhd(1000, 12345) + trak(1280, 720)
    data = FTYP + large_box(b"mdat", b"\x00" * 1024) + large_box(b"moov", payload)
    path = _write(tmp_path, data)
    assert mp4_metadata(path) == VideoMetadata(12.345, 1280, 720)


def test_a_zero_size_box_runs_to_end_of_file(tmp_path):
    payload = mvhd(1000, 12345) + trak(1280, 720)
    data = FTYP + box(b"mdat", b"\x00" * 64) + struct.pack(">I", 0) + b"moov" + payload
    path = _write(tmp_path, data)
    assert mp4_metadata(path) == VideoMetadata(12.345, 1280, 720)


def test_truncation_never_raises_or_guesses(tmp_path):
    data = FTYP + box(b"mdat", b"\x00" * 32) + _avatar_moov()
    for cut in range(len(data)):
        metadata = mp4_metadata(_write(tmp_path, data[:cut]))
        assert metadata.duration_seconds in (None, 12.345)
        assert (metadata.width, metadata.height) in ((None, None), (1280, 720))


def test_truncation_keeps_the_fields_read_before_it(tmp_path):
    full = FTYP + _avatar_moov()
    moov_payload = len(FTYP) + 8
    mvhd_end = moov_payload + len(mvhd(1000, 12345))
    audio_trak_end = mvhd_end + len(trak(0, 0))

    def cut_at(offset):
        return mp4_metadata(_write(tmp_path, full[:offset]))

    # mvhd's duration field ends 28 bytes into the box.
    assert cut_at(moov_payload + 24) == VideoMetadata()
    assert cut_at(mvhd_end + 30) == VideoMetadata(duration_seconds=12.345)
    assert cut_at(audio_trak_end + 40) == VideoMetadata(duration_seconds=12.345)


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"not a video at all",
        b"\x00\x00\x00\x03moov",
        struct.pack(">I", 0xFFFFFFF0) + b"moov" + b"\x01" * 40,
        large_box(b"moov", b"")[:12],
        FTYP + moov(box(b"mvhd", b"\x02" + b"\x00" * 30), box(b"trak", box(b"tkhd", b"\x00"))),
        bytes(range(256)) * 4,
    ],
)
def test_garbage_gives_empty_metadata(tmp_path, data):
    assert mp4_metadata(_write(tmp_path, data)) == VideoMetadata()


def test_missing_file_gives_empty_metadata(tmp_path):
    assert mp4_metadata(str(tmp_path / "nope.mp4")) == VideoMetadata()
    assert mp4_metadata(str(tmp_path)) == VideoMetadata()


def test_video_metadata_dispatches_on_format(tmp_path):
    mp4_path = _write(tmp_path, FTYP + _avatar_moov())
    webm_path = _write(tmp_path, WEBM_HEADER, "video.webm")
    assert video_metadata(mp4_path, "mp4") == VideoMetadata(12.345, 1280, 720)
    assert video_metadata(webm_path, "webm") == VideoMetadata()


def _upload(data: bytes, filename: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=filename)


def _store(upload: UploadFile, directory, *, stem="slide-1", max_bytes=MB):
    return asyncio.run(
        store_uploaded_video(
            upload, directory=str(directory), stem=stem, max_bytes=max_bytes
        )
    )


def _reject(upload: UploadFile, directory, **kwargs) -> HTTPException:
    with pytest.raises(HTTPException) as caught:
        _store(upload, directory, **kwargs)
    return caught.value


@pytest.mark.parametrize("filename", ["avatar.mp4", "AVATAR.MP4", "avatar.m4v"])
def test_store_mp4(tmp_path, filename):
    directory = tmp_path / "videos"
    data = FTYP + box(b"mdat", b"\x01" * 4096) + _avatar_moov()

    stored = _store(_upload(data, filename), directory)

    final_path = str(directory / "slide-1.mp4")
    assert stored == StoredVideo(
        path=final_path, format="mp4", mime_type="video/mp4", size_bytes=len(data)
    )
    assert os.listdir(directory) == ["slide-1.mp4"]
    with open(final_path, "rb") as stored_file:
        assert stored_file.read() == data


def test_store_webm(tmp_path):
    stored = _store(_upload(WEBM_HEADER, "avatar.webm"), tmp_path)

    assert stored == StoredVideo(
        path=str(tmp_path / "slide-1.webm"),
        format="webm",
        mime_type="video/webm",
        size_bytes=len(WEBM_HEADER),
    )
    assert os.listdir(tmp_path) == ["slide-1.webm"]


def test_store_replaces_an_earlier_upload(tmp_path):
    _store(_upload(FTYP + b"\x00" * 10, "first.mp4"), tmp_path)
    second = FTYP + b"\x01" * 20

    stored = _store(_upload(second, "second.mp4"), tmp_path)

    assert stored.size_bytes == len(second)
    assert (tmp_path / "slide-1.mp4").read_bytes() == second
    assert os.listdir(tmp_path) == ["slide-1.mp4"]


@pytest.mark.parametrize("filename", ["avatar.mov", "avatar.gif", "avatar", "", None])
def test_store_rejects_other_extensions(tmp_path, filename):
    directory = tmp_path / "videos"
    error = _reject(_upload(FTYP, filename), directory)

    assert error.status_code == 400
    assert error.detail == "Invalid video file type. Accepted types: .m4v, .mp4, .webm"
    assert not directory.exists()


@pytest.mark.parametrize(
    ("data", "filename"),
    [
        (WEBM_HEADER, "avatar.mp4"),
        (FTYP + b"\x00" * 16, "avatar.webm"),
        (b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "avatar.mp4"),
        (bytes(range(256)), "avatar.webm"),
        (b"\x00\x00\x00", "avatar.mp4"),
    ],
)
def test_store_rejects_content_that_does_not_match_the_extension(
    tmp_path, data, filename
):
    error = _reject(_upload(data, filename), tmp_path)

    assert error.status_code == 400
    assert error.detail == "Uploaded file is not a valid MP4 or WebM video"
    assert os.listdir(tmp_path) == []


def test_store_rejects_an_empty_upload(tmp_path):
    error = _reject(_upload(b"", "avatar.mp4"), tmp_path)

    assert error.status_code == 400
    assert error.detail == "Uploaded video file is empty"
    assert os.listdir(tmp_path) == []


def test_store_stops_reading_once_the_limit_is_passed(tmp_path, monkeypatch):
    monkeypatch.setattr(video_files, "UPLOAD_CHUNK_BYTES", 16)
    data = FTYP + b"\x00" * 1000
    upload = _upload(data, "avatar.mp4")

    error = _reject(upload, tmp_path, max_bytes=100)

    assert error.status_code == 413
    assert "upload limit" in error.detail
    assert os.listdir(tmp_path) == []
    assert upload.file.tell() <= 100 + 16


def test_store_limit_boundary_keeps_the_previous_video(tmp_path, monkeypatch):
    monkeypatch.setattr(video_files, "UPLOAD_CHUNK_BYTES", 7)
    data = FTYP + b"\x00" * 40

    stored = _store(_upload(data, "avatar.mp4"), tmp_path, max_bytes=len(data))
    assert stored.size_bytes == len(data)

    error = _reject(_upload(data + b"\x00", "avatar.mp4"), tmp_path, max_bytes=len(data))
    assert error.status_code == 413
    assert error.detail == f"Video is larger than the {len(data) / MB:g} MB upload limit"
    assert os.listdir(tmp_path) == ["slide-1.mp4"]
    assert (tmp_path / "slide-1.mp4").read_bytes() == data


def test_store_limit_message_reads_in_megabytes(tmp_path):
    data = FTYP + b"\x00" * (MB // 2)
    error = _reject(_upload(data, "avatar.mp4"), tmp_path, max_bytes=MB // 2)

    assert error.status_code == 413
    assert error.detail == "Video is larger than the 0.5 MB upload limit"
    assert os.listdir(tmp_path) == []


def test_store_cleans_up_after_an_unexpected_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(video_files, "UPLOAD_CHUNK_BYTES", 8)
    upload = _upload(FTYP + b"\x00" * 64, "avatar.mp4")
    real_read = upload.read
    calls = []

    async def failing_read(size=-1):
        calls.append(size)
        if len(calls) == 3:
            raise RuntimeError("connection reset")
        return await real_read(size)

    upload.read = failing_read

    with pytest.raises(RuntimeError, match="connection reset"):
        _store(upload, tmp_path)
    assert os.listdir(tmp_path) == []


@pytest.mark.parametrize(
    ("value", "expected_mb"),
    [
        (None, DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("250", 250),
        (" 1.5 ", 1.5),
        ("0", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("-5", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("abc", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("inf", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
        ("nan", DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB),
    ],
)
def test_max_upload_bytes_from_env(monkeypatch, value, expected_mb):
    if value is None:
        monkeypatch.delenv("SLIDE_VIDEO_MAX_UPLOAD_MB", raising=False)
    else:
        monkeypatch.setenv("SLIDE_VIDEO_MAX_UPLOAD_MB", value)
    assert get_slide_video_max_upload_bytes() == int(expected_mb * MB)
