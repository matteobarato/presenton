"""Speaker note generation for Smart (direct HTML) presentations.

Smart slides are streamed as raw HTML, so notes cannot be produced inside the
deck response without risking drift between a slide and its note whenever a
continuation or retry rewrites that slide. Notes are therefore generated after
the deck is consolidated, from the final slide HTML that was persisted.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Sequence

from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage

from utils.llm_calls.generate_smart_presentation import extract_smart_slide_text
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import generate_structured_with_schema_retries

SMART_SPEAKER_NOTE_MIN_CHARACTERS = 100
SMART_SPEAKER_NOTE_MAX_CHARACTERS = 500
SMART_SPEAKER_NOTE_CONCURRENCY = 4
SMART_SPEAKER_NOTE_MAX_SLIDE_CHARACTERS = 4000

SMART_SPEAKER_NOTE_SYSTEM_PROMPT = (
    "You write speaker notes for presentation slides. You are given the text "
    "that is already visible on a finished slide plus the surrounding deck "
    "outline. Write what the presenter says while that slide is on screen: the "
    "framing, the reasoning behind the numbers, and the transition into the "
    "next slide. Never restate the slide verbatim, never describe the layout or "
    "styling, and never invent facts, figures, or citations that are not "
    "supported by the slide or the deck outline. Speaker notes are plain text: "
    "no markdown, no bullet markers, no emojis, no headings."
)

SMART_SPEAKER_NOTE_USER_PROMPT = """# Deck Title:
{deck_title}

# Deck Outline:
{deck_outline}

# Current Slide:
Position: {slide_position} of {slide_count}
Type: {slide_type}
Title: {slide_title}

# Slide Text: START
{slide_text}
# Slide Text: END

# Language:
{language}

{additional_instructions}
Write one speaker note for the current slide, between {min_characters} and
{max_characters} characters, in the language above.
"""


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "speaker_note": {
                "type": "string",
                "minLength": SMART_SPEAKER_NOTE_MIN_CHARACTERS,
                "maxLength": SMART_SPEAKER_NOTE_MAX_CHARACTERS,
                "description": "Speaker note for the slide",
            }
        },
        "required": ["speaker_note"],
        "additionalProperties": False,
    }


def _deck_outline(slides: Sequence[dict[str, Any]]) -> str:
    return "\n".join(
        f"- Slide {index + 1}: type={slide.get('slide_type') or 'content'}; "
        f"title={str(slide.get('title') or '').strip() or f'Slide {index + 1}'}"
        for index, slide in enumerate(slides)
    )


def _additional_instructions(
    tone: Optional[str], verbosity: Optional[str], instructions: Optional[str]
) -> str:
    parts = [
        part
        for part in (
            f"# User Instructions:\n{instructions.strip()}"
            if instructions and instructions.strip()
            else "",
            f"# Tone:\n{tone.strip()}" if tone and tone.strip() else "",
            f"# Verbosity:\n{verbosity.strip()}"
            if verbosity and verbosity.strip()
            else "",
        )
        if part
    ]
    return "\n\n".join(parts) + "\n\n" if parts else ""


def _slide_text(slide: dict[str, Any]) -> str:
    text = str(slide.get("text") or "").strip()
    if not text:
        text = extract_smart_slide_text(slide.get("html") or "")
    if len(text) > SMART_SPEAKER_NOTE_MAX_SLIDE_CHARACTERS:
        text = text[:SMART_SPEAKER_NOTE_MAX_SLIDE_CHARACTERS]
    return text


def get_speaker_note_messages(
    *,
    slides: Sequence[dict[str, Any]],
    index: int,
    deck_title: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
) -> list[Message]:
    slide = slides[index]
    return [
        SystemMessage(content=SMART_SPEAKER_NOTE_SYSTEM_PROMPT),
        UserMessage(
            content=SMART_SPEAKER_NOTE_USER_PROMPT.format(
                deck_title=deck_title.strip() or "Untitled Presentation",
                deck_outline=_deck_outline(slides),
                slide_position=index + 1,
                slide_count=len(slides),
                slide_type=str(slide.get("slide_type") or "content"),
                slide_title=str(slide.get("title") or "").strip()
                or f"Slide {index + 1}",
                slide_text=_slide_text(slide) or "This slide has no visible text.",
                language=language or "auto-detect from the slide text",
                additional_instructions=_additional_instructions(
                    tone, verbosity, instructions
                ),
                min_characters=SMART_SPEAKER_NOTE_MIN_CHARACTERS,
                max_characters=SMART_SPEAKER_NOTE_MAX_CHARACTERS,
            )
        ),
    ]


def _normalize_note(value: Any) -> str:
    note = " ".join(str(value or "").split())
    if len(note) <= SMART_SPEAKER_NOTE_MAX_CHARACTERS:
        return note
    clipped = note[:SMART_SPEAKER_NOTE_MAX_CHARACTERS]
    boundary = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"))
    if boundary >= SMART_SPEAKER_NOTE_MIN_CHARACTERS:
        return clipped[: boundary + 1]
    return clipped.rsplit(" ", 1)[0].rstrip(",;:-") if " " in clipped else clipped


async def generate_smart_speaker_note(
    *,
    slides: Sequence[dict[str, Any]],
    index: int,
    deck_title: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
) -> str:
    """Generate one speaker note from a consolidated Smart slide."""
    client = get_client(config=get_llm_config())
    model = get_model()
    response_schema = _response_schema()
    try:
        response = await generate_structured_with_schema_retries(
            client,
            model,
            messages=get_speaker_note_messages(
                slides=slides,
                index=index,
                deck_title=deck_title,
                language=language,
                tone=tone,
                verbosity=verbosity,
                instructions=instructions,
            ),
            response_format=JSONSchemaResponse(
                name="response",
                json_schema=response_schema,
                strict=True,
            ),
            json_schema=response_schema,
            strict=False,
            validate_schema=True,
        )
    except Exception as e:
        raise handle_llm_client_exceptions(e)
    return _normalize_note((response or {}).get("speaker_note"))


async def generate_smart_speaker_notes(
    *,
    slides: Sequence[dict[str, Any]],
    deck_title: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    indexes: Optional[Sequence[int]] = None,
    concurrency: int = SMART_SPEAKER_NOTE_CONCURRENCY,
) -> dict[int, str]:
    """Generate speaker notes for the requested slides.

    Speaker notes are supplementary, so a slide whose note fails to generate is
    omitted from the result instead of failing the whole deck.
    """
    targets = list(indexes) if indexes is not None else list(range(len(slides)))
    targets = [index for index in targets if 0 <= index < len(slides)]
    if not targets:
        return {}
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def generate(index: int) -> str:
        async with semaphore:
            return await generate_smart_speaker_note(
                slides=slides,
                index=index,
                deck_title=deck_title,
                language=language,
                tone=tone,
                verbosity=verbosity,
                instructions=instructions,
            )

    results = await asyncio.gather(
        *(generate(index) for index in targets), return_exceptions=True
    )
    notes: dict[int, str] = {}
    for index, result in zip(targets, results):
        if isinstance(result, BaseException):
            if isinstance(result, asyncio.CancelledError):
                raise result
            continue
        if result:
            notes[index] = result
    return notes
