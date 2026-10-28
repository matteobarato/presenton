import asyncio
import uuid
import weakref
from typing import Optional, Sequence

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.v1.auth.context import get_current_owner_id
from api.v1.ppt.endpoints.presentation import (
    _presentation_with_slides_for_speaker_notes,
    _slide_at_index,
)
from constants.tts_languages import (
    UnsupportedTTSLanguageError,
    find_tts_language,
    resolve_tts_language,
)
from enums.async_task_status import AsyncTaskStatus
from models.slide_avatar_generation import (
    AvatarGenerationPreview,
    PlaceholderRequest,
    PlaceholderResponse,
    PortraitResponse,
    SlideAvatarGenerationRequest,
)
from models.sql.async_task import AsyncTaskModel
from models.sql.slide import SlideModel
from services.database import get_async_session
from services.slide_avatar_generation import (
    ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION,
    SlidePlan,
    initial_task_data,
    plan_avatar_generation,
    run_avatar_generation_task,
)
from services.slide_avatar_portrait import (
    InvalidPortraitError,
    MAX_PORTRAIT_BYTES,
    delete_portrait,
    generation_available,
    portrait_response,
    save_portrait,
)
from services.slide_video_service import (
    InvalidStageBoxError,
    MultipleNarrationLanguagesError,
    SlideVideoNotSupportedError,
    list_slide_videos,
    remove_slide_placeholder,
    set_video_placeholder,
)
from services.speaker_note_tts_service import list_speaker_note_audios
from utils.ffmpeg_utils import ffmpeg_available

SLIDE_AVATARS_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])

# One generation request per deck at a time, from the running-task check until
# the new task is committed. The server runs in a single process, so an
# in-memory lock is enough; a deck's lock goes away once nobody holds it.
_GENERATION_LOCKS: "weakref.WeakValueDictionary[uuid.UUID, asyncio.Lock]" = (
    weakref.WeakValueDictionary()
)


def _generation_lock(presentation_id: uuid.UUID) -> asyncio.Lock:
    lock = _GENERATION_LOCKS.get(presentation_id)
    if lock is None:
        lock = asyncio.Lock()
        _GENERATION_LOCKS[presentation_id] = lock
    return lock


