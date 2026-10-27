"""Render a narrated video of a finished presentation.

This is the orchestration layer on top of three already-built pieces: the
ffmpeg wrapper (`utils/ffmpeg_utils.py`), the PDF-to-PNG renderer
(`utils/pdf_to_images.py`) and the speaker-note narration service
(`services/speaker_note_tts_service.py`). None of those know about each
other; this module is what turns "a deck with speaker notes" into "one mp4
with narration, timed slides and (optionally) subtitles".

The pipeline, in order: make sure narration audio exists for every slide that
has a note (reusing what is already stored), work out how long each slide
needs to stay on screen from the real length of its audio, check whether a
previous render already matches those inputs exactly (a content-addressed
`source_hash`, not a timestamp), and if not, render the deck to PNG frames,
build subtitle cues from the text that was actually spoken, and hand one
single ffmpeg invocation a concat list of images and a filter graph that pads
every slide's audio to its exact on-screen duration so picture and sound
never drift apart.

A slide with no note and no audio is not an error: it becomes
`min_slide_seconds` of silence and is reported back in `skipped`, the same
shape `generate_speaker_note_audios` already uses.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import logging
import math
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Optional, Sequence, Union

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.tts_languages import TTSLanguage, resolve_tts_language
from models.sql.presentation import PresentationModel
from models.sql.presentation_video import PresentationVideoModel
from models.sql.slide import SlideModel
from services.speaker_note_tts_service import (
    SpeakerNoteAudioGenerationResult,
    generate_speaker_note_audios,
    list_speaker_note_audios,
)
from utils.asset_directory_utils import (
    absolute_fastapi_asset_url,
    get_videos_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.export_utils import export_presentation, get_next_app_url
from utils.ffmpeg_utils import (
    FFmpegProgress,
    FFmpegRuntimeError,
    MISSING_FFMPEG_MESSAGE,
    ffmpeg_available,
    media_duration_seconds,
    probe_media,
    run_ffmpeg,
)
from utils.get_env import get_app_data_directory_env, get_temp_directory_env
from utils.hyperframes_composition import (
    SLIDE_HEIGHT,
    SLIDE_WIDTH,
    CompositionSlide,
    write_hyperframes_project,
)
from utils.hyperframes_runner import (
    HyperFramesRenderError,
    HyperFramesUnavailableError,
    gsap_script_path,
    hyperframes_available,
    render_hyperframes_project,
)
from utils.llm_calls.generate_slide_animations import (
    SlideTween,
    generate_slide_animations,
    slide_animation_end_seconds,
)
from utils.pdf_to_images import PdfRenderError, render_pdf_to_pngs_async
from utils.speaker_indicator import (
    SpeakerIndicatorFrames,
    speaker_indicator_input_args,
    speaker_indicator_intervals,
    speaker_indicator_overlay,
    write_speaker_indicator_frames,
)
from utils.runtime_limits import log_memory
from utils.subtitle_utils import Cue, split_into_cues, write_webvtt

LOGGER = logging.getLogger(__name__)

# How many slide-video encodes may run at once. ffmpeg's libx264 encode is
# CPU-bound and single-invocation-heavy; letting an unbounded number of large
# decks encode concurrently would starve the web workers serving everything
# else. Read inline (not through utils/get_env.py) rather than adding a
# module-level constant, so a deployment can change it without a restart of
# anything except this process picking up the new env value on the next call.
_DEFAULT_ENCODE_CONCURRENCY = 1

ProgressCallback = Callable[[dict[str, Any]], Union[None, Awaitable[None]]]

_RESOLUTIONS: dict[str, tuple[int, int]] = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "1440p": (2560, 1440),
}
_FPS_CHOICES = (24, 30)
_SUBTITLES_MODES = ("soft", "burned", "none")

_MAX_SLIDE_SECONDS = 3600.0

# Captured after a slide's last tween ends, so its final frame (the one held
# for the rest of the narration) is the settled layout, not the last step of
# an ease.
_ANIMATION_SETTLE_SECONDS = 0.3
_ANIMATION_PLAN_CACHE_FILENAME = "animation-plans.json"
_COMPOSITION_FETCH_TIMEOUT_SECONDS = 120.0


class PresentationVideoConfigurationError(RuntimeError):
    """Raised when ffmpeg/ffprobe are not available on this machine."""


class PresentationVideoRenderError(RuntimeError):
    """Raised when rendering frames or encoding the video fails."""


class AnimatedVideoUnavailableError(RuntimeError):
    """Raised when an animated render cannot be made; the still render is used."""


@dataclass
class VideoRenderOptions:
    resolution: str = "1080p"
    fps: int = 30
    subtitles_mode: str = "soft"
    min_slide_seconds: float = 3.0
    lead_in_seconds: float = 0.4
    lead_out_seconds: float = 0.4
    voice: Optional[str] = None
    generate_missing_audio: bool = True
    # Animate Template-v2 slide elements in with HyperFrames instead of
    # showing every slide as one still frame.
    animate: bool = False
    # Show the looping "speaker is talking" bubble in the top-right corner
    # of every narrated slide.
    speaker_indicator: bool = True

    def __post_init__(self) -> None:
        if self.resolution not in _RESOLUTIONS:
            raise ValueError(
                f"Unsupported resolution {self.resolution!r}; expected one of "
                f"{sorted(_RESOLUTIONS)}"
            )
        if self.fps not in _FPS_CHOICES:
            raise ValueError(
                f"Unsupported fps {self.fps!r}; expected one of {_FPS_CHOICES}"
            )
        if self.subtitles_mode not in _SUBTITLES_MODES:
            raise ValueError(
                f"Unsupported subtitles_mode {self.subtitles_mode!r}; expected "
                f"one of {_SUBTITLES_MODES}"
            )
        if not (0 < self.min_slide_seconds <= _MAX_SLIDE_SECONDS):
            raise ValueError("min_slide_seconds must be a small positive number")
        if not (0 <= self.lead_in_seconds <= _MAX_SLIDE_SECONDS):
            raise ValueError("lead_in_seconds must not be negative")
        if not (0 <= self.lead_out_seconds <= _MAX_SLIDE_SECONDS):
            raise ValueError("lead_out_seconds must not be negative")

    @property
    def width(self) -> int:
        return _RESOLUTIONS[self.resolution][0]

    @property
    def height(self) -> int:
        return _RESOLUTIONS[self.resolution][1]

    @property
    def preset(self) -> str:
        preset = f"{self.resolution}-{self.fps}-{self.subtitles_mode}"
        if self.animate:
            preset += "-anim"
        if not self.speaker_indicator:
            preset += "-plain"
        return preset


@dataclass
class SlideTiming:
    slide_index: int
    page_index: int
    audio_path: Optional[str]
    text: str
    audio_seconds: float
    start_seconds: float
    duration_seconds: float
    # Not part of the spec'd public shape, but carried along so
    # `compute_video_source_hash` doesn't need a second pass over the slides
    # and audio rows to look these back up.
    slide_id: Optional[uuid.UUID] = None
    audio_id: Optional[uuid.UUID] = None
    source_note_hash: str = ""
    audio_updated_at: Optional[datetime] = None


@dataclass
class PresentationVideoResult:
    video: PresentationVideoModel
    reused: bool
    skipped: list[dict[str, Any]] = field(default_factory=list)
    narration: Optional[dict[str, Any]] = None
    animation: Optional[dict[str, Any]] = None


async def _emit_progress(
    on_progress: Optional[ProgressCallback],
    phase: str,
    completed: float,
    total: float,
) -> None:
    """Call a caller's progress hook, sync or async, without ever raising.

    Mirrors `_invoke_progress_callback` in ffmpeg_utils: a caller's callback
    (updating a DB row, pushing a websocket message, ...) is a side effect
    that must never be allowed to take down the render itself.
    """
    if on_progress is None:
        return
    try:
        result = on_progress({"phase": phase, "completed": completed, "total": total})
        if inspect.isawaitable(result):
            await result
    except Exception:
        LOGGER.warning("presentation video on_progress callback raised", exc_info=True)


_encode_semaphore: Optional[asyncio.Semaphore] = None
_encode_semaphore_size: Optional[int] = None


def _get_encode_semaphore() -> asyncio.Semaphore:
    global _encode_semaphore, _encode_semaphore_size
    raw = os.getenv("PRESENTATION_VIDEO_ENCODE_CONCURRENCY")
    try:
        size = max(1, int(raw)) if raw else _DEFAULT_ENCODE_CONCURRENCY
    except ValueError:
        size = _DEFAULT_ENCODE_CONCURRENCY
    if _encode_semaphore is None or _encode_semaphore_size != size:
        _encode_semaphore = asyncio.Semaphore(size)
        _encode_semaphore_size = size
    return _encode_semaphore


def compute_video_source_hash(
    *,
    timings: Sequence[SlideTiming],
    language_code: str,
    options: VideoRenderOptions,
) -> str:
    """A stable freshness key for a render: same inputs, same hash, always.

    Built from an explicitly ordered, newline-joined string rather than
    hashing a dict or a Python tuple, so the result is stable across
    processes and Python versions (no `hash()`, no dict iteration order).
    """
    hasher = hashlib.sha256()
    lines: list[str] = []
    for timing in timings:
        lines.append(
            "slide|"
            + "|".join(
                (
                    str(timing.slide_id),
                    str(timing.slide_index),
                    str(timing.audio_id),
                    timing.source_note_hash or "",
                    timing.audio_updated_at.isoformat()
                    if timing.audio_updated_at
                    else "",
                )
            )
        )
    lines.append(f"language={language_code}")
    lines.append(f"preset={options.preset}")
    lines.append(f"resolution={options.resolution}")
    lines.append(f"fps={options.fps}")
    lines.append(f"subtitles_mode={options.subtitles_mode}")
    lines.append(f"min_slide_seconds={options.min_slide_seconds!r}")
    lines.append(f"lead_in_seconds={options.lead_in_seconds!r}")
    lines.append(f"lead_out_seconds={options.lead_out_seconds!r}")
    if options.animate:
        lines.append("animate=1")
    if options.speaker_indicator:
        lines.append("speaker_indicator=1")
    hasher.update("\n".join(lines).encode("utf-8"))
    return hasher.hexdigest()


async def _load_existing_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language_code: Optional[str] = None,
) -> list[PresentationVideoModel]:
    statement = select(PresentationVideoModel).where(
        PresentationVideoModel.presentation == presentation_id
    )
    if language_code is not None:
        statement = statement.where(PresentationVideoModel.language == language_code)
    return list(
        await sql_session.scalars(
            statement.order_by(
                PresentationVideoModel.language, PresentationVideoModel.preset
            )
        )
    )


async def list_presentation_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> list[PresentationVideoModel]:
    """Every rendered video of a deck, across languages and presets."""
    language_code = resolve_tts_language(language).code if language else None
    return await _load_existing_videos(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )


async def delete_presentation_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> int:
    """Drop stored videos and the files behind them (video + sidecar subtitle)."""
    language_code = resolve_tts_language(language).code if language else None
    videos = await _load_existing_videos(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )
    paths: list[str] = []
    for video in videos:
        if video.path:
            paths.append(video.path)
        if video.subtitle_path:
            paths.append(video.subtitle_path)
        await sql_session.delete(video)
    if videos:
        await sql_session.commit()
    remove_presentation_video_files(presentation_id, paths)
    return len(videos)


async def presentation_video_paths(
    sql_session: AsyncSession, *, presentation_id: uuid.UUID
) -> list[str]:
    """Files holding a deck's rendered videos, for a caller about to delete the deck."""
    videos = await _load_existing_videos(
        sql_session, presentation_id=presentation_id
    )
    paths: list[str] = []
    for video in videos:
        if video.path:
            paths.append(video.path)
        if video.subtitle_path:
            paths.append(video.subtitle_path)
    cache_path = _animation_cache_path(presentation_id)
    if os.path.isfile(cache_path):
        paths.append(cache_path)
    return paths


