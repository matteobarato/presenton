import asyncio
import uuid

import pytest
from fastapi import HTTPException

from api.v1.ppt.endpoints.outlines import stream_outlines
from api.v1.ppt.endpoints.slide import edit_slide, edit_slide_html
from api.v1.ppt.endpoints.presentation import prepare_presentation, stream_presentation
from constants.presentation import (
    IMPORTED_DECK_REBUILD_MESSAGE,
    IMPORTED_OUTLINE_CHAT_MESSAGE,
    IMPORTED_SLIDE_CHAT_MESSAGE,
)
from models.presentation_outline_model import SlideOutlineModel
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from services.pptx_import.guards import ensure_not_imported
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


def test_ensure_not_imported_allows_template_deck():
    ensure_not_imported(_presentation(None))


def test_chat_save_slide_not_refused_for_template_deck():
    p = _presentation(None)
    memory = PresentationChatMemoryLayer(_session(p), p.id)
    result = asyncio.run(
        memory.save_slide(
            content={}, layout_id="x", index=0, replace_old_slide_at_index=True
        )
    )
    assert result["message"] != IMPORTED_SLIDE_CHAT_MESSAGE


def test_edit_slide_refuses_imported_deck():
    p = _presentation("pptx")
    slide = SlideModel(
        id=uuid.uuid4(), presentation=p.id, layout_group="g", layout="l",
        index=0, content={},
    )
    session = FakeAsyncSession({slide.id: slide, p.id: p})
    _assert_409(edit_slide(slide.id, "make it shorter", session))


def test_edit_slide_html_refuses_imported_deck():
    p = _presentation("pptx")
    slide = SlideModel(
        id=uuid.uuid4(), presentation=p.id, layout_group="g", layout="l",
        index=0, content={}, html_content="<div></div>",
    )
    session = FakeAsyncSession({slide.id: slide, p.id: p})
    _assert_409(edit_slide_html(slide.id, "make it shorter", None, session))


def _outline_deck(source):
    p = _presentation(source)
    p.outlines = {"slides": [{"content": "# One"}, {"content": "# Two"}]}
    return p


def _outline_calls(memory):
    return {
        "add": (lambda: memory.add_outline(content="# New"), "saved"),
        "update": (lambda: memory.update_outline(index=0, content="# Renamed"), "saved"),
        "delete": (lambda: memory.delete_outline(index=0), "deleted"),
        "move": (lambda: memory.move_outline(from_index=0, to_index=1), "saved"),
    }


def test_chat_outline_tools_refuse_imported_deck():
    p = _outline_deck("pptx")
    before = p.outlines
    memory = PresentationChatMemoryLayer(_session(p), p.id)
    for name, (call, flag) in _outline_calls(memory).items():
        result = asyncio.run(call())
        assert result == {flag: False, "message": IMPORTED_OUTLINE_CHAT_MESSAGE}, name
    assert p.outlines == before


def test_chat_outline_tools_not_refused_for_template_deck():
    p = _outline_deck(None)
    memory = PresentationChatMemoryLayer(_session(p), p.id)
    for name in ("add", "update"):
        call, flag = _outline_calls(memory)[name]
        result = asyncio.run(call())
        assert result[flag] is True, name
        assert result["message"] != IMPORTED_OUTLINE_CHAT_MESSAGE
