import json
import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO))

from scripts.template_video_layouts.style import contrast, extract_style  # noqa: E402

IDS = sorted(p.parent.name for p in (REPO / "templates").glob("*/template.json"))
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def load(template_id):
    return json.loads((REPO / "templates" / template_id / "template.json").read_text())


def test_contrast_black_white():
    assert contrast("#000000", "#FFFFFF") == pytest.approx(21.0)
    assert contrast("#777777", "#777777") == pytest.approx(1.0)


def test_momentum_style():
    style = extract_style(load("momentum"))
    assert style.accent.upper() == "#213EBB"
    assert style.heading_font["family"] in {"Lato Heavy", "Lato Bold", "Lato", "Anton"}


def test_modern_style_uses_montserrat():
    assert extract_style(load("modern")).body_font["family"] == "Montserrat"


@pytest.mark.parametrize("template_id", IDS)
def test_style_is_usable(template_id):
    template = load(template_id)
    style = extract_style(template)
    families = set(template["fonts"]) | {template["theme"]["fonts"]["textFont"]["name"]}
    for color in (style.background, style.accent, style.accent_text, style.card):
        assert HEX.match(color), color
    assert style.heading_font["family"] in families
    assert style.body_font["family"] in families
    assert style.heading_size > style.body_size > 0
    assert contrast(style.heading_font["color"], style.background) >= 3.0
    assert contrast(style.body_font["color"], style.background) >= 3.0
    assert contrast(style.accent_text, style.accent) >= 4.5
