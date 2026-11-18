"""Five avatar-ready layout structures, styled from a TemplateStyle.

The structures follow Momentum's presenter layouts. Every text box is sized
from its `max_length`, so text at the limit still fits its box.
"""

from __future__ import annotations

import math
from typing import Any

from .style import TemplateStyle, contrast, readable_on

STAGE_W, STAGE_H = 1280, 720
PH_W, PH_H = 288, 512
CHAR_W = 0.55  # average glyph width as a fraction of the font size


def placeholder_component(x: float, y: float, w: int = PH_W, h: int = PH_H) -> dict:
    return {
        "id": "video_placeholder",
        "description": "Avatar video placeholder",
        "position": {"x": x, "y": y},
        "elements": [
            {
                "type": "image",
                "position": {"x": 0, "y": 0},
                "size": {"width": w, "height": h},
                "data": "/static/images/video-placeholder.png",
                "fit": "cover",
                "decorative": True,
                "name": "avatar_video",
                "is_icon": False,
                "video_placeholder": True,
            }
        ],
    }


def _ink(base: dict, backing: str) -> str:
    color = base["color"]
    return color if contrast(color, backing) >= 4.5 else readable_on(backing)


def _text(
    name: str,
    content: str,
    x: float,
    y: float,
    w: float,
    base: dict,
    size: float,
    backing: str,
    min_length: int,
    max_length: int,
    *,
    align: str = "left",
    bold: bool | None = None,
    color: str | None = None,
    letter_spacing: float | None = None,
) -> dict:
    line_height = float(base.get("line_height") or 1.2)
    lines = max(1, math.ceil(max_length * CHAR_W * size / w))
    height = math.ceil(lines * size * line_height) + 2
    font: dict[str, Any] = {
        "size": size,
        "family": base["family"],
        "color": color or _ink(base, backing),
        "line_height": line_height,
        "bold": base.get("bold", False) if bold is None else bold,
    }
    if letter_spacing is not None:
        font["letter_spacing"] = letter_spacing
    return {
        "type": "text",
        "position": {"x": x, "y": y},
        "size": {"width": w, "height": height},
        "rotation": 0,
        "font": font,
        "alignment": {"horizontal": align, "vertical": "top"},
        "runs": [{"text": content, "font": dict(font)}],
        "decorative": False,
        "name": name,
        "min_length": min(min_length, len(content)),
        "max_length": max(max_length, len(content)),
    }


def _rect(x, y, w, h, color: str, radius: float = 0, opacity: float = 1) -> dict:
    return {
        "type": "container",
        "position": {"x": x, "y": y},
        "size": {"width": w, "height": h},
        "fill": {"color": color, "opacity": opacity},
        "border_radius": {"tl": radius, "tr": radius, "bl": radius, "br": radius},
    }


def _component(cid: str, description: str, x: float, y: float, elements: list[dict]) -> dict:
    return {"id": cid, "description": description, "position": {"x": x, "y": y}, "elements": elements}


def _background(style: TemplateStyle) -> dict:
    points = [{"x": 0, "y": 0}, {"x": STAGE_W, "y": 0}, {"x": STAGE_W, "y": STAGE_H}, {"x": 0, "y": STAGE_H}]
    element = {
        "type": "vector",
        "shape": "polygon",
        "fill": {"color": style.background, "opacity": 1},
        "points": points,
        "closed": True,
    }
    return _component("full_bleed_canvas", "Plain full-slide background in the template's own color.", 0, 0, [element])


def _bottom(elements: list[dict]) -> float:
    return max(e["position"]["y"] + e["size"]["height"] for e in elements)


def _stack(
    elements_spec: list[tuple], x: float, y: float, gap: float
) -> tuple[list[dict], float]:
    """Place text elements one under another; returns them and the next y."""
    out, cursor = [], y
    for build in elements_spec:
        el = build(cursor)
        out.append(el)
        cursor = el["position"]["y"] + el["size"]["height"] + gap
    return out, cursor


def _header(style: TemplateStyle, bg: str, x: float, y: float, w: float, eyebrow: str, title: str, body: str | None):
    """Eyebrow, title and optional paragraph in one component; returns (elements, next_y)."""
    hs = min(style.heading_size, 44)
    specs = [
        lambda cy: _text("eyebrow_label", eyebrow, 0, cy, w, style.body_font, 14, bg, 6, 28,
                         bold=True, color=style.accent if contrast(style.accent, bg) >= 3 else None,
                         letter_spacing=1.2),
        lambda cy: _text("main_title", title, 0, cy, w, style.heading_font, hs, bg, 12, 48),
    ]
    if body is not None:
        specs.append(lambda cy: _text("intro_text", body, 0, cy, w, style.body_font, style.body_size, bg, 40, 150))
    return _stack(specs, x, y, 12)


