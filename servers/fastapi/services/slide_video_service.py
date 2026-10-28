"""Avatar videos uploaded per slide, and the playback plan built around them.

A narrated deck has one presenter throughout: on most slides it is a voice
bubble playing the slide's narration, and on the few slides that carry an
avatar video (made offline, lip-synced to that narration) it expands into a
placeholder the slide's layout reserves for it. The placeholder is an ordinary
image element tagged `video_placeholder`, so every existing editor and export
path handles it as an image; its poster is transparent, which keeps it out of
sight in static exports. It sits in a component of its own, so it is layered
like any other component: slide content above it is drawn over the avatar.

Videos only exist on template slides, whose `ui` element tree has somewhere to
put the placeholder. A placeholder is how a slide opts in to an avatar, so it
can exist before any video does: the editor adds one, uploading or generating
a video fills it (adding it if missing), and deleting the video leaves it
empty - the slide keeps the voice bubble until a video arrives. Only removing
the placeholder itself takes it off the slide.
"""

from __future__ import annotations

import copy
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterator, Literal, Mapping, Optional, Sequence

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
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.speaker_note_tts_service import list_speaker_note_audios, note_digest
from utils.asset_directory_utils import (
    absolute_fastapi_asset_url,
    app_data_file_url,
    get_videos_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.video_files import (
    get_slide_video_max_upload_bytes,
    remove_deck_video_files,
    remove_file,
    StoredVideo,
    store_uploaded_video,
    video_metadata,
)

STAGE_WIDTH = 1280
STAGE_HEIGHT = 720
STAGE_MARGIN = 24

VIDEO_PLACEHOLDER_FLAG = "video_placeholder"
VIDEO_PLACEHOLDER_NAME = "avatar_video"
VIDEO_PLACEHOLDER_POSTER = "/static/images/video-placeholder.png"
# An avatar always fills its placeholder, cropping the overflow, so the face
# keeps its proportions whatever box the author drew. Nothing lets the author
# pick another fit, and placeholders made before this stored `fill`, so the
# stored `fit` is overwritten rather than read.
AVATAR_FIT: Literal["cover"] = "cover"
DEFAULT_PLACEHOLDER_WIDTH = 320
MAX_DEFAULT_PLACEHOLDER_HEIGHT = 360
DEFAULT_VIDEO_ASPECT = 9 / 16
# A placeholder gets a component of its own, like an image inserted in the
# editor, so its place in `components` is its layer.
VIDEO_PLACEHOLDER_COMPONENT_ID = "video_placeholder"
VIDEO_PLACEHOLDER_COMPONENT_DESCRIPTION = "Avatar video placeholder"

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
    # A layout can be made of components alone; the placeholder then starts
    # the root `elements` list.
    ui = slide.ui
    return isinstance(ui, dict) and (
        isinstance(ui.get("elements"), list) or isinstance(ui.get("components"), list)
    )


def _is_video_placeholder(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("type") == "image"
        and value.get(VIDEO_PLACEHOLDER_FLAG) is True
    )


def _position(value: dict[str, Any]) -> tuple[float, float]:
    position = value.get("position") if isinstance(value.get("position"), dict) else {}
    return _number(position.get("x")) or 0.0, _number(position.get("y")) or 0.0


def _walk(
    value: Any, offset: tuple[float, float] = (0.0, 0.0)
) -> Iterator[tuple[dict[str, Any], tuple[float, float]]]:
    """Every dict in the tree, with the stage offset its own `position` is
    relative to: a component's elements, and a group's children, are placed
    from their parent's position, as the editor draws them."""
    if isinstance(value, dict):
        yield value, offset
        x, y = _position(value)
        child_offset = (offset[0] + x, offset[1] + y)
        for child in value.values():
            yield from _walk(child, child_offset)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child, offset)


def _locate_video_placeholder(
    ui: Any,
) -> Optional[tuple[dict[str, Any], tuple[float, float]]]:
    return next(
        ((node, offset) for node, offset in _walk(ui) if _is_video_placeholder(node)),
        None,
    )


def find_video_placeholder(ui: Any) -> Optional[dict[str, Any]]:
    """The slide's placeholder element, wherever it sits in the element tree."""
    located = _locate_video_placeholder(ui)
    return located[0] if located else None


