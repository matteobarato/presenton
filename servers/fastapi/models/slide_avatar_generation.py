import uuid
from typing import Literal, Optional

from pydantic import BaseModel

from models.slide_video_response import PortraitResponse, StageBox  # noqa: F401  (re-exported)


class PlaceholderRequest(BaseModel):
    """Slide coordinates (1280×720) for the placeholder; unset keeps or defaults."""

    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None


class PlaceholderResponse(BaseModel):
    slide_index: int
    slide_id: uuid.UUID
    placeholder: StageBox
    # The slide's element tree after the change, so the editor can swap it in.
    ui: dict


class SlideAvatarGenerationRequest(BaseModel):
    # None: every slide that has a placeholder.
    slide_indices: Optional[list[int]] = None
    # None: the deck's only narrated language.
    language: Optional[str] = None
    # Regenerate avatars that are up to date, uploaded ones included.
    force: bool = False
    resolution: Literal["720p", "480p"] = "720p"


class AvatarGenerationPreview(BaseModel):
    """What a generation would do now, slide by slide, without starting one."""

    language: str
    # Sorted codes of the languages the deck is narrated in.
    languages: list[str] = []
    # As in the task's `data.slides`: slide_index, slide_id, state, reason.
    slides: list[dict]
