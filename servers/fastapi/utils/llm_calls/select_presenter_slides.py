"""Pick which slides of an imported PowerPoint deck get a presenter video.

Used when the user leaves the presenter count on Automatic. Choosing is a
nicety, so this never raises: any failure gives the evenly spaced fallback.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, Sequence

from llmai import get_client
from llmai.shared import JSONSchemaResponse, SystemMessage, UserMessage

from services.pptx_import.presenter_slots import (
    fallback_presenter_slides,
    normalize_presenter_slides,
)
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import generate_structured_with_schema_retries

LOGGER = logging.getLogger(__name__)

_EXCERPT_CHARS = 300
PRESENTER_SELECTION_TIMEOUT_SECONDS = 30

SYSTEM_PROMPT = (
    "You choose which slides of a presentation get a video presenter. The "
    "presenter appears on the first and last slides and on chapter or section "
    "introductions; otherwise on roughly one slide in every 3-4. Return the "
    "0-based indexes of the chosen slides."
)

USER_PROMPT = """# Deck Title:
{deck_title}

# Slides:
{slides}
"""


def presenter_slides_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"indexes": {"type": "array", "items": {"type": "integer"}}},
        "required": ["indexes"],
        "additionalProperties": False,
    }


def _slides_prompt(slides: Sequence[dict[str, str]]) -> str:
    blocks = []
    for index, slide in enumerate(slides):
        text = str(slide.get("text") or "")[:_EXCERPT_CHARS]
        note = str(slide.get("note") or "")[:_EXCERPT_CHARS]
        blocks.append(f"index: {index}\ntext: {text}\nnote: {note}")
    return "\n\n".join(blocks)


async def select_presenter_slides(
    slides: Sequence[dict[str, str]], *, deck_title: str
) -> list[int]:
    slide_count = len(slides)
    if slide_count <= 2:
        return normalize_presenter_slides([], slide_count)
    try:
        client = get_client(config=get_llm_config())
        model = get_model()
        schema = presenter_slides_schema()
        response = await asyncio.wait_for(
            generate_structured_with_schema_retries(
                client,
                model,
                messages=[
                    SystemMessage(content=SYSTEM_PROMPT),
                    UserMessage(
                        content=USER_PROMPT.format(
                            deck_title=deck_title.strip() or "Untitled Presentation",
                            slides=_slides_prompt(slides),
                        )
                    ),
                ],
                response_format=JSONSchemaResponse(
                    name="response", json_schema=schema, strict=True
                ),
                json_schema=schema,
                strict=False,
                validate_schema=True,
            ),
            timeout=PRESENTER_SELECTION_TIMEOUT_SECONDS,
        )
        picks = normalize_presenter_slides(
            (response or {}).get("indexes") or [], slide_count
        )
        if len(picks) > max(2, math.ceil(slide_count / 2)):
            LOGGER.warning(
                "presenter slide choice picked %d of %d slides; using the fallback",
                len(picks),
                slide_count,
            )
            return fallback_presenter_slides(slide_count)
        return picks
    except Exception:
        LOGGER.warning(
            "presenter slide choice failed; using the fallback", exc_info=True
        )
        return fallback_presenter_slides(slide_count)