def _remove_video_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        LOGGER.warning("Could not remove presentation video file %s: %s", path, exc)


def remove_presentation_video_files(
    presentation_id: uuid.UUID, paths: Sequence[str]
) -> None:
    """Delete video/subtitle files, and the deck's video folder once empty."""
    directories: set[str] = set()
    for path in paths:
        if not path:
            continue
        directories.add(os.path.dirname(path))
        _remove_video_file(path)
    for directory in directories:
        if os.path.basename(directory) != str(presentation_id):
            continue
        try:
            os.rmdir(directory)
        except OSError:
            continue


def _video_url_for_path(path: Optional[str]) -> Optional[str]:
    """Browser-facing URL for a file written under APP_DATA_DIRECTORY/videos."""
    if not path:
        return None
    app_data = get_app_data_directory_env()
    if not app_data:
        return path
    try:
        relative = os.path.relpath(
            os.path.realpath(path), os.path.realpath(app_data)
        )
    except (OSError, ValueError):
        return path
    if relative.startswith(".."):
        return path
    return absolute_fastapi_asset_url("/app_data/" + relative.replace(os.sep, "/"))


def _escape_filtergraph_path(path: str) -> str:
    """Escape a filesystem path for use inside a single-quoted filter value.

    ffmpeg's filtergraph parser treats `:` as an option separator and `'` /
    `\\` as quoting characters, and a temp directory path routinely contains
    `:` on some platforms and always can contain characters the parser would
    otherwise choke on. Wrapping the whole value in single quotes and
    escaping only backslash and single-quote (the two characters special
    *inside* a quoted value) sidesteps having to individually escape `:`.
    """
    return path.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


