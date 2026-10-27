"""Crossfades between the slides of a narrated video.

Every slide keeps exactly the frames its narration gives it; a crossfade
never moves a slide boundary. Each fade is centred on the boundary instead:
half of it is taken from the outgoing slide's lead-out and half from the
incoming slide's lead-in, the silent padding around the narration, so no
spoken word is ever covered and the video stays exactly as long as the
narration timeline.

ffmpeg's `xfade` blends the last `duration` of its first input with the first
`duration` of its second, and the result is `offset + len(second)` long. To
centre a fade of `2h` frames on boundary frame `b` without shortening
anything, the outgoing slide is extended by `h` frames and the incoming one
prefixed by `h` frames (both copies of its edge frame, padded by the caller),
and the fade starts at `b - h`. Chained over a whole deck, frame `b` is still
where the incoming slide's own first frame lands.

Everything here works in whole frames, so rounding never accumulates over a
long deck, and is pure, so the filter graph can be checked without ffmpeg.
"""

from __future__ import annotations

from typing import Sequence

MAX_CROSSFADE_SECONDS = 1.5


def slide_frames(
    spans: Sequence[tuple[float, float]], fps: int
) -> list[tuple[int, int]]:
    """`(start_seconds, duration_seconds)` per slide → `(start_frame, frames)`.

    Boundaries come from rounding each slide's cumulative start and end, the
    same rule `plan_animated_segments` uses, so every path agrees on where a
    slide begins.
    """
    frames: list[tuple[int, int]] = []
    for start, duration in spans:
        start_frame = round(start * fps)
        end_frame = round((start + duration) * fps)
        frames.append((start_frame, max(1, end_frame - start_frame)))
    return frames


def plan_half_fades(
    frames: Sequence[int], crossfade_seconds: float, fps: int
) -> list[int]:
    """Half the fade length, in frames, at each boundary between slides.

    Each half is at most half of the slide it eats into, on both sides, so
    the two fades of one slide can never overlap, however short it is. Any
    requested crossfade is at least one frame each side where the slides
    allow it; a one-frame slide is cut. `0` means hard cuts.
    """
    if crossfade_seconds <= 0:
        return [0] * max(0, len(frames) - 1)
    wanted = crossfade_seconds * fps
    halves: list[int] = []
    for index in range(len(frames) - 1):
        before, after = frames[index], frames[index + 1]
        half = max(1, round(min(wanted, before, after) / 2))
        halves.append(min(half, before // 2, after // 2))
    return halves


def segment_padding(index: int, half_fades: Sequence[int]) -> tuple[int, int]:
    """Edge frames to clone before and after slide `index` for its fades."""
    before = half_fades[index - 1] if index > 0 else 0
    after = half_fades[index] if index < len(half_fades) else 0
    return before, after


def xfade_chain(
    labels: Sequence[str],
    boundary_frames: Sequence[int],
    half_fades: Sequence[int],
    fps: int,
    output_label: str,
) -> list[str]:
    """Join padded slide streams `labels` with one centred `xfade` per boundary.

    Each `xfade` takes the stream built so far as its first input, so its
    offset is measured on the deck's own timeline. A boundary with no fade
    (a slide too short for one) is joined end to end instead.
    """
    parts: list[str] = []
    current = labels[0]
    for index, (boundary, half) in enumerate(zip(boundary_frames, half_fades)):
        is_last = index == len(boundary_frames) - 1
        output = output_label if is_last else f"x{index + 1}"
        if half == 0:
            # `concat` outputs a microsecond time base, which a later `xfade`
            # refuses; the joined stream is continuous from 0, so frame
            # numbers are its exact timestamps.
            parts.append(
                f"[{current}][{labels[index + 1]}]concat=n=2:v=1:a=0,"
                f"settb=1/{fps},setpts=N,fps=fps={fps}[{output}]"
            )
        else:
            parts.append(
                f"[{current}][{labels[index + 1]}]xfade=transition=fade:"
                f"duration={2 * half / fps:.6f}:offset={(boundary - half) / fps:.6f}"
                f"[{output}]"
            )
        current = output
    return parts
