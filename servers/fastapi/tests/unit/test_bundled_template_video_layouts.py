"""Every bundled template carries avatar-ready layouts (see
docs/superpowers/specs/2026-11-18-template-avatar-video-layouts-design.md)."""

import json
import re
from pathlib import Path
from typing import Any

import pytest

from services.slide_video_service import find_video_placeholder

TEMPLATES_ROOT = Path(__file__).resolve().parents[4] / "templates"
TEMPLATE_IDS = sorted(p.parent.name for p in TEMPLATES_ROOT.glob("*/template.json"))
NEW_PER_TEMPLATE = {**{t: 7 for t in TEMPLATE_IDS}, "momentum": 5}
_NEW_ID = re.compile(r"_pv\d\d$")


def load(template_id: str) -> dict[str, Any]:
    return json.loads((TEMPLATES_ROOT / template_id / "template.json").read_text())


def new_layouts(template: dict[str, Any]) -> list[dict[str, Any]]:
    return [l for l in template["layouts"] if _NEW_ID.search(l["id"])]


def _count_placeholders(value: Any) -> int:
    if isinstance(value, dict):
        own = 1 if value.get("video_placeholder") is True else 0
        return own + sum(_count_placeholders(v) for v in value.values())
    if isinstance(value, list):
        return sum(_count_placeholders(v) for v in value)
    return 0


def _texts(value: Any):
    if isinstance(value, dict):
        if value.get("type") == "text":
            yield value
        for v in value.values():
            yield from _texts(v)
    elif isinstance(value, list):
        for v in value:
            yield from _texts(v)


def test_template_ids_found():
    assert len(TEMPLATE_IDS) == 13


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_new_layout_count(template_id):
    assert len(new_layouts(load(template_id))) == NEW_PER_TEMPLATE[template_id]


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_exactly_one_placeholder(template_id):
    for layout in new_layouts(load(template_id)):
        assert find_video_placeholder(layout) is not None, layout["id"]
        assert _count_placeholders(layout) == 1, layout["id"]


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_layout_ids_unique(template_id):
    ids = [l["id"] for l in load(template_id)["layouts"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_description_mentions_presenter_avatar_video(template_id):
    for layout in new_layouts(load(template_id)):
        assert "presenter avatar video" in layout["description"].lower(), layout["id"]


def _hint_violations(layout: dict[str, Any]) -> set[tuple]:
    bad = set()
    for text in _texts(layout):
        name = text.get("name")
        content = "".join(r.get("text", "") for r in text.get("runs", []))
        if not name or not isinstance(text.get("min_length"), int) or not isinstance(text.get("max_length"), int):
            bad.add(("hints", name))
        elif not text["min_length"] <= len(content) <= text["max_length"]:
            bad.add(("length", name))
    return bad


def _stage_violations(layout: dict[str, Any]) -> set[tuple]:
    bad = set()
    for comp in layout["components"]:
        cx, cy = comp["position"]["x"], comp["position"]["y"]
        for el in comp["elements"]:
            if el.get("type") == "vector" or el.get("rotation"):
                continue
            size, pos = el.get("size"), el.get("position")
            if not size or not pos:
                continue
            x, y = cx + pos["x"], cy + pos["y"]
            if not (-1 <= x and x + size["width"] <= 1281 and -1 <= y and y + size["height"] <= 721):
                bad.add((comp["id"].removesuffix("_pv"), el.get("name")))
    return bad


def _source(template: dict[str, Any], layout: dict[str, Any]) -> dict[str, Any] | None:
    """The existing layout a derived one was copied from, if it is one."""
    source_id = _NEW_ID.sub("", layout["id"])
    return next((l for l in template["layouts"] if l["id"] == source_id), None)


@pytest.mark.parametrize("check", [_hint_violations, _stage_violations], ids=["text_hints", "inside_stage"])
@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_new_layouts_add_no_violations(template_id, check):
    """Generated layouts are clean; derived ones inherit, but never add to, their source's issues."""
    template = load(template_id)
    for layout in new_layouts(template):
        source = _source(template, layout)
        allowed = check(source) if source else set()
        assert check(layout) <= allowed, (layout["id"], check(layout) - allowed)


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_components_registered(template_id):
    template = load(template_id)
    registered = {c["id"] for c in template["merged_components"]}
    for layout in new_layouts(template):
        for comp in layout["components"]:
            assert comp["id"] in registered, (layout["id"], comp["id"])