def _write_concat_file(
    pages: Sequence[Any], timings: Sequence[SlideTiming], path: str
) -> None:
    """Write the ffmpeg concat-demuxer list for the slide images.

    The final image is repeated once *without* a duration line: the concat
    demuxer ignores the duration on the very last listed file, so without
    this repeat the last slide would flash by for a single frame instead of
    holding for its computed duration. This is a documented ffmpeg quirk, not
    a bug in this code.
    """
    lines: list[str] = []
    for page, timing in zip(pages, timings):
        safe_path = page.path.replace("'", "'\\''")
        lines.append(f"file '{safe_path}'")
        lines.append(f"duration {timing.duration_seconds:.3f}")
    if pages:
        safe_path = pages[-1].path.replace("'", "'\\''")
        lines.append(f"file '{safe_path}'")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _audio_input_args(timing: SlideTiming) -> list[str]:
    if timing.audio_path:
        return ["-i", timing.audio_path]
    return [
        "-f",
        "lavfi",
        "-t",
        f"{timing.duration_seconds:.3f}",
        "-i",
        "anullsrc=r=44100:cl=stereo",
    ]


def build_ffmpeg_args(
    *,
    concat_path: str,
    image_paths: Sequence[str],
    timings: Sequence[SlideTiming],
    vtt_path: Optional[str],
    options: VideoRenderOptions,
    language_code: str,
    output_path: str,
    speaker_indicator: Optional[SpeakerIndicatorFrames] = None,
) -> list[str]:
    """Build the single ffmpeg invocation that assembles the whole video.

    Pure and side-effect free (aside from reading `timings`/`options`, which
    are already in memory) so it can be unit tested by inspecting the
    resulting argv without ever spawning ffmpeg.
    """
    burned_subtitles = options.subtitles_mode == "burned" and vtt_path is not None

    if burned_subtitles:
        # Burning captions means every output frame is drawn on individually,
        # so each one needs its own buffer -- and a still image expanded by
        # the `fps` filter arrives in one unstoppable burst of thousands of
        # frames, which is how this used to exhaust the machine's memory.
        # Looping each slide image at the output frame rate instead makes the
        # demuxer emit one packet per frame, so the input queue applies back
        # pressure and only a handful of frames are ever in flight.
        args: list[str] = []
        for image_path, timing in zip(image_paths, timings):
            args.extend(
                [
                    "-loop",
                    "1",
                    "-framerate",
                    str(options.fps),
                    "-t",
                    f"{timing.duration_seconds:.3f}",
                    "-i",
                    image_path,
                ]
            )
        audio_input_start = len(timings)
    else:
        args = ["-f", "concat", "-safe", "0", "-i", concat_path]
        audio_input_start = 1

    for timing in timings:
        args.extend(_audio_input_args(timing))

    soft_subtitles = options.subtitles_mode == "soft" and vtt_path is not None
    subtitle_input_index: Optional[int] = None
    if soft_subtitles:
        subtitle_input_index = audio_input_start + len(timings)
        args.extend(["-i", vtt_path])
    indicator_input_index = _add_speaker_indicator_input(
        args, speaker_indicator, timings, options
    )

    filter_parts: list[str] = []
    # The concat demuxer's still-image frames carry timestamps derived from
    # each entry's `duration`, not a fixed frame rate; letting the plain `-r`
    # output option retime them is unreliable (verified against a real
    # ffmpeg encode -- it drifts by seconds on multi-slide input) because it
    # only relabels the stream instead of resampling it. Running the video
    # through an explicit `fps` filter forces a real, correctly-timed
    # constant frame rate, so it is applied unconditionally rather than only
    # when subtitles are burned in.
    # `format` runs *before* `fps`, and that order is a memory fix, not a
    # style choice. The slide images decode to rgb24; the encoder wants
    # yuv420p. With the conversion left implicit it is auto-inserted after
    # `fps`, so every one of the thousands of duplicated still frames is
    # converted -- and allocated -- separately, and a whole deck's worth of
    # 1080p frames piles up in the graph (verified: ~3 MB per frame, 10 GB
    # resident on a five-slide deck, killed by the OOM killer). Converting
    # once up front means `fps` duplicates references to a single buffer.
    if burned_subtitles:
        slide_labels = "".join(f"[{i}:v]" for i in range(len(timings)))
        video_chain = (
            f"{slide_labels}concat=n={len(timings)}:v=1:a=0,format=yuv420p"
        )
    else:
        video_chain = f"[0:v]format=yuv420p,fps=fps={options.fps}"
    filter_parts.extend(
        _video_output_parts(
            video_chain,
            subtitles_vtt=vtt_path if burned_subtitles else None,
            speaker_indicator=speaker_indicator,
            indicator_input_index=indicator_input_index,
            timings=timings,
        )
    )
    video_map = "[vout]"

    filter_parts.extend(_audio_filter_parts(timings, options, audio_input_start))

    args.extend(["-filter_complex", ";".join(filter_parts)])
    args.extend(["-map", video_map, "-map", "[aout]"])
    if soft_subtitles and subtitle_input_index is not None:
        args.extend(["-map", f"{subtitle_input_index}:s:0"])

    # The concat list repeats the final image with no duration, which leaves
    # the demuxer holding it open past the deck's end (see
    # `_write_concat_file`). Capping the output at the timeline's own length
    # stops the video running one slide-duration longer than the narration.
    args.extend(
        _encode_args(
            timings=timings,
            soft_subtitles=soft_subtitles,
            language_code=language_code,
            output_path=output_path,
        )
    )
    return args


