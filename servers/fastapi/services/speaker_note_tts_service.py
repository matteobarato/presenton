"""Narration audio for the speaker notes of a finished presentation.

One audio file per slide, in a language the caller chooses, produced through an
OpenAI-compatible speech endpoint. The text that gets synthesized is stored
alongside the file, because it is not always the slide's note: a deck written in
one language and narrated in another is translated first, since a speech
provider reads whatever characters it is handed and has no language setting of
its own.

Audio is addressed by slide and language, so a deck can carry an Italian and an
English reading at the same time, and re-running the generation only re-reads
the slides whose note, voice or model changed.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import struct
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.tts_languages import TTSLanguage, find_tts_language, resolve_tts_language
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from utils.asset_directory_utils import (
    absolute_fastapi_asset_url,
    get_audio_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.get_env import (
    get_app_data_directory_env,
    get_openai_compat_tts_api_key_env,
    get_openai_compat_tts_base_url_env,
    get_openai_compat_tts_model_env,
    get_openai_compat_tts_voice_env,
)
from utils.llm_calls.translate_speaker_notes import translate_speaker_notes

LOGGER = logging.getLogger(__name__)

SPEAKER_NOTE_TTS_CONCURRENCY = 4
SPEAKER_NOTE_TTS_FORMAT = "mp3"
# The OpenAI speech endpoint rejects input longer than this. Generated notes are
# far shorter, so this only guards hand-edited notes.
SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS = 4000
SPEAKER_NOTE_TTS_DEFAULT_VOICE = "alloy"

MISSING_TTS_CONFIG_MESSAGE = (
    "OPENAI_COMPAT_TTS_BASE_URL, OPENAI_COMPAT_TTS_API_KEY and "
    "OPENAI_COMPAT_TTS_MODEL must be set to generate speaker note audio."
)


class SpeakerNoteTTSConfigurationError(RuntimeError):
    """Raised when the speech provider is not configured."""


@dataclass
class SpeakerNoteTTSConfig:
    base_url: str
    api_key: str
    model: str
    voice: str


@dataclass
class SpeakerNoteAudioGenerationResult:
    language: TTSLanguage
    audios: list[SpeakerNoteAudioModel] = field(default_factory=list)
    generated_slide_indexes: list[int] = field(default_factory=list)
    reused_slide_indexes: list[int] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "language": self.language.code,
            "language_name": self.language.name,
            "generated": len(self.generated_slide_indexes),
            "reused": len(self.reused_slide_indexes),
            "skipped": len(self.skipped),
            "total": len(self.audios),
        }


def get_speaker_note_tts_config(voice: Optional[str] = None) -> SpeakerNoteTTSConfig:
    base_url = (get_openai_compat_tts_base_url_env() or "").strip()
    api_key = (get_openai_compat_tts_api_key_env() or "").strip()
    model = (get_openai_compat_tts_model_env() or "").strip()
    if not base_url or not api_key or not model:
        raise SpeakerNoteTTSConfigurationError(MISSING_TTS_CONFIG_MESSAGE)
    resolved_voice = (
        (voice or "").strip()
        or (get_openai_compat_tts_voice_env() or "").strip()
        or SPEAKER_NOTE_TTS_DEFAULT_VOICE
    )
    return SpeakerNoteTTSConfig(
        base_url=base_url, api_key=api_key, model=model, voice=resolved_voice
    )


def note_digest(note: str) -> str:
    return hashlib.sha256(" ".join(str(note or "").split()).encode("utf-8")).hexdigest()


def clip_tts_input(text: str) -> str:
    """Keep synthesis input inside the provider's limit, on a sentence boundary."""
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS:
        return normalized
    clipped = normalized[:SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS]
    boundary = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"))
    if boundary > 0:
        return clipped[: boundary + 1]
    return clipped.rsplit(" ", 1)[0] if " " in clipped else clipped


async def synthesize_speech(
    text: str,
    *,
    config: SpeakerNoteTTSConfig,
) -> bytes:
    """Read one piece of text aloud through the configured provider."""
    client = AsyncOpenAI(base_url=config.base_url, api_key=config.api_key)
    response = await client.audio.speech.create(
        model=config.model,
        voice=config.voice,
        input=clip_tts_input(text),
        response_format=SPEAKER_NOTE_TTS_FORMAT,
    )
    audio = response.content
    if not audio:
        raise RuntimeError("Speech provider returned no audio for a speaker note")
    return audio