def _number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def placeholder_box(element: Optional[dict[str, Any]]) -> Optional[StageBox]:
    """`element`'s own box, relative to whatever it is placed in."""
    if element is None:
        return None
    position = element.get("position") if isinstance(element.get("position"), dict) else {}
    size = element.get("size") if isinstance(element.get("size"), dict) else {}
    x, y = _number(position.get("x")), _number(position.get("y"))
    width, height = _number(size.get("width")), _number(size.get("height"))
    if None in (x, y, width, height):
        return None
    return StageBox.of(x, y, width, height)


def find_video_placeholder_box(ui: Any) -> Optional[StageBox]:
    """The slide's placeholder on the stage, in stage pixels."""
    located = _locate_video_placeholder(ui)
    if located is None:
        return None
    element, (offset_x, offset_y) = located
    box = placeholder_box(element)
    if box is None:
        return None
    return StageBox.of(
        offset_x + box.position.x,
        offset_y + box.position.y,
        box.size.width,
        box.size.height,
    )


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
        "fit": AVATAR_FIT,
        "data": absolute_fastapi_asset_url(VIDEO_PLACEHOLDER_POSTER),
        "position": {"x": box.position.x, "y": box.position.y},
        "size": {"width": box.size.width, "height": box.size.height},
    }


def _placeholder_component(element: dict[str, Any]) -> dict[str, Any]:
    """`element`, stage-placed, wrapped in a component of its own at the same
    spot, the way the editor wraps an inserted image."""
    x, y = _position(element)
    return {
        "id": VIDEO_PLACEHOLDER_COMPONENT_ID,
        "description": VIDEO_PLACEHOLDER_COMPONENT_DESCRIPTION,
        "position": {"x": x, "y": y},
        "elements": [{**element, "position": {"x": 0, "y": 0}}],
    }


def _components(ui: dict[str, Any]) -> list[Any]:
    if not isinstance(ui.get("components"), list):
        ui["components"] = []
    return ui["components"]


def lift_root_video_placeholder(ui: dict[str, Any]) -> None:
    """Move a placeholder kept in the slide's root `elements`, as placeholders
    were before they could be layered, into a component on top of the slide:
    where every export drew the avatar then. Changes `ui` in place."""
    elements = ui.get("elements")
    if not isinstance(elements, list):
        return
    lifted = [item for item in elements if _is_video_placeholder(item)]
    if not lifted:
        return
    ui["elements"] = [item for item in elements if not _is_video_placeholder(item)]
    _components(ui).extend(_placeholder_component(item) for item in lifted)


