"""Turn an uploaded PowerPoint deck into the slides of a new presentation."""

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import PurePath
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError

from constants.presentation import MAX_NUMBER_OF_SLIDES
from models.presentation_import import ImportPresentationRequest
from services.export_task_service import EXPORT_TASK_SERVICE
from services.pptx_import.fit import fit_slide_to_stage, slide_background_color
from services.pptx_import.notes import align_speaker_notes, read_speaker_notes
from services.pptx_import.presenter_slots import (
    add_bottom_right_presenter_slot,
    spread_presenter_slides,
)
from templates.fonts_and_slides_preview import _preview_dimensions_from_pptx
from templates.v2.models.layouts import RawSlideLayouts
from utils.asset_directory_utils import resolve_app_path_to_filesystem
from utils.llm_calls.select_presenter_slides import select_presenter_slides
from utils.slide_ui_text import slide_ui_text

LOGGER = logging.getLogger(__name__)

DEFAULT_IMPORT_TITLE = "Imported presentation"


@dataclass
class ImportedSlide:
    ui: dict
    speaker_note: str


@dataclass
class ImportedDeck:
    slides: list[ImportedSlide]
    presenter_indexes: list[int]


def imported_presentation_title(request: ImportPresentationRequest) -> str:
    return (
        (request.title or "").strip()
        or PurePath(request.source_name or "").stem
        or DEFAULT_IMPORT_TITLE
    )


async def _converted_layouts(pptx_path: str) -> list[dict[str, Any]]:
    pptx_json = await EXPORT_TASK_SERVICE.convert_pptx_to_json(pptx_path)
    try:
        RawSlideLayouts.model_validate(pptx_json.model_dump(mode="json"))
    except ValidationError as exc:
        LOGGER.exception(
            "[presentation.import] PPTX-to-JSON export produced invalid slide "
            "layout JSON pptx_path=%s",
            pptx_path,
        )
        raise HTTPException(
            status_code=500,
            detail="PPTX-to-JSON export produced invalid slide layout JSON",
        ) from exc
    # The converter's own dicts: the validated model would drop or add keys.
    return pptx_json.layouts


async def _speaker_notes(pptx_path: str, layout_ids: list[str]) -> list[str]:
    try:
        notes = await asyncio.to_thread(read_speaker_notes, pptx_path)
    except Exception:
        LOGGER.exception(
            "[presentation.import] could not read speaker notes pptx_path=%s",
            pptx_path,
        )
        return [""] * len(layout_ids)
    return align_speaker_notes(layout_ids, notes)


async def _presenter_indexes(
    request: ImportPresentationRequest, slides: list[ImportedSlide]
) -> list[int]:
    if request.n_videos is None:
        return await select_presenter_slides(
            [
                {"text": slide_ui_text(slide.ui), "note": slide.speaker_note}
                for slide in slides
            ],
            deck_title=imported_presentation_title(request),
        )
    if request.n_videos == 0:
        return []
    return spread_presenter_slides(len(slides), request.n_videos)


async def build_imported_deck(request: ImportPresentationRequest) -> ImportedDeck:
    pptx_path = resolve_app_path_to_filesystem(request.pptx_url)
    if not pptx_path or not os.path.isfile(pptx_path):
        raise HTTPException(
            status_code=404, detail="PowerPoint file not found. Upload it again."
        )

    layouts = await _converted_layouts(pptx_path)
    if not layouts:
        raise HTTPException(status_code=400, detail="The PowerPoint has no slides.")
    if len(layouts) > MAX_NUMBER_OF_SLIDES:
        LOGGER.info(
            "[presentation.import] capping slides=%d to %d",
            len(layouts),
            MAX_NUMBER_OF_SLIDES,
        )
        layouts = layouts[:MAX_NUMBER_OF_SLIDES]

    width, height = _preview_dimensions_from_pptx(pptx_path)
    notes = await _speaker_notes(pptx_path, [layout["id"] for layout in layouts])
    slides = [
        ImportedSlide(
            ui={
                "id": layout["id"],
                "description": layout["description"],
                "background": slide_background_color(
                    layout["elements"], width, height
                ),
                "components": [],
                "elements": fit_slide_to_stage(layout["elements"], width, height),
            },
            speaker_note=note,
        )
        for layout, note in zip(layouts, notes)
    ]

    presenter_indexes = await _presenter_indexes(request, slides)
    for index in presenter_indexes:
        slides[index].ui = add_bottom_right_presenter_slot(slides[index].ui)
    return ImportedDeck(slides=slides, presenter_indexes=presenter_indexes)