_MPEG_BITRATES_V1_L3 = (
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
)
_MPEG_BITRATES_V2_L3 = (
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
)
_MPEG_SAMPLE_RATES = {
    3: (44100, 48000, 32000),  # MPEG 1
    2: (22050, 24000, 16000),  # MPEG 2
    0: (11025, 12000, 8000),   # MPEG 2.5
}


def mp3_duration_seconds(audio: bytes) -> Optional[float]:
    """Length of an MP3 stream, summed frame by frame.

    Best effort and dependency free: anything unexpected in the byte stream
    returns None rather than a wrong number, since the duration is a convenience
    for players and callers, never something the audio itself depends on.
    """
    offset = 0
    size = len(audio)

    # Skip an ID3v2 tag, whose size is stored as four 7-bit big-endian bytes.
    if size >= 10 and audio[:3] == b"ID3":
        tag_size = 0
        for byte in audio[6:10]:
            if byte & 0x80:
                return None
            tag_size = (tag_size << 7) | byte
        offset = 10 + tag_size

    duration = 0.0
    frames = 0
    while offset + 4 <= size:
        header = struct.unpack(">I", audio[offset : offset + 4])[0]
        if (header & 0xFFE00000) != 0xFFE00000:
            # Trailing metadata (ID3v1, padding) after at least one frame is fine.
            if frames:
                break
            return None
        version_bits = (header >> 19) & 0b11
        layer_bits = (header >> 17) & 0b11
        bitrate_index = (header >> 12) & 0b1111
        sample_rate_index = (header >> 10) & 0b11
        padding = (header >> 9) & 0b1
        if layer_bits != 0b01 or version_bits == 0b01 or sample_rate_index == 0b11:
            return None
        if bitrate_index in (0, 0b1111):
            return None
        bitrates = (
            _MPEG_BITRATES_V1_L3 if version_bits == 0b11 else _MPEG_BITRATES_V2_L3
        )
        bitrate = bitrates[bitrate_index] * 1000
        sample_rate = _MPEG_SAMPLE_RATES[version_bits][sample_rate_index]
        if not bitrate or not sample_rate:
            return None
        samples_per_frame = 1152 if version_bits == 0b11 else 576
        frame_length = int(
            (samples_per_frame // 8) * bitrate / sample_rate
        ) + padding
        if frame_length <= 4:
            return None
        duration += samples_per_frame / sample_rate
        frames += 1
        offset += frame_length

    return round(duration, 3) if frames else None


def _audio_url_for_path(path: str) -> str:
    """Browser-facing URL for a file written under APP_DATA_DIRECTORY/audio."""
    app_data = get_app_data_directory_env()
    if not app_data:
        return path
    try:
        relative = os.path.relpath(
            os.path.realpath(path), os.path.realpath(app_data)
        )
    except (OSError, ValueError):
        return path
    if relative.startswith(".."):
        return path
    return absolute_fastapi_asset_url("/app_data/" + relative.replace(os.sep, "/"))


def _remove_audio_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        LOGGER.warning("Could not remove speaker note audio %s: %s", path, exc)


def _slide_title(slide: SlideModel) -> str:
    content = slide.content or {}
    title = content.get("title") if isinstance(content, dict) else None
    return title.strip() if isinstance(title, str) and title.strip() else ""


def _is_fresh(
    audio: SpeakerNoteAudioModel,
    *,
    digest: str,
    config: SpeakerNoteTTSConfig,
) -> bool:
    return (
        audio.source_note_hash == digest
        and audio.model == config.model
        and (audio.voice or "") == config.voice
        and bool(audio.path)
        and os.path.isfile(audio.path)
    )


async def _load_existing_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language_code: Optional[str] = None,
) -> list[SpeakerNoteAudioModel]:
    statement = select(SpeakerNoteAudioModel).where(
        SpeakerNoteAudioModel.presentation == presentation_id
    )
    if language_code is not None:
        statement = statement.where(SpeakerNoteAudioModel.language == language_code)
    return list(
        await sql_session.scalars(
            statement.order_by(SpeakerNoteAudioModel.slide_index)
        )
    )


