import asyncio

from pptx import Presentation

from templates import fonts_and_slides_preview as preview
from templates.fonts_and_slides_preview import (
    FontsUploadAndSlidesPreviewResponse,
    _count_pptx_slides,
)


def _deck(tmp_path, slides: int) -> str:
    prs = Presentation()
    for _ in range(slides):
        prs.slides.add_slide(prs.slide_layouts[6])
    path = tmp_path / "deck.pptx"
    prs.save(str(path))
    return str(path)


def test_counts_slides_in_presentation_xml(tmp_path):
    assert _count_pptx_slides(_deck(tmp_path, slides=3)) == 3


def test_unreadable_file_counts_as_unknown(tmp_path):
    bad = tmp_path / "bad.pptx"
    bad.write_bytes(b"not a zip")
    assert _count_pptx_slides(str(bad)) is None


def test_response_defaults_original_count_to_none():
    response = FontsUploadAndSlidesPreviewResponse(
        slide_image_urls=[], pptx_url="", modified_pptx_url="", fonts={}
    )
    assert response.original_slide_count is None


def test_preview_response_carries_original_count(tmp_path, monkeypatch):
    deck_path = _deck(tmp_path, slides=3)

    class FakeUpload:
        filename = "deck.pptx"

        async def read(self):
            with open(deck_path, "rb") as f:
                return f.read()

    async def fake_fix_fonts(**kwargs):
        return ({}, {}, {}, [], kwargs["pptx_path"], [], [], {}, set(), {})

    async def fake_font_urls(**kwargs):
        return {}

    monkeypatch.setattr(preview, "upload_fonts_and_fix_fonts_in_pptx", fake_fix_fonts)
    monkeypatch.setattr(preview, "_build_upload_preview_font_urls", fake_font_urls)

    work = tmp_path / "work"
    work.mkdir()
    response = asyncio.run(
        preview.upload_fonts_and_preview_handler(
            FakeUpload(),
            max_slides=2,
            upload_fonts=False,
            get_slide_images=False,
            upload_presentation=False,
            temp_dir=str(work),
        )
    )
    assert response.original_slide_count == 3
    assert _count_pptx_slides(response.modified_pptx_url) == 2
