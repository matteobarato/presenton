import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pptx import Presentation
from pptx.util import Emu, Inches

from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER, import_presentation
from models.presentation_import import ImportPresentationRequest
from models.sql.presentation import PresentationModel
from services.export_task_service import PptxToJsonDocument
from services.slide_video_service import (
    PRESENTER_SLOT_ASPECT,
    default_placeholder_box,
    find_video_placeholder,
    find_video_placeholder_box,
)

from tests.conftest import FakeAsyncSession

SERVICE = "services.pptx_import.service"


class _ImportSession(FakeAsyncSession):
    async def refresh(self, obj):
        if isinstance(obj, PresentationModel):
            now = datetime.now()
            obj.created_at = obj.created_at or now
            obj.updated_at = obj.updated_at or now


@pytest.fixture
def session() -> _ImportSession:
    return _ImportSession()


def _text(name: str, text: str, *, x=100.0, y=100.0, width=600.0, height=80.0):
    return {
        "type": "text",
        "position": {"x": x, "y": y},
        "size": {"width": width, "height": height},
        "runs": [{"text": text}],
        "decorative": False,
        "name": name,
        "max_length": 200,
        "min_length": 1,
    }


def _background(width: float, height: float, color: str):
    return {
        "type": "vector",
        "points": [
            {"x": 0, "y": 0},
            {"x": width, "y": 0},
            {"x": width, "y": height},
            {"x": 0, "y": height},
        ],
        "closed": True,
        "fill": {"color": color},
    }


def _layouts(count: int, *, width=1280.0, height=720.0, color="#FFFFFF"):
    return {
        "layouts": [
            {
                "id": f"slide_{n}",
                "description": f"Full slide layout converted from PPTX slide {n}.",
                "elements": [
                    _background(width, height, color),
                    _text("Title", f"Slide {n} title"),
                ],
            }
            for n in range(1, count + 1)
        ]
    }


def _deck(tmp_path, count: int, *, notes=None, four_by_three=False) -> str:
    prs = Presentation()
    if four_by_three:
        prs.slide_width, prs.slide_height = Inches(10), Inches(7.5)
    else:
        prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
    for i in range(count):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        if notes and i < len(notes) and notes[i]:
            slide.notes_slide.notes_text_frame.text = notes[i]
    path = tmp_path / "upload.pptx"
    prs.save(str(path))
    return str(path)


def _run_import(
    session,
    *,
    pptx_path,
    layouts,
    selector=None,
    **request_fields,
):
    request = ImportPresentationRequest(
        pptx_url="/app_data/uploads/upload.pptx",
        language=request_fields.pop("language", "English"),
        **request_fields,
    )
    selector = selector or AsyncMock(return_value=[])
    with patch(
        f"{SERVICE}.resolve_app_path_to_filesystem", return_value=pptx_path
    ), patch(
        f"{SERVICE}.EXPORT_TASK_SERVICE.convert_pptx_to_json",
        new=AsyncMock(return_value=PptxToJsonDocument(**layouts)),
    ), patch(f"{SERVICE}.select_presenter_slides", new=selector):
        return asyncio.run(import_presentation(request, sql_session=session))


def _slot_indexes(presentation) -> list[int]:
    return [
        slide.index
        for slide in presentation.slides
        if find_video_placeholder(slide.ui) is not None
    ]


def test_import_creates_editable_slides_with_notes(tmp_path, session):
    notes = ["Open warmly.", "Walk through numbers.", "Close with the ask."]
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 3, notes=notes),
        layouts=_layouts(3),
        n_videos=0,
        source_name="Q3 Review.pptx",
        fonts={"Inter": "/app_data/fonts/inter.ttf"},
    )

    assert presentation.source == "pptx"
    assert presentation.source_name == "Q3 Review.pptx"
    assert presentation.title == "Q3 Review"
    assert presentation.n_slides == 3
    assert presentation.fonts == {"Inter": "/app_data/fonts/inter.ttf"}
    assert [slide.index for slide in presentation.slides] == [0, 1, 2]
    for slide, note in zip(presentation.slides, notes):
        assert slide.layout_group == "blank"
        assert slide.layout == "__blank_slide__"
        assert slide.content == {}
        assert slide.ui["elements"]
        assert slide.speaker_note == note
    assert session.commit_count == 1
    assert len(session.added) == 1 and len(session.added_all) == 3

    route = next(
        r
        for r in PRESENTATION_ROUTER.routes
        if r.path == "/presentation/import" and "POST" in r.methods
    )
    assert route.status_code == 201


