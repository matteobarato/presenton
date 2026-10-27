import asyncio
import os

import pypdfium2 as pdfium
import pytest

from utils.pdf_to_images import (
    MAX_RENDER_SCALE,
    _DEFAULT_MAX_RENDER_SCALE,
    _max_render_scale_from_env,
    PdfRenderError,
    RenderedPage,
    pdf_page_count,
    render_pdf_to_pngs,
    render_pdf_to_pngs_async,
)


def _make_pdf(path: str, page_count: int, width: float = 1280, height: float = 720) -> None:
    """Build a tiny multi-page PDF fixture at known page dimensions (in points)."""

    document = pdfium.PdfDocument.new()
    try:
        for _ in range(page_count):
            document.new_page(width, height)
        document.save(path)
    finally:
        document.close()


def test_pdf_page_count(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=5)

    assert pdf_page_count(pdf_path) == 5


def test_default_scale_renders_at_native_size(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=1, width=1280, height=720)
    out_dir = str(tmp_path / "out")

    pages = render_pdf_to_pngs(pdf_path, out_dir)

    assert len(pages) == 1
    assert pages[0].width == 1280
    assert pages[0].height == 720


def test_target_height_scales_proportionally(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=1, width=1280, height=720)
    out_dir = str(tmp_path / "out")

    pages = render_pdf_to_pngs(pdf_path, out_dir, target_height=1080)

    assert pages[0].height == 1080
    assert pages[0].width == 1920


def test_scale_and_target_height_are_mutually_exclusive(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=1)
    out_dir = str(tmp_path / "out")

    with pytest.raises(ValueError):
        render_pdf_to_pngs(pdf_path, out_dir, target_height=1080, scale=2.0)


def test_scale_is_clamped_to_max_render_scale(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=1, width=1280, height=720)
    out_dir = str(tmp_path / "out")

    pages = render_pdf_to_pngs(pdf_path, out_dir, scale=MAX_RENDER_SCALE * 100)

    assert pages[0].height == int(720 * MAX_RENDER_SCALE)


def test_page_indexes_subset_selection(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=5)
    out_dir = str(tmp_path / "out")

    pages = render_pdf_to_pngs(pdf_path, out_dir, page_indexes=[0, 2, 4])

    assert [page.index for page in pages] == [0, 2, 4]
    for page in pages:
        assert os.path.exists(page.path)


def test_page_indexes_out_of_range_raises_pdf_render_error(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=3)
    out_dir = str(tmp_path / "out")

    with pytest.raises(PdfRenderError):
        render_pdf_to_pngs(pdf_path, out_dir, page_indexes=[0, 99])


def test_filenames_are_zero_padded_and_sort_in_page_order(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    page_count = 12
    _make_pdf(pdf_path, page_count=page_count)
    out_dir = str(tmp_path / "out")

    pages = render_pdf_to_pngs(pdf_path, out_dir)

    filenames = [os.path.basename(page.path) for page in pages]
    assert filenames == sorted(filenames)
    assert filenames[0] == "slide-01.png"
    assert filenames[-1] == "slide-12.png"


def test_on_page_callback_fires_once_per_page_and_survives_exceptions(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=3)
    out_dir = str(tmp_path / "out")

    seen: list[RenderedPage] = []

    def on_page(rendered_page: RenderedPage) -> None:
        seen.append(rendered_page)
        raise RuntimeError("progress callback boom")

    pages = render_pdf_to_pngs(pdf_path, out_dir, on_page=on_page)

    assert len(seen) == 3
    assert len(pages) == 3


def test_corrupt_pdf_raises_pdf_render_error(tmp_path):
    pdf_path = str(tmp_path / "corrupt.pdf")
    with open(pdf_path, "wb") as f:
        f.write(b"not actually a pdf")
    out_dir = str(tmp_path / "out")

    with pytest.raises(PdfRenderError):
        render_pdf_to_pngs(pdf_path, out_dir)


def test_nonexistent_pdf_raises_pdf_render_error(tmp_path):
    out_dir = str(tmp_path / "out")

    with pytest.raises(PdfRenderError):
        render_pdf_to_pngs(str(tmp_path / "missing.pdf"), out_dir)


def test_async_wrapper_returns_same_result(tmp_path):
    pdf_path = str(tmp_path / "deck.pdf")
    _make_pdf(pdf_path, page_count=4)
    sync_out_dir = str(tmp_path / "sync_out")
    async_out_dir = str(tmp_path / "async_out")

    sync_pages = render_pdf_to_pngs(pdf_path, sync_out_dir)
    async_pages = asyncio.run(render_pdf_to_pngs_async(pdf_path, async_out_dir))

    assert [(p.index, p.width, p.height) for p in sync_pages] == [
        (p.index, p.width, p.height) for p in async_pages
    ]
    assert len(async_pages) == 4


def test_max_render_scale_env_falls_back_when_unusable(monkeypatch):
    """docker-compose's ${VAR:-} form exports an empty string, not an unset var.

    Parsing that eagerly used to raise at import time and take the server down
    on boot, so every unusable value must fall back to the default instead.
    """
    for raw in ("", "   ", "not-a-number", "0", "-2.5"):
        monkeypatch.setenv("PDF_TO_IMAGES_MAX_RENDER_SCALE", raw)
        assert _max_render_scale_from_env() == _DEFAULT_MAX_RENDER_SCALE

    monkeypatch.delenv("PDF_TO_IMAGES_MAX_RENDER_SCALE", raising=False)
    assert _max_render_scale_from_env() == _DEFAULT_MAX_RENDER_SCALE


def test_max_render_scale_env_honours_a_valid_override(monkeypatch):
    monkeypatch.setenv("PDF_TO_IMAGES_MAX_RENDER_SCALE", "3.5")
    assert _max_render_scale_from_env() == 3.5
