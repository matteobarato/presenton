"""The "speaker is talking" bubble drawn in the top-right corner of a video.

A small round bubble with sound-wave bars that move in a seamless loop. It is
not part of any slide: ffmpeg overlays it on the finished picture, so it
keeps moving while a slide is held still for its narration (the slide frames
themselves are a single repeated image then), and it does not take part in
slide transitions. Consecutive narrated slides are merged into one interval,
so the bubble stays put across their cut instead of blinking.

The loop frames are drawn with Pillow once per render, at the output
resolution, as an RGBA PNG sequence that ffmpeg's image2 demuxer loops.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Sequence

from PIL import Image, ImageDraw, ImageFilter

FRAME_PATTERN = "indicator-%03d.png"

# Relative to the output height, so 720p and 1440p look the same as 1080p.
_DIAMETER_RATIO = 0.078
_MARGIN_RATIO = 0.035
_SHADOW_RATIO = 0.14
_LOOP_SECONDS = 1.2
_SUPERSAMPLE = 4

_BUBBLE_FILL = (17, 24, 39, 205)
_BUBBLE_RING = (255, 255, 255, 70)
_BAR_FILL = (255, 255, 255, 255)
_SHADOW_FILL = (0, 0, 0, 110)

# Five bars, each with its own phase so the loop reads as speech rather than
# a metronome; the outer bars stay shorter, like a voice-level glyph.
_BAR_PHASES = (0.0, 0.27, 0.58, 0.13, 0.82)
_BAR_SCALE = (0.55, 0.85, 1.0, 0.85, 0.55)


@dataclass(frozen=True)
class SpeakerIndicatorFrames:
    pattern: str
    frame_count: int
    # Size of each frame (bubble plus room for its shadow) and where its top
    # left corner goes, so the bubble itself sits `margin` from the corner.
    size: int
    x: int
    y: int


def _even(value: float) -> int:
    rounded = max(2, int(round(value)))
    return rounded + (rounded % 2)


def _bar_level(frame: int, frame_count: int, phase: float) -> float:
    """0..1, periodic over the loop, mixing two harmonics so bars don't sync."""
    t = 2 * math.pi * (frame / frame_count + phase)
    value = 0.62 * math.sin(t) + 0.38 * math.sin(2 * t + phase * 5)
    return 0.5 + 0.5 * value


def _draw_frame(frame: int, frame_count: int, diameter: int, padding: int) -> Image.Image:
    scale = _SUPERSAMPLE
    size = (diameter + 2 * padding) * scale
    d = diameter * scale
    p = padding * scale

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = int(d * 0.04)
    ImageDraw.Draw(shadow).ellipse(
        (p, p + offset, p + d, p + d + offset), fill=_SHADOW_FILL
    )
    image = shadow.filter(ImageFilter.GaussianBlur(p * 0.45))

    draw = ImageDraw.Draw(image)
    ring = max(scale, int(d * 0.02))
    draw.ellipse((p, p, p + d, p + d), fill=_BUBBLE_FILL, outline=_BUBBLE_RING, width=ring)

    bar_width = d * 0.075
    gap = d * 0.055
    total = len(_BAR_PHASES) * bar_width + (len(_BAR_PHASES) - 1) * gap
    left = p + (d - total) / 2
    centre = p + d / 2
    min_height = d * 0.1
    max_height = d * 0.46
    for index, (phase, bar_scale) in enumerate(zip(_BAR_PHASES, _BAR_SCALE)):
        level = _bar_level(frame, frame_count, phase)
        height = min_height + (max_height - min_height) * level * bar_scale
        x0 = left + index * (bar_width + gap)
        draw.rounded_rectangle(
            (x0, centre - height / 2, x0 + bar_width, centre + height / 2),
            radius=bar_width / 2,
            fill=_BAR_FILL,
        )

    return image.resize((size // scale, size // scale), Image.LANCZOS)


def write_speaker_indicator_frames(
    directory: str, *, width: int, height: int, fps: int
) -> SpeakerIndicatorFrames:
    """Draw one seamless loop of the bubble into `directory`."""
    os.makedirs(directory, exist_ok=True)
    diameter = _even(height * _DIAMETER_RATIO)
    padding = _even(diameter * _SHADOW_RATIO)
    margin = int(round(height * _MARGIN_RATIO))
    frame_count = max(2, int(round(_LOOP_SECONDS * fps)))
    for frame in range(frame_count):
        _draw_frame(frame, frame_count, diameter, padding).save(
            os.path.join(directory, FRAME_PATTERN % frame)
        )
    size = diameter + 2 * padding
    return SpeakerIndicatorFrames(
        pattern=os.path.join(directory, FRAME_PATTERN),
        frame_count=frame_count,
        size=size,
        x=width - margin - diameter - padding,
        y=margin - padding,
    )


def speaker_indicator_intervals(
    spans: Sequence[tuple[float, float, bool]],
) -> list[tuple[float, float]]:
    """Merge `(start, duration, narrated)` slide spans into on-screen intervals.

    Narrated slides that follow each other become one interval, which is what
    keeps the bubble steady across their transition.
    """
    intervals: list[tuple[float, float]] = []
    for start, duration, narrated in spans:
        if not narrated or duration <= 0:
            continue
        end = start + duration
        if intervals and abs(intervals[-1][1] - start) < 1e-6:
            intervals[-1] = (intervals[-1][0], end)
        else:
            intervals.append((start, end))
    return intervals


def speaker_indicator_input_args(frames: SpeakerIndicatorFrames, fps: int) -> list[str]:
    return [
        "-f",
        "image2",
        "-loop",
        "1",
        "-framerate",
        str(fps),
        "-i",
        frames.pattern,
    ]


def speaker_indicator_overlay(
    *,
    video_label: str,
    indicator_input_index: int,
    frames: SpeakerIndicatorFrames,
    intervals: Sequence[tuple[float, float]],
    output_label: str,
) -> str:
    """Overlay filter putting the looping bubble on `video_label` while narrated.

    The overlay is fed the frames in `rgba` and the result goes back to
    `yuv420p` once, so the alpha edge of the bubble blends instead of being
    flattened against black. The looping bubble input never ends, so
    `shortest=1` is what ends the overlay with the video under it; without it
    ffmpeg keeps encoding the last frame forever.
    """
    enable = "+".join(f"between(t,{start:.3f},{end:.3f})" for start, end in intervals)
    return (
        f"[{indicator_input_index}:v]format=rgba[indicator];"
        f"[{video_label}][indicator]overlay=x={frames.x}:y={frames.y}:"
        f"enable='{enable}':shortest=1:format=auto,format=yuv420p[{output_label}]"
    )