def items_above_video_placeholder(ui: Any) -> int:
    """How many of the slide's top-level items are layered over its
    placeholder: root elements first, then components, in drawing order. A
    placeholder still in the root elements counts as on top."""
    if not isinstance(ui, dict):
        return 0
    lifted = copy.deepcopy(ui)
    lift_root_video_placeholder(lifted)
    elements = lifted.get("elements") if isinstance(lifted.get("elements"), list) else []
    items = [*elements, *_components(lifted)]
    for index, item in enumerate(items):
        if find_video_placeholder(item) is not None:
            return len(items) - index - 1
    return 0


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

    Coordinates are stage pixels, wherever the placeholder sits in the tree. A
    placeholder the slide already has keeps its place, and its layer, unless
    coordinates are given; a missing one is added in a component of its own on
    top of the slide. Always a new dict, since the slide's JSON column only
    notices a change when it is reassigned.
    """
    next_ui = copy.deepcopy(ui)
    lift_root_video_placeholder(next_ui)
    if _locate_video_placeholder(next_ui) is None:
        _components(next_ui).append(
            _placeholder_component(
                _new_placeholder_element(
                    default_placeholder_box(video_width, video_height)
                )
            )
        )
    located = _locate_video_placeholder(next_ui)
    assert located is not None
    element, (offset_x, offset_y) = located

    current = find_video_placeholder_box(next_ui) or default_placeholder_box(
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
    element["position"] = {
        "x": box.position.x - offset_x,
        "y": box.position.y - offset_y,
    }
    element["size"] = {"width": box.size.width, "height": box.size.height}
    element["fit"] = AVATAR_FIT
    return next_ui


def remove_video_placeholder(ui: Any) -> Any:
    """Return a copy of `ui` with every placeholder element taken out, and any
    component that held nothing else."""

    def strip(value: Any) -> Any:
        if isinstance(value, list):
            return [strip(item) for item in value if not _is_video_placeholder(item)]
        if isinstance(value, dict):
            return {
                key: None if _is_video_placeholder(child) else strip(child)
                for key, child in value.items()
            }
        return value

    def holds_only_placeholders(component: Any) -> bool:
        elements = component.get("elements") if isinstance(component, dict) else None
        return (
            isinstance(elements, list)
            and len(elements) > 0
            and all(_is_video_placeholder(item) for item in elements)
        )

    stripped = strip(copy.deepcopy(ui))
    if isinstance(ui, dict) and isinstance(ui.get("components"), list):
        stripped["components"] = [
            strip(component)
            for component in ui["components"]
            if not holds_only_placeholders(component)
        ]
    return stripped


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


StaleReason = Literal["note_changed", "audio_regenerated"]


def _as_utc(moment: datetime) -> datetime:
    # SQLite hands timestamps back without a zone, Postgres with one; every
    # stored value is UTC, so a naive one is read as UTC to compare the two.
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=timezone.utc)


def avatar_stale_reason(
    video: SlideVideoModel,
    slide: SlideModel,
    audio: Optional[SpeakerNoteAudioModel],
) -> Optional[StaleReason]:
    """Why the avatar no longer matches its narration, or None while it does.

    The avatar was lip-synced to the note's audio at upload time. A note edited
    since changes what should be said; audio regenerated since, in the avatar's
    own language, changes how it sounds, so the lips drift from the voice. Audio
    in another language says nothing about this avatar, and an avatar with no
    language ("any") has no audio to compare against, so it only checks the
    note. Staleness is a warning: stale avatars are still played.
    """
    if note_digest(slide.speaker_note or "") != video.source_note_hash:
        return "note_changed"
    if (
        video.language is not None
        and audio is not None
        and audio.language == video.language
        and _as_utc(audio.updated_at) > _as_utc(video.updated_at)
    ):
        return "audio_regenerated"
    return None


def slide_video_response(
    video: SlideVideoModel,
    slide: SlideModel,
    audio: Optional[SpeakerNoteAudioModel] = None,
) -> SlideVideoResponse:
    """`audio` is the slide's narration in the avatar's language, if any."""
    stale_reason = avatar_stale_reason(video, slide, audio)
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
        language=video.language,
        source="heygen" if video.source == "heygen" else "upload",
        stale=stale_reason is not None,
        stale_reason=stale_reason,
        placeholder=find_video_placeholder_box(slide.ui),
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


def slide_videos_response(
    presentation_id: uuid.UUID,
    slides: Sequence[SlideModel],
    videos: Sequence[SlideVideoModel],
    audios: Sequence[SpeakerNoteAudioModel] = (),
) -> SlideVideosResponse:
    by_slide = {video.slide: video for video in videos}
    audio_by_slide_language = {
        (audio.slide, audio.language): audio for audio in audios
    }
    responses = [
        slide_video_response(
            by_slide[slide.id],
            slide,
            audio_by_slide_language.get((slide.id, by_slide[slide.id].language)),
        )
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


ActorKind = Literal["video", "voice", "none"]


@dataclass(frozen=True)
class SlideActor:
    """Who presents one slide, and with what.

    `video` is set only when `actor == "video"`. `audio` is the slide's TTS
    narration in the language asked for; it is the soundtrack for `video` and
    `voice` slides alike, since avatars are silent. `avatar_skipped` says why a
    slide that has an avatar does not show it.
    """

    slide: SlideModel
    actor: ActorKind
    audio: Optional[SpeakerNoteAudioModel]
    video: Optional[SlideVideoModel]
    avatar_skipped: Optional[Literal["disabled", "language"]] = None


def resolve_slide_actors(
    slides: Sequence[SlideModel],
    audio_by_slide: Mapping[uuid.UUID, SpeakerNoteAudioModel],
    video_by_slide: Mapping[uuid.UUID, SlideVideoModel],
    *,
    language: Optional[str],
    avatars: bool = True,
) -> list[SlideActor]:
    """Pick each slide's presenter, in slide order.

    The playback plan and the MP4 export both ask here, so what a viewer sees
    in the player is what the export renders. An avatar wins when avatars are
    on and it was synced to `language` (or to no language in particular, or
    no narration language is in play at all, so there is nothing for it to
    disagree with); an avatar on a slide with no narration still plays,
    silently. Otherwise the
    slide gets the voice bubble if it has audio, and nothing if it has none.
    """
    actors: list[SlideActor] = []
    for slide in slides:
        audio = audio_by_slide.get(slide.id)
        video = video_by_slide.get(slide.id)
        skipped: Optional[Literal["disabled", "language"]] = None
        if video is not None:
            if not avatars:
                skipped = "disabled"
            elif (
                language is not None
                and video.language is not None
                and video.language != language
            ):
                skipped = "language"
            else:
                actors.append(SlideActor(slide, "video", audio, video))
                continue
        actors.append(
            SlideActor(
                slide, "voice" if audio is not None else "none", audio, None, skipped
            )
        )
    return actors


def avatar_box(slide: SlideModel, video: SlideVideoModel) -> StageBox:
    """Where the avatar plays: the slide's placeholder, or the default corner
    spot shaped like the video when the placeholder was removed since upload."""
    return find_video_placeholder_box(slide.ui) or default_placeholder_box(
        video.width, video.height
    )


def avatar_border_radius(slide: SlideModel) -> float:
    """The placeholder's corner radius in stage pixels, as the editor sets it on
    an image (per corner, or one number); the corners' average, 0 when unset."""
    element = find_video_placeholder(slide.ui)
    radius = element.get("border_radius") if element is not None else None
    if isinstance(radius, dict):
        corners = [_number(radius.get(key)) or 0.0 for key in ("tl", "tr", "bl", "br")]
        return max(0.0, sum(corners) / 4)
    return max(0.0, _number(radius) or 0.0)