async def list_speaker_note_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> list[SpeakerNoteAudioModel]:
    """Every stored reading of a deck, in slide order."""
    language_code = resolve_tts_language(language).code if language else None
    return await _load_existing_audios(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )


async def delete_speaker_note_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> int:
    """Drop stored readings and the files behind them."""
    language_code = resolve_tts_language(language).code if language else None
    audios = await _load_existing_audios(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )
    paths = [audio.path for audio in audios]
    for audio in audios:
        await sql_session.delete(audio)
    if audios:
        await sql_session.commit()
    remove_speaker_note_audio_files(presentation_id, paths)
    return len(audios)


async def speaker_note_audio_paths(
    sql_session: AsyncSession, *, presentation_id: uuid.UUID
) -> list[str]:
    """Files holding a deck's narration, for a caller about to delete the deck.

    Collected before the rows go, because deleting a presentation drops them
    through the database's cascade and the files on disk would otherwise be
    left behind with nothing pointing at them.
    """
    audios = await _load_existing_audios(
        sql_session, presentation_id=presentation_id
    )
    return [audio.path for audio in audios if audio.path]


def remove_speaker_note_audio_files(
    presentation_id: uuid.UUID, paths: Sequence[str]
) -> None:
    """Delete narration files, and the deck's audio folder once it is empty."""
    directories: set[str] = set()
    for path in paths:
        if not path:
            continue
        directories.add(os.path.dirname(path))
        _remove_audio_file(path)
    for directory in directories:
        if os.path.basename(directory) != str(presentation_id):
            continue
        try:
            os.rmdir(directory)
        except OSError:
            # Not empty, already gone, or not ours to remove: the files that
            # mattered are the audio itself, which is already deleted.
            continue


def _needs_translation(
    presentation: PresentationModel, language: TTSLanguage
) -> bool:
    """Whether a deck's notes have to be translated before they are read aloud.

    A deck records its language as free text, so when it cannot be resolved the
    notes are translated anyway: an unnecessary translation of text already in
    the target language is a no-op the prompt handles, while skipping a needed
    one produces audio in the wrong language.
    """
    source = find_tts_language(presentation.language)
    return source is None or source.code != language.code


