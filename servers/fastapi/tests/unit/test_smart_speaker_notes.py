import asyncio
from types import SimpleNamespace

from api.v1.ppt.endpoints.presentation import _apply_smart_speaker_notes
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from utils.llm_calls.generate_smart_speaker_notes import (
    SMART_SPEAKER_NOTE_MAX_CHARACTERS,
    _normalize_note,
    generate_smart_speaker_note,
    generate_smart_speaker_notes,
    get_speaker_note_messages,
)


def _smart_slide_html(title="Slide", slide_type="content", body="Revenue grew 12%"):
    return (
        f'<section data-slide-type="{slide_type}" data-slide-title="{title}" '
        'class="relative h-[720px] w-[1280px] overflow-hidden">'
        f"<h1>{title}</h1><p>{body}</p></section>"
    )


def _outline():
    return [
        {"title": "Cover", "slide_type": "title", "html": _smart_slide_html("Cover", "title")},
        {"title": "Growth", "slide_type": "content", "html": _smart_slide_html("Growth")},
    ]


def _patch_client(monkeypatch, generate):
    monkeypatch.setattr(
        "utils.llm_calls.generate_smart_speaker_notes.get_client",
        lambda **_kwargs: object(),
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_smart_speaker_notes.get_llm_config",
        lambda **_kwargs: SimpleNamespace(),
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_smart_speaker_notes.get_model",
        lambda: "note-model",
    )
    monkeypatch.setattr(
        "utils.llm_calls.generate_smart_speaker_notes."
        "generate_structured_with_schema_retries",
        generate,
    )


def test_speaker_note_prompt_uses_visible_text_and_deck_outline():
    messages = get_speaker_note_messages(
        slides=_outline(),
        index=1,
        deck_title="Annual Review",
        language="English",
        tone="confident",
        instructions="Focus on the Americas",
    )

    prompt = messages[1].content
    assert "Annual Review" in prompt
    assert "- Slide 1: type=title; title=Cover" in prompt
    assert "Position: 2 of 2" in prompt
    assert "Revenue grew 12%" in prompt
    assert "Focus on the Americas" in prompt
    assert "confident" in prompt
    # The note is written from the rendered copy, never the markup.
    assert "<section" not in prompt
    assert "h-[720px]" not in prompt


def test_speaker_note_is_clamped_to_the_schema_maximum():
    note = _normalize_note("sentence. " * 200)
    assert len(note) <= SMART_SPEAKER_NOTE_MAX_CHARACTERS
    assert note.endswith(".")
    assert _normalize_note("  spaced \n note  ") == "spaced note"
    assert _normalize_note(None) == ""


def test_generate_speaker_note_returns_model_text(monkeypatch):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": "  Open with the revenue trend.  "}

    _patch_client(monkeypatch, fake_generate)

    note = asyncio.run(
        generate_smart_speaker_note(
            slides=_outline(),
            index=1,
            deck_title="Annual Review",
            language="English",
        )
    )
    assert note == "Open with the revenue trend."


def test_generate_speaker_notes_skips_slides_that_fail(monkeypatch):
    requested = []

    async def fake_generate(_client, _model, **kwargs):
        prompt = kwargs["messages"][1].content
        requested.append(prompt)
        if "Position: 1 of 2" in prompt:
            raise RuntimeError("model unavailable")
        return {"speaker_note": "Walk through the growth drivers."}

    _patch_client(monkeypatch, fake_generate)

    notes = asyncio.run(
        generate_smart_speaker_notes(
            slides=_outline(),
            deck_title="Annual Review",
            language="English",
        )
    )

    assert len(requested) == 2
    assert notes == {1: "Walk through the growth drivers."}


def test_generate_speaker_notes_only_targets_requested_slides(monkeypatch):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": "Note"}

    _patch_client(monkeypatch, fake_generate)

    notes = asyncio.run(
        generate_smart_speaker_notes(
            slides=_outline(),
            deck_title="Annual Review",
            language="English",
            indexes=[1, 5, -1],
        )
    )
    assert notes == {1: "Note"}


def test_generate_speaker_notes_without_targets_makes_no_calls(monkeypatch):
    async def fail(_client, _model, **_kwargs):
        raise AssertionError("no speaker note call expected")

    _patch_client(monkeypatch, fail)

    assert (
        asyncio.run(
            generate_smart_speaker_notes(
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


def test_apply_smart_speaker_notes_only_fills_missing_notes(monkeypatch):
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
        "api.v1.ppt.endpoints.presentation.generate_smart_speaker_notes",
        fake_notes,
    )

    updated = asyncio.run(
        _apply_smart_speaker_notes(slides, presentation, deck_title="Annual Review")
    )

    assert captured["indexes"] == [1, 2]
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


def test_apply_smart_speaker_notes_is_a_noop_when_every_slide_has_one(monkeypatch):
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
        "api.v1.ppt.endpoints.presentation.generate_smart_speaker_notes",
        fail,
    )

    assert (
        asyncio.run(
            _apply_smart_speaker_notes(slides, presentation, deck_title="Annual Review")
        )
        == []
    )
