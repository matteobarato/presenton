"""Storage and inspection of the avatar videos uploaded for slides.

The videos are produced elsewhere (lip-synced against the slide's narration)
and arrive here finished, so the server only has to keep them safe on disk and
know enough about them to lay out a player: how long they run and how large
the picture is. Uploads are tens of megabytes, so they are streamed to disk in
chunks and the size limit is enforced while reading, never after.

Metadata is read without ffmpeg or any media library. An MP4 keeps its
duration and frame size in a handful of fixed-layout header boxes, which a few
seeks can reach; WebM needs a real EBML parser, and browsers report its
duration as soon as they load it, so it is left unread.
"""

from __future__ import annotations

import logging
import math
import os
import struct
import uuid
from dataclasses import dataclass
from typing import BinaryIO, Iterator, Optional, Sequence

from fastapi import HTTPException, UploadFile

from utils.get_env import get_slide_video_max_upload_mb_env

LOGGER = logging.getLogger(__name__)

ALLOWED_VIDEO_EXTENSIONS: dict[str, tuple[str, str]] = {
    ".mp4": ("mp4", "video/mp4"),
    ".m4v": ("mp4", "video/mp4"),
    ".webm": ("webm", "video/webm"),
}
DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB = 100
UPLOAD_CHUNK_BYTES = 1024 * 1024

_BYTES_PER_MB = 1024 * 1024
_SNIFF_BYTES = 8
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3"

# Real files have a handful of boxes per level. The cap keeps a crafted file
# made of millions of empty boxes from pinning the CPU.
_MAX_BOXES_PER_CONTAINER = 10_000
_BOX_HEADER = struct.Struct(">I4s")


@dataclass(frozen=True)
class StoredVideo:
    path: str
    format: str
    mime_type: str
    size_bytes: int


@dataclass(frozen=True)
class VideoMetadata:
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None


def get_slide_video_max_upload_bytes() -> int:
    raw = (get_slide_video_max_upload_mb_env() or "").strip()
    try:
        megabytes = float(raw)
    except ValueError:
        megabytes = 0
    if not math.isfinite(megabytes) or megabytes <= 0:
        megabytes = DEFAULT_SLIDE_VIDEO_MAX_UPLOAD_MB
    return int(megabytes * _BYTES_PER_MB)


def _sniff_container(head: bytes) -> Optional[str]:
    if head[4:8] == b"ftyp":
        return "mp4"
    if head[:4] == _WEBM_MAGIC:
        return "webm"
    return None


def _check_not_empty(size: int) -> None:
    if not size:
        raise HTTPException(status_code=400, detail="Uploaded video file is empty")


def _check_within_limit(size: int, max_bytes: int) -> None:
    if size > max_bytes:
        max_mb = max_bytes / _BYTES_PER_MB
        raise HTTPException(
            status_code=413,
            detail=f"Video is larger than the {max_mb:g} MB upload limit",
        )


def _reject_non_video() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="Uploaded file is not a valid MP4 or WebM video",
    )


def _check_container(head: bytes, video_format: str) -> None:
    if _sniff_container(head) != video_format:
        raise _reject_non_video()


def remove_file(path: Optional[str]) -> None:
    """Delete one file, tolerating what a cleanup cannot do anything about.

    A path that is already gone (or was never set) is the normal case when a
    row outlives its file, and any other failure is logged rather than raised:
    the caller is usually cleaning up after a commit that has already happened,
    and a stray file must not turn that into an error response.
    """
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        LOGGER.warning("Could not remove video file %s: %s", path, exc)


def remove_deck_video_files(
    presentation_id: uuid.UUID, paths: Sequence[str]
) -> None:
    """Delete a deck's avatar and rendered-video files, then its folder.

    Avatars and MP4 renders share ``<videos>/<presentation_id>/``, so the
    folder goes only once the last file has. It is removed only when it is
    named after the deck, which keeps a path outside the deck's own folder from
    ever taking its parent directory with it, and ``rmdir`` (never ``rmtree``)
    leaves anything that is still in it.
    """
    directories: set[str] = set()
    for path in paths:
        if not path:
            continue
        directories.add(os.path.dirname(path))
        remove_file(path)
    for directory in directories:
        if os.path.basename(directory) != str(presentation_id):
            continue
        try:
            os.rmdir(directory)
        except OSError:
            continue


