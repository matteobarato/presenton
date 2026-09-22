"""Speaker note generation for finished presentations.

Notes are written after a deck is complete and persisted, never while it is
still being generated: a Smart continuation or a template retry can rewrite a
slide after the fact, and a note produced inline would then describe content
that no longer exists. Writing them at the end also lets every note be written
against the whole deck, which is what keeps a narrated deck from repeating
itself. Both generation modes go through this module, so Smart HTML slides and
template slides produce notes of the same shape.
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

SPEAKER_NOTE_MIN_CHARACTERS = 100
SPEAKER_NOTE_MAX_CHARACTERS = 500
SPEAKER_NOTE_CONCURRENCY = 4
SPEAKER_NOTE_MAX_SLIDE_CHARACTERS = 4000
# Every note is written against the whole deck, so the other slides are
# summarized to keep the prompt affordable for long presentations.
SPEAKER_NOTE_MAX_CONTEXT_SLIDE_CHARACTERS = 700
SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS = 14000
# Notes are read aloud in sequence, so each call sees the notes already written
# for the slides before it and avoids repeating them.
SPEAKER_NOTE_PRECEDING_NOTES = 3

SPEAKER_NOTE_SYSTEM_PROMPT = (
    "You write the spoken script a presenter delivers over a slide. You are "
    "given the full deck, the notes already written for the slides before this "
    "one, and the text of the slide currently on screen. Write only what is "
    "said while that slide is up: the framing, the reasoning behind the "
    "numbers, and the handover into the next slide. "
    "Rules: cover this slide only, and use the rest of the deck for continuity "
    "and terminology rather than as material to cover early; never repeat a "
    "point an earlier note already made; never read the slide out verbatim; "
    "never describe the layout, styling, colors, or charts as objects; never "
    "invent facts, figures, names, or citations that the deck does not "
    "support. The note is spoken aloud, so write connected sentences a person "
    "can read at natural pace: plain text only, no markdown, no bullet "
    "markers, no emojis, no headings, no stage directions, no speaker labels."
)

SPEAKER_NOTE_USER_PROMPT = """# Deck Title:
{deck_title}

# Full Deck: START
{deck_context}
# Full Deck: END

{preceding_notes}# Current Slide:
Position: {slide_position} of {slide_count}
Type: {slide_type}
Title: {slide_title}

# Slide Text: START
{slide_text}
# Slide Text: END

# Language:
{language}

{additional_instructions}
Write the spoken note for slide {slide_position} only, between
{min_characters} and {max_characters} characters, in the language above.
"""


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "speaker_note": {
                "type": "string",
                "minLength": SPEAKER_NOTE_MIN_CHARACTERS,
                "maxLength": SPEAKER_NOTE_MAX_CHARACTERS,
                "description": "Speaker note for the slide",
            }
        },
        "required": ["speaker_note"],
        "additionalProperties": False,
    }


def _slide_title(slides: Sequence[dict[str, Any]], index: int) -> str:
    title = str(slides[index].get("title") or "").strip()
    return title or f"Slide {index + 1}"


def _deck_context(slides: Sequence[dict[str, Any]], current_index: int) -> str:
    """Summarize the whole deck so a note can be written in its context."""
    budget = SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS
    lines: list[str] = []
    for index in range(len(slides)):
        header = (
            f"Slide {index + 1} "
            f"(type={slides[index].get('slide_type') or 'content'}): "
            f"{_slide_title(slides, index)}"
        )
        if index == current_index:
            lines.append(f"{header} <- the slide you are writing for")
            continue
        text = _slide_text(slides[index], SPEAKER_NOTE_MAX_CONTEXT_SLIDE_CHARACTERS)
        entry = f"{header}\n  {text}" if text else header
        if len(entry) > budget:
            entry = header
        budget -= len(entry)
        lines.append(entry)
        if budget <= 0:
            break
    return "\n".join(lines)


def _preceding_notes(
    slides: Sequence[dict[str, Any]],
    current_index: int,
    notes: Optional[dict[int, str]],
) -> str:
    """Render the notes already written for earlier slides, most recent last."""
    if not notes:
        return ""
    earlier = [
        index
        for index in sorted(notes)
        if index < current_index and str(notes[index] or "").strip()
    ][-SPEAKER_NOTE_PRECEDING_NOTES:]
    if not earlier:
        return ""
    rendered = "\n".join(
        f"Slide {index + 1} ({_slide_title(slides, index)}): {notes[index].strip()}"
        for index in earlier
    )
    return f"# Notes Already Spoken: START\n{rendered}\n# Notes Already Spoken: END\n\n"


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


# Content keys that hold assets or runtime data rather than audience copy.
SPEAKER_NOTE_SKIPPED_CONTENT_KEYS = {
    "__image_url__",
    "__icon_url__",
    "__image_prompt__",
    "__icon_query__",
    "__speaker_note__",
}


def extract_slide_content_text(content: Any) -> str:
    """Flatten a template slide's structured content into its visible copy."""
    parts: list[str] = []

    def walk(value: Any, key: Optional[str] = None) -> None:
        if key in SPEAKER_NOTE_SKIPPED_CONTENT_KEYS:
            return
        if isinstance(value, dict):
            for child_key, child in value.items():
                walk(child, str(child_key))
            return
        if isinstance(value, (list, tuple)):
            for child in value:
                walk(child, key)
            return
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            parts.append(str(value))
            return
        text = str(value).strip()
        if not text or text.startswith(("http://", "https://", "/static/", "data:")):
            return
        parts.append(text)

    walk(content)
    return " ".join(" ".join(parts).split())