def _points(style: TemplateStyle, bg: str, w: float, titles: list[tuple[str, str]]) -> list[dict]:
    els, cy = [], 0.0
    for i, (head, desc) in enumerate(titles, 1):
        els.append(_rect(0, cy + 6, 10, 10, style.accent, 2))
        t = _text(f"point_{i}_title", head, 26, cy, w - 26, style.body_font, 16, bg, 6, 28, bold=True)
        d = _text(f"point_{i}_text", desc, 26, cy + t["size"]["height"] + 2, w - 26, style.body_font, 14, bg, 12, 64)
        els += [t, d]
        cy = d["position"]["y"] + d["size"]["height"] + 16
    return els


def _video_left(style: TemplateStyle, n: int) -> dict:
    bg = style.background
    px, py = 96, 104
    header, next_y = _header(
        style, bg, 520, 0, 696, "MEET YOUR PRESENTER", "A clear message from the person behind it",
        "Your presenter walks the audience through the idea in their own voice, so the key message lands in seconds.",
    )
    top = 96
    points = _points(style, bg, 696, [
        ("Clear goals", "Everyone knows what we are aiming for."),
        ("Shared context", "The background behind each decision."),
        ("Next steps", "What happens right after this slide."),
    ])
    return {
        "id": f"video_left_title_points_pv{n:02d}",
        "description": "Presenter avatar video framed on the left with a headline, short explanation and three key points on the right. Use when a narrator or avatar introduces a topic, team or initiative on camera.",
        "components": [
            _background(style),
            _component("video_frame_accent", "Offset accent panel framing the portrait video from behind.", px + 20, py + 20,
                       [_rect(0, 0, PH_W, PH_H, style.accent, 8)]),
            placeholder_component(px, py),
            _component("title_body_block", "Eyebrow label, headline and supporting paragraph.", 520, top, header),
            _component("key_points_list", "Three stacked key points with markers.", 520, top + next_y + 12, points),
        ],
    }


def _video_right(style: TemplateStyle, n: int) -> dict:
    bg, card = style.background, style.card
    title = _text("main_title", "How we work", 0, 0, 720, style.heading_font, min(style.heading_size, 56), bg, 8, 28)
    sub = _text("intro_text", "Three steps that take an idea from first draft to delivery.", 0, title["size"]["height"] + 12, 720,
                style.body_font, style.body_size, bg, 24, 90)
    steps = []
    cy = 0.0
    for i, (head, desc) in enumerate(
        [("Plan", "Agree on scope and owners."), ("Build", "Ship in small, reviewed pieces."), ("Review", "Check results and adjust.")], 1
    ):
        steps.append(_rect(0, cy, 52, 52, style.accent, 26))
        steps.append(_text(f"step_{i}_number", str(i), 0, cy + 12, 52, style.heading_font, 22, style.accent, 1, 2,
                           align="center", bold=True, color=style.accent_text))
        t = _text(f"step_{i}_title", head, 72, cy, 640, style.body_font, 20, bg, 3, 22, bold=True)
        d = _text(f"step_{i}_text", desc, 72, cy + t["size"]["height"] + 2, 640, style.body_font, 15, bg, 12, 60)
        steps += [t, d]
        cy = max(cy + 52, d["position"]["y"] + d["size"]["height"]) + 24
    top_steps = 64 + 12 + title["size"]["height"] + 12 + sub["size"]["height"] + 44
    return {
        "id": f"title_steps_video_right_pv{n:02d}",
        "description": "Explainer with a bold headline, short summary and three numbered steps on the left and a presenter avatar video in a card panel on the right. Use for process or how-it-works narration.",
        "components": [
            _background(style),
            _component("title_body_block", "Headline and short summary.", 64, 64, [title, sub]),
            _component("numbered_steps_list", "Three numbered steps.", 64, top_steps, steps),
            _component("video_card_panel", "Card panel holding the portrait video.", 852, 64,
                       [_rect(0, 0, 352, 592, card, 14)]),
            placeholder_component(884, 104),
        ],
    }


def _callout(style: TemplateStyle, idx: int, x: float, y: float, w: float, head: str, text: str) -> list[dict]:
    card = style.card
    t = _text(f"callout_{idx}_title", head, 20, 18, w - 40, style.body_font, 18, card, 6, 26, bold=True)
    d = _text(f"callout_{idx}_text", text, 20, 18 + t["size"]["height"] + 6, w - 40, style.body_font, 15, card, 24, 90)
    h = d["position"]["y"] + d["size"]["height"] + 18
    return [_rect(0, 0, w, h, card, 12), _rect(0, 0, 6, h, style.accent, 3), t, d]


