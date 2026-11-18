"""Read how a bundled template really looks, so new layouts match it."""

from __future__ import annotations

import statistics
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterator

WHITE, BLACK = "#FFFFFF", "#000000"


def _channel(value: int) -> float:
    v = value / 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminance(color: str) -> float:
    r, g, b = (int(color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def readable_on(color: str) -> str:
    return WHITE if contrast(WHITE, color) >= contrast(BLACK, color) else BLACK


@dataclass(frozen=True)
class TemplateStyle:
    background: str
    accent: str
    accent_text: str
    card: str
    heading_font: dict
    body_font: dict
    heading_size: int
    body_size: int


def _walk(value: Any) -> Iterator[dict]:
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from _walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v)


def _hex(value: Any) -> str | None:
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        try:
            int(value[1:], 16)
        except ValueError:
            return None
        return value.upper()
    return None


def _full_slide_fill(el: dict) -> str | None:
    fill = el.get("fill")
    if not isinstance(fill, dict) or (fill.get("opacity", 1) or 0) < 0.99:
        return None
    color = _hex(fill.get("color"))
    if el.get("type") == "vector":
        pts = el.get("points") or []
        xs = [p.get("x", 0) for p in pts if isinstance(p, dict)]
        ys = [p.get("y", 0) for p in pts if isinstance(p, dict)]
        if xs and ys and max(xs) - min(xs) >= 1270 and max(ys) - min(ys) >= 710:
            return color
    size = el.get("size")
    if el.get("type") == "container" and isinstance(size, dict):
        if size.get("width", 0) >= 1270 and size.get("height", 0) >= 710:
            return color
    return None


def _texts(layouts: list[dict], families: set[str]) -> list[dict]:
    out = []
    for layout in layouts:
        for el in _walk(layout.get("components", [])):
            font = el.get("font")
            if el.get("type") == "text" and isinstance(font, dict):
                if _hex(font.get("color")) and font.get("family") in families and font.get("size"):
                    out.append(font)
    return out


def _fill_counts(layouts: list[dict]) -> Counter:
    counts: Counter = Counter()
    for layout in layouts:
        for el in _walk(layout.get("components", [])):
            if el.get("type") in ("container", "vector"):
                fill = el.get("fill")
                if isinstance(fill, dict) and (fill.get("opacity", 1) or 0) >= 0.9:
                    color = _hex(fill.get("color"))
                    if color:
                        counts[color] += 1
    return counts


def extract_style(template: dict[str, Any]) -> TemplateStyle:
    layouts = [l for l in template["layouts"] if isinstance(l, dict)]
    colors = template.get("theme", {}).get("colors", {})

    bgs = Counter(
        c
        for l in layouts
        for el in _walk(l.get("components", []))
        if (c := _full_slide_fill(el))
    )
    background = bgs.most_common(1)[0][0] if bgs else _hex(colors.get("background")) or WHITE

    theme_font = template.get("theme", {}).get("fonts", {}).get("textFont", {}).get("name")
    families = set(template.get("fonts") or {}) | ({theme_font} if theme_font else set())
    fonts = _texts(layouts, families)
    legible = [f for f in fonts if contrast(_hex(f["color"]), background) >= 3.0]
    headings = [f for f in legible if f["size"] >= 32] or legible or fonts
    bodies = [f for f in legible if 12 <= f["size"] <= 22] or legible or fonts

    def pick(pool: list[dict], key) -> dict:
        winner = Counter(key(f) for f in pool).most_common(1)[0][0] if pool else None
        font = next((f for f in pool if key(f) == winner), None) or {}
        family = font.get("family") or template.get("theme", {}).get("fonts", {}).get(
            "textFont", {}
        ).get("name", "Arial")
        text = _hex(font.get("color")) or readable_on(background)
        if contrast(text, background) < 3.0:
            text = readable_on(background)
        return {
            "family": family,
            "color": text,
            "bold": bool(font.get("bold", False)),
            "line_height": font.get("line_height", 1.2),
        }

    heading_font = pick(headings, lambda f: (f["family"], _hex(f["color"])))
    body_font = pick(bodies, lambda f: (f["family"], _hex(f["color"])))

    heading_sizes = [f["size"] for f in headings if f["size"] >= 32]
    heading_size = int(min(64, max(36, statistics.median(heading_sizes)))) if heading_sizes else 44
    body_pool = [round(f["size"]) for f in bodies if 14 <= f["size"] <= 20]
    body_size = Counter(body_pool).most_common(1)[0][0] if body_pool else 16
    body_size = min(body_size, heading_size - 1)

    accent = _hex(colors.get("primary")) or heading_font["color"]
    if contrast(accent, background) < 1.8:
        fills = [
            c for c, _ in _fill_counts(layouts).most_common()
            if contrast(c, background) >= 1.8
        ]
        accent = fills[0] if fills else heading_font["color"]

    card = _hex(colors.get("card")) or WHITE
    if card == background:
        card = accent
    return TemplateStyle(
        background=background,
        accent=accent,
        accent_text=readable_on(accent),
        card=card,
        heading_font=heading_font,
        body_font=body_font,
        heading_size=heading_size,
        body_size=body_size,
    )