async def _default_video_language(
    sql_session: AsyncSession, presentation_id: uuid.UUID
) -> Optional[str]:
    """The deck's only narrated language, or None when it has none or several."""
    audios = await list_speaker_note_audios(
        sql_session, presentation_id=presentation_id
    )
    languages = {audio.language for audio in audios}
    return languages.pop() if len(languages) == 1 else None


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
    language: Optional[str] = None,
) -> SlideVideoModel:
    """Store a slide's avatar video, replacing any earlier one.

    `language` is the narration language the avatar was synced to. Left unset
    it is the deck's only narrated language, or None ("any") when the deck has
    none or several; a given one must be a supported TTS language.

    The file is written under a new name on every upload, because the app
    serves stored media with a long cache lifetime and a replaced file at the
    same URL would keep playing the old video.
    """
    if not is_template_slide(slide):
        raise SlideVideoNotSupportedError(
            "Avatar videos can only be added to template slides"
        )
    # Resolved before the file is stored, so a bad code leaves nothing behind.
    if language is not None and language.strip():
        video_language: Optional[str] = resolve_tts_language(language).code
    else:
        video_language = await _default_video_language(sql_session, presentation.id)

    directory = os.path.join(get_videos_directory(), str(presentation.id))
    stored = await store_uploaded_video(
        file,
        directory=directory,
        stem=f"{slide.id}-{uuid.uuid4().hex[:8]}",
        max_bytes=get_slide_video_max_upload_bytes(),
    )
    return await store_slide_video_bytes(
        sql_session=sql_session,
        presentation=presentation,
        slide=slide,
        stored=stored,
        original_filename=file.filename,
        language=video_language,
        source_note_hash=note_digest(slide.speaker_note or ""),
        source="upload",
        x=x,
        y=y,
        width=width,
        height=height,
    )


async def store_slide_video_bytes(
    *,
    sql_session: AsyncSession,
    presentation: PresentationModel,
    slide: SlideModel,
    stored: StoredVideo,
    original_filename: Optional[str],
    language: Optional[str],
    source_note_hash: str,
    source: Literal["upload", "heygen"],
    x: Optional[float] = None,
    y: Optional[float] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
) -> SlideVideoModel:
    """Record an already stored video as the slide's, replacing any earlier one.

    Owns `stored`: the file is removed again if the row cannot be saved.
    """
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
        video.source_note_hash = source_note_hash
        video.language = language
        video.source = source
        video.original_filename = original_filename
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
        remove_file(stored.path)
        raise

    if previous_path and previous_path != stored.path:
        remove_file(previous_path)
    return video


