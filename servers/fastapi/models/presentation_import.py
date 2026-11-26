from typing import Any, Optional

from pydantic import BaseModel, Field


class ImportPresentationRequest(BaseModel):
    """Start a presentation from an uploaded PowerPoint deck."""

    pptx_url: str
    language: str = Field(min_length=1)
    # None lets the AI choose the presenter slides.
    n_videos: Optional[int] = Field(default=None, ge=0)
    fonts: Optional[dict[str, Any]] = None
    title: Optional[str] = Field(default=None, max_length=255)
    source_name: Optional[str] = Field(default=None, max_length=255)
