"""Hold a template deck to the number of image and presenter-video slides asked for.

Media only reaches a slide through the layout picked for it. A layout whose
schema has an `image_prompt` slot gets an image; a layout whose UI frames an
avatar video placeholder (`SlideLayoutModel.has_video`) gets a presenter
video once avatars are generated. So the counts are steered when layouts are
chosen, first by telling the structure model the targets, then by swapping
layouts until they are met, since the model does not always listen. Templates
without video layouts get the presenter slot added to the chosen slides
instead (`video_slot_positions`).

A count is None for "auto" (nothing changes), 0 for "none" and a positive
number for the target count of slides.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable, List, Optional, Sequence

from models.presentation_layout import PresentationLayoutModel

LOGGER = logging.getLogger(__name__)

IMAGE_SLOT_KEYS = frozenset({"image_prompt", "__image_prompt__"})

# Words that name a layout's media rather than its purpose. A substitute
# layout is matched on the rest, so a bullet slide stays a bullet slide.
_MEDIA_WORDS = frozenset(
    {
        "image",
        "images",
        "img",
        "photo",
        "picture",
        "visual",
        "video",
        "avatar",
        "presenter",
    }
)
# Layouts that need content an ordinary text slide does not have. They are
# only chosen as substitutes for slides that already use that kind of layout.
_SPECIAL_WORDS = frozenset(
    {
        "table",
        "chart",
        "charts",
        "graph",
        "metric",
        "metrics",
        "toc",
        "contents",
        "team",
    }
)
_CONTENTS_WORDS = frozenset({"toc", "contents"})


def _has_image_slot(schema: Any) -> bool:
    if isinstance(schema, dict):
        properties = schema.get("properties")
        if isinstance(properties, dict) and IMAGE_SLOT_KEYS.intersection(properties):
            return True
        return any(_has_image_slot(value) for value in schema.values())
    if isinstance(schema, list):
        return any(_has_image_slot(item) for item in schema)
    return False


def image_layout_indexes(layout: PresentationLayoutModel) -> List[int]:
    """Indexes of the layouts that show an image."""
    return [
        index
        for index, slide in enumerate(layout.slides)
        if _has_image_slot(slide.json_schema)
    ]


def video_layout_indexes(layout: PresentationLayoutModel) -> List[int]:
    """Indexes of the layouts that frame a presenter video."""
    return [index for index, slide in enumerate(layout.slides) if slide.has_video]


def _words(layout: PresentationLayoutModel, index: int) -> frozenset[str]:
    slide = layout.slides[index]
    text = " ".join(
        part for part in (slide.id, slide.name, slide.json_schema.get("title")) if part
    )
    words = re.split(r"[^a-z]+", text.lower())
    return frozenset(word for word in words if word and not word.isdigit())


def _special_words(layout: PresentationLayoutModel, index: int) -> frozenset[str]:
    return (_words(layout, index) - _MEDIA_WORDS) & _SPECIAL_WORDS


def plain_layout_indexes(layout: PresentationLayoutModel) -> List[int]:
    """Layouts with no image and no video that fit any text slide.

    Tables, charts, metrics, contents and team layouts are left out: they need
    data an ordinary slide does not have, so they are never a way to drop an
    image. Video layouts are left out too: they would add a presenter slot the
    user did not ask for.
    """
    media = set(image_layout_indexes(layout)) | set(video_layout_indexes(layout))
    return [
        index
        for index in range(len(layout.slides))
        if index not in media and not _special_words(layout, index)
    ]


def _best_substitute(
    layout: PresentationLayoutModel,
    current: int,
    candidates: Sequence[int],
    usage: dict[int, int],
) -> Optional[int]:
    """The candidate layout closest in purpose to `current`.

    Purpose is read from the layout's name, without its media words. Special
    layouts (tables, charts, team cards...) are only allowed when the current
    layout is one too. Ties go to the layout used least so far, for variety.
    """
    current_words = _words(layout, current) - _MEDIA_WORDS
    current_special = _special_words(layout, current)
    best: Optional[int] = None
    best_key: Optional[tuple] = None
    for candidate in candidates:
        words = _words(layout, candidate) - _MEDIA_WORDS
        special = _special_words(layout, candidate)
        if special and not special <= current_special:
            continue
        union = current_words | words
        similarity = len(current_words & words) / len(union) if union else 0.0
        key = (-similarity, usage.get(candidate, 0), candidate)
        if best_key is None or key < best_key:
            best, best_key = candidate, key
    return best


def _spread(positions: Sequence[int], count: int) -> List[int]:
    """`count` of `positions`, picked evenly across the deck."""
    if count <= 0:
        return []
    if count >= len(positions):
        return list(positions)
    step = len(positions) / count
    return [positions[int(step * i + step / 2)] for i in range(count)]


def _enforce_slot(
    selection: List[int],
    layout: PresentationLayoutModel,
    target: Optional[int],
    slot_layouts: Sequence[int],
    out_candidates: Sequence[int],
    locked: set[int],
) -> None:
    """Swap layouts in `selection`, in place, until `target` slides use one of
    `slot_layouts`. Slides leaving the slot move to `out_candidates`; locked
    positions are never touched."""
    if target is None:
        return
    target = max(0, min(target, len(selection)))
    slot_set = set(slot_layouts)
    usage: dict[int, int] = {}
    for index in selection:
        usage[index] = usage.get(index, 0) + 1

    def swap(position: int, candidates: Sequence[int]) -> None:
        substitute = _best_substitute(layout, selection[position], candidates, usage)
        if substitute is None:
            return
        usage[selection[position]] -= 1
        usage[substitute] = usage.get(substitute, 0) + 1
        selection[position] = substitute

    in_slot = [p for p, index in enumerate(selection) if index in slot_set]
    if len(in_slot) > target and out_candidates:
        keep = set(_spread(in_slot, target))
        for position in in_slot:
            if position not in keep and position not in locked:
                swap(position, out_candidates)
    elif len(in_slot) < target and slot_layouts:
        # Table, chart and metrics slides keep their layout: their content
        # is data a media layout has no place for.
        free = [
            p
            for p, index in enumerate(selection)
            if index not in slot_set
            and p not in locked
            and not _special_words(layout, index)
        ]
        for position in _spread(free, target - len(in_slot)):
            swap(position, slot_layouts)


def enforce_media_targets(
    slides: Iterable[int],
    layout: PresentationLayoutModel,
    n_images: Optional[int],
    n_videos: Optional[int] = None,
) -> List[int]:
    """Swap layouts until the image and presenter-video targets are met.

    Videos are settled first and their slides then stay put; the image pass
    never moves a slide onto a video layout, so asking for fewer images never
    adds presenter slots. When the template cannot meet a target (no such
    layouts, or nothing to swap to) the closest reachable count is kept rather
    than failing the deck.
    """
    selection = list(slides)
    all_layouts = range(len(layout.slides))
    image_layouts = image_layout_indexes(layout)
    video_layouts = video_layout_indexes(layout)
    video_set = set(video_layouts)
    image_set = set(image_layouts)

    _enforce_slot(
        selection,
        layout,
        n_videos,
        video_layouts,
        [i for i in all_layouts if i not in video_set],
        locked=set(),
    )
    on_video = {p for p, index in enumerate(selection) if index in video_set}
    _enforce_slot(
        selection,
        layout,
        n_images,
        [i for i in image_layouts if i not in video_set],
        [i for i in all_layouts if i not in image_set and i not in video_set],
        locked=on_video,
    )
    return selection


def enforce_image_target(
    slides: Iterable[int],
    layout: PresentationLayoutModel,
    n_images: Optional[int],
) -> List[int]:
    """`enforce_media_targets` with the presenter-video count left automatic."""
    return enforce_media_targets(slides, layout, n_images, None)


def video_slot_positions(
    slides: Sequence[int],
    layout: PresentationLayoutModel,
    n_videos: Optional[int],
) -> List[int]:
    """Slides that need a presenter slot added, beyond the video layouts.

    The template's video layouts already frame a presenter; when they fall
    short of `n_videos` (most templates have none), the rest are spread
    across the other slides, preferring layouts with a clear corner and
    leaving out table-of-contents slides.
    Deterministic, so every caller agrees on the same slides.
    """
    if not n_videos:
        return []
    video_set = set(video_layout_indexes(layout))
    on_video = sum(1 for index in slides if index in video_set)
    free = [
        position
        for position, index in enumerate(slides)
        if index not in video_set
        and not (_words(layout, index) & _CONTENTS_WORDS)
    ]
    # Slides with a clear corner first, so the slot hides no content; the
    # others only when those run out.
    clear = [p for p in free if layout.slides[slides[p]].presenter_fits]
    crowded = [p for p in free if not layout.slides[slides[p]].presenter_fits]
    wanted = max(0, min(n_videos, len(slides)) - on_video)
    chosen = _spread(clear, wanted)
    chosen += _spread(crowded, wanted - len(chosen))
    return sorted(chosen)


def log_media_targets(
    slides: Sequence[int],
    layout: PresentationLayoutModel,
    n_images: Optional[int],
    n_videos: Optional[int] = None,
) -> None:
    """Record requested and reached counts; templates can fall short."""
    for kind, requested, slot in (
        ("images", n_images, set(image_layout_indexes(layout))),
        ("videos", n_videos, set(video_layout_indexes(layout))),
    ):
        if requested is None:
            continue
        reached = sum(1 for index in slides if index in slot)
        if kind == "videos":
            reached += len(video_slot_positions(slides, layout, n_videos))
        log = LOGGER.info if reached == min(requested, len(slides)) else LOGGER.warning
        log(
            "[media_target] %s requested=%d reached=%d slides=%d template=%r",
            kind,
            requested,
            reached,
            len(slides),
            layout.name,
        )


def _image_section(
    layout: PresentationLayoutModel, n_images: Optional[int], n_slides: int
) -> str:
    if n_images is None:
        return ""
    image_layouts = image_layout_indexes(layout)
    if not image_layouts:
        return ""
    plain_layouts = plain_layout_indexes(layout)
    target = max(0, min(n_images, n_slides))
    if not plain_layouts:
        if target == 0:
            return ""
        rule = (
            f"Use layouts with an image on at least {target} of the {n_slides} "
            "slides, on the slides that benefit most from a visual. This "
            "overrides any rule about avoiding image layouts."
        )
        plain_line = ""
    else:
        if target == 0:
            rule = "No slide may use a layout with an image."
        else:
            rule = (
                f"Exactly {target} of the {n_slides} slides must use a layout with "
                "an image; every other slide must use a layout without one. Spread "
                "the image slides across the deck, on the slides that benefit most "
                "from a visual. This overrides any rule about avoiding image layouts."
            )
        plain_line = (
            "\nLayouts without an image for ordinary slides: "
            + ", ".join(str(index) for index in plain_layouts)
            + "."
        )
    listed = ", ".join(str(index) for index in image_layouts)
    return (
        f"# Image Target\n{rule}\nLayouts with an image: {listed}.{plain_line}\n"
        "Never use a table, chart, metrics or contents layout for content that "
        "lacks that data, even to meet the image target."
    )


def _video_section(
    layout: PresentationLayoutModel, n_videos: Optional[int], n_slides: int
) -> str:
    if n_videos is None:
        return ""
    video_layouts = video_layout_indexes(layout)
    if not video_layouts:
        return ""
    listed = ", ".join(str(index) for index in video_layouts)
    target = max(0, min(n_videos, n_slides))
    if target == 0:
        rule = "No slide may use a presenter video layout."
    else:
        rule = (
            f"Use a presenter video layout on at most {target} of the {n_slides} "
            "slides, on slides where a presenter introducing or stressing a point "
            "helps most, such as the opening or a key message."
        )
    return f"# Presenter Video Target\n{rule}\nPresenter video layouts: {listed}."


def media_target_instruction(
    layout: PresentationLayoutModel,
    n_images: Optional[int],
    n_slides: int,
    n_videos: Optional[int] = None,
) -> str:
    """The structure prompt's section on the media targets; empty for auto.

    It names the same layouts `enforce_media_targets` swaps between, so the
    model is never told to drop images where only chart or table layouts are
    left: that would put invented data on a text slide.
    """
    sections = [
        _image_section(layout, n_images, n_slides),
        _video_section(layout, n_videos, n_slides),
    ]
    return "\n\n".join(section for section in sections if section)


def image_target_instruction(
    layout: PresentationLayoutModel,
    n_images: Optional[int],
    n_slides: int,
) -> str:
    """`media_target_instruction` for images alone."""
    return media_target_instruction(layout, n_images, n_slides, None)