def _centered(style: TemplateStyle, n: int) -> dict:
    bg = style.background
    title = _text("main_title", "Meet the voice behind the numbers", 64, 28, 1152, style.heading_font,
                  min(style.heading_size, 36), bg, 12, 48, align="center")
    comps = [
        _background(style),
        _component("centered_title", "Centered headline above the video.", 0, 0, [title]),
        placeholder_component(496, 104),
    ]
    left = [("Focus", "One idea per slide, said plainly."), ("Proof", "A fact or number that backs it up.")]
    right = [("Context", "Why it matters right now."), ("Action", "What we ask the audience to do.")]
    for side, x, items in (("left", 64, left), ("right", 840, right)):
        for i, (head, text) in enumerate(items):
            y = 150 + i * 220
            idx = len([c for c in comps if c["id"].startswith("callout_")]) + 1
            comps.append(_component(f"callout_{idx}", f"{side.title()} callout card.", x, y,
                                    _callout(style, idx, x, y, 376, head, text)))
    return {
        "id": f"centered_video_side_callouts_pv{n:02d}",
        "description": "Spotlight slide with a centered presenter avatar video between callout cards on the left and right and a headline above. Use to feature a speaker with supporting points.",
        "components": comps,
    }


def _quote(style: TemplateStyle, n: int) -> dict:
    bg, card = style.background, style.card
    title = _text("main_title", "In their words", 64, 64, 740, style.heading_font, min(style.heading_size, 52), bg, 6, 24)
    panel_y = 64 + title["size"]["height"] + 32
    quote = _text("quote_body_text", "Working this way changed how our whole team plans and delivers.", 56, 70, 624,
                  style.heading_font, 26, card, 30, 110, bold=False)
    author = _text("quote_author_text", "Jordan Lee", 56, 70 + quote["size"]["height"] + 20, 624, style.body_font, 18, card, 4, 28, bold=True)
    role = _text("quote_author_role", "Head of Operations", 56, author["position"]["y"] + author["size"]["height"] + 2, 624,
                 style.body_font, 14, card, 6, 36)
    mark = _text("quote_mark_accent", "“", 56, 8, 80, style.heading_font, 80, card, 1, 1, color=style.accent, bold=True)
    panel_h = role["position"]["y"] + role["size"]["height"] + 40
    return {
        "id": f"quote_panel_video_pv{n:02d}",
        "description": "Testimonial or leadership message with a large title, a quote panel and a presenter avatar video on the right. Use for a quote delivered on camera.",
        "components": [
            _background(style),
            _component("large_title_block", "Large title.", 64, 64, [{**title, "position": {"x": 0, "y": 0}}]),
            _component("framed_quote_panel", "Card with accent edge, quote and attribution.", 64, panel_y,
                       [_rect(0, 0, 740, panel_h, card, 12), _rect(0, 0, 8, panel_h, style.accent, 4), mark, quote, author, role]),
            _component("video_frame_accent", "Offset accent panel behind the video.", 920, 124,
                       [_rect(0, 0, PH_W, PH_H, style.accent, 8)]),
            placeholder_component(900, 104),
        ],
    }


def _band(style: TemplateStyle, n: int) -> dict:
    bg, card = style.background, style.card
    title = _text("main_title", "What to remember", 0, 0, 752, style.heading_font, min(style.heading_size, 48), bg, 8, 32)
    body = _text("intro_text", "Three takeaways from the presenter, in the order they come up.", 0, title["size"]["height"] + 12, 752,
                 style.body_font, style.body_size, bg, 24, 90)
    cards = []
    for i, (head, text) in enumerate(
        [("Simple", "Keep the message short."), ("Visual", "Show it, then say it."), ("Actionable", "End with one clear next step.")]
    ):
        x = i * 260
        t = _text(f"card_{i + 1}_title", head, x + 20, 20, 192, style.body_font, 18, card, 4, 14, bold=True)
        d = _text(f"card_{i + 1}_text", text, x + 20, 20 + t["size"]["height"] + 6, 192, style.body_font, 14, card, 12, 56)
        cards += [_rect(x, 0, 232, 220, card, 12), _rect(x, 0, 232, 6, style.accent, 3), t, d]
    return {
        "id": f"video_band_title_cards_pv{n:02d}",
        "description": "Overview with a full-height accent band on the left holding a presenter avatar video, plus a title, short intro and three takeaway cards. Use for summaries narrated on camera.",
        "components": [
            _background(style),
            _component("video_side_band", "Full-height accent band behind the video.", 0, 0, [_rect(0, 0, 400, STAGE_H, style.accent)]),
            placeholder_component(56, 104),
            _component("title_body_block", "Title and intro.", 464, 96, [title, body]),
            _component("takeaway_cards", "Three takeaway cards.", 464, 400, cards),
        ],
    }


def build_archetypes(style: TemplateStyle, start: int) -> list[dict]:
    """The five avatar layouts, numbered `_pv<start>` … `_pv<start+4>`."""
    return [
        _video_left(style, start),
        _video_right(style, start + 1),
        _centered(style, start + 2),
        _quote(style, start + 3),
        _band(style, start + 4),
    ]
