import uuid

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