def _narrated_intervals(timings: Sequence[SlideTiming]) -> list[tuple[float, float]]:
    return speaker_indicator_intervals(
        [
            (timing.start_seconds, timing.duration_seconds, bool(timing.audio_path))
            for timing in timings
        ]
    )


def _add_speaker_indicator_input(
    args: list[str],
    speaker_indicator: Optional[SpeakerIndicatorFrames],
    timings: Sequence[SlideTiming],
    options: VideoRenderOptions,
) -> Optional[int]:
    """Append the looping bubble as the last input, if any slide is narrated."""
    if speaker_indicator is None or not _narrated_intervals(timings):
        return None
    index = sum(1 for arg in args if arg == "-i")
    args.extend(speaker_indicator_input_args(speaker_indicator, options.fps))
    return index


def _video_output_parts(
    video_chain: str,
    *,
    subtitles_vtt: Optional[str],
    speaker_indicator: Optional[SpeakerIndicatorFrames],
    indicator_input_index: Optional[int],
    timings: Sequence[SlideTiming],
) -> list[str]:
    """Finish the picture as `[vout]`: bubble overlay first, burned captions on top."""
    subtitles = (
        f"subtitles='{_escape_filtergraph_path(subtitles_vtt)}'"
        if subtitles_vtt is not None
        else None
    )
    if speaker_indicator is None or indicator_input_index is None:
        return [video_chain + (f",{subtitles}" if subtitles else "") + "[vout]"]
    overlay_label = "vind" if subtitles else "vout"
    parts = [
        video_chain + "[vbase]",
        speaker_indicator_overlay(
            video_label="vbase",
            indicator_input_index=indicator_input_index,
            frames=speaker_indicator,
            intervals=_narrated_intervals(timings),
            output_label=overlay_label,
        ),
    ]
    if subtitles:
        parts.append(f"[vind]{subtitles}[vout]")
    return parts


def _audio_filter_parts(
    timings: Sequence[SlideTiming],
    options: VideoRenderOptions,
    audio_input_start: int,
) -> list[str]:
    """Pad every slide's narration to its exact on-screen time, then join them."""
    filter_parts: list[str] = []
    labels: list[str] = []
    for i, timing in enumerate(timings):
        input_index = audio_input_start + i
        label = f"a{i}"
        labels.append(f"[{label}]")
        if timing.audio_path:
            lead_in_ms = round(options.lead_in_seconds * 1000)
            filter_parts.append(
                f"[{input_index}:a]adelay={lead_in_ms}|{lead_in_ms},apad,"
                f"atrim=0:{timing.duration_seconds:.3f},asetpts=N/SR/TB,"
                f"aformat=sample_rates=44100:channel_layouts=stereo[{label}]"
            )
        else:
            filter_parts.append(
                f"[{input_index}:a]aformat=sample_rates=44100:"
                f"channel_layouts=stereo[{label}]"
            )
    filter_parts.append(
        "".join(labels) + f"concat=n={len(timings)}:v=0:a=1[aout]"
    )
    return filter_parts


def _encode_args(
    *,
    timings: Sequence[SlideTiming],
    soft_subtitles: bool,
    language_code: str,
    output_path: str,
) -> list[str]:
    args = [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
    ]
    if soft_subtitles:
        args.extend(
            ["-c:s", "mov_text", "-metadata:s:s:0", f"language={language_code}"]
        )
    total_seconds = timings[-1].start_seconds + timings[-1].duration_seconds
    args.extend(["-t", f"{total_seconds:.3f}"])
    args.extend(["-movflags", "+faststart", output_path])
    return args


@dataclass
class AnimatedSegment:
    """One slide's share of the animated clip and of the final video, in frames.

    `clip_frames` is how much of the HyperFrames clip the slide occupies (its
    entrance, or a single frame for a still slide); for the remaining
    `frames - clip_frames` ffmpeg holds its last clip frame.
    """

    slide_index: int
    output_start_frame: int
    frames: int
    clip_start_frame: int
    clip_frames: int

    @property
    def hold_frames(self) -> int:
        return max(0, self.frames - self.clip_frames)


def plan_animated_segments(
    timings: Sequence[SlideTiming],
    entrance_seconds: Sequence[Optional[float]],
    fps: int,
) -> list[AnimatedSegment]:
    """Lay every slide out on a frame grid, for the clip and for the video.

    Frame boundaries come from rounding each slide's *cumulative* start, not
    its own duration, so rounding never accumulates into picture drifting
    away from the narration over a long deck. `entrance_seconds` is None for
    a slide shown as a still, which needs a single clip frame.
    """
    segments: list[AnimatedSegment] = []
    clip_start = 0
    for timing, entrance in zip(timings, entrance_seconds):
        start_frame = round(timing.start_seconds * fps)
        end_frame = round((timing.start_seconds + timing.duration_seconds) * fps)
        frames = max(1, end_frame - start_frame)
        if entrance is None:
            clip_frames = 1
        else:
            wanted = math.ceil(
                (entrance + _ANIMATION_SETTLE_SECONDS) * fps - 1e-9
            )
            clip_frames = max(1, min(frames, wanted))
        segments.append(
            AnimatedSegment(
                slide_index=timing.slide_index,
                output_start_frame=start_frame,
                frames=frames,
                clip_start_frame=clip_start,
                clip_frames=clip_frames,
            )
        )
        clip_start += clip_frames
    return segments


