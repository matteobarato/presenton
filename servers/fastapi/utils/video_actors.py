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

The avatar and the bubble are the two forms of the one presenter, and where
one hands over to the other the picture morphs instead of fading. Going to the
bubble the avatar collapses: it stays sharp while its corners round off into a
circle the bubble's size and it travels to the bubble's spot, and only at the
very end does it dissolve into the bubble. Coming from the bubble it is the
reverse: the bubble dissolves into a circle of the avatar that opens out into
its placeholder. The morph has its own, longer window, centred on the slide
change and limited to the narration's silent lead-in and lead-out so no spoken
word is ever covered; the slide itself still crossfades over its own window.

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
# Where an avatar collapses to: the bubble's centre and diameter, in output
# pixels.
Collapse = tuple[float, float, int]


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
    # The placeholder's corner radius, in output pixels.
    radius: float = 0.0


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
    radius: float = 0.0
    # Copies of the avatar's first frame shown before it starts playing.
    play_from_frame: int = 0
    # The fade-in stays fully transparent for this many frames first: a bubble
    # that takes over from a collapsing avatar appears in the window's second
    # half, as the avatar dissolves into it.
    fade_in_start: int = 0
    # Where, in the segment, the fade-out starts; the end of the segment when
    # unset. A bubble handing over to an avatar is gone after a short dissolve
    # at the start of the morph window.
    fade_out_start: Optional[int] = None
    # An avatar morphs from and to the bubble over its first `morph_in_frames`
    # and last `morph_out_frames`, so it plays plainly in between. These
    # windows carry the dissolve with the bubble instead of `fade_*_frames`.
    morph_in_frames: int = 0
    morph_out_frames: int = 0
    # The bubble the avatar morphs with: its centre and diameter.
    collapse_to: Optional[Collapse] = None


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


def scale_radius(radius: float, box: Box, width: int) -> float:
    """A stage corner radius in output pixels, no larger than half the box."""
    _, _, box_width, box_height = box
    return max(0.0, min(radius * width / _STAGE_WIDTH, min(box_width, box_height) / 2))


def _rounded_mask(width: int, height: int, radius: float) -> str:
    """`geq` that clips the avatar to the placeholder's rounded corners."""
    if radius <= 0:
        return ""
    alpha = (
        f"st(4,abs(X+0.5-{width / 2})-({width / 2}-{radius}));"
        f"st(5,abs(Y+0.5-{height / 2})-({height / 2}-{radius}));"
        "alpha(X,Y)*clip(0.5-(hypot(max(ld(4),0),max(ld(5),0))"
        f"+min(max(ld(4),ld(5)),0)-{radius}),0,1)"
    )
    return f",geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{alpha}'"


