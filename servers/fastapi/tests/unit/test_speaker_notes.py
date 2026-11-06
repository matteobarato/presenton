import asyncio
from types import SimpleNamespace

import pytest

from api.v1.ppt.endpoints.presentation import _apply_speaker_notes
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from utils.llm_calls.generate_speaker_notes import (
    SPEAKER_NOTE_MAX_CHARACTERS,
    extract_slide_content_text,
    SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS,
    _deck_context,
    generate_speaker_note,
    generate_speaker_notes,
)


def _smart_slide_html(title="Slide", slide_type="content", body="Revenue grew 12%"):
    return (
        f'<section data-slide-type="{slide_type}" data-slide-title="{title}" '
        'class="relative h-[720px] w-[1280px] overflow-hidden">'
        f"<h1>{title}</h1><p>{body}</p></section>"
    )


def _outline():
    return [
        {
            "title": "Cover",
            "slide_type": "title",
            "html": _smart_slide_html("Cover", "title", "Cover keynote framing"),
        },
        {"title": "Growth", "slide_type": "content", "html": _smart_slide_html("Growth")},
    ]


def _patch_client(monkeypatch, generate):
    monkeypatch.setattr(
        "utils.llm_calls.generate_speaker_notes.get_client",
        lambda **_kwargs: object(),
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_speaker_notes.get_llm_config",
        lambda **_kwargs: SimpleNamespace(),
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_speaker_notes.get_model",
        lambda: "note-model",
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_speaker_notes."
        "generate_structured_with_schema_retries",
        generate,
    )


def test_deck_context_stays_within_its_character_budget():
    slides = [
        {
            "title": f"Topic-{index:02d}",
            "slide_type": "content",
            "html": _smart_slide_html(body="detail " * 400),
        }
        for index in range(40)
    ]
    context = _deck_context(slides, current_index=38)
    assert len(context) <= SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS
    # Late slides must not disappear when early slides exhaust the budget.
    for index in range(40):
        assert f"Topic-{index:02d}" in context


@pytest.mark.parametrize(
    "value", [None, 42, {"text": "Not narration"}, " \n ", "x" * (SPEAKER_NOTE_MAX_CHARACTERS + 1)]
)
def test_invalid_model_output_is_not_spoken_or_truncated(monkeypatch, value):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": value}

    _patch_client(monkeypatch, fake_generate)
    note = asyncio.run(
        generate_speaker_note(
            slides=_outline(), index=0, deck_title="Review", language="English"
        )
    )
    assert note == ""


@pytest.mark.parametrize("note", ["A short complete thought.", "a" * 499 + "."])
def test_complete_notes_need_no_padding_and_allow_the_length_boundary(monkeypatch, note):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": f"  {note}\n"}

    _patch_client(monkeypatch, fake_generate)
    result = asyncio.run(
        generate_speaker_note(
            slides=_outline(), index=0, deck_title="Review", language="English"
        )
    )
    assert result == note
    assert len(result) <= SPEAKER_NOTE_MAX_CHARACTERS


@pytest.mark.parametrize(
    "verbosity,maximum", [("low", 1000), ("medium", 1800), ("high", 2600), ("very-high", 4500)]
)
def test_note_length_limits_preserve_complete_output_without_truncation(
    monkeypatch, verbosity, maximum
):
    async def generate(value):
        async def fake_generate(_client, _model, **_kwargs):
            return {"speaker_note": value}

        _patch_client(monkeypatch, fake_generate)
        return await generate_speaker_note(
            slides=_outline(), index=0, deck_title="Review",
            language="English", verbosity=verbosity,
        )

    complete = "a" * (maximum - 1) + "."
    assert asyncio.run(generate(complete)) == complete
    assert asyncio.run(generate(complete + "x")) == ""

def test_generate_speaker_notes_skips_slides_that_fail(monkeypatch):
    reviews = []

    async def fake_generate(_client, _model, **kwargs):
        if "notes" in kwargs["json_schema"]["properties"]:
            reviews.append(kwargs["json_schema"]["properties"]["notes"]["required"])
            return {"notes": {"1": "Growth comes from stronger repeat purchases."}}
        prompt = kwargs["messages"][1].content
        if "Position: 1 of 2" in prompt:
            raise RuntimeError("model unavailable")
        return {"speaker_note": "Walk through the growth drivers."}

    _patch_client(monkeypatch, fake_generate)

    notes = asyncio.run(
        generate_speaker_notes(
            slides=_outline(),
            deck_title="Annual Review",
            language="English",
        )
    )

    assert reviews == [["1"]]
    assert notes == {1: "Growth comes from stronger repeat purchases."}


@pytest.mark.parametrize(
    "review",
    [
        {},
        {"notes": {"0": "Only half the deck."}},
        {"notes": {"0": "Changed.", "1": "Changed.", "2": "Unauthorized change."}},
        {"notes": {"0": "Changed.", "1": "   "}},
        {"notes": {"0": "Changed.", "1": 123}},
        {"notes": {"0": "Changed.", "1": "x" * (SPEAKER_NOTE_MAX_CHARACTERS + 1)}},
        RuntimeError("editor unavailable"),
    ],
)
def test_invalid_editorial_result_keeps_all_complete_drafts(monkeypatch, review):
    async def fake_generate(_client, _model, **kwargs):
        if "notes" in kwargs["json_schema"]["properties"]:
            if isinstance(review, Exception):
                raise review
            return review
        return {"speaker_note": "A complete draft that must not be lost."}

    _patch_client(monkeypatch, fake_generate)
    notes = asyncio.run(
        generate_speaker_notes(
            slides=_outline(), deck_title="Review", language="English"
        )
    )
    assert notes == {
        0: "A complete draft that must not be lost.",
        1: "A complete draft that must not be lost.",
    }


