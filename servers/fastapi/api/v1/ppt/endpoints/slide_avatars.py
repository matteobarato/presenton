import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.ppt.endpoints.presentation import (
    _presentation_with_slides_for_speaker_notes,
    _slide_at_index,
)
from models.slide_avatar_generation import PlaceholderRequest, PlaceholderResponse
from services.database import get_async_session
from services.slide_video_service import (
    InvalidStageBoxError,
    SlideVideoNotSupportedError,
    remove_slide_placeholder,
    set_video_placeholder,
)

SLIDE_AVATARS_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])


@SLIDE_AVATARS_ROUTER.post(
    "/{id}/videos/{slide_index}/placeholder", response_model=PlaceholderResponse
)
async def put_slide_placeholder(
    id: uuid.UUID,
    slide_index: int,
    body: PlaceholderRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Mark a slide as one that gets an avatar, before it has any video.

    Adds the placeholder in the bottom-right corner, or moves the one the slide
    has when coordinates are given. Only template slides can hold one.
    """
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