def dissolve_frames(window: int) -> int:
    """The short cross-dissolve that swaps avatar and bubble inside a morph."""
    return max(2, window // 5)


def plan_actor_segments(
    spans: Sequence[ActorSpan],
    half_fades: Sequence[int],
    bubble: Optional[SpeakerIndicatorFrames] = None,
    morph_halves: Optional[Sequence[int]] = None,
) -> list[ActorSegment]:
    """Group slides into overlays and give each one its fades and morphs.

    `half_fades` has one entry per slide boundary, as `plan_half_fades`
    returns it; 0 means a hard cut there. `morph_halves` says, per boundary,
    how far the avatar/bubble morph reaches into each slide; where it is set
    (and the boundary has a crossfade, and the `bubble` is drawn) an avatar
    and the bubble morph into each other there instead of fading.
    """

    def morphs(boundary: int) -> bool:
        if bubble is None or morph_halves is None:
            return False
        if half_fades[boundary] <= 0 or morph_halves[boundary] <= 0:
            return False
        kinds = {spans[boundary].kind, spans[boundary + 1].kind}
        return kinds == {"voice", "video"}

    def half(boundary: int) -> int:
        if morphs(boundary):
            return int((morph_halves or [0])[boundary])
        return half_fades[boundary]

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
        fade_in = half(index - 1) if index > 0 else 0
        fade_out = half(last) if last < len(spans) - 1 else 0
        morph_in = index > 0 and morphs(index - 1)
        morph_out = last < len(spans) - 1 and morphs(last)
        start = span.start_frame - fade_in
        end = spans[last].start_frame + spans[last].frames + fade_out
        frames = end - start
        if span.kind == "voice":
            fade_in_frames, fade_in_start = 2 * fade_in, 0
            if morph_in:
                fade_in_frames = dissolve_frames(2 * fade_in)
                fade_in_start = 2 * fade_in - fade_in_frames
            fade_out_frames, fade_out_start = 2 * fade_out, None
            if morph_out:
                fade_out_frames = dissolve_frames(2 * fade_out)
                fade_out_start = frames - 2 * fade_out
            segments.append(
                ActorSegment(
                    kind="bubble",
                    start_frame=start,
                    frames=frames,
                    fade_in_frames=fade_in_frames,
                    fade_out_frames=fade_out_frames,
                    fade_in_start=fade_in_start,
                    fade_out_start=fade_out_start,
                )
            )
        else:
            segments.append(
                ActorSegment(
                    kind="avatar",
                    start_frame=start,
                    frames=frames,
                    fade_in_frames=0 if morph_in else 2 * fade_in,
                    fade_out_frames=0 if morph_out else 2 * fade_out,
                    avatar_path=span.avatar_path,
                    box=span.box,
                    fit=span.fit,
                    radius=span.radius,
                    play_from_frame=fade_in + span.lead_in_frames,
                    morph_in_frames=2 * fade_in if morph_in else 0,
                    morph_out_frames=2 * fade_out if morph_out else 0,
                    collapse_to=(
                        (*bubble.centre, bubble.diameter or bubble.size)
                        if bubble is not None and (morph_in or morph_out)
                        else None
                    ),
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


def _fades(segment: ActorSegment, *, frames: Optional[int] = None) -> str:
    """Alpha fades for the segment's plain edges (not its morphs)."""
    frames = segment.frames if frames is None else frames
    fades = ""
    if segment.fade_in_frames:
        fades += (
            f",fade=t=in:s={segment.fade_in_start}:"
            f"n={segment.fade_in_frames}:alpha=1"
        )
    if segment.fade_out_frames:
        start = (
            frames - segment.fade_out_frames
            if segment.fade_out_start is None
            else segment.fade_out_start
        )
        fades += f",fade=t=out:s={start}:n={segment.fade_out_frames}:alpha=1"
    return fades


def _eased(progress: str) -> str:
    """Smootherstep of a 0..1 expression: slow start, slow finish."""
    return f"({progress}*{progress}*{progress}*({progress}*(6*{progress}-15)+10))"


def _shape(variable: str, offset: int, window: int, *, expanding: bool) -> str:
    """How far the avatar is from its placeholder, 0..1 (1 = the bubble).

    `variable` is the frame counter the expression runs on and `offset` the
    frame the morph window starts at on it.
    """
    progress = f"clip(({variable}-{offset})/{max(1, window - 1)},0,1)"
    eased = _eased(progress)
    return f"(1-{eased})" if expanding else eased


def _circle_mask(
    width: int, height: int, window: int, *, expanding: bool, radius: float = 0.0
) -> str:
    """`geq` that rounds the avatar's corners into a circle as it morphs.

    A rounded rectangle centred on the picture shrinks from the whole
    placeholder to the largest circle in it; its edge is anti-aliased from
    the signed distance. The picture itself is left untouched, so it stays
    sharp, and the circle crops it to its middle. It starts from the
    placeholder's own corner `radius`.
    """
    side = min(width, height)
    corner = f"{radius}+({side / 2}-{radius})" if radius else f"{side / 2}"
    store = "st(0,clip(N/%d,0,1));" % max(1, window - 1)
    store += "st(0,ld(0)*ld(0)*ld(0)*(ld(0)*(6*ld(0)-15)+10));"
    if expanding:
        store += "st(0,1-ld(0));"
    alpha = (
        f"{store}"
        f"st(1,{width / 2}+({side / 2}-{width / 2})*ld(0));"
        f"st(2,{height / 2}+({side / 2}-{height / 2})*ld(0));"
        f"st(3,{corner}*ld(0));"
        f"st(4,abs(X+0.5-{width / 2})-(ld(1)-ld(3)));"
        f"st(5,abs(Y+0.5-{height / 2})-(ld(2)-ld(3)));"
        "alpha(X,Y)*clip(0.5-(hypot(max(ld(4),0),max(ld(5),0))"
        "+min(max(ld(4),ld(5)),0)-ld(3)),0,1)"
    )
    return f"geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{alpha}'"


def _morph_size(segment: ActorSegment, shape: str) -> tuple[str, str]:
    """Width and height expressions of the avatar's canvas while it morphs."""
    _, _, width, height = segment.box or (0, 0, 2, 2)
    _, _, diameter = segment.collapse_to or (0, 0, 2)
    factor = f"(1+({diameter / min(width, height):.6f}-1)*{shape})"
    return (
        f"max(2,2*round({width}*{factor}/2))",
        f"max(2,2*round({height}*{factor}/2))",
    )


def _morph_scale(segment: ActorSegment, window: int, *, expanding: bool) -> str:
    """Scale the masked avatar frame by frame (its `n` counts from 0)."""
    shape = _shape("n", 0, window, expanding=expanding)
    width, height = _morph_size(segment, shape)
    return f"scale=w='{width}':h='{height}':eval=frame"


def _morph_position(
    segment: ActorSegment, first_frame: int, window: int, *, expanding: bool
) -> tuple[str, str]:
    """Overlay `x`/`y` of the morphing avatar, on the deck's frame count.

    The picture's centre travels between its placeholder's and the bubble's.
    """
    x, y, box_width, box_height = segment.box or (0, 0, 2, 2)
    target_x, target_y, _ = segment.collapse_to or (0.0, 0.0, 2)
    shape = _shape("n", first_frame, window, expanding=expanding)
    width, height = _morph_size(segment, shape)
    centre_x = f"({x + box_width / 2}+({target_x:.3f}-{x + box_width / 2})*{shape})"
    centre_y = f"({y + box_height / 2}+({target_y:.3f}-{y + box_height / 2})*{shape})"
    return f"'{centre_x}-({width})/2'", f"'{centre_y}-({height})/2'"


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
    stream starts and after it ends (`eof_action=pass`). An avatar that
    morphs is split into up to three streams: the morph into the segment's
    start, the plain playback, and the morph out of its end.
    """
    parts: list[str] = []
    current = video_label
    overlay_count = 0

    def overlay(stream: str, x: str, y: str) -> None:
        nonlocal current, overlay_count
        parts.append(
            f"[{current}][{stream}]overlay=x={x}:y={y}:"
            f"eof_action=pass:format=auto[ov{overlay_count}]"
        )
        current = f"ov{overlay_count}"
        overlay_count += 1

    for number, segment in enumerate(segments):
        input_index = first_input_index + number
        # Whole frames in a 1/fps time base: a start written as rounded
        # seconds can land a frame early (frame 61 at 30 fps is 2.0333…).
        shift = f"settb=1/{fps},setpts=N+{segment.start_frame}"
        if segment.kind == "bubble":
            if indicator is None:
                raise ValueError("A bubble overlay needs the bubble's frames")
            parts.append(
                f"[{input_index}:v]format=rgba,trim=end_frame={segment.frames},"
                f"{shift}{_fades(segment)}[actor{number}]"
            )
            overlay(f"actor{number}", str(indicator.x), str(indicator.y))
            continue

        x, y, width, height = segment.box or (0, 0, 2, 2)
        prepared = (
            f"[{input_index}:v]setpts=PTS-STARTPTS,fps={fps},"
            f"{fit_filter(segment.fit, width, height)},"
            f"tpad=start={segment.play_from_frame}:start_mode=clone:"
            f"stop=-1:stop_mode=clone,trim=end_frame={segment.frames}"
            f"{_rounded_mask(width, height, segment.radius)}"
        )
        morph_in = segment.morph_in_frames if segment.collapse_to else 0
        morph_out = segment.morph_out_frames if segment.collapse_to else 0
        if not (morph_in or morph_out):
            parts.append(f"{prepared},{shift}{_fades(segment)}[actor{number}]")
            overlay(f"actor{number}", str(x), str(y))
            continue

        # The middle is the plain playback between the morphs, with the
        # fades of any edge that does not morph.
        middle_start = morph_in
        middle_end = segment.frames - morph_out
        pieces = [("in", morph_in), ("mid", 0), ("out", morph_out)]
        used = [(kind, size) for kind, size in pieces if kind == "mid" or size]
        labels = [f"av{number}{kind}" for kind, _ in used]
        parts.append(f"{prepared}[prep{number}]")
        parts.append(f"[prep{number}]split={len(used)}" + "".join(f"[{l}]" for l in labels))
        for (kind, size), label in zip(used, labels):
            if kind == "mid":
                parts.append(
                    f"[{label}]trim=start_frame={middle_start}:end_frame={middle_end},"
                    f"settb=1/{fps},setpts=N+{segment.start_frame + middle_start}"
                    f"{_fades(segment, frames=middle_end - middle_start)}"
                    f"[piece{number}{kind}]"
                )
                overlay(f"piece{number}{kind}", str(x), str(y))
                continue
            expanding = kind == "in"
            first = 0 if expanding else segment.frames - size
            dissolve = dissolve_frames(size)
            fade = (
                f"fade=t=in:s=0:n={dissolve}:alpha=1"
                if expanding
                else f"fade=t=out:s={size - dissolve}:n={dissolve}:alpha=1"
            )
            window = (
                f"trim=end_frame={size}"
                if expanding
                else f"trim=start_frame={first}"
            )
            parts.append(
                f"[{label}]{window},settb=1/{fps},"
                f"setpts=N+{segment.start_frame + first},format=yuva420p,"
                f"{_circle_mask(width, height, size, expanding=expanding, radius=segment.radius)},{fade},"
                f"{_morph_scale(segment, size, expanding=expanding)}[piece{number}{kind}]"
            )
            morph_x, morph_y = _morph_position(
                segment, segment.start_frame + first, size, expanding=expanding
            )
            overlay(f"piece{number}{kind}", morph_x, morph_y)
    parts.append(f"[{current}]format=yuv420p[{output_label}]")
    return parts
