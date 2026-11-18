"""Avatar layouts derived from a template's own image layouts."""

from __future__ import annotations

import copy
from typing import Any

from .archetypes import placeholder_component

STAGE_W, STAGE_H = 1280, 720
MIN_IMAGE_AREA = 100_000
MAX_PLACEHOLDER_WIDTH = 360
MIN_PLACEHOLDER_WIDTH = 160
SEARCH_STEP = 8
PORTRAIT = 16 / 9
# Elements a presenter video must not cover.
CONTENT_TYPES = frozenset({"text", "chart", "table", "infographic", "gauge", "progress_bar", "vertical_funnel"})
# Laid out at render time: the box is what counts, the children's stored positions say nothing.
LAID_OUT_TYPES = frozenset({"flex", "grid"})


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


def _content_boxes(value: Any, offset: tuple[float, float] = (0.0, 0.0)):
    """Stage boxes (x, y, w, h) of content elements; nested positions are relative to their parent."""
    if isinstance(value, dict):
        pos = value.get("position") if isinstance(value.get("position"), dict) else {}
        x, y = offset[0] + (pos.get("x") or 0), offset[1] + (pos.get("y") or 0)
        size = value.get("size")
        has_box = isinstance(size, dict) and size.get("width") and size.get("height")
        if has_box and value.get("type") in CONTENT_TYPES | LAID_OUT_TYPES:
            yield (x, y, size["width"], size["height"])
            if value.get("type") in LAID_OUT_TYPES:
                return
        for child in value.values():
            yield from _content_boxes(child, (x, y))
    elif isinstance(value, list):
        for child in value:
            yield from _content_boxes(child, offset)


def _panel_boxes(components: list[dict]):
    """Boxes of visible filled panels, which hide whatever sits beneath their layer.
    Slide-sized backdrops are left out: they are a wash, not a card."""
    for comp in components:
        for el, (x, y) in _with_offsets(comp.get("elements", []), (comp["position"]["x"], comp["position"]["y"])):
            size, fill = el.get("size"), el.get("fill")
            if not isinstance(fill, dict):
                continue
            if el.get("type") == "vector" and el.get("points"):
                xs = [p.get("x", 0) for p in el["points"] if isinstance(p, dict)]
                ys = [p.get("y", 0) for p in el["points"] if isinstance(p, dict)]
                if not xs or not ys:
                    continue
                x, y = x + min(xs), y + min(ys)
                w, h = max(xs) - min(xs), max(ys) - min(ys)
            elif el.get("type") == "container" and isinstance(size, dict):
                w, h = size.get("width") or 0, size.get("height") or 0
            else:
                continue
            if (fill.get("opacity", 1) or 0) >= 0.3 and w and h and not (w >= 1000 and h >= 600):
                yield (x, y, w, h)


def _with_offsets(value: Any, offset: tuple[float, float]):
    if isinstance(value, dict):
        pos = value.get("position") if isinstance(value.get("position"), dict) else {}
        x, y = offset[0] + (pos.get("x") or 0), offset[1] + (pos.get("y") or 0)
        yield value, (x, y)
        for child in value.values():
            yield from _with_offsets(child, (x, y))
    elif isinstance(value, list):
        for child in value:
            yield from _with_offsets(child, offset)


def _overlaps(blockers: list[tuple], box: tuple[float, float, float, float]) -> bool:
    bx, by, bw, bh = box
    return any(
        min(bx + bw, cx + cw) - max(bx, cx) > 1 and min(by + bh, cy + ch) - max(by, cy) > 1
        for cx, cy, cw, ch in blockers
    )


def _place(blockers: list[tuple], area: tuple[float, float, float, float]) -> tuple[float, float, int, int] | None:
    """The largest portrait box inside `area` that covers no content, nearest the area's centre."""
    left, top, width, height = area
    widths = range(min(MAX_PLACEHOLDER_WIDTH, int(width)), MIN_PLACEHOLDER_WIDTH - 1, -24)
    for w in widths:
        h = round(w * PORTRAIT)
        if h > height:
            continue
        best = None
        x = left
        while x + w <= left + width + 0.01:
            y = top
            while y + h <= top + height + 0.01:
                if not _overlaps(blockers, (x, y, w, h)):
                    dist = abs(x + w / 2 - (left + width / 2)) + abs(y + h / 2 - (top + height / 2))
                    if best is None or dist < best[0]:
                        best = (dist, x, y)
                y += SEARCH_STEP
            x += SEARCH_STEP
        if best:
            return best[1], best[2], w, h
    return None


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
    for _, layout, (ci, ei, image) in candidates:
        if len(out) == count:
            break
        n = start + len(out)
        new = copy.deepcopy(layout)
        comp = new["components"][ci]
        # The part of the image that is on the stage: a bleeding image must not pull the placeholder off it.
        left = max(0, comp["position"]["x"] + image["position"]["x"])
        top = max(0, comp["position"]["y"] + image["position"]["y"])
        right = min(STAGE_W, comp["position"]["x"] + image["position"]["x"] + image["size"]["width"])
        bottom = min(STAGE_H, comp["position"]["y"] + image["position"]["y"] + image["size"]["height"])
        del comp["elements"][ei]
        blockers = list(_content_boxes(new["components"])) + list(_panel_boxes(new["components"][ci + 1 :]))
        spot = _place(blockers, (left, top, right - left, bottom - top))
        if spot is None:
            continue  # the avatar would sit on top of text or a chart: not a layout worth offering
        x, y, w, h = spot
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