def build_animated_ffmpeg_args(
    *,
    clip_path: str,
    segments: Sequence[AnimatedSegment],
    timings: Sequence[SlideTiming],
    vtt_path: Optional[str],
    options: VideoRenderOptions,
    language_code: str,
    output_path: str,
    speaker_indicator: Optional[SpeakerIndicatorFrames] = None,
) -> list[str]:
    """Build the ffmpeg invocation that turns the entrance clip into the video.

    The clip holds every slide's entrance back to back. Each slide reads its
    own stretch of it as a separate input, seeked half a frame before its
    first frame so the seek lands on that frame whatever way the boundary
    rounds, and cut to an exact frame count with `trim`. `tpad` then holds
    the last frame for the rest of the slide's narration, keeping a single
    frame in memory however long the hold is. Splitting one clip input per
    slide would instead buffer every slide's frames until the concat reached
    them, and the `loop` filter that could hold a frame mid-stream counts its
    start frame differently between ffmpeg releases.

    Nothing may retime the frames between the cut and `tpad`: on ffmpeg 7.x
    a `setpts` there leaves `tpad` padding nothing (verified: 36 frames out
    where 120 were asked for, on 7.1, while 6.1 pads correctly), which turns
    every hold into a cut and leaves the video a fraction of its narration's
    length. Timestamps are rebuilt from the frame count after the concat
    instead, which also pins the output to an exact constant frame rate.
    """
    args: list[str] = []
    for segment in segments:
        seek = max(0.0, (segment.clip_start_frame - 0.5) / options.fps)
        args.extend(
            [
                "-ss",
                f"{seek:.6f}",
                "-t",
                f"{(segment.clip_frames + 1) / options.fps:.6f}",
                "-i",
                clip_path,
            ]
        )
    audio_input_start = len(segments)
    for timing in timings:
        args.extend(_audio_input_args(timing))

    soft_subtitles = options.subtitles_mode == "soft" and vtt_path is not None
    subtitle_input_index: Optional[int] = None
    if soft_subtitles:
        subtitle_input_index = audio_input_start + len(timings)
        args.extend(["-i", vtt_path])
    indicator_input_index = _add_speaker_indicator_input(
        args, speaker_indicator, timings, options
    )

    filter_parts: list[str] = []
    labels: list[str] = []
    for index, segment in enumerate(segments):
        chain = f"[{index}:v]trim=end_frame={segment.clip_frames},format=yuv420p"
        if segment.hold_frames > 0:
            chain += f",tpad=stop_mode=clone:stop={segment.hold_frames}"
        filter_parts.append(f"{chain}[v{index}]")
        labels.append(f"[v{index}]")
    video_chain = (
        "".join(labels)
        + f"concat=n={len(segments)}:v=1:a=0,"
        + f"setpts=N/{options.fps}/TB,fps=fps={options.fps}"
    )
    filter_parts.extend(
        _video_output_parts(
            video_chain,
            subtitles_vtt=(
                vtt_path if options.subtitles_mode == "burned" else None
            ),
            speaker_indicator=speaker_indicator,
            indicator_input_index=indicator_input_index,
            timings=timings,
        )
    )
    filter_parts.extend(_audio_filter_parts(timings, options, audio_input_start))

    args.extend(["-filter_complex", ";".join(filter_parts)])
    args.extend(["-map", "[vout]", "-map", "[aout]"])
    if soft_subtitles and subtitle_input_index is not None:
        args.extend(["-map", f"{subtitle_input_index}:s:0"])
    args.extend(
        _encode_args(
            timings=timings,
            soft_subtitles=soft_subtitles,
            language_code=language_code,
            output_path=output_path,
        )
    )
    return args


def build_composition_slides(
    segments: Sequence[AnimatedSegment],
    slide_html: Sequence[str],
    tweens: Sequence[Sequence[SlideTween]],
    fps: int,
) -> list[CompositionSlide]:
    """Place each slide's HTML in its clip slot.

    Slots are offset half a frame early, so a frame is sampled in the middle
    of a slot rather than on its edge, where float rounding in the browser
    could show the previous slide or neither.
    """
    slides: list[CompositionSlide] = []
    for segment, html, slide_tweens in zip(segments, slide_html, tweens):
        start = max(0.0, (segment.clip_start_frame - 0.5) / fps)
        end = (segment.clip_start_frame + segment.clip_frames - 0.5) / fps
        slides.append(
            CompositionSlide(
                slide_index=segment.slide_index,
                html=html,
                start_seconds=start,
                duration_seconds=end - start,
                tweens=slide_tweens,
                timeline_start_seconds=segment.clip_start_frame / fps,
            )
        )
    return slides


def _animation_cache_path(presentation_id: uuid.UUID) -> str:
    return os.path.join(
        get_videos_directory(), str(presentation_id), _ANIMATION_PLAN_CACHE_FILENAME
    )


