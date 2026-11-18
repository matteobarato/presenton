import copy
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO))

from scripts.template_video_layouts.derive import derive_layouts  # noqa: E402


def _image(w, h, **extra):
    return {
        "type": "image", "position": {"x": 10, "y": 20}, "size": {"width": w, "height": h},
        "data": "/static/images/replaceable_template_image.png", "fit": "cover",
        "decorative": False, "name": "photo", "is_icon": False, **extra,
    }


def _layout(lid, desc, image, with_text=True):
    elements = [image] + ([{"type": "text", "name": "title", "position": {"x": 0, "y": 0}}] if with_text else [])
    return {
        "id": lid, "description": desc,
        "components": [
            {"id": "bg", "description": "bg", "position": {"x": 0, "y": 0}, "elements": [{"type": "vector"}]},
            {"id": "media", "description": "media", "position": {"x": 100, "y": 50}, "elements": elements},
        ],
    }


def _template():
    return {"layouts": [
        _layout("big_1234", "Big image slide", _image(600, 500)),
        _layout("mid_2345", "Medium image slide", _image(400, 300)),
        _layout("icon_3456", "Icon slide", _image(500, 500, is_icon=True)),
        _layout("small_4567", "Tiny image slide", _image(100, 100)),
        _layout("plain_5678", "Text only", {"type": "text", "name": "t", "position": {"x": 0, "y": 0}}),
    ]}


def _placeholders(value):
    if isinstance(value, dict):
        return (1 if value.get("video_placeholder") else 0) + sum(_placeholders(v) for v in value.values())
    if isinstance(value, list):
        return sum(_placeholders(v) for v in value)
    return 0


def test_derives_largest_images_first():
    out = derive_layouts(_template(), 2, 6)
    assert [l["id"] for l in out] == ["big_1234_pv06", "mid_2345_pv07"]
    assert all(l["description"].startswith("Presenter avatar video version: ") for l in out)
    assert all(_placeholders(l) == 1 for l in out)


def test_placeholder_is_portrait_centered_in_old_box_in_its_own_component():
    layout = derive_layouts(_template(), 1, 1)[0]
    comp = next(c for c in layout["components"] if c["id"] == "video_placeholder")
    el = comp["elements"][0]
    w, h = el["size"]["width"], el["size"]["height"]
    assert h > w and abs(w / h - 9 / 16) < 0.02 and w <= 360
    assert comp["description"] == "Avatar video placeholder"
    # old box: stage x 110..710, y 70..570
    cx, cy = comp["position"]["x"] + el["position"]["x"] + w / 2, comp["position"]["y"] + el["position"]["y"] + h / 2
    assert abs(cx - 410) <= 1 and abs(cy - 320) <= 1
    media = next(c for c in layout["components"] if c["id"] == "media")
    assert [e["type"] for e in media["elements"]] == ["text"]  # the image is gone, nothing else removed


def test_originals_untouched_and_no_candidates_returns_empty():
    template = _template()
    before = copy.deepcopy(template)
    derive_layouts(template, 3, 1)
    assert template == before
    assert derive_layouts({"layouts": [_layout("p_1", "x", {"type": "text", "name": "t", "position": {"x": 0, "y": 0}})]}, 2, 1) == []


def test_fewer_candidates_than_requested_returns_what_exists():
    assert len(derive_layouts(_template(), 5, 1)) == 2  # icon + tiny + text-only are skipped


def test_placeholder_stays_on_stage_when_the_image_bleeds_off_it():
    template = {"layouts": [_layout("bleed_1", "Bleeding image", _image(700, 900, position={"x": -150, "y": -80}))]}
    layout = derive_layouts(template, 1, 1)[0]
    comp = next(c for c in layout["components"] if c["id"] == "video_placeholder")
    el = comp["elements"][0]
    x, y = comp["position"]["x"] + el["position"]["x"], comp["position"]["y"] + el["position"]["y"]
    assert x >= 0 and y >= 0
    assert x + el["size"]["width"] <= 1280 and y + el["size"]["height"] <= 720
