import pytest

from services.pptx_import.presenter_slots import (
    add_bottom_right_presenter_slot,
    fallback_presenter_slides,
    normalize_presenter_slides,
    spread_presenter_slides,
)
from services.slide_video_service import (
    PRESENTER_SLOT_ASPECT,
    default_placeholder_box,
    find_video_placeholder_box,
)


@pytest.mark.parametrize(
    "s,n,expected",
    [
        (12, 3, [0, 6, 11]),
        (10, 3, [0, 5, 9]),
        (6, 3, [0, 3, 5]),
        (5, 1, [0]),
        (3, 9, [0, 1, 2]),
        (1, 2, [0]),
        (4, 0, []),
        (0, 3, []),
    ],
)
def test_spread(s, n, expected):
    assert spread_presenter_slides(s, n) == expected


@pytest.mark.parametrize(
    "s,expected",
    [(1, [0]), (2, [0, 1]), (12, [0, 4, 8, 11]), (9, [0, 4, 8]), (5, [0, 4])],
)
def test_fallback(s, expected):
    assert fallback_presenter_slides(s) == expected


def test_normalize_forces_ends_and_drops_bad():
    assert normalize_presenter_slides([3, 99, -1, 3, "x"], 6) == [0, 3, 5]


def test_slot_is_bottom_right_portrait():
    ui = add_bottom_right_presenter_slot({"id": "s", "components": [], "elements": []})
    box = find_video_placeholder_box(ui)
    assert box == default_placeholder_box(*PRESENTER_SLOT_ASPECT)
    assert box.size.height > box.size.width


def test_existing_slot_is_kept_as_a_copy():
    ui = add_bottom_right_presenter_slot({"id": "s", "components": [], "elements": []})
    again = add_bottom_right_presenter_slot(ui)
    assert again == ui and again is not ui
