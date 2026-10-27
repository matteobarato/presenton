from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, UniqueConstraint
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime
from api.v1.auth.context import get_current_owner_id


class PresentationVideoModel(SQLModel, table=True):
    """One rendered, narrated video of a deck, for one language and one preset.

    Kept beside the presentation rather than on `PresentationModel` so a deck
    can hold more than one rendered video - one per language, and one per
    render preset (resolution, fps, subtitle mode) within a language - without
    the presentation row growing a column per render. Both foreign keys
    cascade, which is what keeps the video rows of a deleted deck from
    outliving it.

    `source_hash` is a freshness key, not a content hash: it is a sha256 over
    the ordered slide ids and indexes, each slide's `source_note_hash` from
    `speaker_note_audios`, each of those audio rows' `updated_at`, and the
    render parameters that produced this row. It is computed by the rendering
    service (a later step), not here - this model only stores it. A stale hash
    is what tells the service a note was edited or re-narrated after this
    video was rendered, so the video needs to be rebuilt rather than reused.
    """

    __tablename__ = "presentation_videos"
    __table_args__ = (
        UniqueConstraint(
            "presentation",
            "language",
            "preset",
            name="uq_presentation_video_presentation_language_preset",
        ),
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
    language: str
    language_name: str
    # Short deterministic slug for the render parameters that distinguish two
    # videos of the same deck in the same language, e.g. "1080p-30-soft".
    preset: str
    path: str
    url: str
    # One of "soft" (sidecar WebVTT track), "burned" (subtitles baked into the
    # video frames), or "none".
    subtitles_mode: str
    subtitle_path: Optional[str] = None
    subtitle_url: Optional[str] = None
    resolution: str
    width: int
    height: int
    fps: int
    slide_count: int
    duration_seconds: Optional[float] = Field(
        sa_column=Column(Float, nullable=True), default=None
    )
    size_bytes: Optional[int] = None
    source_hash: str
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
