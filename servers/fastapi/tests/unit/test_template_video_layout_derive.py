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


def _text_at(x, y, w, h):
    return {"type": "text", "name": "t", "position": {"x": x, "y": y}, "size": {"width": w, "height": h}}


def _boxes_overlap(a, b):
    return min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]) > 1 and min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]) > 1


def _placeholder_box(layout):
    comp = next(c for c in layout["components"] if c["id"] == "video_placeholder")
    el = comp["elements"][0]
    return (comp["position"]["x"] + el["position"]["x"], comp["position"]["y"] + el["position"]["y"],
            el["size"]["width"], el["size"]["height"])


def test_layouts_with_no_free_spot_for_the_placeholder_are_skipped():
    # the image box is stage x 110..710, y 70..570; the text fills all of it
    covered = _layout("covered_1", "Text over the whole image", _image(600, 500), with_text=False)
    covered["components"].append({"id": "overlay", "description": "o", "position": {"x": 100, "y": 60}, "elements": [_text_at(0, 0, 620, 520)]})
    clear = _layout("clear_2", "Text beside the image", _image(600, 500), with_text=False)
    clear["components"].append({"id": "side", "description": "s", "position": {"x": 800, "y": 100}, "elements": [_text_at(0, 0, 300, 60)]})
    assert [l["id"] for l in derive_layouts({"layouts": [covered, clear]}, 5, 1)] == ["clear_2_pv01"]


def test_placeholder_moves_to_free_space_inside_the_image_when_text_overlays_its_middle():
    layout = _layout("over_1", "Text over the middle", _image(600, 500), with_text=False)
    text = _text_at(0, 0, 220, 300)  # stage x 310..530, y 170..470: the middle of the image
    layout["components"].append({"id": "overlay", "description": "o", "position": {"x": 310, "y": 170}, "elements": [text]})
    out = derive_layouts({"layouts": [layout]}, 1, 1)
    assert len(out) == 1
    box = _placeholder_box(out[0])
    assert not _boxes_overlap(box, (310, 170, 220, 300))
    assert 110 <= box[0] and box[0] + box[2] <= 710 and 70 <= box[1] and box[1] + box[3] <= 570  # still on the image
    assert box[2] >= 160 and abs(box[2] / box[3] - 9 / 16) < 0.02


def test_text_nested_in_a_group_counts_at_its_absolute_position():
    layout = _layout("nested_1", "Nested text over the whole image", _image(600, 500), with_text=False)
    layout["components"].append(
        {"id": "grp", "description": "g", "position": {"x": 0, "y": 0},
         "elements": [{"type": "group", "position": {"x": 100, "y": 60}, "children": [_text_at(0, 0, 620, 520)]}]}
    )
    assert derive_layouts({"layouts": [layout]}, 5, 1) == []


def test_a_flex_container_over_the_image_counts_as_one_content_box():
    # children of a flex get their place at render time, so their stored positions say nothing
    layout = _layout("flexed_1", "Flex text over the whole image", _image(600, 500), with_text=False)
    layout["components"].append(
        {"id": "stack", "description": "s", "position": {"x": 100, "y": 60},
         "elements": [{"type": "flex", "position": {"x": 0, "y": 0}, "size": {"width": 620, "height": 520},
                       "children": [_text_at(0, 0, 50, 20)]}]}
    )
    assert derive_layouts({"layouts": [layout]}, 5, 1) == []


def _panel(x, y, w, h, opacity=1):
    return {"type": "container", "position": {"x": x, "y": y}, "size": {"width": w, "height": h},
            "fill": {"color": "#112233", "opacity": opacity}}


def test_an_opaque_panel_in_a_later_layer_blocks_the_placeholder_but_one_underneath_does_not():
    above = _layout("above_1", "Panel above", _image(600, 500), with_text=False)
    above["components"].append({"id": "panel", "description": "p", "position": {"x": 100, "y": 60}, "elements": [_panel(0, 0, 620, 520)]})
    below = _layout("below_2", "Panel below", _image(600, 500), with_text=False)
    below["components"].insert(1, {"id": "panel", "description": "p", "position": {"x": 100, "y": 60}, "elements": [_panel(0, 0, 620, 520)]})
    assert [l["id"] for l in derive_layouts({"layouts": [above, below]}, 5, 1)] == ["below_2_pv01"]


def test_a_full_slide_backdrop_in_a_later_layer_is_not_a_blocker():
    layout = _layout("backdrop_1", "Backdrop above", _image(600, 500), with_text=False)
    layout["components"].append({"id": "wash", "description": "w", "position": {"x": 0, "y": 0}, "elements": [_panel(0, 0, 1280, 720, 0.4)]})
    assert len(derive_layouts({"layouts": [layout]}, 1, 1)) == 1


def test_a_filled_vector_card_in_a_later_layer_blocks_the_placeholder():
    card = {"type": "vector", "shape": "polygon", "fill": {"color": "#1B8C2D", "opacity": 1}, "closed": True,
            "points": [{"x": 0, "y": 0}, {"x": 620, "y": 0}, {"x": 620, "y": 520}, {"x": 0, "y": 520}]}
    layout = _layout("vector_1", "Vector card above", _image(600, 500), with_text=False)
    layout["components"].append({"id": "card", "description": "c", "position": {"x": 100, "y": 60}, "elements": [card]})
    assert derive_layouts({"layouts": [layout]}, 5, 1) == []
