import copy

from services.pptx_import.fit import fit_slide_to_stage, slide_background_color


def _rect(x, y, w, h, color):
    return {
        "type": "vector",
        "shape": "polygon",
        "points": [
            {"x": x, "y": y},
            {"x": x + w, "y": y},
            {"x": x + w, "y": y + h},
            {"x": x, "y": y + h},
        ],
        "closed": True,
        "fill": {"color": color},
    }


def _text(x, y, w, h, size=16, letter_spacing=None, line_height=None):
    font = {"size": size}
    if letter_spacing is not None:
        font["letter_spacing"] = letter_spacing
    if line_height is not None:
        font["line_height"] = line_height
    return {
        "type": "text",
        "position": {"x": x, "y": y},
        "size": {"width": w, "height": h},
        "font": font,
        "runs": [{"text": "Hello"}],
    }


def _bbox(vector):
    xs = [p["x"] for p in vector["points"]]
    ys = [p["y"] for p in vector["points"]]
    return (min(xs), min(ys), max(xs), max(ys))


def test_16x9_deck_is_left_as_is():
    els = [_rect(0, 0, 1280, 720, "#112233"), _text(100, 100, 400, 50, size=24)]
    assert fit_slide_to_stage(els, 1280, 720) == els
    assert fit_slide_to_stage(els, 1280, 721) == els


def test_4x3_deck_is_scaled_centred_with_background_band():
    els = [
        _rect(0, 0, 1280, 960, "#112233"),
        _text(0, 0, 1280, 100, size=40, letter_spacing=2, line_height=1.2),
    ]
    out = fit_slide_to_stage(els, 1280, 960)
    assert out[0]["fill"]["color"] == "#112233" and _bbox(out[0]) == (0, 0, 1280, 720)
    assert out[0]["decorative"] is True and out[0]["closed"] is True
    assert _bbox(out[1]) == (160, 0, 1120, 720)
    t = out[2]
    assert t["position"] == {"x": 160, "y": 0}
    assert t["size"] == {"width": 960, "height": 75}
    assert t["font"]["size"] == 30 and t["font"]["letter_spacing"] == 1.5
    assert t["font"]["line_height"] == 1.2


def test_nested_children_scale_but_only_top_level_moves():
    group = {
        "type": "group",
        "position": {"x": 100, "y": 80},
        "size": {"width": 400, "height": 400},
        "children": [_text(20, 40, 200, 40, size=20)],
    }
    out = fit_slide_to_stage([group], 1280, 960)
    assert out[1]["position"] == {"x": 235, "y": 60}
    assert out[1]["children"][0]["position"] == {"x": 15, "y": 30}
    assert out[1]["children"][0]["font"]["size"] == 15


def test_top_level_vector_points_are_scaled_and_offset():
    v = {
        "type": "vector",
        "points": [{"x": 0, "y": 0}, {"x": 1280, "y": 960}],
        "stroke": {"color": "#000000", "width": 4, "dash": [8, 4]},
    }
    out = fit_slide_to_stage([v], 1280, 960)[1]
    assert out["points"] == [{"x": 160, "y": 0}, {"x": 1120, "y": 720}]
    assert out["stroke"]["width"] == 3 and out["stroke"]["dash"] == [6, 3]


def test_chart_data_is_not_scaled():
    chart = {
        "type": "chart",
        "position": {"x": 0, "y": 0},
        "size": {"width": 640, "height": 480},
        "chart_type": "bar",
        "series": [{"name": "a", "values": [10, 20]}],
    }
    assert fit_slide_to_stage([chart], 1280, 960)[1]["series"][0]["values"] == [10, 20]


def test_wider_than_16x9_is_centred_vertically_without_scaling():
    out = fit_slide_to_stage([_text(0, 0, 1280, 600)], 1280, 600)
    assert out[1]["position"] == {"x": 0, "y": 60} and out[1]["size"]["width"] == 1280


def test_background_defaults_to_white_without_full_size_fill():
    assert slide_background_color([_text(0, 0, 10, 10)], 1280, 960) == "#FFFFFF"


def test_background_is_the_bottom_most_full_size_fill():
    els = [_rect(0, 0, 100, 100, "#111111"), _rect(0, 0, 1280, 960, "#222222"), _rect(0, 0, 1280, 960, "#333333")]
    assert slide_background_color(els, 1280, 960) == "#222222"


def test_input_is_not_mutated():
    els = [_rect(0, 0, 1280, 960, "#112233"), _text(10, 10, 100, 20, size=20)]
    before = copy.deepcopy(els)
    fit_slide_to_stage(els, 1280, 960)
    assert els == before
