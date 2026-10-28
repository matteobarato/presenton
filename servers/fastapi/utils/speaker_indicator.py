"""The "speaker is talking" bubble drawn at the deck's bubble box on a video.

The bubble is centred in the deck's bubble box (bottom-right unless the author
moved it), the same spot the player shows it in, but drawn at half the box's
size: on a video the bubble is a discreet cue, not a second presenter. It is a small round bubble with sound-wave bars that
move in a seamless loop. It is not part of any slide: ffmpeg overlays it on
the finished picture, so it keeps moving while a slide is held still for its
narration (the slide frames themselves are a single repeated image then).
When and how long it shows - one steady bubble across consecutive narrated
slides, fading with the slide where the presenter changes - is decided in
`utils/video_actors.py`; this module only draws it.

The loop frames are drawn with Pillow once per render, at the output
resolution, as an RGBA PNG sequence that ffmpeg's image2 demuxer loops.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from PIL import Image, ImageDraw, ImageFilter

FRAME_PATTERN = "indicator-%03d.png"

# The bubble box is given in the 1280x720 slide stage (what `resolve_bubble`
# returns) and scaled to the output, so 720p and 1440p look the same as 1080p.
# The stage size is repeated here rather than imported from the service layer
# to keep this module a drawing helper that depends on Pillow alone.
_STAGE_WIDTH = 1280
_STAGE_HEIGHT = 720
# The bubble's diameter as a fraction of the bubble box's shorter side.
BUBBLE_SCALE = 0.5
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
    # left corner goes, so the bubble itself is centred in the bubble box.
    size: int
    x: int
    y: int
    # Just the round bubble, without the room for its shadow.
    diameter: int = 0

    @property
    def centre(self) -> tuple[float, float]:
        return self.x + self.size / 2, self.y + self.size / 2


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
    directory: str,
    *,
    box: tuple[float, float, float, float],
    width: int,
    height: int,
    fps: int,
) -> SpeakerIndicatorFrames:
    """Draw one seamless loop of the bubble into `directory`.

    `box` is `(x, y, w, h)` in stage pixels. The bubble's diameter is
    `BUBBLE_SCALE` of the box's shorter side and it is centred in the box, so a
    non-square box never stretches the circle.
    """
    box_x, box_y, box_width, box_height = box
    os.makedirs(directory, exist_ok=True)
    diameter = _even(
        min(box_width, box_height) * BUBBLE_SCALE * height / _STAGE_HEIGHT
    )
    padding = _even(diameter * _SHADOW_RATIO)
    centre_x = (box_x + box_width / 2) * width / _STAGE_WIDTH
    centre_y = (box_y + box_height / 2) * height / _STAGE_HEIGHT
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
        x=int(round(centre_x - size / 2)),
        y=int(round(centre_y - size / 2)),
        diameter=diameter,
    )
