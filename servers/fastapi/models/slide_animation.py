import uuid
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

AnimationStatus = Literal[
    "fresh", "stale_content", "stale_layout", "missing", "unsupported"
]


class AnimationTarget(BaseModel):
    id: str
    kind: str
    box: Optional[dict[str, Any]] = None
    text: Optional[str] = None


class SlideTweenModel(BaseModel):
    target: str
    from_values: dict[str, float] = Field(default_factory=dict)
    duration: float
    delay: float = 0.0
    ease: str = "power2.out"


class SlideAnimationEntry(BaseModel):
    slide_id: uuid.UUID
    index: int
    status: AnimationStatus
    source: Optional[Literal["llm", "fallback", "user"]] = None
    reset_from_user: bool = False
    tweens: list[dict[str, Any]] = Field(default_factory=list)
    targets: list[AnimationTarget] = Field(default_factory=list)
    # Signature of `targets` as the slide is now (None when unsupported). Send
    # it back with a PUT so an edit made against older elements is refused.
    targets_signature: Optional[str] = None


class SlideAnimationsResponse(BaseModel):
    slides: list[SlideAnimationEntry]


class SlideAnimationsRequest(BaseModel):
    # None: every slide.
    slide_indexes: Optional[list[int]] = None
    force: bool = False


class SlideAnimationUpdateRequest(BaseModel):
    tweens: list[SlideTweenModel]
    # Optional guards (409 on mismatch): the slide the edit was made on, and
    # the `targets_signature` of the entry it was made against.
    slide_id: Optional[uuid.UUID] = None
    targets_signature: Optional[str] = None
