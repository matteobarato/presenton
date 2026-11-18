"""Avatar layouts derived from a template's own image layouts."""

from __future__ import annotations

import copy
from typing import Any

from .archetypes import placeholder_component

STAGE_W, STAGE_H = 1280, 720
MIN_IMAGE_AREA = 100_000
MAX_PLACEHOLDER_WIDTH = 360
PORTRAIT = 16 / 9


def _is_candidate(el: Any) -> bool:
    if not isinstance(el, dict) or el.get("type") != "image":
        return False
    if el.get("is_icon") or el.get("video_placeholder"):
        return False
    size = el.get("size") or {}
    return size.get("width", 0) * size.get("height", 0) >= MIN_IMAGE_AREA


def _biggest_image(layout: dict) -> tuple[int, int, dict] | None:
    """(component index, element index, element) of the layout's largest top-level image."""
    best = None
    for ci, comp in enumerate(layout.get("components", [])):
        for ei, el in enumerate(comp.get("elements", [])):
            if _is_candidate(el):
                area = el["size"]["width"] * el["size"]["height"]
                if best is None or area > best[0]:
                    best = (area, ci, ei, el)
    return best and (best[1], best[2], best[3])


def _has_placeholder(layout: dict) -> bool:
    return any(
        isinstance(el, dict) and el.get("video_placeholder")
        for comp in layout.get("components", [])
        for el in comp.get("elements", [])
    )


def _portrait_box(old_w: float, old_h: float) -> tuple[int, int]:
    w = min(MAX_PLACEHOLDER_WIDTH, old_w)
    h = w * PORTRAIT
    if h > old_h:
        h = old_h
        w = h / PORTRAIT
    return round(w), round(h)


def derive_layouts(template: dict[str, Any], count: int, start: int) -> list[dict]:
    """Up to `count` layouts, numbered `_pv<start>`…, each a copy of one of the
    template's image layouts with its largest image swapped for the placeholder."""
    candidates = []
    seen: set[str] = set()
    for layout in template.get("layouts", []):
        if _has_placeholder(layout) or layout["id"].rsplit("_", 1)[-1].startswith("pv"):
            continue
        found = _biggest_image(layout)
        if found is None or layout.get("description") in seen:
            continue
        seen.add(layout.get("description"))
        candidates.append((found[2]["size"]["width"] * found[2]["size"]["height"], layout, found))
    candidates.sort(key=lambda c: -c[0])

    out = []
    for n, (_, layout, (ci, ei, image)) in enumerate(candidates[:count], start):
        new = copy.deepcopy(layout)
        comp = new["components"][ci]
        # The part of the image that is on the stage: a bleeding image must not pull the placeholder off it.
        left = max(0, comp["position"]["x"] + image["position"]["x"])
        top = max(0, comp["position"]["y"] + image["position"]["y"])
        right = min(STAGE_W, comp["position"]["x"] + image["position"]["x"] + image["size"]["width"])
        bottom = min(STAGE_H, comp["position"]["y"] + image["position"]["y"] + image["size"]["height"])
        w, h = _portrait_box(right - left, bottom - top)
        x = left + (right - left - w) / 2
        y = top + (bottom - top - h) / 2
        del comp["elements"][ei]
        holder = placeholder_component(round(x, 2), round(y, 2), w, h)
        # The placeholder takes the image's place in the layering, just above the component it left.
        insert_at = ci + 1 if comp["elements"] else ci
        if not comp["elements"]:
            del new["components"][ci]
        new["components"].insert(insert_at, holder)
        new["id"] = f"{layout['id']}_pv{n:02d}"
        new["description"] = "Presenter avatar video version: " + (layout.get("description") or "")
        out.append(new)
    return out
