"""Persisted entrance animations of a deck's slides: read, plan, edit, clear."""

import uuid
from typing import Any, Optional, Sequence

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.context import (
    get_current_owner_id,
    reset_current_owner_id,
    reset_current_owner_is_admin,
    set_current_owner_id,
    set_current_owner_is_admin,
)
from api.v1.ppt.endpoints.presentation import (
    _presentation_with_slides_for_speaker_notes,
    _slide_at_index,
    build_export_cookie_header,
)
from enums.async_task_status import AsyncTaskStatus
from models.api_error_model import APIErrorModel
from models.slide_animation import (
    AnimationTarget,
    SlideAnimationEntry,
    SlideAnimationsRequest,
    SlideAnimationsResponse,
    SlideAnimationUpdateRequest,
)
from models.sql.async_task import AsyncTaskModel
from models.sql.slide import SlideModel
from services import slide_animation_service as animations
from services.database import async_session_maker, get_async_session
from utils.datetime_utils import get_current_utc_datetime

SLIDE_ANIMATIONS_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])

ASYNC_TASK_TYPE_ANIMATIONS = "presentation.animations"


async def _composition(presentation_id: uuid.UUID, cookie_header: Optional[str]):
    try:
        return await animations._fetch_video_composition(
            presentation_id, cookie_header
        )
    except animations.AnimatedVideoUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


def _entries_by_slide(composition: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(entry.get("id")): entry
        for entry in composition.get("slides") or []
        if isinstance(entry, dict)
    }


def _slide_entry(
    slide: SlideModel, composition_entry: Optional[dict[str, Any]]
) -> SlideAnimationEntry:
    entry = composition_entry or {}
    status = animations.plan_status(slide.animation, entry)
    stored = slide.animation if animations._is_plan(slide.animation) else None
    has_plan = status != "unsupported" and stored is not None
    targets = (
        [
            AnimationTarget(
                id=str(element.get("id")),
                kind=str(element.get("kind")),
                box=element.get("box"),
                text=element.get("text"),
            )
            for element in animations._entry_elements(entry)
        ]
        if status != "unsupported"
        else []
    )
    return SlideAnimationEntry(
        slide_id=slide.id,
        index=slide.index,
        status=status,
        source=stored["source"] if has_plan else None,
        reset_from_user=bool(stored.get("reset_from_user")) if has_plan else False,
        tweens=list(stored["tweens"]) if has_plan else [],
        targets=targets,
    )


def _response(
    slides: Sequence[SlideModel], composition: dict[str, Any]
) -> SlideAnimationsResponse:
    entries = _entries_by_slide(composition)
    return SlideAnimationsResponse(
        slides=[_slide_entry(slide, entries.get(str(slide.id))) for slide in slides]
    )


def _scope(
    slides: Sequence[SlideModel], slide_indexes: Optional[list[int]]
) -> Optional[list[uuid.UUID]]:
    if slide_indexes is None:
        return None
    return [_slide_at_index(slides, index).id for index in slide_indexes]


