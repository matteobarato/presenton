import pytest

from models.slide_video_response import StageBox
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.slide_video_service import (
    InvalidStageBoxError,
    default_placeholder_box,
    ensure_video_placeholder,
    find_video_placeholder,
    is_template_slide,
    placeholder_box,
    remove_video_placeholder,
    resolve_bubble,
    set_bubble,
)


def _ui(*elements, components=None):
    return {
        "id": "layout",
        "description": "",
        "components": components or [],
        "elements": list(elements),
    }


def _placeholder(x=10, y=20, width=300, height=200):
    return {
        "type": "image",
        "name": "avatar_video",
        "video_placeholder": True,
        "decorative": True,
        "position": {"x": x, "y": y},
        "size": {"width": width, "height": height},
    }


def _box(box: StageBox):
    return (box.position.x, box.position.y, box.size.width, box.size.height)


def test_only_slides_with_an_element_tree_are_template_slides():
    assert is_template_slide(SlideModel(layout_group="g", layout="l", index=0, content={}, ui=_ui()))
    assert not is_template_slide(
        SlideModel(layout_group="smart-html", layout="s", index=0, content={}, ui=None)
    )
    assert not is_template_slide(
        SlideModel(layout_group="g", layout="l", index=0, content={}, ui={"id": "x"})
    )


def test_a_layout_made_only_of_components_is_a_template_slide():
    ui = {"id": "layout", "components": [{"id": "c", "elements": []}]}
    assert is_template_slide(
        SlideModel(layout_group="g", layout="l", index=0, content={}, ui=ui)
    )

    placed = ensure_video_placeholder(ui, video_width=1280, video_height=720)
    assert placed["components"] == ui["components"]
    assert placed["elements"][0]["video_placeholder"] is True


def test_finds_a_placeholder_nested_in_components_but_not_plain_images():
    image = {"type": "image", "data": "a.png"}
    nested = _placeholder()
    ui = _ui(
        image,
        components=[{"id": "c", "elements": [{"type": "group", "children": [nested]}]}],
    )

    assert find_video_placeholder(ui) is nested
    assert find_video_placeholder(_ui(image)) is None
    assert find_video_placeholder(None) is None


def test_default_placeholder_follows_the_video_shape_within_limits():
    assert _box(default_placeholder_box(1920, 1080)) == (936, 516, 320, 180)
    assert _box(default_placeholder_box()) == (936, 516, 320, 180)
    # Square avatars stay square.
    assert _box(default_placeholder_box(1080, 1080)) == (936, 376, 320, 320)
    # Portrait video would be too tall at 320 wide, so the height is capped.
    assert _box(default_placeholder_box(1080, 1920)) == (1256 - 202, 336, 202, 360)


def test_ensure_adds_a_placeholder_once_and_returns_a_new_dict():
    ui = _ui({"type": "text", "runs": []})

    first = ensure_video_placeholder(ui, video_width=1280, video_height=720)
    second = ensure_video_placeholder(first, video_width=1280, video_height=720)

    assert first is not ui
    assert ui["elements"] == [{"type": "text", "runs": []}]
    assert len(first["elements"]) == 2
    assert first["elements"][-1]["video_placeholder"] is True
    assert first["elements"][-1]["data"].endswith("/static/images/video-placeholder.png")
    assert second == first
    assert second is not first


def test_ensure_keeps_an_existing_placeholder_and_applies_given_coordinates():
    ui = _ui(_placeholder(x=10, y=20, width=300, height=200))

    kept = ensure_video_placeholder(ui, video_width=1920, video_height=1080)
    moved = ensure_video_placeholder(ui, x=100, height=150)

    assert _box(placeholder_box(find_video_placeholder(kept))) == (10, 20, 300, 200)
    assert _box(placeholder_box(find_video_placeholder(moved))) == (100, 20, 300, 150)
    assert len(moved["elements"]) == 1


@pytest.mark.parametrize(
    "coordinates",
    [
        {"x": 1100},
        {"y": -1},
        {"width": 0},
        {"x": 0, "y": 0, "width": 1281, "height": 10},
    ],
)
def test_ensure_rejects_a_box_off_the_slide(coordinates):
    ui = _ui(_placeholder())
    with pytest.raises(InvalidStageBoxError):
        ensure_video_placeholder(ui, **coordinates)


def test_remove_takes_out_every_placeholder_and_leaves_the_rest():
    text = {"type": "text", "runs": []}
    ui = _ui(
        text,
        _placeholder(),
        components=[
            {"id": "c", "elements": [_placeholder()]},
            {"id": "d", "child": _placeholder()},
        ],
    )

    cleaned = remove_video_placeholder(ui)

    assert find_video_placeholder(cleaned) is None
    assert cleaned["elements"] == [text]
    assert cleaned["components"][0]["elements"] == []
    assert cleaned["components"][1]["child"] is None
    # The original is left alone.
    assert find_video_placeholder(ui) is not None


def test_bubble_defaults_to_the_corner_until_a_deck_sets_one():
    presentation = PresentationModel(content="", n_slides=1, language="Italian")

    default = resolve_bubble(presentation)
    assert default.is_default is True
    assert _box(default) == (1160, 600, 96, 96)

    placed = set_bubble(presentation, StageBox.of(24, 24, 120, 120))
    assert placed.is_default is False
    assert _box(placed) == (24, 24, 120, 120)
    assert presentation.narration == {
        "bubble": {
            "position": {"x": 24, "y": 24},
            "size": {"width": 120, "height": 120},
        }
    }

    with pytest.raises(InvalidStageBoxError):
        set_bubble(presentation, StageBox.of(1200, 0, 96, 96))
    # A rejected placement does not overwrite the stored one.
    assert _box(resolve_bubble(presentation)) == (24, 24, 120, 120)