def _load_animation_cache(path: str) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_animation_cache(path: str, data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = f"{path}.{uuid.uuid4().hex}.tmp"
    try:
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        os.replace(temporary, path)
    except OSError:
        LOGGER.warning("Could not save slide animation plans to %s", path, exc_info=True)
        _remove_video_file(temporary)


async def _resolve_animation_plans(
    *,
    presentation: PresentationModel,
    animated: Sequence[tuple[int, Any, str, Sequence[dict[str, Any]]]],
    slide_count: int,
    on_progress: Optional[ProgressCallback],
) -> dict[int, list[SlideTween]]:
    """Animation plans for `(position, slide_id, html, elements)`, cached per slide.

    A plan is reused for as long as the slide's rendered HTML is unchanged,
    so re-rendering a video after a narration edit costs no LLM calls.
    """
    cache_path = _animation_cache_path(presentation.id)
    cache = _load_animation_cache(cache_path)
    plans: dict[int, list[SlideTween]] = {}
    missing: list[tuple[int, Sequence[dict[str, Any]]]] = []
    hashes: dict[int, tuple[str, str]] = {}

    for position, slide_id, html, elements in animated:
        html_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
        key = str(slide_id)
        hashes[position] = (key, html_hash)
        cached = cache.get(key)
        if isinstance(cached, dict) and cached.get("html_hash") == html_hash:
            try:
                plans[position] = [
                    SlideTween.from_dict(item) for item in cached.get("tweens") or []
                ]
                continue
            except (KeyError, TypeError, ValueError):
                pass
        missing.append((position, elements))

    await _emit_progress(on_progress, "animation-plan", len(plans), len(animated))
    if missing:
        generated = await generate_slide_animations(
            slides=missing,
            slide_count=slide_count,
            deck_title=presentation.title or "",
        )
        for position, tweens in generated.items():
            plans[position] = tweens
            key, html_hash = hashes[position]
            cache[key] = {
                "html_hash": html_hash,
                "tweens": [tween.to_dict() for tween in tweens],
            }
        _save_animation_cache(cache_path, cache)
    await _emit_progress(on_progress, "animation-plan", len(animated), len(animated))
    return plans


async def _fetch_video_composition(
    presentation_id: uuid.UUID, cookie_header: Optional[str]
) -> dict[str, Any]:
    url = f"{get_next_app_url().rstrip('/')}/api/video-composition/{presentation_id}"
    headers = {"x-export-cookie": cookie_header} if cookie_header else {}
    async with httpx.AsyncClient(timeout=_COMPOSITION_FETCH_TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers=headers)
    if response.status_code != 200:
        raise AnimatedVideoUnavailableError(
            f"Slide HTML for the animated video could not be loaded "
            f"(HTTP {response.status_code})"
        )
    data = response.json()
    if not isinstance(data, dict) or not isinstance(data.get("slides"), list):
        raise AnimatedVideoUnavailableError("Slide HTML response was malformed")
    return data


async def _render_slide_pages(
    *,
    presentation: PresentationModel,
    cookie_header: Optional[str],
    tmp_dir: str,
    options: VideoRenderOptions,
    slide_count: int,
    on_progress: Optional[ProgressCallback],
) -> list[Any]:
    """Every slide as one PNG, through the same PDF export as `/export`."""
    export_result = await export_presentation(
        presentation.id,
        presentation.title or str(presentation.id),
        "pdf",
        cookie_header=cookie_header,
    )
    await _emit_progress(on_progress, "render", 0, slide_count)
    try:
        pages = await render_pdf_to_pngs_async(
            export_result.path, tmp_dir, target_height=options.height
        )
    except PdfRenderError as exc:
        raise PresentationVideoRenderError(
            f"Could not render presentation PDF to frames: {exc}"
        ) from exc
    await _emit_progress(on_progress, "render", len(pages), slide_count)

    if len(pages) != slide_count:
        raise PresentationVideoRenderError(
            f"Rendered PDF has {len(pages)} pages but the presentation "
            f"has {slide_count} slides; refusing to render a video "
            "that could misalign narration to the wrong slide"
        )
    return pages


def _still_slide_html(image_reference: str) -> str:
    # The PNG is already at the output resolution; it is placed in the
    # 1280x720 slide box the composition scales, sized to fill it exactly.
    return (
        f'<img src="{image_reference}" alt="" style="position:absolute;left:0;top:0;'
        f'width:{SLIDE_WIDTH}px;height:{SLIDE_HEIGHT}px;display:block">'
    )


@dataclass
class AnimatedRender:
    clip_path: str
    segments: list[AnimatedSegment]
    animated_slides: int


async def _render_animated_clip(
    *,
    presentation: PresentationModel,
    ordered_slides: Sequence[SlideModel],
    timings: Sequence[SlideTiming],
    options: VideoRenderOptions,
    cookie_header: Optional[str],
    tmp_dir: str,
    on_progress: Optional[ProgressCallback],
) -> AnimatedRender:
    """Render the entrance of every slide into one silent HyperFrames clip.

    Template-v2 slides get their planned entrance; any other slide is placed
    in the clip as its still PDF frame for a single frame, so the encode
    treats every slide the same way.
    """
    if not hyperframes_available():
        raise AnimatedVideoUnavailableError(
            "The HyperFrames renderer is not installed on this server"
        )
    gsap_path = str(gsap_script_path())

    composition = await _fetch_video_composition(presentation.id, cookie_header)
    composed = composition["slides"]
    if len(composed) != len(ordered_slides):
        raise AnimatedVideoUnavailableError(
            f"Slide HTML covers {len(composed)} slides but the presentation "
            f"has {len(ordered_slides)}"
        )
    for slide, entry in zip(ordered_slides, composed):
        if str(entry.get("id")) != str(slide.id):
            raise AnimatedVideoUnavailableError(
                "Slide HTML is out of step with the presentation's slides"
            )

    animated = [
        (position, slide.id, entry["html"], entry.get("elements") or [])
        for position, (slide, entry) in enumerate(zip(ordered_slides, composed))
        if isinstance(entry.get("html"), str) and entry["html"]
    ]
    if not animated:
        raise AnimatedVideoUnavailableError(
            "None of this presentation's slides can be animated"
        )

    plans = await _resolve_animation_plans(
        presentation=presentation,
        animated=animated,
        slide_count=len(ordered_slides),
        on_progress=on_progress,
    )

    pages: Optional[list[Any]] = None
    if len(animated) < len(ordered_slides):
        pages = await _render_slide_pages(
            presentation=presentation,
            cookie_header=cookie_header,
            tmp_dir=tmp_dir,
            options=options,
            slide_count=len(ordered_slides),
            on_progress=on_progress,
        )

    project_dir = os.path.join(tmp_dir, "hyperframes")
    still_dir = os.path.join(project_dir, "stills")
    html_by_position = {position: html for position, _, html, _ in animated}
    slide_html: list[str] = []
    entrance: list[Optional[float]] = []
    tweens: list[list[SlideTween]] = []
    for position in range(len(ordered_slides)):
        if position in html_by_position:
            slide_tweens = plans.get(position) or []
            slide_html.append(html_by_position[position])
            entrance.append(slide_animation_end_seconds(slide_tweens))
            tweens.append(slide_tweens)
            continue
        assert pages is not None
        os.makedirs(still_dir, exist_ok=True)
        still_name = f"slide-{position}.png"
        shutil.copyfile(pages[position].path, os.path.join(still_dir, still_name))
        slide_html.append(_still_slide_html(f"stills/{still_name}"))
        entrance.append(None)
        tweens.append([])

    segments = plan_animated_segments(timings, entrance, options.fps)
    write_hyperframes_project(
        project_dir,
        build_composition_slides(segments, slide_html, tweens, options.fps),
        width=options.width,
        height=options.height,
        gsap_path=gsap_path,
        chart_scripts=composition.get("chart_scripts") or None,
    )

    clip_path = os.path.join(tmp_dir, "animated.mp4")

    async def _clip_progress(percent: float, _message: str) -> None:
        await _emit_progress(on_progress, "animate", percent, 100)

    try:
        await render_hyperframes_project(
            project_dir, clip_path, fps=options.fps, on_progress=_clip_progress
        )
    except (HyperFramesRenderError, HyperFramesUnavailableError) as exc:
        tail = getattr(exc, "stderr_tail", "")
        if tail:
            LOGGER.warning("HyperFrames output tail:\n%s", tail[-4000:])
        raise AnimatedVideoUnavailableError(str(exc)) from exc

    return AnimatedRender(
        clip_path=clip_path, segments=segments, animated_slides=len(animated)
    )


async def _resolve_narration(
    *,
    presentation: PresentationModel,
    ordered_slides: Sequence[SlideModel],
    target_language: TTSLanguage,
    sql_session: AsyncSession,
    options: VideoRenderOptions,
    on_progress: Optional[ProgressCallback],
) -> tuple[dict[uuid.UUID, Any], Optional[SpeakerNoteAudioGenerationResult]]:
    if options.generate_missing_audio:

        async def _narration_progress(completed: int, total: int) -> None:
            await _emit_progress(on_progress, "narration", completed, total)

        narration_result = await generate_speaker_note_audios(
            presentation=presentation,
            slides=ordered_slides,
            language=target_language.code,
            sql_session=sql_session,
            voice=options.voice,
            on_progress=_narration_progress,
        )
        audios = narration_result.audios
    else:
        narration_result = None
        audios = await list_speaker_note_audios(
            sql_session,
            presentation_id=presentation.id,
            language=target_language.code,
        )
    return {audio.slide: audio for audio in audios}, narration_result


async def _build_timings(
    *,
    ordered_slides: Sequence[SlideModel],
    audio_by_slide: dict[uuid.UUID, Any],
    options: VideoRenderOptions,
    already_skipped: Sequence[dict[str, Any]],
) -> tuple[list[SlideTiming], list[dict[str, Any]]]:
    skipped: list[dict[str, Any]] = list(already_skipped)
    skipped_indexes = {entry["slide_index"] for entry in skipped}

    timings: list[SlideTiming] = []
    start = 0.0
    for page_index, slide in enumerate(ordered_slides):
        audio = audio_by_slide.get(slide.id)
        audio_path: Optional[str] = None
        text = ""
        audio_seconds = 0.0
        source_note_hash = ""
        audio_id: Optional[uuid.UUID] = None
        audio_updated_at: Optional[datetime] = None

        if audio is not None and audio.path and os.path.isfile(audio.path):
            audio_path = audio.path
            text = audio.text or ""
            source_note_hash = audio.source_note_hash or ""
            audio_id = audio.id
            audio_updated_at = audio.updated_at
            measured = await media_duration_seconds(audio.path)
            if measured is not None:
                audio_seconds = measured
            elif audio.duration_seconds:
                audio_seconds = audio.duration_seconds
            else:
                audio_seconds = options.min_slide_seconds
        elif slide.index not in skipped_indexes:
            skipped.append(
                {
                    "slide_index": slide.index,
                    "reason": "No narration audio available for this slide",
                }
            )
            skipped_indexes.add(slide.index)

        duration = max(
            options.lead_in_seconds + audio_seconds + options.lead_out_seconds,
            options.min_slide_seconds,
        )
        timings.append(
            SlideTiming(
                slide_index=slide.index,
                page_index=page_index,
                audio_path=audio_path,
                text=text,
                audio_seconds=audio_seconds,
                start_seconds=start,
                duration_seconds=duration,
                slide_id=slide.id,
                audio_id=audio_id,
                source_note_hash=source_note_hash,
                audio_updated_at=audio_updated_at,
            )
        )
        start += duration

    skipped.sort(key=lambda entry: entry["slide_index"])
    return timings, skipped


def _build_cues(timings: Sequence[SlideTiming], options: VideoRenderOptions) -> list[Cue]:
    cues: list[Cue] = []
    for timing in timings:
        if not timing.text or timing.audio_seconds <= 0:
            continue
        cues.extend(
            split_into_cues(
                timing.text,
                start_seconds=timing.start_seconds + options.lead_in_seconds,
                duration_seconds=timing.audio_seconds,
            )
        )
    return cues


async def generate_presentation_video(
    *,
    presentation: PresentationModel,
    slides: Sequence[SlideModel],
    language: str,
    sql_session: AsyncSession,
    options: Optional[VideoRenderOptions] = None,
    regenerate: bool = False,
    cookie_header: Optional[str] = None,
    on_progress: Optional[ProgressCallback] = None,
) -> PresentationVideoResult:
    """Render (or reuse) one narrated video of a deck, in one language/preset."""
    if not ffmpeg_available():
        raise PresentationVideoConfigurationError(MISSING_FFMPEG_MESSAGE)

    target_language = resolve_tts_language(language)
    opts = options or VideoRenderOptions()

    ordered_slides = sorted(slides, key=lambda slide: slide.index)

    audio_by_slide, narration_result = await _resolve_narration(
        presentation=presentation,
        ordered_slides=ordered_slides,
        target_language=target_language,
        sql_session=sql_session,
        options=opts,
        on_progress=on_progress,
    )

    timings, skipped = await _build_timings(
        ordered_slides=ordered_slides,
        audio_by_slide=audio_by_slide,
        options=opts,
        already_skipped=narration_result.skipped if narration_result else [],
    )

    source_hash = compute_video_source_hash(
        timings=timings, language_code=target_language.code, options=opts
    )

    existing = await sql_session.scalar(
        select(PresentationVideoModel).where(
            PresentationVideoModel.presentation == presentation.id,
            PresentationVideoModel.language == target_language.code,
            PresentationVideoModel.preset == opts.preset,
        )
    )

    if (
        not regenerate
        and existing is not None
        and existing.source_hash == source_hash
        and existing.path
        and os.path.isfile(existing.path)
    ):
        return PresentationVideoResult(
            video=existing,
            reused=True,
            skipped=skipped,
            narration=narration_result.summary() if narration_result else None,
            # A still fallback is stored under a hash that never matches, so
            # an animated preset that is reused is always an animated render.
            animation={"requested": True, "applied": True} if opts.animate else None,
        )

    if not timings:
        raise PresentationVideoRenderError("Presentation has no slides to render")

    total_duration = timings[-1].start_seconds + timings[-1].duration_seconds

    log_memory(
        LOGGER,
        "presentation.video.render.start",
        presentation_id=str(presentation.id),
        language=target_language.code,
        preset=opts.preset,
    )

    animation: Optional[dict[str, Any]] = None
    stored_source_hash = source_hash

    temp_root = get_temp_directory_env() or None
    with tempfile.TemporaryDirectory(dir=temp_root) as tmp_dir:
        try:
            animated_render: Optional[AnimatedRender] = None
            if opts.animate:
                try:
                    animated_render = await _render_animated_clip(
                        presentation=presentation,
                        ordered_slides=ordered_slides,
                        timings=timings,
                        options=opts,
                        cookie_header=cookie_header,
                        tmp_dir=tmp_dir,
                        on_progress=on_progress,
                    )
                    animation = {
                        "requested": True,
                        "applied": True,
                        "animated_slides": animated_render.animated_slides,
                    }
                except (AnimatedVideoUnavailableError, httpx.HTTPError) as exc:
                    # Animation is an enhancement: the narrated video still
                    # gets made, as stills, and says why. The stored hash is
                    # made not to match, so the next request tries again
                    # instead of serving this fallback as the animated video.
                    LOGGER.warning(
                        "Animated video unavailable for %s, rendering stills: %s",
                        presentation.id,
                        exc,
                    )
                    animation = {
                        "requested": True,
                        "applied": False,
                        "animated_slides": 0,
                        "reason": str(exc),
                    }
                    stored_source_hash = f"{source_hash}:stills"

            vtt_path: Optional[str] = None
            if opts.subtitles_mode != "none":
                cues = _build_cues(timings, opts)
                vtt_path = os.path.join(tmp_dir, "subtitles.vtt")
                write_webvtt(cues, vtt_path)

            pages: list[Any] = []
            concat_path = os.path.join(tmp_dir, "concat.txt")
            if animated_render is None:
                pages = await _render_slide_pages(
                    presentation=presentation,
                    cookie_header=cookie_header,
                    tmp_dir=tmp_dir,
                    options=opts,
                    slide_count=len(timings),
                    on_progress=on_progress,
                )
                _write_concat_file(pages, timings, concat_path)

            speaker_indicator: Optional[SpeakerIndicatorFrames] = None
            if opts.speaker_indicator and _narrated_intervals(timings):
                speaker_indicator = write_speaker_indicator_frames(
                    os.path.join(tmp_dir, "speaker-indicator"),
                    width=opts.width,
                    height=opts.height,
                    fps=opts.fps,
                )

            video_id = existing.id if existing is not None else uuid.uuid4()
            output_dir = os.path.join(get_videos_directory(), str(presentation.id))
            os.makedirs(output_dir, exist_ok=True)
            file_stub = f"{target_language.code}-{opts.preset}-{uuid.uuid4().hex}"
            output_path = os.path.join(output_dir, f"{file_stub}.mp4")
            subtitle_output_path = (
                os.path.join(output_dir, f"{file_stub}.vtt")
                if opts.subtitles_mode == "soft"
                else None
            )

            if animated_render is not None:
                ffmpeg_args = build_animated_ffmpeg_args(
                    clip_path=animated_render.clip_path,
                    segments=animated_render.segments,
                    timings=timings,
                    vtt_path=vtt_path,
                    options=opts,
                    language_code=target_language.code,
                    output_path=output_path,
                    speaker_indicator=speaker_indicator,
                )
            else:
                ffmpeg_args = build_ffmpeg_args(
                    concat_path=concat_path,
                    image_paths=[page.path for page in pages],
                    timings=timings,
                    vtt_path=vtt_path,
                    options=opts,
                    language_code=target_language.code,
                    output_path=output_path,
                    speaker_indicator=speaker_indicator,
                )

            async def _encode_progress(progress: FFmpegProgress) -> None:
                await _emit_progress(
                    on_progress, "encode", progress.out_time_seconds, total_duration
                )

            async with _get_encode_semaphore():
                try:
                    await run_ffmpeg(
                        ffmpeg_args,
                        total_duration_seconds=total_duration,
                        on_progress=_encode_progress,
                    )
                except FFmpegRuntimeError as exc:
                    raise PresentationVideoRenderError(
                        f"ffmpeg failed while rendering the presentation video: {exc}"
                    ) from exc

            if subtitle_output_path is not None and vtt_path is not None:
                shutil.copyfile(vtt_path, subtitle_output_path)
        finally:
            pass  # TemporaryDirectory cleans itself up on context exit.

    probe = await probe_media(output_path)
    try:
        size_bytes = os.path.getsize(output_path)
    except OSError:
        size_bytes = probe.size_bytes

    url = _video_url_for_path(output_path)
    subtitle_url = _video_url_for_path(subtitle_output_path)

    old_paths: list[str] = []
    if existing is not None:
        if existing.path and existing.path != output_path:
            old_paths.append(existing.path)
        if existing.subtitle_path and existing.subtitle_path != subtitle_output_path:
            old_paths.append(existing.subtitle_path)
        existing.language_name = target_language.name
        existing.path = output_path
        existing.url = url
        existing.subtitles_mode = opts.subtitles_mode
        existing.subtitle_path = subtitle_output_path
        existing.subtitle_url = subtitle_url
        existing.resolution = opts.resolution
        existing.width = opts.width
        existing.height = opts.height
        existing.fps = opts.fps
        existing.slide_count = len(timings)
        existing.duration_seconds = probe.duration_seconds
        existing.size_bytes = size_bytes
        existing.source_hash = stored_source_hash
        existing.updated_at = get_current_utc_datetime()
        video_row = existing
    else:
        video_row = PresentationVideoModel(
            id=video_id,
            presentation=presentation.id,
            language=target_language.code,
            language_name=target_language.name,
            preset=opts.preset,
            path=output_path,
            url=url,
            subtitles_mode=opts.subtitles_mode,
            subtitle_path=subtitle_output_path,
            subtitle_url=subtitle_url,
            resolution=opts.resolution,
            width=opts.width,
            height=opts.height,
            fps=opts.fps,
            slide_count=len(timings),
            duration_seconds=probe.duration_seconds,
            size_bytes=size_bytes,
            source_hash=stored_source_hash,
        )

    sql_session.add(video_row)
    await sql_session.commit()
    await sql_session.refresh(video_row)

    # The old file(s) are only removed once the new row has committed
    # successfully, so a cached URL can never end up pointing at a file that
    # no longer exists, and a failed commit never orphans the fresh render.
    for old_path in old_paths:
        _remove_video_file(old_path)

    log_memory(
        LOGGER,
        "presentation.video.render.finish",
        presentation_id=str(presentation.id),
        language=target_language.code,
        preset=opts.preset,
    )

    return PresentationVideoResult(
        video=video_row,
        reused=False,
        skipped=skipped,
        narration=narration_result.summary() if narration_result else None,
        animation=animation,
    )
