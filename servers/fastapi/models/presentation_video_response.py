from datetime import datetime
from typing import Any, List, Optional
import uuid

from pydantic import BaseModel

from models.sql.presentation_video import PresentationVideoModel


class PresentationVideoResponse(BaseModel):
    """One deck's rendered video, as clients see it.

    The filesystem paths the video and subtitle files were written to stay
    server-side; callers play/download them through `url` / `subtitle_url`,
    which is what the app serves and authorizes.
    """

    id: uuid.UUID
    presentation_id: uuid.UUID
    language: str
    language_name: str
    preset: str
    url: str
    subtitles_mode: str
    subtitle_url: Optional[str] = None
    resolution: str
    width: int
    height: int
    fps: int
    slide_count: int
    duration_seconds: Optional[float] = None
    size_bytes: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, video: PresentationVideoModel) -> "PresentationVideoResponse":
        return cls(
            id=video.id,
            presentation_id=video.presentation,
            language=video.language,
            language_name=video.language_name,
            preset=video.preset,
            url=video.url,
            subtitles_mode=video.subtitles_mode,
            subtitle_url=video.subtitle_url,
            resolution=video.resolution,
            width=video.width,
            height=video.height,
            fps=video.fps,
            slide_count=video.slide_count,
            duration_seconds=video.duration_seconds,
            size_bytes=video.size_bytes,
            created_at=video.created_at,
            updated_at=video.updated_at,
        )


class PresentationVideosResponse(BaseModel):
    """A deck's rendered videos, across languages and presets."""

    presentation_id: uuid.UUID
    videos: List[PresentationVideoResponse]

    @classmethod
    def from_models(
        cls,
        *,
        presentation_id: uuid.UUID,
        videos: List[PresentationVideoModel],
    ) -> "PresentationVideosResponse":
        return cls(
            presentation_id=presentation_id,
            videos=[PresentationVideoResponse.from_model(video) for video in videos],
        )


class PresentationVideoRequest(BaseModel):
    """What to render, and how.

    Every field below `language` is optional and, left unset, falls back to
    whatever `VideoRenderOptions` itself defaults to - this model does not
    duplicate those defaults, it only carries what the caller actually chose
    to override.
    """

    language: str
    regenerate: bool = False
    voice: Optional[str] = None
    resolution: Optional[str] = None
    fps: Optional[int] = None
    subtitles: Optional[str] = None
    min_slide_seconds: Optional[float] = None
    padding_seconds: Optional[float] = None
    generate_missing_audio: bool = True
    # Animate Template-v2 slide elements in (HyperFrames) instead of showing
    # each slide as a still. Other slides stay still either way.
    animate: bool = False
    # The looping "speaker is talking" bubble on narrated slides; on unless
    # turned off.
    speaker_indicator: bool = True
    # Seconds of crossfade at each slide change, taken from the silence
    # around the narration (0 cuts); 0.5 when left out.
    crossfade_seconds: Optional[float] = None


class PresentationVideoGenerationResponse(BaseModel):
    """A finished render, plus what the run actually did.

    The video row alone cannot say whether it was rebuilt or served from
    cache, or which slides went out silent because they had no speaker note
    to read. Those are facts about the run, not about the file, so they ride
    alongside it here rather than being stored on the row - the same split
    `SpeakerNoteAudiosResponse` makes for narration. Without this the sync
    caller had no way to learn what the async task reports in its task data.
    """

    video: PresentationVideoResponse
    reused: bool = False
    skipped: List[dict[str, Any]] = []
    narration: Optional[dict[str, Any]] = None
    # Set when `animate` was requested: whether it was applied, to how many
    # slides, and if not, why the video was rendered as stills instead.
    animation: Optional[dict[str, Any]] = None

    @classmethod
    def from_result(cls, result: Any) -> "PresentationVideoGenerationResponse":
        return cls(
            video=PresentationVideoResponse.from_model(result.video),
            reused=result.reused,
            skipped=list(result.skipped or []),
            narration=result.narration,
            animation=getattr(result, "animation", None),
        )
