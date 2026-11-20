"""The bundled templates' avatar layouts feed presenter-video selection."""

import json
from pathlib import Path

import pytest

from models.presentation_layout import PresentationLayoutModel, SlideLayoutModel
from services.slide_video_service import find_video_placeholder, presenter_slot_fits
from utils.image_target import (
    enforce_media_targets,
    video_layout_indexes,
    video_slot_positions,
)

TEMPLATES_ROOT = Path(__file__).resolve().parents[4] / "templates"
TEMPLATE_IDS = sorted(p.parent.name for p in TEMPLATES_ROOT.glob("*/template.json"))
# 7 new layouts per template; momentum has its 5 hand-made ones plus 5 new;
# studio is built around the presenter, with 8 of its 16 layouts on video.
EXPECTED_VIDEO_LAYOUTS = {**{t: 7 for t in TEMPLATE_IDS}, "momentum": 10, "studio": 8}


def layout_model(template_id: str) -> PresentationLayoutModel:
    """Built the way the presentation endpoint builds it from a template's layouts."""
    template = json.loads((TEMPLATES_ROOT / template_id / "template.json").read_text())
    return PresentationLayoutModel(
        name=template_id,
        slides=[
            SlideLayoutModel(
                id=str(source["id"]),
                description=source.get("description"),
                json_schema={"title": str(source["id"])},
                has_video=find_video_placeholder(source) is not None,
                presenter_fits=presenter_slot_fits(source),
            )
            for source in template["layouts"]
        ],
    )


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_every_template_offers_video_layouts(template_id):
    layout = layout_model(template_id)
    assert len(video_layout_indexes(layout)) == EXPECTED_VIDEO_LAYOUTS[template_id]


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_a_video_target_is_met_by_layouts_so_no_presenter_slot_is_injected(template_id):
    layout = layout_model(template_id)
    plain = [i for i in range(len(layout.slides)) if i not in set(video_layout_indexes(layout))]
    selection = plain[:8]
    chosen = enforce_media_targets(selection, layout, None, 3)
    video_set = set(video_layout_indexes(layout))
    assert sum(1 for index in chosen if index in video_set) == 3
    assert video_slot_positions(chosen, layout, 3) == []