def _slide_text(
    slide: dict[str, Any],
    max_characters: int = SPEAKER_NOTE_MAX_SLIDE_CHARACTERS,
) -> str:
    text = str(slide.get("text") or "").strip()
    if not text:
        html = slide.get("html")
        text = (
            extract_smart_slide_text(html)
            if html
            else extract_slide_content_text(slide.get("content"))
        )
    if len(text) > max_characters:
        text = text[:max_characters].rsplit(" ", 1)[0]
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
    preceding_notes: Optional[dict[int, str]] = None,
) -> list[Message]:
    slide = slides[index]
    return [
        SystemMessage(content=SPEAKER_NOTE_SYSTEM_PROMPT),
        UserMessage(
            content=SPEAKER_NOTE_USER_PROMPT.format(
                deck_title=deck_title.strip() or "Untitled Presentation",
                deck_context=_deck_context(slides, index),
                preceding_notes=_preceding_notes(slides, index, preceding_notes),
                slide_position=index + 1,
                slide_count=len(slides),
                slide_type=str(slide.get("slide_type") or "content"),
                slide_title=_slide_title(slides, index),
                slide_text=_slide_text(slide) or "This slide has no visible text.",
                language=language or "auto-detect from the slide text",
                additional_instructions=_additional_instructions(
                    tone, verbosity, instructions
                ),
                min_characters=SPEAKER_NOTE_MIN_CHARACTERS,
                max_characters=SPEAKER_NOTE_MAX_CHARACTERS,
            )
        ),
    ]


def _normalize_note(value: Any) -> str:
    note = " ".join(str(value or "").split())
    if len(note) <= SPEAKER_NOTE_MAX_CHARACTERS:
        return note
    clipped = note[:SPEAKER_NOTE_MAX_CHARACTERS]
    boundary = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"))
    if boundary >= SPEAKER_NOTE_MIN_CHARACTERS:
        return clipped[: boundary + 1]
    return clipped.rsplit(" ", 1)[0].rstrip(",;:-") if " " in clipped else clipped


async def generate_speaker_note(
    *,
    slides: Sequence[dict[str, Any]],
    index: int,
    deck_title: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    preceding_notes: Optional[dict[int, str]] = None,
) -> str:
    """Generate one speaker note from a consolidated deck."""
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
                preceding_notes=preceding_notes,
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


async def generate_speaker_notes(
    *,
    slides: Sequence[dict[str, Any]],
    deck_title: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    indexes: Optional[Sequence[int]] = None,
    known_notes: Optional[dict[int, str]] = None,
    concurrency: int = SPEAKER_NOTE_CONCURRENCY,
) -> dict[int, str]:
    """Generate speaker notes for the requested slides of a finished deck.

    Slides are processed in deck order, in batches, so every note is written
    with the notes of the preceding slides in hand and the narration does not
    repeat itself. `known_notes` carries the notes a slide already had, which
    keeps a partially generated deck continuous when it is backfilled.

    Speaker notes are supplementary, so a slide whose note fails to generate is
    omitted from the result instead of failing the whole deck.
    """
    targets = sorted(
        {
            index
            for index in (
                indexes if indexes is not None else range(len(slides))
            )
            if 0 <= index < len(slides)
        }
    )
    if not targets:
        return {}
    batch_size = max(1, concurrency)
    context_notes: dict[int, str] = {
        index: str(note).strip()
        for index, note in (known_notes or {}).items()
        if str(note or "").strip()
    }
    notes: dict[int, str] = {}

    for start in range(0, len(targets), batch_size):
        batch = targets[start : start + batch_size]
        results = await asyncio.gather(
            *(
                generate_speaker_note(
                    slides=slides,
                    index=index,
                    deck_title=deck_title,
                    language=language,
                    tone=tone,
                    verbosity=verbosity,
                    instructions=instructions,
                    preceding_notes=dict(context_notes),
                )
                for index in batch
            ),
            return_exceptions=True,
        )
        for index, result in zip(batch, results):
            if isinstance(result, BaseException):
                if isinstance(result, asyncio.CancelledError):
                    raise result
                continue
            if result:
                notes[index] = result
                context_notes[index] = result
    return notes
