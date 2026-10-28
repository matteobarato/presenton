"""Slide content layered over an avatar, drawn over it in a narrated video.

An avatar plays in its slide's video placeholder, which sits in a component of
its own and so has a layer like any other component (see
`services/slide_video_service.py`). Where the slide draws components over the
placeholder, the slide is split at it: the picture under the avatar is the
slide up to and including the placeholder, and the components above it are a
transparent layer drawn over the avatar. A slide with nothing above its
placeholder is drawn whole, and its avatar on top, as before.

Each such layer is one overlay on the deck's timeline, shown for exactly as
long as its slide: it follows the slide's crossfades, extended by half the
fade on each edge with its alpha ramping over the whole fade, and is drawn
after the presenter and before burned-in captions. It is a still PNG when
slides are stills, or the slide's stretch of an alpha clip when they are
animated, held on its last frame like the slide itself.

Everything here is pure and counts whole frames, like the crossfade.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence


@dataclass(frozen=True)
class OverAvatarLayer:
    """The content above one slide's avatar, as one overlay."""

    path: str
    # On the deck timeline, including the reach of the slide's fades.
    start_frame: int
    frames: int
    fade_in_frames: int
    fade_out_frames: int
    # Copies of the first frame shown before the slide's own first frame, for
    # the fade into it.
    lead_frames: int = 0
    # Set when `path` is the animated alpha clip: where the slide's entrance
    # starts in it, and how long it runs before its last frame is held.
    clip_start_frame: Optional[int] = None
    clip_frames: int = 1


def plan_over_avatar_layers(
    spans: Sequence[tuple[int, int]],
    half_fades: Sequence[int],
    paths: dict[int, str],
    clip_slots: Optional[dict[int, tuple[int, int]]] = None,
) -> list[OverAvatarLayer]:
    """One overlay per slide in `paths`, in slide order.

    `spans` is every slide's `(start_frame, frames)` and `half_fades` the
    crossfade at each boundary, as `plan_half_fades` returns them (empty or
    all 0 for hard cuts). `clip_slots` maps a slide to its `(clip_start_frame,
    clip_frames)` in the alpha clip when the layers are animated.
    """
    layers: list[OverAvatarLayer] = []
    for position in sorted(paths):
        start, frames = spans[position]
        before = half_fades[position - 1] if 0 < position <= len(half_fades) else 0
        after = half_fades[position] if position < len(half_fades) else 0
        clip_start, clip_frames = (
            clip_slots[position] if clip_slots and position in clip_slots else (None, 1)
        )
        layers.append(
            OverAvatarLayer(
                path=paths[position],
                start_frame=start - before,
                frames=before + frames + after,
                fade_in_frames=2 * before,
                fade_out_frames=2 * after,
                lead_frames=before,
                clip_start_frame=clip_start,
                clip_frames=clip_frames,
            )
        )
    return layers


def over_avatar_input_args(layers: Sequence[OverAvatarLayer], fps: int) -> list[str]:
    """One ffmpeg input per layer, in layer order.

    A still is read as a single frame; a clip is seeked half a frame before
    the slide's first frame, like the animated slides themselves.
    """
    args: list[str] = []
    for layer in layers:
        if layer.clip_start_frame is None:
            args.extend(["-framerate", str(fps), "-i", layer.path])
            continue
        seek = max(0.0, (layer.clip_start_frame - 0.5) / fps)
        args.extend(
            [
                "-ss",
                f"{seek:.6f}",
                "-t",
                f"{(layer.clip_frames + 1) / fps:.6f}",
                "-i",
                layer.path,
            ]
        )
    return args


def _fades(layer: OverAvatarLayer) -> str:
    fades = ""
    if layer.fade_in_frames:
        fades += f",fade=t=in:s=0:n={layer.fade_in_frames}:alpha=1"
    if layer.fade_out_frames:
        start = layer.frames - layer.fade_out_frames
        fades += f",fade=t=out:s={start}:n={layer.fade_out_frames}:alpha=1"
    return fades


def over_avatar_filters(
    layers: Sequence[OverAvatarLayer],
    *,
    first_input_index: int,
    fps: int,
    video_label: str,
    output_label: str,
) -> list[str]:
    """Overlay every layer on `video_label`, ending in yuv420p `output_label`.

    As with the slides, nothing retimes the frames between the cut and `tpad`
    (see `build_animated_ffmpeg_args`): timestamps are rebuilt after it.
    """
    parts: list[str] = []
    current = video_label
    for number, layer in enumerate(layers):
        held = layer.clip_frames if layer.clip_start_frame is not None else 1
        pads: list[str] = []
        if layer.lead_frames:
            pads.append(f"start={layer.lead_frames}:start_mode=clone")
        stop = layer.frames - layer.lead_frames - held
        if stop > 0:
            pads.append(f"stop={stop}:stop_mode=clone")
        chain = (
            f"[{first_input_index + number}:v]trim=end_frame={held},format=yuva420p"
        )
        if pads:
            chain += ",tpad=" + ":".join(pads)
        parts.append(
            f"{chain},trim=end_frame={layer.frames},settb=1/{fps},"
            f"setpts=N+{layer.start_frame}{_fades(layer)}[over{number}]"
        )
        parts.append(
            f"[{current}][over{number}]overlay=x=0:y=0:"
            f"eof_action=pass:format=auto[ovl{number}]"
        )
        current = f"ovl{number}"
    parts.append(f"[{current}]format=yuv420p[{output_label}]")
    return parts