async def generate_speaker_note_audios(
    *,
    presentation: PresentationModel,
    slides: Sequence[SlideModel],
    language: str,
    sql_session: AsyncSession,
    slide_indexes: Optional[Sequence[int]] = None,
    regenerate: bool = False,
    voice: Optional[str] = None,
    concurrency: int = SPEAKER_NOTE_TTS_CONCURRENCY,
    on_progress: Optional[Any] = None,
) -> SpeakerNoteAudioGenerationResult:
    """Narrate the speaker notes of a deck, one audio file per slide.

    Slides whose audio is already current are left alone, so this can be called
    again after editing a few notes without paying to re-read the whole deck.
    `regenerate` forces every requested slide to be read again.
    """
    target_language = resolve_tts_language(language)
    config = get_speaker_note_tts_config(voice)

    ordered_slides = list(slides)
    requested = (
        None if slide_indexes is None else {int(index) for index in slide_indexes}
    )
    existing = {
        audio.slide: audio
        for audio in await _load_existing_audios(
            sql_session,
            presentation_id=presentation.id,
            language_code=target_language.code,
        )
    }

    result = SpeakerNoteAudioGenerationResult(language=target_language)
    pending: list[int] = []

    for position, slide in enumerate(ordered_slides):
        if requested is not None and slide.index not in requested:
            continue
        note = (slide.speaker_note or "").strip()
        if not note:
            result.skipped.append(
                {
                    "slide_index": slide.index,
                    "reason": "This slide has no speaker note to read aloud",
                }
            )
            continue
        current = existing.get(slide.id)
        if (
            not regenerate
            and current is not None
            and _is_fresh(current, digest=note_digest(note), config=config)
        ):
            result.reused_slide_indexes.append(slide.index)
            continue
        pending.append(position)

    texts: dict[int, str] = {
        position: (ordered_slides[position].speaker_note or "").strip()
        for position in pending
    }
    translated_positions: set[int] = set()

    if pending and _needs_translation(presentation, target_language):
        translations = await translate_speaker_notes(
            notes=dict(texts),
            target_language=target_language.name,
            deck_title=presentation.title or "",
            slide_titles={
                position: _slide_title(ordered_slides[position])
                for position in pending
            },
        )
        for position in list(pending):
            translation = translations.get(position)
            if translation:
                texts[position] = translation
                translated_positions.add(position)
                continue
            # Reading an untranslated note with the requested language's voice
            # would produce audio in the wrong language, so the slide is left
            # without audio instead.
            pending.remove(position)
            result.skipped.append(
                {
                    "slide_index": ordered_slides[position].index,
                    "reason": (
                        "Could not translate this slide's speaker note into "
                        f"{target_language.name}"
                    ),
                }
            )

    semaphore = asyncio.Semaphore(max(1, concurrency))
    completed = 0

    async def synthesize(position: int) -> bytes:
        async with semaphore:
            return await synthesize_speech(texts[position], config=config)

    if pending:
        results = await asyncio.gather(
            *(synthesize(position) for position in pending),
            return_exceptions=True,
        )
        output_directory = os.path.join(get_audio_directory(), str(presentation.id))
        os.makedirs(output_directory, exist_ok=True)

        for position, audio_bytes in zip(pending, results):
            slide = ordered_slides[position]
            if isinstance(audio_bytes, BaseException):
                if isinstance(audio_bytes, asyncio.CancelledError):
                    raise audio_bytes
                LOGGER.exception(
                    "[speaker-notes.tts] synthesis failed slide=%s", slide.id,
                    exc_info=audio_bytes,
                )
                result.skipped.append(
                    {
                        "slide_index": slide.index,
                        "reason": "The speech provider could not read this slide",
                    }
                )
                continue

            filename = f"{slide.id}-{target_language.code}-{uuid.uuid4().hex}.{SPEAKER_NOTE_TTS_FORMAT}"
            path = os.path.join(output_directory, filename)
            with open(path, "wb") as audio_file:
                audio_file.write(audio_bytes)

            record = existing.get(slide.id)
            previous_path = record.path if record else None
            if record is None:
                record = SpeakerNoteAudioModel(
                    presentation=presentation.id,
                    slide=slide.id,
                    slide_index=slide.index,
                    language=target_language.code,
                    language_name=target_language.name,
                    model=config.model,
                    voice=config.voice,
                    text=texts[position],
                    translated=position in translated_positions,
                    source_note_hash=note_digest(slide.speaker_note or ""),
                    path=path,
                    url=_audio_url_for_path(path),
                    format=SPEAKER_NOTE_TTS_FORMAT,
                    size_bytes=len(audio_bytes),
                    duration_seconds=mp3_duration_seconds(audio_bytes),
                )
                existing[slide.id] = record
            else:
                record.slide_index = slide.index
                record.language_name = target_language.name
                record.model = config.model
                record.voice = config.voice
                record.text = texts[position]
                record.translated = position in translated_positions
                record.source_note_hash = note_digest(slide.speaker_note or "")
                record.path = path
                record.url = _audio_url_for_path(path)
                record.format = SPEAKER_NOTE_TTS_FORMAT
                record.size_bytes = len(audio_bytes)
                record.duration_seconds = mp3_duration_seconds(audio_bytes)
                record.updated_at = get_current_utc_datetime()
            sql_session.add(record)
            # The previous file is replaced rather than overwritten so a client
            # that cached the old URL never plays stale narration.
            if previous_path and previous_path != path:
                _remove_audio_file(previous_path)

            result.generated_slide_indexes.append(slide.index)
            completed += 1
            if on_progress is not None:
                await on_progress(completed, len(pending))

        await sql_session.commit()

    result.audios = await _load_existing_audios(
        sql_session,
        presentation_id=presentation.id,
        language_code=target_language.code,
    )
    result.generated_slide_indexes.sort()
    result.reused_slide_indexes.sort()
    result.skipped.sort(key=lambda entry: entry["slide_index"])
    return result