async def store_uploaded_video(
    file: UploadFile, *, directory: str, stem: str, max_bytes: int
) -> StoredVideo:
    """Stream an uploaded video to ``directory/stem.<format>``.

    The bytes land in a ``.part`` file first and are renamed only once the
    whole upload has been checked, so a rejected or interrupted upload never
    replaces a video that is already in use. ``stem`` is used as given and must
    come from the server (an id), not from the client.
    """
    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension not in ALLOWED_VIDEO_EXTENSIONS:
        accepted = ", ".join(sorted(ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video file type. Accepted types: {accepted}",
        )
    video_format, mime_type = ALLOWED_VIDEO_EXTENSIONS[extension]

    os.makedirs(directory, exist_ok=True)
    final_path = os.path.abspath(os.path.join(directory, f"{stem}.{video_format}"))
    part_path = f"{final_path}.part"

    size = 0
    head = b""
    try:
        with open(part_path, "wb") as output:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                _check_within_limit(size, max_bytes)
                if len(head) < _SNIFF_BYTES:
                    head += chunk[: _SNIFF_BYTES - len(head)]
                output.write(chunk)

        _check_not_empty(size)
        _check_container(head, video_format)
        os.replace(part_path, final_path)
    except BaseException:
        # BaseException, so a request cancelled mid-upload cleans up as well.
        remove_file(part_path)
        raise

    return StoredVideo(
        path=final_path,
        format=video_format,
        mime_type=mime_type,
        size_bytes=size,
    )


def store_video_bytes(
    data: bytes, *, directory: str, stem: str, max_bytes: int
) -> StoredVideo:
    """Write an in-memory video to ``directory/stem.<format>``.

    Same checks and errors as ``store_uploaded_video``, except that the format
    comes from the bytes themselves, as there is no filename to read it from.
    """
    _check_not_empty(len(data))
    _check_within_limit(len(data), max_bytes)
    video_format = _sniff_container(data[:_SNIFF_BYTES])
    if video_format is None:
        raise _reject_non_video()
    mime_type = "video/mp4" if video_format == "mp4" else "video/webm"

    os.makedirs(directory, exist_ok=True)
    final_path = os.path.abspath(os.path.join(directory, f"{stem}.{video_format}"))
    part_path = f"{final_path}.part"
    try:
        with open(part_path, "wb") as output:
            output.write(data)
        os.replace(part_path, final_path)
    except BaseException:
        remove_file(part_path)
        raise
    return StoredVideo(
        path=final_path,
        format=video_format,
        mime_type=mime_type,
        size_bytes=len(data),
    )


def _read_at(f: BinaryIO, offset: int, length: int, end: int) -> Optional[bytes]:
    if offset + length > end:
        return None
    f.seek(offset)
    data = f.read(length)
    return data if len(data) == length else None


def _iter_boxes(f: BinaryIO, start: int, end: int) -> Iterator[tuple[bytes, int, int]]:
    """Boxes between two offsets, as (type, payload start, payload end).

    A box that claims to run past its parent is clipped to it and ends the
    walk, so a truncated file still yields whatever it does contain.
    """
    offset = start
    for _ in range(_MAX_BOXES_PER_CONTAINER):
        header = _read_at(f, offset, _BOX_HEADER.size, end)
        if header is None:
            return
        size, box_type = _BOX_HEADER.unpack(header)
        header_size = _BOX_HEADER.size
        if size == 1:
            largesize = _read_at(f, offset + header_size, 8, end)
            if largesize is None:
                return
            size = struct.unpack(">Q", largesize)[0]
            header_size += 8
        elif size == 0:
            size = end - offset
        if size < header_size:
            return
        box_end = offset + size
        if box_end > end:
            yield box_type, offset + header_size, end
            return
        yield box_type, offset + header_size, box_end
        offset = box_end


def _find_box(
    f: BinaryIO, start: int, end: int, box_type: bytes
) -> Optional[tuple[int, int]]:
    for found_type, payload_start, payload_end in _iter_boxes(f, start, end):
        if found_type == box_type:
            return payload_start, payload_end
    return None


def _mvhd_duration(f: BinaryIO, start: int, end: int) -> Optional[float]:
    version = _read_at(f, start, 1, end)
    if version == b"\x01":
        fields = _read_at(f, start + 4, 28, end)
        layout, unknown = ">QQIQ", 0xFFFFFFFFFFFFFFFF
    elif version == b"\x00":
        fields = _read_at(f, start + 4, 16, end)
        layout, unknown = ">IIII", 0xFFFFFFFF
    else:
        return None
    if fields is None:
        return None
    _created, _modified, timescale, duration = struct.unpack(layout, fields)
    # All ones is the spec's "unknown"; zero is what fragmented files write.
    if not timescale or not duration or duration == unknown:
        return None
    return round(duration / timescale, 3)


def _tkhd_size(f: BinaryIO, start: int, end: int) -> Optional[tuple[int, int]]:
    version = _read_at(f, start, 1, end)
    if version == b"\x01":
        size_offset = 88
    elif version == b"\x00":
        size_offset = 76
    else:
        return None
    fields = _read_at(f, start + size_offset, 8, end)
    if fields is None:
        return None
    width, height = struct.unpack(">II", fields)
    width, height = width >> 16, height >> 16
    if not width or not height:
        return None
    return width, height


def mp4_metadata(path: str) -> VideoMetadata:
    """Duration and frame size of an MP4, read from its header boxes.

    Best effort and dependency free: the file is walked with seeks, so only
    the few hundred bytes of ``moov`` are read however large the media is, and
    anything malformed keeps whatever was read before it instead of raising.
    The metadata decorates a player; playback never depends on it.
    """
    duration: Optional[float] = None
    size: Optional[tuple[int, int]] = None
    try:
        with open(path, "rb") as f:
            file_end = os.fstat(f.fileno()).st_size
            moov = _find_box(f, 0, file_end, b"moov")
            if moov is not None:
                for box_type, start, end in _iter_boxes(f, *moov):
                    if box_type == b"mvhd" and duration is None:
                        duration = _mvhd_duration(f, start, end)
                    elif box_type == b"trak" and size is None:
                        tkhd = _find_box(f, start, end, b"tkhd")
                        if tkhd is not None:
                            size = _tkhd_size(f, *tkhd)
    except (OSError, ValueError, struct.error):
        pass
    width, height = size if size is not None else (None, None)
    return VideoMetadata(duration_seconds=duration, width=width, height=height)


def video_metadata(path: str, format: str) -> VideoMetadata:
    if format == "mp4":
        return mp4_metadata(path)
    return VideoMetadata()
