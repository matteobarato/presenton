from datetime import datetime
from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel

from models.speaker_note_audio_response import SpeakerNoteAudioResponse


class StagePosition(BaseModel):
    x: float
    y: float


class StageSize(BaseModel):
    width: float
    height: float


class StageBox(BaseModel):
    """A rectangle on the 1280×720 slide stage, in the slide `ui` coordinates."""

    position: StagePosition
    size: StageSize

    @classmethod
    def of(cls, x: float, y: float, width: float, height: float) -> "StageBox":
        return cls(
            position=StagePosition(x=x, y=y),
            size=StageSize(width=width, height=height),
        )


class SlideVideoResponse(BaseModel):
    """One slide's avatar video, as clients see it.

    `placeholder` is where the slide's layout reserves room for the video, read
    from the tagged element in the slide's `ui`; it is null when that element
    has been removed from the slide since the upload.
    """

    id: uuid.UUID
    presentation_id: uuid.UUID
    slide_id: uuid.UUID
    slide_index: int
    url: str
    format: str
    mime_type: str
    original_filename: Optional[str] = None
    size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    # The narration language the avatar was synced to; null = any language.
    language: Optional[str] = None
    # The avatar no longer matches the narration it was made from: the speaker
    # note changed after it was made (`note_changed`), or the slide's audio in
    # its language was regenerated since (`audio_regenerated`). `stale` is
    # `stale_reason is not None`, kept for clients that only need the flag.
    stale: bool
    stale_reason: Optional[Literal["note_changed", "audio_regenerated"]] = None
    placeholder: Optional[StageBox] = None
    created_at: datetime
    updated_at: datetime


class SlideVideosResponse(BaseModel):
    """A deck's avatar videos in slide order."""

    presentation_id: uuid.UUID
    total_duration_seconds: Optional[float] = None
    videos: List[SlideVideoResponse]


class PlaybackBubble(StageBox):
    """Where the voice bubble sits; `is_default` until a deck sets its own."""

    is_default: bool


class PlaybackBubbleRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float


class PlaybackSlide(BaseModel):
    """What the narrator does on one slide.

    `actor` is `video` when the slide has an avatar video, which then expands
    into `placeholder`; `voice` when only narration audio exists, played behind
    the voice bubble; `none` when the slide has neither. `audio` is filled for
    video slides too, so a viewer who switches the avatar off still hears the
    narration.
    """

    slide_id: uuid.UUID
    slide_index: int
    actor: Literal["video", "voice", "none"]
    duration_seconds: Optional[float] = None
    placeholder: Optional[StageBox] = None
    video: Optional[SlideVideoResponse] = None
    audio: Optional[SpeakerNoteAudioResponse] = None


class PresentationPlaybackResponse(BaseModel):
    """Everything a player needs to narrate a deck, in slide order.

    The actor is one presence across the whole deck: transitions between
    slides follow from comparing consecutive `actor` values (voice to video
    expands the bubble into the placeholder, video to voice collapses it back).
    """

    presentation_id: uuid.UUID
    language: Optional[str] = None
    language_name: Optional[str] = None
    stage: StageSize
    bubble: PlaybackBubble
    total_duration_seconds: Optional[float] = None
    slides: List[PlaybackSlide]
