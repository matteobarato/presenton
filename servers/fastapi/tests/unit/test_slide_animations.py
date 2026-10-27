import asyncio

import pytest

import utils.llm_calls.generate_slide_animations as animations
from utils.llm_calls.generate_slide_animations import (
    SLIDE_ANIMATION_MAX_SECONDS,
    SlideTween,
    fallback_slide_animation,
    generate_slide_animations,
    slide_animation_end_seconds,
    validate_slide_animation,
)


def _raw(**overrides):
    base = {
        "target": "e0",
        "opacity": 0,
        "x": None,
        "y": 40,
        "scale": None,
        "rotation": None,
        "blur": None,
        "duration": 0.6,
        "delay": 0.2,
        "ease": "power3.out",
    }
    base.update(overrides)
    return base


def test_validate_keeps_known_targets_once():
    tweens = validate_slide_animation(
        [_raw(), _raw(target="e9"), _raw(delay=1.0)], ["e0", "e1"]
    )
    assert [tween.target for tween in tweens] == ["e0"]
    assert tweens[0].from_values == {"opacity": 0.0, "y": 40.0}
    assert tweens[0].delay == 0.2


def test_validate_clamps_values_and_replaces_unknown_ease():
    (tween,) = validate_slide_animation(
        [_raw(x=-5000, scale=9, rotation=180, blur=-3, duration=40, ease="bounce.inOut")],
        ["e0"],
    )
    assert tween.from_values["x"] == -400
    assert tween.from_values["scale"] == 1.5
    assert tween.from_values["rotation"] == 30
    # Clamped to its resting value, a property no longer animates.
    assert "blur" not in tween.from_values
    assert tween.duration == 1.2
    assert tween.ease == "power2.out"


def test_validate_turns_motionless_tween_into_fade():
    (tween,) = validate_slide_animation([_raw(opacity=1, y=0)], ["e0"])
    assert tween.from_values == {"opacity": 0.0}


def test_validate_pulls_late_tweens_inside_the_entrance_window():
    (tween,) = validate_slide_animation([_raw(delay=9, duration=1.0)], ["e0"])
    assert tween.end_seconds == pytest.approx(SLIDE_ANIMATION_MAX_SECONDS)


def test_validate_ignores_non_numbers_and_garbage():
    assert validate_slide_animation("nope", ["e0"]) == []
    (tween,) = validate_slide_animation(
        [_raw(opacity=True, y="40", x=float("nan")), 7], ["e0"]
    )
    assert tween.from_values == {"opacity": 0.0}


def test_fallback_fades_up_in_reading_order_and_skips_backgrounds():
    elements = [
        {"id": "e0", "box": {"x": 0, "y": 0, "width": 1280, "height": 720}},
        {"id": "e1", "box": {"x": 600, "y": 300, "width": 100, "height": 100}},
        {"id": "e2", "box": {"x": 40, "y": 40, "width": 600, "height": 80}},
    ]
    tweens = fallback_slide_animation(elements)
    assert [tween.target for tween in tweens] == ["e2", "e1"]
    assert [tween.delay for tween in tweens] == [0.0, 0.12]
    assert slide_animation_end_seconds(tweens) <= SLIDE_ANIMATION_MAX_SECONDS


def test_fallback_stagger_never_runs_past_the_window():
    elements = [
        {"id": f"e{i}", "box": {"x": 0, "y": i, "width": 10, "height": 10}}
        for i in range(40)
    ]
    tweens = fallback_slide_animation(elements)
    assert slide_animation_end_seconds(tweens) == pytest.approx(SLIDE_ANIMATION_MAX_SECONDS)


def test_tween_round_trips_through_dict():
    tween = SlideTween("e1", {"opacity": 0.0, "blur": 6.0}, 0.5, 0.3, "expo.out")
    assert SlideTween.from_dict(tween.to_dict()) == tween


def test_generate_falls_back_when_the_llm_fails(monkeypatch):
    async def failing(**_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(animations, "generate_slide_animation", failing)
    elements = [{"id": "e0", "box": {"x": 0, "y": 0, "width": 100, "height": 50}}]
    plans = asyncio.run(
        generate_slide_animations(
            slides=[(2, elements), (3, [])], slide_count=4, deck_title="Deck"
        )
    )
    assert [tween.target for tween in plans[2]] == ["e0"]
    assert plans[3] == []


def test_generate_uses_llm_plan_when_valid(monkeypatch):
    seen = {}

    async def planner(*, elements, slide_position, slide_count, deck_title):
        seen["position"] = slide_position
        return [SlideTween("e0", {"x": -60.0}, 0.5, 0.0, "power2.out")]

    monkeypatch.setattr(animations, "generate_slide_animation", planner)
    plans = asyncio.run(
        generate_slide_animations(
            slides=[(0, [{"id": "e0"}])], slide_count=1, deck_title="Deck"
        )
    )
    assert plans[0][0].from_values == {"x": -60.0}
    assert seen["position"] == 1