@SLIDE_AVATARS_ROUTER.post(
    "/{id}/videos/{slide_index}/placeholder", response_model=PlaceholderResponse
)
async def put_slide_placeholder(
    id: uuid.UUID,
    slide_index: int,
    body: Optional[PlaceholderRequest] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Mark a slide as one that gets an avatar, before it has any video.

    Adds the placeholder in the bottom-right corner, or moves the one the slide
    has when coordinates are given. Only template slides can hold one.
    """
    body = body or PlaceholderRequest()
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    slide = _slide_at_index(slides, slide_index)
    try:
        box = await set_video_placeholder(
            sql_session,
            slide,
            x=body.x,
            y=body.y,
            width=body.width,
            height=body.height,
        )
    except (SlideVideoNotSupportedError, InvalidStageBoxError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return PlaceholderResponse(
        slide_index=slide.index, slide_id=slide.id, placeholder=box, ui=slide.ui
    )


@SLIDE_AVATARS_ROUTER.delete("/{id}/videos/{slide_index}/placeholder")
async def delete_slide_placeholder(
    id: uuid.UUID,
    slide_index: int,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Take the placeholder off a slide, deleting its video too if it has one."""
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    slide = _slide_at_index(slides, slide_index)
    removed = await remove_slide_placeholder(
        sql_session, presentation_id=id, slide=slide
    )
    return {"removed": removed}


# The literal `portrait` segment is registered here, ahead of the presentation
# router's `/{id}/videos/{slide_index}`, so it is never read as a slide index.
@SLIDE_AVATARS_ROUTER.put("/{id}/videos/portrait", response_model=PortraitResponse)
async def put_portrait(
    id: uuid.UUID,
    file: UploadFile = File(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Set the deck's presenter portrait (JPEG, PNG or WebP, up to 10 MB)."""
    presentation, _ = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    # One byte past the limit is enough to know it is too large.
    data = await file.read(MAX_PORTRAIT_BYTES + 1)
    try:
        return await save_portrait(sql_session, presentation, data)
    except InvalidPortraitError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@SLIDE_AVATARS_ROUTER.get("/{id}/videos/portrait", response_model=PortraitResponse)
async def get_portrait(
    id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """The deck's portrait: its URL and dimensions."""
    presentation, _ = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    portrait = portrait_response(presentation)
    if portrait is None:
        raise HTTPException(status_code=404, detail="This deck has no portrait")
    return portrait


@SLIDE_AVATARS_ROUTER.delete("/{id}/videos/portrait")
async def delete_deck_portrait(
    id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Remove the deck's portrait and its file."""
    presentation, _ = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    return {"deleted": await delete_portrait(sql_session, presentation)}


async def _generation_language(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    language: Optional[str],
    *,
    fallback: Optional[str] = None,
    first_of_many: bool = False,
) -> str:
    """The language code to generate in, resolved as `/playback` resolves it.

    With `first_of_many`, a deck narrated in several languages and no explicit
    `language` resolves to the first sorted code instead of failing.

    A deck with no narration at all has nothing to lip-sync to; `fallback`
    stands in for its language when the caller only wants a preview.
    """
    audios = await list_speaker_note_audios(
        sql_session, presentation_id=presentation_id
    )
    languages = {audio.language for audio in audios}
    if not languages and fallback is None:
        raise HTTPException(
            status_code=422,
            detail="This deck has no narration yet: generate TTS first",
        )
    try:
        if language:
            return resolve_tts_language(language).code
        if len(languages) > 1 and first_of_many:
            return resolve_tts_language(sorted(languages)[0]).code
        if len(languages) > 1:
            raise MultipleNarrationLanguagesError(languages)
        return resolve_tts_language(languages.pop()).code if languages else fallback
    except (UnsupportedTTSLanguageError, MultipleNarrationLanguagesError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


async def _plan_generation(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    slides: Sequence[SlideModel],
    *,
    language: str,
    slide_indices: Optional[Sequence[int]],
    force: bool,
) -> list[SlidePlan]:
    audios = await list_speaker_note_audios(
        sql_session, presentation_id=presentation_id, language=language
    )
    videos = await list_slide_videos(sql_session, presentation_id=presentation_id)
    return plan_avatar_generation(
        slides,
        videos,
        audios,
        language=language,
        slide_indices=slide_indices,
        force=force,
        can_transcode=ffmpeg_available(),
    )


async def _generation_tasks(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    status: Optional[AsyncTaskStatus] = None,
) -> list[AsyncTaskModel]:
    """The deck's generation tasks, newest first.

    The deck is matched in Python, not in SQL, because reading a JSON key is
    spelled differently by each database.
    """
    statement = select(AsyncTaskModel).where(
        AsyncTaskModel.type == ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION
    )
    if status is not None:
        statement = statement.where(AsyncTaskModel.status == status)
    statement = statement.order_by(AsyncTaskModel.created_at.desc())
    return [
        task
        for task in await sql_session.scalars(statement)
        if (task.data or {}).get("presentation_id") == str(presentation_id)
    ]


# `generate` is a literal segment like `portrait`, registered ahead of
# `/{id}/videos/{slide_index}` for the same reason.
@SLIDE_AVATARS_ROUTER.post("/{id}/videos/generate", response_model=AsyncTaskModel)
async def generate_slide_avatars(
    id: uuid.UUID,
    background_tasks: BackgroundTasks,
    body: Optional[SlideAvatarGenerationRequest] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Generate lip-synced avatars with ElevenLabs, as a task to poll.

    Each chosen slide that has a placeholder and up-to-date narration gets a
    video made from the deck's portrait and the slide's audio. Slides whose
    avatar is already up to date are skipped unless `force` is set; the task's
    `data.slides` says what happens to each slide and why. Generating spends
    ElevenLabs credits for every slide that is not skipped.
    """
    body = body or SlideAvatarGenerationRequest()
    presentation, slides = await _presentation_with_slides_for_speaker_notes(
        id, sql_session
    )
    if not generation_available():
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY is not set")
    if portrait_response(presentation) is None:
        raise HTTPException(
            status_code=422,
            detail="Upload a presenter portrait before generating avatars",
        )
    language = await _generation_language(sql_session, id, body.language)
    for slide_index in body.slide_indices or []:
        _slide_at_index(slides, slide_index)

    lock = _generation_lock(id)
    async with lock:
        running = await _generation_tasks(sql_session, id, AsyncTaskStatus.PENDING)
        if running:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Avatars are already being generated for this deck",
                    "task_id": running[0].id,
                },
            )

        plans = await _plan_generation(
            sql_session,
            id,
            slides,
            language=language,
            slide_indices=body.slide_indices,
            force=body.force,
        )
        task = AsyncTaskModel(
            type=ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION,
            status=AsyncTaskStatus.PENDING,
            message="Queued for avatar generation",
            data=initial_task_data(
                id, language=language, resolution=body.resolution, plans=plans
            ),
        )
        sql_session.add(task)
        await sql_session.commit()
    await sql_session.refresh(task)
    background_tasks.add_task(
        run_avatar_generation_task, task.id, id, get_current_owner_id()
    )
    return task


@SLIDE_AVATARS_ROUTER.get("/{id}/videos/generate", response_model=AsyncTaskModel)
async def get_slide_avatar_generation(
    id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """The deck's latest avatar generation, so a reloaded editor can resume polling."""
    await _presentation_with_slides_for_speaker_notes(id, sql_session)
    tasks = await _generation_tasks(sql_session, id)
    if not tasks:
        raise HTTPException(
            status_code=404, detail="No avatars have been generated for this deck"
        )
    return tasks[0]


@SLIDE_AVATARS_ROUTER.get(
    "/{id}/videos/generate/preview", response_model=AvatarGenerationPreview
)
async def preview_slide_avatar_generation(
    id: uuid.UUID,
    language: Optional[str] = Query(default=None),
    sql_session: AsyncSession = Depends(get_async_session),
):
    """What generating every placeholder slide would do now, without starting it.

    Needs neither the API key nor a portrait, so the editor can show each
    slide's status and why it would be skipped.
    """
    presentation, slides = await _presentation_with_slides_for_speaker_notes(
        id, sql_session
    )
    deck_language = find_tts_language(presentation.language)
    language_code = await _generation_language(
        sql_session,
        id,
        language,
        fallback=deck_language.code if deck_language else "en",
        first_of_many=True,
    )
    narrated = sorted(
        {
            audio.language
            for audio in await list_speaker_note_audios(
                sql_session, presentation_id=id
            )
        }
    )
    plans = await _plan_generation(
        sql_session,
        id,
        slides,
        language=language_code,
        slide_indices=None,
        force=False,
    )
    return AvatarGenerationPreview(
        language=language_code,
        languages=narrated,
        slides=[plan.to_dict() for plan in plans],
    )
