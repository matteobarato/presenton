import asyncio
import uuid
from datetime import datetime
from typing import Any

import pytest
from fastapi import HTTPException

import api.v1.ppt.endpoints.presentation as presentation_endpoint
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from tests.conftest import FakeAsyncSession


class SlideAsyncSession(FakeAsyncSession):
    def __init__(self, get_results=None, slides=None):
        super().__init__(get_results=get_results)
        self._slides = list(slides or [])

    async def scalars(self, *_args: Any, **_kwargs: Any):
        return list(self._slides)


def _presentation(presentation_id: uuid.UUID) -> PresentationModel:
    return PresentationModel(
        id=presentation_id,
        content="Annual review",
        n_slides=3,
        language="English",
        title="Annual Review",
        layout=None,
        fonts=None,
        include_title_slide=True,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def _smart_slide(presentation_id, index, title, note=None):
    return SlideModel(
        presentation=presentation_id,
        layout_group="smart-html",
        layout="smart-html",
        index=index,
        content={"title": title},
        html_content=(
            f'<section data-slide-type="content" class="relative h-[720px] '
            f'w-[1280px] overflow-hidden"><h1>{title}</h1><p>ARR up 34%</p></section>'
        ),
        speaker_note=note,
    )


def _template_slide(presentation_id, index, title, note=None):
    return SlideModel(
        presentation=presentation_id,
        layout_group="general",
        layout="bulleted-list",
        index=index,
        content={"title": title, "items": [{"heading": "Hiring", "body": "8 roles"}]},
        speaker_note=note,
    )


def _call(session, presentation_id, **kwargs):
    return asyncio.run(
        presentation_endpoint.generate_presentation_speaker_notes(
            id=presentation_id, sql_session=session, **kwargs
        )
    )


def _patch_notes(monkeypatch, notes, captured=None):
    async def fake_notes(**kwargs):
        if captured is not None:
            captured.update(kwargs)
        return notes

    monkeypatch.setattr(
        presentation_endpoint, "generate_speaker_notes", fake_notes
    )


def test_speaker_notes_endpoint_requires_an_existing_presentation():
    presentation_id = uuid.uuid4()
    with pytest.raises(HTTPException) as error:
        _call(SlideAsyncSession(), presentation_id)
    assert error.value.status_code == 404


def test_speaker_notes_endpoint_rejects_a_deck_without_slides():
    presentation_id = uuid.uuid4()
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)}, slides=[]
    )
    with pytest.raises(HTTPException) as error:
        _call(session, presentation_id)
    assert error.value.status_code == 400
    assert "no slides" in error.value.detail


def test_speaker_notes_endpoint_rejects_unknown_slide_indexes():
    presentation_id = uuid.uuid4()
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)},
        slides=[_smart_slide(presentation_id, 0, "Cover")],
    )
    with pytest.raises(HTTPException) as error:
        _call(session, presentation_id, slide_indexes=[0, 7])
    assert error.value.status_code == 422
    assert "7" in error.value.detail


def test_speaker_notes_endpoint_fills_only_missing_notes(monkeypatch):
    presentation_id = uuid.uuid4()
    slides = [
        _smart_slide(presentation_id, 0, "Cover", "Existing opener."),
        _smart_slide(presentation_id, 1, "Revenue"),
        _template_slide(presentation_id, 2, "Next steps"),
    ]
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)}, slides=slides
    )
    captured: dict[str, Any] = {}
    _patch_notes(monkeypatch, {1: "Revenue note.", 2: "Closing note."}, captured)

    response = _call(session, presentation_id)

    assert captured["indexes"] == [1, 2]
    assert captured["known_notes"] == {0: "Existing opener."}
    assert captured["deck_title"] == "Annual Review"
    # Both generation modes contribute their own copy to the deck context.
    assert captured["slides"][1]["html"].startswith("<section")
    assert captured["slides"][2]["content"]["items"][0]["body"] == "8 roles"
    assert captured["slides"][2]["slide_type"] == "bulleted-list"
    assert [slide.speaker_note for slide in response.slides] == [
        "Existing opener.",
        "Revenue note.",
        "Closing note.",
    ]
    assert session.commit_count == 1


def test_speaker_notes_endpoint_regenerates_existing_notes(monkeypatch):
    presentation_id = uuid.uuid4()
    slides = [
        _smart_slide(presentation_id, 0, "Cover", "Existing opener."),
        _smart_slide(presentation_id, 1, "Revenue", "Existing revenue note."),
    ]
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)}, slides=slides
    )
    captured: dict[str, Any] = {}
    _patch_notes(monkeypatch, {0: "New opener.", 1: "New revenue note."}, captured)

    response = _call(session, presentation_id, regenerate=True)

    assert captured["indexes"] == [0, 1]
    # Nothing is fed back as context when every note is being rewritten.
    assert captured["known_notes"] == {}
    assert [slide.speaker_note for slide in response.slides] == [
        "New opener.",
        "New revenue note.",
    ]


def test_speaker_notes_endpoint_maps_slide_indexes_to_deck_positions(monkeypatch):
    presentation_id = uuid.uuid4()
    # A deck with a gap in its slide indexes still targets the right slide.
    slides = [
        _smart_slide(presentation_id, 0, "Cover"),
        _smart_slide(presentation_id, 4, "Revenue"),
        _smart_slide(presentation_id, 9, "Next"),
    ]
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)}, slides=slides
    )
    captured: dict[str, Any] = {}
    _patch_notes(monkeypatch, {2: "Closing note."}, captured)

    response = _call(session, presentation_id, slide_indexes=[9])

    assert captured["indexes"] == [2]
    assert [slide.speaker_note for slide in response.slides] == [
        None,
        None,
        "Closing note.",
    ]


def test_speaker_notes_endpoint_skips_the_commit_when_nothing_changes(monkeypatch):
    presentation_id = uuid.uuid4()
    slides = [_smart_slide(presentation_id, 0, "Cover", "Existing opener.")]
    session = SlideAsyncSession(
        get_results={presentation_id: _presentation(presentation_id)}, slides=slides
    )

    async def fail(**_kwargs):
        raise AssertionError("no speaker note generation expected")

    monkeypatch.setattr(presentation_endpoint, "generate_speaker_notes", fail)

    response = _call(session, presentation_id)

    assert session.commit_count == 0
    assert response.slides[0].speaker_note == "Existing opener."
