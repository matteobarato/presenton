"""Which slides of an imported deck get a presenter, and where it stands."""

import copy
from typing import Any, Iterable

from services.slide_video_service import (
    PRESENTER_SLOT_ASPECT,
    default_placeholder_box,
    ensure_video_placeholder,
    find_video_placeholder,
)


def spread_presenter_slides(slide_count: int, count: int) -> list[int]:
    """`count` indexes spread evenly over the deck, first and last included."""
    if count <= 0 or slide_count <= 0:
        return []
    count = min(count, slide_count)
    if count == 1:
        return [0]
    last = slide_count - 1
    # Round half up; Python's round() would go to even.
    return [int(i * last / (count - 1) + 0.5) for i in range(count)]


def fallback_presenter_slides(slide_count: int) -> list[int]:
    """Every fourth slide, and the last."""
    if slide_count <= 0:
        return []
    return sorted({*range(0, slide_count, 4), slide_count - 1})


def normalize_presenter_slides(indexes: Iterable[int], slide_count: int) -> list[int]:
    if slide_count <= 0:
        return []
    valid = {
        i
        for i in indexes
        if isinstance(i, int) and not isinstance(i, bool) and 0 <= i < slide_count
    }
    return sorted({*valid, 0, slide_count - 1})


def add_bottom_right_presenter_slot(ui: dict[str, Any]) -> dict[str, Any]:
    if find_video_placeholder(ui) is not None:
        return copy.deepcopy(ui)
    box = default_placeholder_box(*PRESENTER_SLOT_ASPECT)
    return ensure_video_placeholder(
        ui,
        x=box.position.x,
        y=box.position.y,
        width=box.size.width,
        height=box.size.height,
    )
