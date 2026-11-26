import asyncio
import uuid

import pytest
from fastapi import HTTPException

from api.v1.ppt.endpoints.outlines import stream_outlines
from api.v1.ppt.endpoints.presentation import prepare_presentation, stream_presentation
from constants.presentation import IMPORTED_DECK_REBUILD_MESSAGE, IMPORTED_SLIDE_CHAT_MESSAGE
from models.presentation_outline_model import SlideOutlineModel
from models.sql.presentation import PresentationModel, PresentationVersion
from services.chat.memory_layer import PresentationChatMemoryLayer
from tests.conftest import FakeAsyncSession


def _presentation(source):
    return PresentationModel(
        id=uuid.uuid4(),
        version=PresentationVersion.V1_STANDARD,
        content="deck",
        n_slides=1,
        language="English",
        title="Deck",
        source=source,
    )


def _session(p):
    return FakeAsyncSession({p.id: p})


def _assert_409(coro):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(coro)
    assert exc.value.status_code == 409
    assert exc.value.detail == IMPORTED_DECK_REBUILD_MESSAGE


def test_stream_outlines_refuses_imported_deck():
    p = _presentation("pptx")
    _assert_409(stream_outlines(p.id, None, _session(p)))


def test_prepare_presentation_refuses_imported_deck():
    p = _presentation("pptx")
    outlines = [SlideOutlineModel(content="x")]
    _assert_409(prepare_presentation(p.id, outlines, "general", None, _session(p)))


def test_stream_presentation_refuses_imported_deck():
    p = _presentation("pptx")
    _assert_409(stream_presentation(p.id, _session(p)))


def test_chat_save_slide_refuses_imported_deck():
    p = _presentation("pptx")
    memory = PresentationChatMemoryLayer(_session(p), p.id)
    for replace in (True, False):
        result = asyncio.run(
            memory.save_slide(
                content={}, layout_id="x", index=0, replace_old_slide_at_index=replace
            )
        )
        assert result == {
            "saved": False,
            "message": IMPORTED_SLIDE_CHAT_MESSAGE,
            "validation_errors": [],
        }