@SLIDE_ANIMATIONS_ROUTER.get("/{id}/animations", response_model=SlideAnimationsResponse)
async def get_animations(
    id: uuid.UUID,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Each slide's stored animation, its status and the elements it can target."""
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    composition = await _composition(id, build_export_cookie_header(request))
    return _response(slides, composition)


@SLIDE_ANIMATIONS_ROUTER.post(
    "/{id}/animations", response_model=SlideAnimationsResponse
)
async def plan_animations(
    id: uuid.UUID,
    request: Request,
    body: Optional[SlideAnimationsRequest] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Plan missing and stale slides, or every chosen slide with `force`."""
    body = body or SlideAnimationsRequest()
    presentation, slides = await _presentation_with_slides_for_speaker_notes(
        id, sql_session
    )
    slide_ids = _scope(slides, body.slide_indexes)
    cookie_header = build_export_cookie_header(request)
    composition = await _composition(id, cookie_header)
    await animations.resolve_slide_animations(
        sql_session,
        presentation,
        cookie_header,
        slide_ids=slide_ids,
        force=body.force,
        composition=composition,
    )
    return _response(slides, composition)


async def _update_task(session_maker, task_id: str, **fields: Any) -> None:
    async with session_maker() as session:
        task = await session.get(AsyncTaskModel, task_id)
        if task is None:
            return
        data = {**(task.data or {}), **fields.pop("data", {})}
        for key, value in fields.items():
            setattr(task, key, value)
        task.data = data
        task.updated_at = get_current_utc_datetime()
        session.add(task)
        await session.commit()


async def run_animations_task(
    task_id: str,
    presentation_id: uuid.UUID,
    owner_id: Optional[uuid.UUID],
    cookie_header: Optional[str],
    slide_ids: Optional[list[uuid.UUID]],
    force: bool,
) -> None:
    owner_token = set_current_owner_id(owner_id)
    admin_token = set_current_owner_is_admin(False)
    session_maker = async_session_maker
    try:

        async def on_progress(progress: dict[str, Any]) -> None:
            await _update_task(
                session_maker,
                task_id,
                message="Planning animations",
                data={"done": progress["done"], "total": progress["total"]},
            )

        async with session_maker() as session:
            presentation, _ = await _presentation_with_slides_for_speaker_notes(
                presentation_id, session
            )
            await animations.resolve_slide_animations(
                session,
                presentation,
                cookie_header,
                slide_ids=slide_ids,
                force=force,
                on_progress=on_progress,
            )
        await _update_task(
            session_maker,
            task_id,
            status=AsyncTaskStatus.COMPLETED,
            message="Animations ready",
            data={"phase": "done"},
        )
    except Exception as exc:
        error = (
            APIErrorModel(status_code=502, detail=str(exc))
            if isinstance(exc, animations.AnimatedVideoUnavailableError)
            else APIErrorModel.from_exception(exc)
        )
        await _update_task(
            session_maker,
            task_id,
            status=AsyncTaskStatus.ERROR,
            message="Animation planning failed",
            error=error.model_dump(mode="json"),
            data={"phase": "done"},
        )
    finally:
        reset_current_owner_is_admin(admin_token)
        reset_current_owner_id(owner_token)


@SLIDE_ANIMATIONS_ROUTER.post("/{id}/animations/async", response_model=AsyncTaskModel)
async def plan_animations_async(
    id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    body: Optional[SlideAnimationsRequest] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Like `POST /animations`, as a task to poll; `data` has `done` and `total` slides."""
    body = body or SlideAnimationsRequest()
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    slide_ids = _scope(slides, body.slide_indexes)
    task = AsyncTaskModel(
        type=ASYNC_TASK_TYPE_ANIMATIONS,
        status=AsyncTaskStatus.PENDING,
        message="Queued for animation planning",
        data={
            "presentation_id": str(id),
            "phase": "planning",
            "done": 0,
            "total": len(slide_ids) if slide_ids is not None else len(slides),
        },
    )
    sql_session.add(task)
    await sql_session.commit()
    await sql_session.refresh(task)
    background_tasks.add_task(
        run_animations_task,
        task.id,
        id,
        get_current_owner_id(),
        build_export_cookie_header(request),
        slide_ids,
        body.force,
    )
    return task


@SLIDE_ANIMATIONS_ROUTER.put(
    "/{id}/animations/{slide_index}", response_model=SlideAnimationEntry
)
async def put_animation(
    id: uuid.UUID,
    slide_index: int,
    body: SlideAnimationUpdateRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Store a hand-edited animation; unknown targets are dropped, values clamped."""
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    slide = _slide_at_index(slides, slide_index)
    composition = await _composition(id, build_export_cookie_header(request))
    entry = _entries_by_slide(composition).get(str(slide.id)) or {}
    try:
        animations.set_user_animation(
            slide, entry, [tween.model_dump() for tween in body.tweens]
        )
    except animations.AnimationValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    sql_session.add(slide)
    await sql_session.commit()
    return _slide_entry(slide, entry)


@SLIDE_ANIMATIONS_ROUTER.delete("/{id}/animations/{slide_index}", status_code=204)
async def delete_animation(
    id: uuid.UUID,
    slide_index: int,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Forget the slide's stored animation."""
    _, slides = await _presentation_with_slides_for_speaker_notes(id, sql_session)
    slide = _slide_at_index(slides, slide_index)
    slide.animation = None
    sql_session.add(slide)
    await sql_session.commit()
    return Response(status_code=204)
