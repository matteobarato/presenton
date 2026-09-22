import asyncio
from types import SimpleNamespace

from api.v1.ppt.endpoints.presentation import _apply_speaker_notes
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from utils.llm_calls.generate_speaker_notes import (
    SPEAKER_NOTE_MAX_CHARACTERS,
    extract_slide_content_text,
    SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS,
    _normalize_note,
    generate_speaker_note,
    generate_speaker_notes,
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


def test_speaker_note_prompt_carries_the_whole_deck_and_marks_the_slide():
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
    assert "Slide 1 (type=title): Cover" in prompt
    # Every other slide contributes its rendered copy, not just its title.
    assert "Cover keynote framing" in prompt
    assert "Slide 2 (type=content): Growth <- the slide you are writing for" in prompt
    assert "Position: 2 of 2" in prompt
    assert "Revenue grew 12%" in prompt
    assert "Focus on the Americas" in prompt
    assert "confident" in prompt
    # The note is written from the rendered copy, never the markup.
    assert "<section" not in prompt
    assert "h-[720px]" not in prompt


def test_speaker_note_prompt_includes_recent_preceding_notes():
    slides = [
        {"title": f"Slide {index}", "slide_type": "content", "html": _smart_slide_html()}
        for index in range(6)
    ]
    messages = get_speaker_note_messages(
        slides=slides,
        index=5,
        deck_title="Annual Review",
        language="English",
        preceding_notes={
            0: "First note",
            2: "Third note",
            3: "Fourth note",
            4: "Fifth note",
            5: "Own note",
        },
    )

    prompt = messages[1].content
    assert "# Notes Already Spoken: START" in prompt
    # Only the three most recent earlier notes, never the slide's own note.
    assert "First note" not in prompt
    assert "Third note" in prompt
    assert "Fifth note" in prompt
    assert "Own note" not in prompt


def test_speaker_note_prompt_without_earlier_notes_omits_the_section():
    prompt = get_speaker_note_messages(
        slides=_outline(),
        index=0,
        deck_title="Annual Review",
        language="English",
        preceding_notes={1: "Later note"},
    )[1].content
    assert "Notes Already Spoken" not in prompt


def test_deck_context_stays_within_its_character_budget():
    slides = [
        {
            "title": f"Slide {index}",
            "slide_type": "content",
            "html": _smart_slide_html(body="detail " * 400),
        }
        for index in range(40)
    ]
    prompt = get_speaker_note_messages(
        slides=slides,
        index=0,
        deck_title="Annual Review",
        language="English",
    )[1].content
    deck_context = prompt.split("# Full Deck: START\n")[1].split(
        "\n# Full Deck: END"
    )[0]
    assert len(deck_context) <= SPEAKER_NOTE_MAX_CONTEXT_CHARACTERS * 1.2


def test_speaker_note_is_clamped_to_the_schema_maximum():
    note = _normalize_note("sentence. " * 200)
    assert len(note) <= SPEAKER_NOTE_MAX_CHARACTERS
    assert note.endswith(".")
    assert _normalize_note("  spaced \n note  ") == "spaced note"
    assert _normalize_note(None) == ""


def test_generate_speaker_note_returns_model_text(monkeypatch):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": "  Open with the revenue trend.  "}

    _patch_client(monkeypatch, fake_generate)

    note = asyncio.run(
        generate_speaker_note(
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
        generate_speaker_notes(
            slides=_outline(),
            deck_title="Annual Review",
            language="English",
        )
    )

    assert len(requested) == 2
    assert notes == {1: "Walk through the growth drivers."}


def test_generate_speaker_notes_feeds_each_batch_the_earlier_notes(monkeypatch):
    slides = [
        {
            "title": f"Slide {index + 1}",
            "slide_type": "content",
            "html": _smart_slide_html(),
        }
        for index in range(4)
    ]
    prompts = {}

    async def fake_generate(_client, _model, **kwargs):
        prompt = kwargs["messages"][1].content
        position = int(prompt.split("Position: ")[1].split(" of ")[0])
        prompts[position] = prompt
        return {"speaker_note": f"Note for slide {position}."}

    _patch_client(monkeypatch, fake_generate)

    notes = asyncio.run(
        generate_speaker_notes(
            slides=slides,
            deck_title="Annual Review",
            language="English",
            known_notes={0: "Pre-existing opener.", 3: "   "},
            concurrency=2,
        )
    )

    assert notes == {
        0: "Note for slide 1.",
        1: "Note for slide 2.",
        2: "Note for slide 3.",
        3: "Note for slide 4.",
    }
    # First batch only knows the note the deck already had.
    assert "Pre-existing opener." in prompts[2]
    assert "Note for slide 1." not in prompts[2]
    # Later batches see what the earlier batch produced, and a slide never sees
    # a note being written concurrently with it.
    assert "Note for slide 2." in prompts[3]
    assert "Note for slide 3." not in prompts[3]
    assert "Note for slide 2." in prompts[4]
    assert "Note for slide 3." not in prompts[4]


def test_generate_speaker_notes_only_targets_requested_slides(monkeypatch):
    async def fake_generate(_client, _model, **_kwargs):
        return {"speaker_note": "Note"}

    _patch_client(monkeypatch, fake_generate)

    notes = asyncio.run(
        generate_speaker_notes(
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
            "is_dark": True,
            "subtitle": None,
        }
    )

    assert text == "Hiring plan Engineering 8 roles Sales 3 roles 11"


def test_template_slides_use_their_structured_content_for_the_prompt():
    slides = [
        {
            "title": "Hiring plan",
            "slide_type": "bulleted-list",
            "content": {"title": "Hiring plan", "items": [{"body": "8 roles"}]},
        },
        {
            "title": "Budget",
            "slide_type": "chart",
            "content": {"title": "Budget", "total": "2.4M"},
        },
    ]
    prompt = get_speaker_note_messages(
        slides=slides,
        index=0,
        deck_title="Plan",
        language="English",
    )[1].content

    assert "Slide 1 (type=bulleted-list): Hiring plan <- the slide you are writing for" in prompt
    assert "Slide 2 (type=chart): Budget" in prompt
    assert "2.4M" in prompt
    assert "8 roles" in prompt
