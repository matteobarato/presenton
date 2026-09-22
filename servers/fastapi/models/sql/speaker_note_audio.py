from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, UniqueConstraint
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime
from api.v1.auth.context import get_current_owner_id


class SpeakerNoteAudioModel(SQLModel, table=True):
    """One synthesized reading of one slide's speaker note.

    Kept beside the presentation rather than on `SlideModel` so a deck can hold
    a reading per language, and so slide payloads - which travel through every
    editor and export path - do not grow an audio field that most callers never
    read. Both foreign keys cascade, which is what keeps the audio rows of a
    deleted deck or slide from outliving it.
    """

    __tablename__ = "speaker_note_audios"
    __table_args__ = (
        UniqueConstraint("slide", "language", name="uq_speaker_note_audio_slide_language"),
    )

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    owner_id: Optional[uuid.UUID] = Field(
        default_factory=get_current_owner_id,
        exclude=True,
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True
        ),
    )
    presentation: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("presentations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    slide: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("slides.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    slide_index: int
    language: str
    language_name: str
    model: str
    voice: Optional[str] = None
    # The text actually read aloud: the slide's note, or its translation when
    # the requested language is not the language the note was written in.
    text: str
    translated: bool = Field(default=False)
    # Digest of the note this audio was produced from. A note edited afterwards
    # leaves the audio stale, which is what lets a refresh find the slides that
    # need re-synthesis without re-reading the whole deck.
    source_note_hash: str
    path: str
    url: str
    format: str = Field(default="mp3")
    size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = Field(
        sa_column=Column(Float, nullable=True), default=None
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=get_current_utc_datetime,
            onupdate=get_current_utc_datetime,
        ),
    )
