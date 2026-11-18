import json
import math
import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO))

from scripts.template_video_layouts.archetypes import (  # noqa: E402
    build_archetypes,
    placeholder_component,
)
from scripts.template_video_layouts.style import extract_style  # noqa: E402

IDS = sorted(p.parent.name for p in (REPO / "templates").glob("*/template.json"))
PREFIXES = [
    "video_left_title_points",
    "title_steps_video_right",
    "centered_video_side_callouts",
    "quote_panel_video",
    "video_band_title_cards",
]


def archetypes(template_id, start=1):
    template = json.loads((REPO / "templates" / template_id / "template.json").read_text())
    return build_archetypes(extract_style(template), start)


def placeholder_box(layout):
    comps = [c for c in layout["components"] if c["id"] == "video_placeholder"]
    assert len(comps) == 1
    el = comps[0]["elements"][0]
    assert el["video_placeholder"] is True
    return (
        comps[0]["position"]["x"] + el["position"]["x"],
        comps[0]["position"]["y"] + el["position"]["y"],
        el["size"]["width"],
        el["size"]["height"],
    )


def test_placeholder_component_is_verbatim():
    comp = placeholder_component(96, 104)
    assert comp["id"] == "video_placeholder"
    assert comp["description"] == "Avatar video placeholder"
    assert comp["elements"] == [
        {
            "type": "image",
            "position": {"x": 0, "y": 0},
            "size": {"width": 288, "height": 512},
            "data": "/static/images/video-placeholder.png",
            "fit": "cover",
            "decorative": True,
            "name": "avatar_video",
            "is_icon": False,
            "video_placeholder": True,
        }
    ]


def test_five_layouts_with_ids():
    layouts = archetypes("momentum", start=1)
    assert [re.sub(r"_pv\d\d$", "", l["id"]) for l in layouts] == PREFIXES
    assert [l["id"][-4:] for l in layouts] == ["pv01", "pv02", "pv03", "pv04", "pv05"]
    for l in layouts:
        assert "presenter avatar video" in l["description"].lower()


def test_placeholder_positions():
    left, right, centered, quote, band = archetypes("momentum")
    assert placeholder_box(left)[0] < 300
    assert placeholder_box(right)[0] > 700
    x, _, w, _ = placeholder_box(centered)
    assert abs(x + w / 2 - 640) <= 5
    assert placeholder_box(quote)[0] > 700
    assert placeholder_box(band)[0] + 288 <= 400


@pytest.mark.parametrize("template_id", IDS)
def test_layouts_fit_the_stage_and_text_fits_its_box(template_id):
    for layout in archetypes(template_id):
        names = []
        assert layout["components"][0]["id"] == "full_bleed_canvas"
        for comp in layout["components"]:
            cx, cy = comp["position"]["x"], comp["position"]["y"]
            for el in comp["elements"]:
                if el["type"] == "vector":
                    continue
                x, y = cx + el["position"]["x"], cy + el["position"]["y"]
                w, h = el["size"]["width"], el["size"]["height"]
                assert 0 <= x and x + w <= 1280.5, (layout["id"], comp["id"], el.get("name"))
                assert 0 <= y and y + h <= 720.5, (layout["id"], comp["id"], el.get("name"))
                if el["type"] == "text":
                    names.append(el["name"])
                    assert el["min_length"] <= len("".join(r["text"] for r in el["runs"])) <= el["max_length"]
                    font = el["font"]
                    lines = math.ceil(el["max_length"] * 0.55 * font["size"] / w)
                    assert lines * font["size"] * font["line_height"] <= h + 1, (layout["id"], el["name"])
        assert len(names) == len(set(names)), layout["id"]
