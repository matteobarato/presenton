"""Thin runtime wrapper around the `ffmpeg` / `ffprobe` binaries.

Presentation-to-video export shells out to ffmpeg rather than pulling in a
Python encoding library, because ffmpeg is the thing that actually knows how
to mux slide images and narration audio into a video and every alternative
either wraps this same binary or drags in a much heavier dependency. This
module owns only the mechanics of finding the binaries, running them, and
turning their stdout/stderr into something the rest of the codebase can act
on (durations, progress callbacks, bounded error text). It does not know
anything about slides, presentations, or the export task queue -- that logic
belongs to the video service that later steps build on top of this.

Progress is read from ffmpeg's `-progress pipe:1` machine-readable stream
instead of scraping the human-readable stderr banner, because the key=value
format is stable across ffmpeg versions and does not require guessing at
column positions.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, Sequence, Union

from utils.get_env import get_ffmpeg_binary_env, get_ffprobe_binary_env
from utils.runtime_limits import BoundedTextBuffer

LOGGER = logging.getLogger(__name__)

MISSING_FFMPEG_MESSAGE = (
    "ffmpeg (and ffprobe) are required to export a presentation as video. "
    "Install the ffmpeg package for your platform (e.g. `apt-get install "
    "ffmpeg` on Debian/Ubuntu, `brew install ffmpeg` on macOS) so both "
    "binaries are on PATH, or point at them explicitly with the "
    "FFMPEG_BINARY and FFPROBE_BINARY environment variables."
)

# Progress lines arrive far more often than once a second during a fast
# encode; capping stderr keeps a runaway or chatty encode from growing an
# unbounded string in memory the same way _run_bounded_child does for other
# child processes in this codebase.
_STDERR_TAIL_LIMIT = 8192


class FFmpegNotAvailableError(RuntimeError):
    """Raised when neither ffmpeg nor ffprobe can be located.

    Mirrors the role SpeakerNoteTTSConfigurationError plays for the speech
    provider: callers catch this specifically and turn it into a 400 rather
    than letting an unhandled error look like a server bug.
    """


class FFmpegRuntimeError(RuntimeError):
    """Raised when ffmpeg (or ffprobe) exits non-zero, or is killed on timeout.

    Carries the exit code and a bounded tail of stderr so a caller can surface
    something actionable without holding the full (potentially huge) output.
    """

    def __init__(self, message: str, *, returncode: int, stderr_tail: str = ""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr_tail = stderr_tail


@dataclass
class MediaProbe:
    duration_seconds: Optional[float]
    size_bytes: Optional[int]
    format_name: Optional[str]
    has_audio: bool
    has_video: bool
    width: Optional[int]
    height: Optional[int]


@dataclass
class FFmpegProgress:
    out_time_seconds: float
    fraction: Optional[float]
    speed: Optional[str]
    done: bool = False


@dataclass
class FFmpegResult:
    returncode: int
    stderr_tail: str
    duration_seconds_elapsed: Optional[float]


ProgressCallback = Callable[[FFmpegProgress], Union[None, Awaitable[None]]]


def _windows_hidden_subprocess_kwargs() -> dict[str, object]:
    """Suppress the console window ffmpeg would otherwise flash on Windows.

    Replicated from export_task_service.py rather than imported: it is a
    two-line, platform-only helper and this module is meant to stand alone
    as a dependency-free wrapper, not to pull in the export task service's
    unrelated imports just for this.
    """
    if os.name != "nt":
        return {}
    return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}


def _ffprobe_sibling(ffmpeg_path: str) -> Optional[str]:
    """Look for ffprobe next to an explicitly configured ffmpeg binary.

    Someone who points FFMPEG_BINARY at a specific build (a static binary
    dropped in /opt/ffmpeg, say) almost always has the matching ffprobe right
    next to it, so it's worth checking that directory before falling back to
    PATH -- otherwise the two binaries could end up mismatched.
    """
    directory = os.path.dirname(ffmpeg_path)
    if not directory:
        return None
    suffix = ".exe" if ffmpeg_path.lower().endswith(".exe") else ""
    candidate = os.path.join(directory, f"ffprobe{suffix}")
    if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
        return candidate
    return None


def get_ffmpeg_binary() -> str:
    override = (get_ffmpeg_binary_env() or "").strip()
    if override:
        return override
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise FFmpegNotAvailableError(MISSING_FFMPEG_MESSAGE)


def get_ffprobe_binary() -> str:
    override = (get_ffprobe_binary_env() or "").strip()
    if override:
        return override

    ffmpeg_override = (get_ffmpeg_binary_env() or "").strip()
    if ffmpeg_override:
        sibling = _ffprobe_sibling(ffmpeg_override)
        if sibling:
            return sibling

    found = shutil.which("ffprobe")
    if found:
        return found
    raise FFmpegNotAvailableError(MISSING_FFMPEG_MESSAGE)


def ffmpeg_available() -> bool:
    """Never raises -- endpoints use this to return 400 instead of 500."""
    try:
        get_ffmpeg_binary()
        get_ffprobe_binary()
        return True
    except FFmpegNotAvailableError:
        return False


def parse_progress_line(line: str) -> Optional[tuple[str, str]]:
    """Parse one `key=value` line from ffmpeg's -progress stream.

    Pulled out as a pure function so the parsing logic is unit-testable
    without spawning a binary. Returns None for blank lines or anything that
    doesn't look like key=value -- ffmpeg's progress stream is well-formed in
    practice, but being defensive here means a stray line can't crash an
    otherwise-successful encode.
    """
    stripped = line.strip()
    if not stripped or "=" not in stripped:
        return None
    key, _, value = stripped.partition("=")
    key = key.strip()
    value = value.strip()
    if not key:
        return None
    return key, value


def _to_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


async def probe_media(path: str) -> MediaProbe:
    """Run ffprobe and summarize a media file's format and streams.

    JSON output is used (rather than ffprobe's default text) because it is
    the only ffprobe output format that doesn't require hand-rolling a
    parser for values that can contain arbitrary characters (codec names,
    tags, etc).
    """
    binary = get_ffprobe_binary()
    args = [
        binary,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        **_windows_hidden_subprocess_kwargs(),
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        stderr_text = stderr.decode("utf-8", errors="replace")
        raise FFmpegRuntimeError(
            f"ffprobe failed for {path!r} with exit code {process.returncode}",
            returncode=process.returncode if process.returncode is not None else -1,
            stderr_tail=stderr_text[-_STDERR_TAIL_LIMIT:],
        )

    try:
        payload = json.loads(stdout.decode("utf-8", errors="replace") or "{}")
    except json.JSONDecodeError:
        # ffprobe is expected to always emit valid JSON on success; if it
        # somehow doesn't, treat the file as unprobeable rather than guessing.
        payload = {}

    fmt = payload.get("format") or {}
    streams = payload.get("streams") or []

    duration = _to_float(fmt.get("duration"))
    if duration is None:
        for stream in streams:
            duration = _to_float(stream.get("duration"))
            if duration is not None:
                break

    has_audio = any(stream.get("codec_type") == "audio" for stream in streams)
    has_video = any(stream.get("codec_type") == "video" for stream in streams)

    width: Optional[int] = None
    height: Optional[int] = None
    for stream in streams:
        if stream.get("codec_type") == "video":
            width = _to_int(stream.get("width"))
            height = _to_int(stream.get("height"))
            break

    return MediaProbe(
        duration_seconds=duration,
        size_bytes=_to_int(fmt.get("size")),
        format_name=fmt.get("format_name"),
        has_audio=has_audio,
        has_video=has_video,
        width=width,
        height=height,
    )


async def media_duration_seconds(path: str) -> Optional[float]:
    probe = await probe_media(path)
    if probe.duration_seconds is None:
        return None
    return round(probe.duration_seconds, 3)


def _build_progress(
    out_time_seconds: float,
    total_duration_seconds: Optional[float],
    speed: Optional[str],
    done: bool,
) -> FFmpegProgress:
    fraction: Optional[float]
    if total_duration_seconds is None or total_duration_seconds <= 0:
        fraction = None
    else:
        fraction = max(0.0, min(1.0, out_time_seconds / total_duration_seconds))
    return FFmpegProgress(
        out_time_seconds=out_time_seconds,
        fraction=fraction,
        speed=speed,
        done=done,
    )


async def _invoke_progress_callback(
    on_progress: ProgressCallback, progress: FFmpegProgress
) -> None:
    # A caller's progress callback (updating a DB row, pushing a websocket
    # message, ...) is a side effect that must never be allowed to take down
    # the encode itself -- losing a progress update is fine, losing the
    # output file is not.
    try:
        result = on_progress(progress)
        if inspect.isawaitable(result):
            await result
    except Exception:
        LOGGER.warning("ffmpeg on_progress callback raised", exc_info=True)


async def run_ffmpeg(
    args: Sequence[str],
    *,
    total_duration_seconds: Optional[float] = None,
    on_progress: Optional[ProgressCallback] = None,
    timeout_seconds: float = 900,
) -> FFmpegResult:
    """Run ffmpeg with the given middle-of-command-line args.

    Callers pass only the input/filter/output portion of the command; this
    function owns the binary path and the flags that make ffmpeg behave as a
    non-interactive child process (`-nostdin -y`) and that make progress
    machine-readable (`-progress pipe:1 -nostats`), so every call site gets
    the same safe defaults instead of re-deriving them.
    """
    binary = get_ffmpeg_binary()
    full_args = [
        binary,
        "-hide_banner",
        "-nostdin",
        "-y",
        *args,
        "-progress",
        "pipe:1",
        "-nostats",
    ]

    stderr_tail = BoundedTextBuffer(limit=_STDERR_TAIL_LIMIT)
    last_out_time_seconds = 0.0

    process = await asyncio.create_subprocess_exec(
        *full_args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        **_windows_hidden_subprocess_kwargs(),
    )

    LOGGER.info("[ffmpeg] started pid=%s args=%s", process.pid, full_args)

    async def read_progress() -> None:
        nonlocal last_out_time_seconds
        assert process.stdout is not None
        pending_speed: Optional[str] = None
        while True:
            raw_line = await process.stdout.readline()
            if not raw_line:
                break
            parsed = parse_progress_line(raw_line.decode("utf-8", errors="replace"))
            if parsed is None:
                continue
            key, value = parsed
            if key == "speed":
                pending_speed = value
            elif key == "out_time_ms":
                microseconds = _to_int(value)
                if microseconds is not None:
                    last_out_time_seconds = microseconds / 1_000_000
            elif key == "out_time":
                # `out_time` (HH:MM:SS.ffffff) is the fallback when
                # out_time_ms is missing or unparseable in a given build.
                seconds = _parse_ffmpeg_timestamp(value)
                if seconds is not None:
                    last_out_time_seconds = seconds
            elif key == "progress":
                done = value == "end"
                if on_progress is not None:
                    progress = _build_progress(
                        last_out_time_seconds,
                        total_duration_seconds,
                        pending_speed,
                        done,
                    )
                    await _invoke_progress_callback(on_progress, progress)

    async def drain_stderr() -> None:
        assert process.stderr is not None
        while True:
            chunk = await process.stderr.read(65536)
            if not chunk:
                break
            stderr_tail.append(chunk)

    progress_task = asyncio.create_task(read_progress())
    stderr_task = asyncio.create_task(drain_stderr())

    try:
        await asyncio.wait_for(
            asyncio.gather(process.wait(), progress_task, stderr_task),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        await asyncio.gather(progress_task, stderr_task, return_exceptions=True)
        raise FFmpegRuntimeError(
            f"ffmpeg timed out after {timeout_seconds} seconds",
            returncode=-1,
            stderr_tail=stderr_tail.get(),
        )

    returncode = process.returncode if process.returncode is not None else -1
    LOGGER.info("[ffmpeg] exited pid=%s returncode=%s", process.pid, returncode)

    if returncode != 0:
        raise FFmpegRuntimeError(
            f"ffmpeg exited with code {returncode}",
            returncode=returncode,
            stderr_tail=stderr_tail.get(),
        )

    return FFmpegResult(
        returncode=returncode,
        stderr_tail=stderr_tail.get(),
        duration_seconds_elapsed=last_out_time_seconds if last_out_time_seconds else None,
    )


def _parse_ffmpeg_timestamp(value: str) -> Optional[float]:
    """Parse ffmpeg's HH:MM:SS.microseconds timestamp format."""
    parts = value.split(":")
    if len(parts) != 3:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
    except ValueError:
        return None
    return hours * 3600 + minutes * 60 + seconds
