"""The presenter drawn over a narrated video: voice bubble or avatar video.

One presenter spans the whole deck (see `resolve_slide_actors` in
`services/slide_video_service.py`): on a narrated slide it is the looping
voice bubble, on a slide with an avatar it is that avatar playing in the
slide's placeholder, and on a slide with neither it is absent. Consecutive
voice slides share one bubble, so it stays put across their change; every
avatar is its own clip.

Where the presenter changes at a slide change, the outgoing one fades out and
the incoming one fades in over the same window as the slide crossfade
(`utils/video_crossfade.py`): each overlay is extended by half the fade on
that edge and its alpha ramps over the whole fade. The deck's first and last
frames never fade.

Avatars are silent: they were lip-synced offline to the slide's narration,
which is the soundtrack, so their own audio is never even read. An avatar
starts playing exactly when the narration does (after the slide's lead-in),
holds its first frame until then and its last frame once it ends.

Everything here is pure and counts whole frames, like the crossfade.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Sequence

from utils.speaker_indicator import SpeakerIndicatorFrames

_STAGE_WIDTH = 1280
_STAGE_HEIGHT = 720

Box = tuple[int, int, int, int]


@dataclass(frozen=True)
class ActorSpan:
    """One slide's presenter, in output frames."""

    kind: Literal["voice", "video", "none"]
    start_frame: int
    frames: int
    avatar_path: Optional[str] = None
    # Output pixels (x, y, width, height), width and height even.
    box: Optional[Box] = None
    fit: str = "fill"
    lead_in_frames: int = 0


@dataclass(frozen=True)
class ActorSegment:
    """One overlay: a run of voice slides' bubble, or one avatar."""

    kind: Literal["bubble", "avatar"]
    start_frame: int
    frames: int
    fade_in_frames: int
    fade_out_frames: int
    avatar_path: Optional[str] = None
    box: Optional[Box] = None
    fit: str = "fill"
    # Copies of the avatar's first frame shown before it starts playing.
    play_from_frame: int = 0


def _even(value: float) -> int:
    rounded = max(2, int(round(value)))
    return rounded - (rounded % 2)


def scale_box(box: tuple[float, float, float, float], width: int, height: int) -> Box:
    """A 1280×720 stage box in output pixels, with an even size for yuv420p."""
    x, y, box_width, box_height = box
    scale_x = width / _STAGE_WIDTH
    scale_y = height / _STAGE_HEIGHT
    return (
        int(round(x * scale_x)),
        int(round(y * scale_y)),
        _even(box_width * scale_x),
        _even(box_height * scale_y),
    )


def fit_filter(fit: str, width: int, height: int) -> str:
    """Fit a video into `width`×`height` the way the editor fits the placeholder."""
    if fit == "cover":
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},format=yuva420p"
        )
    if fit == "contain":
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"format=yuva420p,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0"
        )
    return f"scale={width}:{height},format=yuva420p"


def plan_actor_segments(
    spans: Sequence[ActorSpan], half_fades: Sequence[int]
) -> list[ActorSegment]:
    """Group slides into overlays and give each one its fades.

    `half_fades` has one entry per slide boundary, as `plan_half_fades`
    returns it; 0 means a hard cut there.
    """
    segments: list[ActorSegment] = []
    index = 0
    while index < len(spans):
        span = spans[index]
        if span.kind == "none":
            index += 1
            continue
        last = index
        if span.kind == "voice":
            while last + 1 < len(spans) and spans[last + 1].kind == "voice":
                last += 1
        fade_in = half_fades[index - 1] if index > 0 else 0
        fade_out = half_fades[last] if last < len(spans) - 1 else 0
        start = span.start_frame - fade_in
        end = spans[last].start_frame + spans[last].frames + fade_out
        if span.kind == "voice":
            segments.append(
                ActorSegment(
                    kind="bubble",
                    start_frame=start,
                    frames=end - start,
                    fade_in_frames=2 * fade_in,
                    fade_out_frames=2 * fade_out,
                )
            )
        else:
            segments.append(
                ActorSegment(
                    kind="avatar",
                    start_frame=start,
                    frames=end - start,
                    fade_in_frames=2 * fade_in,
                    fade_out_frames=2 * fade_out,
                    avatar_path=span.avatar_path,
                    box=span.box,
                    fit=span.fit,
                    play_from_frame=fade_in + span.lead_in_frames,
                )
            )
        index = last + 1
    return segments


def actor_input_args(
    segments: Sequence[ActorSegment],
    indicator: Optional[SpeakerIndicatorFrames],
    fps: int,
) -> list[str]:
    """One ffmpeg input per overlay, in segment order."""
    args: list[str] = []
    for segment in segments:
        if segment.kind == "bubble":
            if indicator is None:
                raise ValueError("A bubble overlay needs the bubble's frames")
            args.extend(
                [
                    "-f", "image2", "-loop", "1", "-framerate", str(fps),
                    "-t", f"{segment.frames / fps:.6f}", "-i", indicator.pattern,
                ]
            )
        else:
            args.extend(["-an", "-i", str(segment.avatar_path)])
    return args


def _fades(segment: ActorSegment) -> str:
    fades = ""
    if segment.fade_in_frames:
        fades += f",fade=t=in:s=0:n={segment.fade_in_frames}:alpha=1"
    if segment.fade_out_frames:
        fades += (
            f",fade=t=out:s={segment.frames - segment.fade_out_frames}:"
            f"n={segment.fade_out_frames}:alpha=1"
        )
    return fades


def actor_overlay_filters(
    segments: Sequence[ActorSegment],
    *,
    first_input_index: int,
    indicator: Optional[SpeakerIndicatorFrames],
    fps: int,
    video_label: str,
    output_label: str,
) -> list[str]:
    """Overlay every segment on `video_label`, ending in yuv420p `output_label`.

    Each overlay stream is cut to its segment and shifted to its start on the
    deck's timeline; `overlay` passes the picture through untouched before a
    stream starts and after it ends (`eof_action=pass`).
    """
    parts: list[str] = []
    current = video_label
    for number, segment in enumerate(segments):
        input_index = first_input_index + number
        shift = f"setpts=N/{fps}/TB+{segment.start_frame / fps:.6f}/TB"
        if segment.kind == "bubble":
            if indicator is None:
                raise ValueError("A bubble overlay needs the bubble's frames")
            x, y = indicator.x, indicator.y
            chain = (
                f"[{input_index}:v]format=rgba,trim=end_frame={segment.frames},"
                f"{shift}{_fades(segment)}"
            )
        else:
            x, y, width, height = segment.box or (0, 0, 2, 2)
            chain = (
                f"[{input_index}:v]setpts=PTS-STARTPTS,fps={fps},"
                f"{fit_filter(segment.fit, width, height)},"
                f"tpad=start={segment.play_from_frame}:start_mode=clone:"
                f"stop=-1:stop_mode=clone,trim=end_frame={segment.frames},"
                f"{shift}{_fades(segment)}"
            )
        parts.append(f"{chain}[actor{number}]")
        parts.append(
            f"[{current}][actor{number}]overlay=x={x}:y={y}:"
            f"eof_action=pass:format=auto[ov{number}]"
        )
        current = f"ov{number}"
    parts.append(f"[{current}]format=yuv420p[{output_label}]")
    return parts
