"""Translation of speaker notes into the language they will be read aloud in.

Text-to-speech has no language setting: the provider reads the characters it is
given. So a deck written in English cannot be narrated in Italian by picking an
Italian voice - the note itself has to be Italian first. This module produces
that text, and the result is what gets synthesized and stored, so a caller can
always see exactly which words were spoken.

The note is spoken, not printed, which the prompt leans on: numbers and
abbreviations are rendered the way the target language says them out loud
rather than transliterated.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional, Sequence

from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage

from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import generate_structured_with_schema_retries

TRANSLATE_NOTE_CONCURRENCY = 4
TRANSLATE_NOTE_MAX_CHARACTERS = 1200

TRANSLATE_NOTE_SYSTEM_PROMPT = (
    "You translate the spoken script a presenter delivers over a slide. The "
    "text is read aloud, so translate it as speech: keep the speaker's voice "
    "and register, keep sentences at a length a person can say in one breath, "
    "and render numbers, dates, currencies, units and abbreviations the way "
    "they are spoken in the target language. "
    "Rules: translate everything, add nothing, drop nothing, and never answer "
    "or comment on the content. Keep product names, company names, people's "
    "names and established technical terms in their original form unless the "
    "target language has a standard equivalent. Return plain text only: no "
    "markdown, no bullet markers, no emojis, no quotation marks around the "
    "whole note, no speaker labels, no stage directions. If the note is "
    "already written in the target language, return it unchanged."
)

TRANSLATE_NOTE_USER_PROMPT = """# Deck Title:
{deck_title}

# Slide Title:
{slide_title}

# Target Language:
{target_language}

# Speaker Note: START
{note}
# Speaker Note: END

Translate the speaker note above into {target_language}.
"""


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "translated_note": {
                "type": "string",
                "minLength": 1,
                "maxLength": TRANSLATE_NOTE_MAX_CHARACTERS,
                "description": "The speaker note in the target language",
            }
        },
        "required": ["translated_note"],
        "additionalProperties": False,
    }


def get_translate_speaker_note_messages(
    *,
    note: str,
    target_language: str,
    deck_title: str = "",
    slide_title: str = "",
) -> list[Message]:
    return [
        SystemMessage(content=TRANSLATE_NOTE_SYSTEM_PROMPT),
        UserMessage(
            content=TRANSLATE_NOTE_USER_PROMPT.format(
                deck_title=deck_title.strip() or "Untitled Presentation",
                slide_title=slide_title.strip() or "Untitled slide",
                target_language=target_language,
                note=note.strip(),
            )
        ),
    ]


async def translate_speaker_note(
    *,
    note: str,
    target_language: str,
    deck_title: str = "",
    slide_title: str = "",
) -> str:
    """Translate one speaker note into the language it will be narrated in."""
    text = " ".join(str(note or "").split())
    if not text:
        return ""

    client = get_client(config=get_llm_config())
    model = get_model()
    response_schema = _response_schema()
    try:
        response = await generate_structured_with_schema_retries(
            client,
            model,
            messages=get_translate_speaker_note_messages(
                note=text,
                target_language=target_language,
                deck_title=deck_title,
                slide_title=slide_title,
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
    return " ".join(str((response or {}).get("translated_note") or "").split())


async def translate_speaker_notes(
    *,
    notes: dict[int, str],
    target_language: str,
    deck_title: str = "",
    slide_titles: Optional[dict[int, str]] = None,
    concurrency: int = TRANSLATE_NOTE_CONCURRENCY,
) -> dict[int, str]:
    """Translate several speaker notes, keyed by the slide position they belong to.

    A note whose translation fails is left out of the result rather than
    failing the batch: the caller decides what that means for its own slide,
    and for narration it means that slide keeps no audio instead of getting
    audio in the wrong language.
    """
    pending: Sequence[int] = [
        index for index in sorted(notes) if str(notes[index] or "").strip()
    ]
    if not pending:
        return {}

    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def translate(index: int) -> str:
        async with semaphore:
            return await translate_speaker_note(
                note=notes[index],
                target_language=target_language,
                deck_title=deck_title,
                slide_title=(slide_titles or {}).get(index, ""),
            )

    results = await asyncio.gather(
        *(translate(index) for index in pending), return_exceptions=True
    )
    translated: dict[int, str] = {}
    for index, result in zip(pending, results):
        if isinstance(result, BaseException):
            if isinstance(result, asyncio.CancelledError):
                raise result
            continue
        if result:
            translated[index] = result
    return translated
