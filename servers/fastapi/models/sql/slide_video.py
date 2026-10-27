from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, UniqueConstraint
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime
from api.v1.auth.context import get_current_owner_id


class SlideVideoModel(SQLModel, table=True):
    """An uploaded avatar video for one slide.

    Videos are made offline from a slide's narration and are optional: most
    slides have none. One video per slide, so the slide foreign key is unique.
    The slide's position is not stored - it is read from the slide itself, so
    reordering a deck cannot leave it stale. Both foreign keys cascade, which
    keeps the rows of a deleted deck or slide from outliving it.
    """

    __tablename__ = "slide_videos"
    __table_args__ = (UniqueConstraint("slide", name="uq_slide_video_slide"),)

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
    # Digest of the speaker note at upload time. The avatar says what the note
    # said then, so a note edited afterwards marks the video stale.
    source_note_hash: str
    original_filename: Optional[str] = None
    path: str
    url: str
    format: str
    mime_type: str
    size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = Field(
        sa_column=Column(Float, nullable=True), default=None
    )
    width: Optional[int] = None
    height: Optional[int] = None
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