def test_explicit_count_spreads_bottom_right_slots(tmp_path, session):
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 12),
        layouts=_layouts(12),
        n_videos=3,
    )

    assert _slot_indexes(presentation) == [0, 6, 11]
    expected = default_placeholder_box(*PRESENTER_SLOT_ASPECT)
    for index in (0, 6, 11):
        assert find_video_placeholder_box(presentation.slides[index].ui) == expected


def test_automatic_uses_ai_choice(tmp_path, session):
    selector = AsyncMock(return_value=[0, 2, 4])
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 5, notes=["Hello there."]),
        layouts=_layouts(5),
        selector=selector,
        n_videos=None,
        title="Launch Plan",
    )

    assert _slot_indexes(presentation) == [0, 2, 4]
    selector.assert_awaited_once()
    slides_arg = selector.await_args.args[0]
    assert slides_arg == [
        {"text": f"Slide {n} title", "note": "Hello there." if n == 1 else ""}
        for n in range(1, 6)
    ]
    assert selector.await_args.kwargs == {"deck_title": "Launch Plan"}


def test_zero_videos_adds_no_slots(tmp_path, session):
    selector = AsyncMock(return_value=[0, 1])
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 4),
        layouts=_layouts(4),
        selector=selector,
        n_videos=0,
    )

    assert _slot_indexes(presentation) == []
    selector.assert_not_awaited()


def _bottom(element: dict) -> float:
    if isinstance(element.get("points"), list):
        return max(point["y"] for point in element["points"])
    return element["position"]["y"] + element["size"]["height"]


def test_4x3_deck_is_fitted(tmp_path, session):
    layouts = _layouts(1, width=1280, height=960, color="#123456")
    layouts["layouts"][0]["elements"].append(
        _text("Footer", "Bottom line", y=850, height=100)
    )
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 1, four_by_three=True),
        layouts=layouts,
        n_videos=0,
    )

    ui = presentation.slides[0].ui
    assert ui["background"] == "#123456"
    assert all(_bottom(element) <= 720 for element in ui["elements"])
    band = ui["elements"][0]
    assert band["type"] == "vector"
    assert band["fill"] == {"color": "#123456"}
    assert [(p["x"], p["y"]) for p in band["points"]] == [
        (0, 0),
        (1280, 0),
        (1280, 720),
        (0, 720),
    ]


def test_missing_file_is_404(session):
    with pytest.raises(HTTPException) as exc_info:
        _run_import(session, pptx_path=None, layouts=_layouts(1))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "PowerPoint file not found. Upload it again."
    assert session.added == []


def test_empty_deck_is_400(tmp_path, session):
    with pytest.raises(HTTPException) as exc_info:
        _run_import(
            session,
            pptx_path=_deck(tmp_path, 0),
            layouts={"layouts": []},
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "The PowerPoint has no slides."
    assert session.added == []


def test_invalid_converter_output_is_500(tmp_path, session):
    with pytest.raises(HTTPException) as exc_info:
        _run_import(
            session,
            pptx_path=_deck(tmp_path, 1),
            layouts={"layouts": [{"id": "slide_1", "elements": []}]},
        )

    assert exc_info.value.status_code == 500
    assert (
        exc_info.value.detail
        == "PPTX-to-JSON export produced invalid slide layout JSON"
    )


def test_deck_over_50_slides_is_capped(tmp_path, session):
    presentation = _run_import(
        session,
        pptx_path=_deck(tmp_path, 55),
        layouts=_layouts(55),
        n_videos=0,
    )

    assert presentation.n_slides == 50
    assert len(presentation.slides) == 50
    assert presentation.slides[-1].ui["id"] == "slide_50"


def test_notes_failure_does_not_fail_import(tmp_path, session):
    with patch(
        f"{SERVICE}.read_speaker_notes", side_effect=RuntimeError("corrupt notes")
    ):
        presentation = _run_import(
            session,
            pptx_path=_deck(tmp_path, 2, notes=["a", "b"]),
            layouts=_layouts(2),
            n_videos=0,
        )

    assert [slide.speaker_note for slide in presentation.slides] == ["", ""]
