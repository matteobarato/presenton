from datetime import datetime
from typing import Any, List, Optional
import uuid

from pydantic import BaseModel

from models.sql.speaker_note_audio import SpeakerNoteAudioModel


class SpeakerNoteAudioResponse(BaseModel):
    """One slide's narration, as clients see it.

    The filesystem path the file was written to stays server-side; callers play
    the audio through `url`, which is what the app serves and authorizes.
    """

    id: uuid.UUID
    presentation_id: uuid.UUID
    slide_id: uuid.UUID
    slide_index: int
    language: str
    language_name: str
    model: str
    voice: Optional[str] = None
    text: str
    translated: bool
    url: str
    format: str
    size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, audio: SpeakerNoteAudioModel) -> "SpeakerNoteAudioResponse":
        return cls(
            id=audio.id,
            presentation_id=audio.presentation,
            slide_id=audio.slide,
            slide_index=audio.slide_index,
            language=audio.language,
            language_name=audio.language_name,
            model=audio.model,
            voice=audio.voice,
            text=audio.text,
            translated=audio.translated,
            url=audio.url,
            format=audio.format,
            size_bytes=audio.size_bytes,
            duration_seconds=audio.duration_seconds,
            created_at=audio.created_at,
            updated_at=audio.updated_at,
        )


class SpeakerNoteAudiosResponse(BaseModel):
    """A deck's narration in slide order, plus what the last run did."""

    presentation_id: uuid.UUID
    language: str
    language_name: str
    total_duration_seconds: Optional[float] = None
    audios: List[SpeakerNoteAudioResponse]
    generated_slide_indexes: List[int] = []
    reused_slide_indexes: List[int] = []
    skipped: List[dict[str, Any]] = []

    @classmethod
    def from_models(
        cls,
        *,
        presentation_id: uuid.UUID,
        language: str,
        language_name: str,
        audios: List[SpeakerNoteAudioModel],
        generated_slide_indexes: Optional[List[int]] = None,
        reused_slide_indexes: Optional[List[int]] = None,
        skipped: Optional[List[dict[str, Any]]] = None,
    ) -> "SpeakerNoteAudiosResponse":
        durations = [
            audio.duration_seconds
            for audio in audios
            if audio.duration_seconds is not None
        ]
        return cls(
            presentation_id=presentation_id,
            language=language,
            language_name=language_name,
            total_duration_seconds=(
                round(sum(durations), 3) if len(durations) == len(audios) and audios
                else None
            ),
            audios=[SpeakerNoteAudioResponse.from_model(audio) for audio in audios],
            generated_slide_indexes=generated_slide_indexes or [],
            reused_slide_indexes=reused_slide_indexes or [],
            skipped=skipped or [],
        )


class SpeakerNoteAudioRequest(BaseModel):
    """What to narrate, and in which language."""

    language: str
    slide_indexes: Optional[List[int]] = None
    regenerate: bool = False
    voice: Optional[str] = None


class SupportedTTSLanguageResponse(BaseModel):
    code: str
    name: str
