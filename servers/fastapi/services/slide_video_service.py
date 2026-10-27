"""Avatar videos uploaded per slide, and the playback plan built around them.

A narrated deck has one presenter throughout: on most slides it is a voice
bubble playing the slide's narration, and on the few slides that carry an
avatar video (made offline, lip-synced to that narration) it expands into a
placeholder the slide's layout reserves for it. The placeholder is an ordinary
image element tagged `video_placeholder`, so every existing editor and export
path handles it as an image; its poster is transparent, which keeps it out of
sight in static exports.

Videos only exist on template slides, whose `ui` element tree has somewhere to
put the placeholder. The placeholder lives on a slide only while the slide has
a video: uploading adds it, deleting the video removes it.
"""

from __future__ import annotations

import copy
import logging
import os
import uuid
from typing import Any, Iterator, Optional, Sequence

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.tts_languages import resolve_tts_language
from models.slide_video_response import (
    PlaybackBubble,
    PlaybackSlide,
    PresentationPlaybackResponse,
    SlideVideoResponse,
    SlideVideosResponse,
    StageBox,
    StageSize,
)
from models.speaker_note_audio_response import SpeakerNoteAudioResponse
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from services.speaker_note_tts_service import list_speaker_note_audios, note_digest
from utils.asset_directory_utils import (
    absolute_fastapi_asset_url,
    app_data_file_url,
    get_videos_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.video_files import (
    get_slide_video_max_upload_bytes,
    store_uploaded_video,
    video_metadata,
)

LOGGER = logging.getLogger(__name__)

STAGE_WIDTH = 1280
STAGE_HEIGHT = 720
STAGE_MARGIN = 24

VIDEO_PLACEHOLDER_FLAG = "video_placeholder"
VIDEO_PLACEHOLDER_NAME = "avatar_video"
VIDEO_PLACEHOLDER_POSTER = "/static/images/video-placeholder.png"
DEFAULT_PLACEHOLDER_WIDTH = 320
MAX_DEFAULT_PLACEHOLDER_HEIGHT = 360
DEFAULT_VIDEO_ASPECT = 9 / 16

DEFAULT_BUBBLE_SIZE = 96


class SlideVideoNotSupportedError(ValueError):
    """Raised for a slide with no template layout to place a video in."""


class InvalidStageBoxError(ValueError):
    """Raised for a rectangle that does not fit on the slide stage."""


class MultipleNarrationLanguagesError(ValueError):
    """Raised when a deck has narration in several languages and none was chosen."""

    def __init__(self, languages: Sequence[str]):
        self.languages = sorted(languages)
        super().__init__(
            "This presentation has been narrated in more than one language: "
            "pass `language` to choose one (" + ", ".join(self.languages) + ")"
        )


def is_template_slide(slide: SlideModel) -> bool:
    ui = slide.ui
    return isinstance(ui, dict) and isinstance(ui.get("elements"), list)


def _is_video_placeholder(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("type") == "image"
        and value.get(VIDEO_PLACEHOLDER_FLAG) is True
    )


def _walk(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def find_video_placeholder(ui: Any) -> Optional[dict[str, Any]]:
    """The slide's placeholder element, wherever it sits in the element tree."""
    return next((node for node in _walk(ui) if _is_video_placeholder(node)), None)


def _number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def placeholder_box(element: Optional[dict[str, Any]]) -> Optional[StageBox]:
    if element is None:
        return None
    position = element.get("position") if isinstance(element.get("position"), dict) else {}
    size = element.get("size") if isinstance(element.get("size"), dict) else {}
    x, y = _number(position.get("x")), _number(position.get("y"))
    width, height = _number(size.get("width")), _number(size.get("height"))
    if None in (x, y, width, height):
        return None
    return StageBox.of(x, y, width, height)


def default_placeholder_box(
    video_width: Optional[int] = None, video_height: Optional[int] = None
) -> StageBox:
    """A box in the bottom-right corner shaped like the video."""
    aspect = (
        video_height / video_width
        if video_width and video_height
        else DEFAULT_VIDEO_ASPECT
    )
    width = float(DEFAULT_PLACEHOLDER_WIDTH)
    height = round(width * aspect)
    if height > MAX_DEFAULT_PLACEHOLDER_HEIGHT:
        height = MAX_DEFAULT_PLACEHOLDER_HEIGHT
        width = round(height / aspect)
    return StageBox.of(
        STAGE_WIDTH - STAGE_MARGIN - width,
        STAGE_HEIGHT - STAGE_MARGIN - height,
        width,
        height,
    )


def default_bubble_box() -> StageBox:
    """The voice bubble's spot when a deck has not set one: the same corner the
    default video placeholder uses, so the presenter shrinks in place."""
    return StageBox.of(
        STAGE_WIDTH - STAGE_MARGIN - DEFAULT_BUBBLE_SIZE,
        STAGE_HEIGHT - STAGE_MARGIN - DEFAULT_BUBBLE_SIZE,
        DEFAULT_BUBBLE_SIZE,
        DEFAULT_BUBBLE_SIZE,
    )


def validate_stage_box(box: StageBox) -> StageBox:
    x, y = box.position.x, box.position.y
    width, height = box.size.width, box.size.height
    if width <= 0 or height <= 0:
        raise InvalidStageBoxError("Width and height must be greater than 0")
    if x < 0 or y < 0 or x + width > STAGE_WIDTH or y + height > STAGE_HEIGHT:
        raise InvalidStageBoxError(
            f"The box must fit inside the {STAGE_WIDTH}x{STAGE_HEIGHT} slide"
        )
    return box


def _new_placeholder_element(box: StageBox) -> dict[str, Any]:
    return {
        "type": "image",
        "name": VIDEO_PLACEHOLDER_NAME,
        VIDEO_PLACEHOLDER_FLAG: True,
        "decorative": True,
        "is_icon": False,
        "fit": "fill",
        "data": absolute_fastapi_asset_url(VIDEO_PLACEHOLDER_POSTER),
        "position": {"x": box.position.x, "y": box.position.y},
        "size": {"width": box.size.width, "height": box.size.height},
    }


def ensure_video_placeholder(
    ui: dict[str, Any],
    *,
    video_width: Optional[int] = None,
    video_height: Optional[int] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
) -> dict[str, Any]:
    """Return a copy of `ui` holding a placeholder, moved by any given coordinates.

    A placeholder the slide already has keeps its place unless coordinates are
    given; a missing one is added on top of the slide. Always a new dict, since
    the slide's JSON column only notices a change when it is reassigned.
    """
    next_ui = copy.deepcopy(ui)
    element = find_video_placeholder(next_ui)
    if element is None:
        element = _new_placeholder_element(
            default_placeholder_box(video_width, video_height)
        )
        next_ui.setdefault("elements", []).append(element)

    current = placeholder_box(element) or default_placeholder_box(
        video_width, video_height
    )
    box = validate_stage_box(
        StageBox.of(
            current.position.x if x is None else x,
            current.position.y if y is None else y,
            current.size.width if width is None else width,
            current.size.height if height is None else height,
        )
    )
    element["position"] = {"x": box.position.x, "y": box.position.y}
    element["size"] = {"width": box.size.width, "height": box.size.height}
    return next_ui


def remove_video_placeholder(ui: Any) -> Any:
    """Return a copy of `ui` with every placeholder element taken out."""

    def strip(value: Any) -> Any:
        if isinstance(value, list):
            return [strip(item) for item in value if not _is_video_placeholder(item)]
        if isinstance(value, dict):
            return {
                key: None if _is_video_placeholder(child) else strip(child)
                for key, child in value.items()
            }
        return value

    return strip(copy.deepcopy(ui))


def resolve_bubble(presentation: PresentationModel) -> PlaybackBubble:
    narration = presentation.narration if isinstance(presentation.narration, dict) else {}
    stored = placeholder_box(narration.get("bubble")) if isinstance(
        narration.get("bubble"), dict
    ) else None
    box = stored or default_bubble_box()
    return PlaybackBubble(
        position=box.position, size=box.size, is_default=stored is None
    )


def set_bubble(presentation: PresentationModel, box: StageBox) -> PlaybackBubble:
    validate_stage_box(box)
    narration = copy.deepcopy(presentation.narration) if isinstance(
        presentation.narration, dict
    ) else {}
    narration["bubble"] = {
        "position": {"x": box.position.x, "y": box.position.y},
        "size": {"width": box.size.width, "height": box.size.height},
    }
    presentation.narration = narration
    return resolve_bubble(presentation)


def _remove_video_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        LOGGER.warning("Could not remove slide video %s: %s", path, exc)


def remove_slide_video_files(
    presentation_id: uuid.UUID, paths: Sequence[str]
) -> None:
    """Delete video files, and the deck's video folder once it is empty."""
    directories: set[str] = set()
    for path in paths:
        if not path:
            continue
        directories.add(os.path.dirname(path))
        _remove_video_file(path)
    for directory in directories:
        if os.path.basename(directory) != str(presentation_id):
            continue
        try:
            os.rmdir(directory)
        except OSError:
            continue


async def list_slide_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slide_ids: Optional[Sequence[uuid.UUID]] = None,
) -> list[SlideVideoModel]:
    statement = select(SlideVideoModel).where(
        SlideVideoModel.presentation == presentation_id
    )
    if slide_ids is not None:
        statement = statement.where(SlideVideoModel.slide.in_(list(slide_ids)))
    return list(await sql_session.scalars(statement))


async def slide_video_paths(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slide_ids: Optional[Sequence[uuid.UUID]] = None,
) -> list[str]:
    """Files behind a deck's videos, for a caller about to delete the deck or
    some of its slides: the rows go through the database's cascade, the files
    would otherwise stay behind."""
    videos = await list_slide_videos(
        sql_session, presentation_id=presentation_id, slide_ids=slide_ids
    )
    return [video.path for video in videos if video.path]


def slide_video_response(
    video: SlideVideoModel, slide: SlideModel
) -> SlideVideoResponse:
    return SlideVideoResponse(
        id=video.id,
        presentation_id=video.presentation,
        slide_id=video.slide,
        slide_index=slide.index,
        url=video.url,
        format=video.format,
        mime_type=video.mime_type,
        original_filename=video.original_filename,
        size_bytes=video.size_bytes,
        duration_seconds=video.duration_seconds,
        width=video.width,
        height=video.height,
        stale=note_digest(slide.speaker_note or "") != video.source_note_hash,
        placeholder=placeholder_box(find_video_placeholder(slide.ui)),
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


def slide_videos_response(
    presentation_id: uuid.UUID,
    slides: Sequence[SlideModel],
    videos: Sequence[SlideVideoModel],
) -> SlideVideosResponse:
    by_slide = {video.slide: video for video in videos}
    responses = [
        slide_video_response(by_slide[slide.id], slide)
        for slide in slides
        if slide.id in by_slide
    ]
    durations = [
        response.duration_seconds
        for response in responses
        if response.duration_seconds is not None
    ]
    return SlideVideosResponse(
        presentation_id=presentation_id,
        total_duration_seconds=(
            round(sum(durations), 3)
            if responses and len(durations) == len(responses)
            else None
        ),
        videos=responses,
    )


async def save_slide_video(
    *,
    sql_session: AsyncSession,
    presentation: PresentationModel,
    slide: SlideModel,
    file: UploadFile,
    x: Optional[float] = None,
    y: Optional[float] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
) -> SlideVideoModel:
    """Store a slide's avatar video, replacing any earlier one.

    The file is written under a new name on every upload, because the app
    serves stored media with a long cache lifetime and a replaced file at the
    same URL would keep playing the old video.
    """
    if not is_template_slide(slide):
        raise SlideVideoNotSupportedError(
            "Avatar videos can only be added to template slides"
        )

    directory = os.path.join(get_videos_directory(), str(presentation.id))
    stored = await store_uploaded_video(
        file,
        directory=directory,
        stem=f"{slide.id}-{uuid.uuid4().hex[:8]}",
        max_bytes=get_slide_video_max_upload_bytes(),
    )
    try:
        metadata = video_metadata(stored.path, stored.format)
        next_ui = ensure_video_placeholder(
            slide.ui,
            video_width=metadata.width,
            video_height=metadata.height,
            x=x,
            y=y,
            width=width,
            height=height,
        )

        video = (
            await list_slide_videos(
                sql_session, presentation_id=presentation.id, slide_ids=[slide.id]
            )
            or [None]
        )[0]
        previous_path = video.path if video is not None else None
        if video is None:
            video = SlideVideoModel(presentation=presentation.id, slide=slide.id)
        video.source_note_hash = note_digest(slide.speaker_note or "")
        video.original_filename = file.filename
        video.path = stored.path
        video.url = app_data_file_url(stored.path)
        video.format = stored.format
        video.mime_type = stored.mime_type
        video.size_bytes = stored.size_bytes
        video.duration_seconds = metadata.duration_seconds
        video.width = metadata.width
        video.height = metadata.height
        video.updated_at = get_current_utc_datetime()

        slide.ui = next_ui
        sql_session.add(slide)
        sql_session.add(video)
        await sql_session.commit()
        await sql_session.refresh(video)
    except BaseException:
        _remove_video_file(stored.path)
        raise

    if previous_path and previous_path != stored.path:
        _remove_video_file(previous_path)
    return video


async def delete_slide_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slides: Sequence[SlideModel],
) -> int:
    """Delete the videos of the given slides, their files and their placeholders."""
    slides_by_id = {slide.id: slide for slide in slides}
    videos = await list_slide_videos(
        sql_session, presentation_id=presentation_id, slide_ids=list(slides_by_id)
    )
    paths = [video.path for video in videos]
    for video in videos:
        slide = slides_by_id[video.slide]
        if is_template_slide(slide):
            slide.ui = remove_video_placeholder(slide.ui)
            sql_session.add(slide)
        await sql_session.delete(video)
    if videos:
        await sql_session.commit()
    remove_slide_video_files(presentation_id, paths)
    return len(videos)


async def build_playback(
    sql_session: AsyncSession,
    *,
    presentation: PresentationModel,
    slides: Sequence[SlideModel],
    language: Optional[str] = None,
) -> PresentationPlaybackResponse:
    """Describe, slide by slide, what the narrator shows and plays.

    Narration audio comes in one language. Without `language`, the deck's only
    narrated language is used; a deck narrated in several needs the caller to
    pick one.
    """
    resolved = resolve_tts_language(language) if language else None
    audios = await list_speaker_note_audios(
        sql_session, presentation_id=presentation.id, language=language
    )
    if resolved is None:
        languages = {audio.language for audio in audios}
        if len(languages) > 1:
            raise MultipleNarrationLanguagesError(languages)
        if languages:
            resolved = resolve_tts_language(languages.pop())

    audio_by_slide = {audio.slide: audio for audio in audios}
    video_by_slide = {
        video.slide: video
        for video in await list_slide_videos(
            sql_session, presentation_id=presentation.id
        )
    }

    playback_slides: list[PlaybackSlide] = []
    for slide in slides:
        video = video_by_slide.get(slide.id)
        audio = audio_by_slide.get(slide.id)
        video_response = slide_video_response(video, slide) if video else None
        audio_response = SpeakerNoteAudioResponse.from_model(audio) if audio else None
        if video_response is not None:
            actor = "video"
            placeholder = video_response.placeholder or default_placeholder_box(
                video.width, video.height
            )
            duration = video_response.duration_seconds
            if duration is None and audio_response is not None:
                duration = audio_response.duration_seconds
        elif audio_response is not None:
            actor = "voice"
            placeholder = None
            duration = audio_response.duration_seconds
        else:
            actor = "none"
            placeholder = None
            duration = None
        playback_slides.append(
            PlaybackSlide(
                slide_id=slide.id,
                slide_index=slide.index,
                actor=actor,
                duration_seconds=duration,
                placeholder=placeholder,
                video=video_response,
                audio=audio_response,
            )
        )

    durations = [
        item.duration_seconds
        for item in playback_slides
        if item.duration_seconds is not None
    ]
    return PresentationPlaybackResponse(
        presentation_id=presentation.id,
        language=resolved.code if resolved else None,
        language_name=resolved.name if resolved else None,
        stage=StageSize(width=STAGE_WIDTH, height=STAGE_HEIGHT),
        bubble=resolve_bubble(presentation),
        total_duration_seconds=(
            round(sum(durations), 3)
            if playback_slides and len(durations) == len(playback_slides)
            else None
        ),
        slides=playback_slides,
    )