def test_editor_cannot_overwrite_unselected_notes(monkeypatch):
    known_notes = {0: "Hand-written opening."}

    async def fake_generate(_client, _model, **kwargs):
        if "notes" in kwargs["json_schema"]["properties"]:
            return {"notes": {"0": "Unwanted rewrite.", "1": "Edited closing."}}
        return {"speaker_note": "Complete closing draft."}

    _patch_client(monkeypatch, fake_generate)
    notes = asyncio.run(
        generate_speaker_notes(
            slides=_outline(),
            deck_title="Review",
            language="English",
            indexes=[1, 1, -1, 5],
            known_notes=known_notes,
        )
    )
    assert notes == {1: "Complete closing draft."}
    assert known_notes == {0: "Hand-written opening."}


def test_cancellation_during_review_propagates(monkeypatch):
    async def fake_generate(_client, _model, **kwargs):
        if "notes" in kwargs["json_schema"]["properties"]:
            raise asyncio.CancelledError
        return {"speaker_note": "Complete narration."}

    _patch_client(monkeypatch, fake_generate)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            generate_speaker_notes(
                slides=_outline(), deck_title="Review", language="English"
            )
        )


def test_generate_speaker_notes_without_targets_makes_no_calls(monkeypatch):
    async def fail(_client, _model, **_kwargs):
        raise AssertionError("no speaker note call expected")

    _patch_client(monkeypatch, fail)

    assert (
        asyncio.run(
            generate_speaker_notes(
                slides=_outline(),
                deck_title="Annual Review",
                language="English",
                indexes=[],
            )
        )
        == {}
    )


def _smart_slide_model(index, title, speaker_note=None):
    return SlideModel(
        presentation="11111111-1111-1111-1111-111111111111",
        layout_group="smart-html",
        layout="smart-html",
        index=index,
        content={"title": title},
        html_content=_smart_slide_html(title, "title" if index == 0 else "content"),
        speaker_note=speaker_note,
    )


def test_apply_speaker_notes_only_fills_missing_notes(monkeypatch):
    slides = [
        _smart_slide_model(0, "Cover", "Existing note"),
        _smart_slide_model(1, "Growth"),
        _smart_slide_model(2, "Closing", "   "),
    ]
    presentation = PresentationModel(
        content="Annual review",
        n_slides=3,
        language="English",
        title="Annual Review",
        layout=None,
        fonts=None,
        include_title_slide=True,
    )
    captured = {}

    async def fake_notes(**kwargs):
        captured.update(kwargs)
        return {1: "Cover the growth drivers.", 2: "Close on next steps."}

    monkeypatch.setattr(
        "api.v1.ppt.endpoints.presentation.generate_speaker_notes",
        fake_notes,
    )

    updated = asyncio.run(
        _apply_speaker_notes(slides, presentation, deck_title="Annual Review")
    )

    assert captured["indexes"] == [1, 2]
    assert captured["known_notes"] == {0: "Existing note"}
    assert captured["language"] == "English"
    assert [slide["slide_type"] for slide in captured["slides"]] == [
        "title",
        "content",
        "content",
    ]
    assert [slide.index for slide in updated] == [1, 2]
    assert slides[0].speaker_note == "Existing note"
    assert slides[1].speaker_note == "Cover the growth drivers."
    assert slides[2].speaker_note == "Close on next steps."


def test_apply_speaker_notes_is_a_noop_when_every_slide_has_one(monkeypatch):
    slides = [_smart_slide_model(0, "Cover", "Existing note")]
    presentation = PresentationModel(
        content="Annual review",
        n_slides=1,
        language="English",
        title="Annual Review",
        layout=None,
        fonts=None,
        include_title_slide=True,
    )

    async def fail(**_kwargs):
        raise AssertionError("no speaker note generation expected")

    monkeypatch.setattr(
        "api.v1.ppt.endpoints.presentation.generate_speaker_notes",
        fail,
    )

    assert (
        asyncio.run(
            _apply_speaker_notes(slides, presentation, deck_title="Annual Review")
        )
        == []
    )


def test_extract_slide_content_text_reads_template_copy_only():
    text = extract_slide_content_text(
        {
            "title": "Hiring plan",
            "items": [
                {"heading": "Engineering", "body": "8 roles"},
                {"heading": "Sales", "body": "3 roles"},
            ],
            "headcount": 11,
            "__image_url__": "https://cdn.example.com/hero.png",
            "__icon_url__": "/static/icons/team.svg",
            "__image_prompt__": "a team working",
            "__speaker_note__": "a stale note",
            "hero": {
                "image_url": "/app_data/images/hero.png",
                "image_prompt": "English art direction, not visible slide copy",
            },
            "card_icon": {
                "icon_url": "/static/icons/team.svg",
                "icon_query": "team collaboration",
            },
            "is_dark": True,
            "subtitle": None,
        }
    )

    assert text == "Hiring plan Engineering 8 roles Sales 3 roles 11"