async def delete_slide_videos(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slides: Sequence[SlideModel],
) -> int:
    """Delete the videos of the given slides and their files.

    Placeholders stay, empty, so the slide can be given a new avatar.
    """
    slides_by_id = {slide.id: slide for slide in slides}
    videos = await list_slide_videos(
        sql_session, presentation_id=presentation_id, slide_ids=list(slides_by_id)
    )
    paths = [video.path for video in videos]
    for video in videos:
        await sql_session.delete(video)
    if videos:
        await sql_session.commit()
    remove_deck_video_files(presentation_id, paths)
    return len(videos)


async def set_video_placeholder(
    sql_session: AsyncSession,
    slide: SlideModel,
    *,
    x: Optional[float] = None,
    y: Optional[float] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
) -> StageBox:
    """Give a slide a video placeholder, or move the one it has.

    The placeholder needs no video: it marks the slide as one that gets an avatar.
    """
    if not is_template_slide(slide):
        raise SlideVideoNotSupportedError(
            "Avatar placeholders can only be added to template slides"
        )
    slide.ui = ensure_video_placeholder(
        slide.ui, x=x, y=y, width=width, height=height
    )
    sql_session.add(slide)
    await sql_session.commit()
    # A just-added or moved placeholder is always readable from the new `ui`.
    box = find_video_placeholder_box(slide.ui)
    assert box is not None
    return box


async def remove_slide_placeholder(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slide: SlideModel,
) -> bool:
    """Take a slide's placeholder off it, with any video and file it had.

    Returns whether the slide had a placeholder.
    """
    videos = await list_slide_videos(
        sql_session, presentation_id=presentation_id, slide_ids=[slide.id]
    )
    had_placeholder = is_template_slide(slide) and (
        find_video_placeholder(slide.ui) is not None
    )
    if had_placeholder:
        slide.ui = remove_video_placeholder(slide.ui)
        sql_session.add(slide)
    for video in videos:
        await sql_session.delete(video)
    if had_placeholder or videos:
        await sql_session.commit()
    remove_deck_video_files(presentation_id, [video.path for video in videos])
    return had_placeholder


async def build_playback(
    sql_session: AsyncSession,
    *,
    presentation: PresentationModel,
    slides: Sequence[SlideModel],
    language: Optional[str] = None,
) -> PresentationPlaybackResponse:
    """Describe, slide by slide, what the narrator shows and plays.

    The narration audio is the soundtrack on every slide. An avatar video is
    silent and was lip-synced to that audio, so on a `video` slide the player
    shows the clip and plays `audio` beside it, and the slide lasts as long as
    the audio. Who presents each slide is decided by `resolve_slide_actors`,
    the same rule the MP4 export uses.

    Narration audio comes in one language. Without `language`, the deck's only
    narrated language is used; a deck narrated in several needs the caller to
    pick one. An avatar synced to another language is not shown.
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
    for resolved_actor in resolve_slide_actors(
        slides,
        audio_by_slide,
        video_by_slide,
        language=resolved.code if resolved else None,
    ):
        slide, audio, video = (
            resolved_actor.slide,
            resolved_actor.audio,
            resolved_actor.video,
        )
        audio_response = SpeakerNoteAudioResponse.from_model(audio) if audio else None
        video_response = (
            slide_video_response(video, slide, audio) if video is not None else None
        )
        placeholder = avatar_box(slide, video) if video is not None else None
        if video is not None:
            # The narration, not the clip, sets how long the slide lasts; the
            # clip's own length is only a fallback for a slide with no audio.
            duration = (
                audio.duration_seconds
                if audio is not None and audio.duration_seconds is not None
                else video.duration_seconds
            )
        else:
            duration = audio.duration_seconds if audio is not None else None
        playback_slides.append(
            PlaybackSlide(
                slide_id=slide.id,
                slide_index=slide.index,
                actor=resolved_actor.actor,
                duration_seconds=duration,
                placeholder=placeholder,
                placeholder_border_radius=(
                    avatar_border_radius(slide) if placeholder is not None else None
                ),
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
