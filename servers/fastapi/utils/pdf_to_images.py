"""Rasterize an exported presentation PDF into per-slide PNG frames.

Presenton exports a deck to PDF through a headless Chromium render where each
slide is pinned to a fixed 1280x720 CSS-pixel page (see
`app/(export)/pdf-maker/PdfMakerPage.tsx`), so the PDF's page order is the
deck's slide order and every page has the same size. The video pipeline needs
those pages as individual image frames it can hand to ffmpeg, so this module
exists to turn "one PDF" into "N ordered PNGs on disk" without ever holding
more than one page's pixels in memory at a time - a 60-slide deck rendered at
a few times native resolution would otherwise be tens to hundreds of
megabytes of decoded RGB held all at once, and video generation is already the
most memory-hungry path in this app.

Filenames are zero-padded to the page count's width (e.g. "slide-001.png")
specifically so a naive lexicographic sort - which is what ffmpeg's concat and
glob demuxers use - reproduces slide order without the caller needing to sort
by anything smarter.

Uses pypdfium2, which is already an installed dependency of pdfplumber. Do not
add PyMuPDF: it is AGPL-licensed and incompatible with this repository's
Apache-2.0 license.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

import pypdfium2 as pdfium

from utils.runtime_limits import log_memory

LOGGER = logging.getLogger(__name__)

# Ceiling on the effective render scale, regardless of how a caller arrives at
# it (explicit `scale`, or a `target_height` divided by a small native page
# height). Without this, a caller-supplied target_height could ask for an
# arbitrarily large bitmap per page and exhaust memory on the box doing the
# rendering. Overridable via env for deployments that know their own limits.
_DEFAULT_MAX_RENDER_SCALE = 8.0


def _max_render_scale_from_env() -> float:
    """Read the ceiling, tolerating an unset, empty or malformed value.

    Deployments set this through docker-compose's `${VAR:-}` form, which
    exports an empty string rather than leaving the variable unset. Parsing
    that eagerly would raise at import time and take the whole server down on
    boot over a value nobody meant to supply, so anything unusable falls back
    to the default instead.
    """
    raw = (os.getenv("PDF_TO_IMAGES_MAX_RENDER_SCALE") or "").strip()
    if not raw:
        return _DEFAULT_MAX_RENDER_SCALE
    try:
        value = float(raw)
    except ValueError:
        LOGGER.warning(
            "Ignoring unparseable PDF_TO_IMAGES_MAX_RENDER_SCALE=%r; using %s",
            raw,
            _DEFAULT_MAX_RENDER_SCALE,
        )
        return _DEFAULT_MAX_RENDER_SCALE
    if value <= 0:
        LOGGER.warning(
            "Ignoring non-positive PDF_TO_IMAGES_MAX_RENDER_SCALE=%r; using %s",
            raw,
            _DEFAULT_MAX_RENDER_SCALE,
        )
        return _DEFAULT_MAX_RENDER_SCALE
    return value


MAX_RENDER_SCALE = _max_render_scale_from_env()


class PdfRenderError(RuntimeError):
    """Raised when a PDF cannot be opened, or a page in it fails to render.

    Covers a missing/unreadable file, a corrupt or password-protected PDF, an
    out-of-range page index, and any failure pdfium raises while rasterizing a
    specific page - callers only need to catch one exception type to know the
    render did not produce a usable frame.
    """


@dataclass
class RenderedPage:
    """One rasterized PDF page, and the metadata a video pipeline needs about it."""

    index: int
    path: str
    width: int
    height: int


def pdf_page_count(pdf_path: str) -> int:
    """Return the number of pages in the PDF at `pdf_path`.

    Split out from `render_pdf_to_pngs` because callers (e.g. a task that
    reports progress as "page X of N") often need the total before rendering
    starts, and opening the document just to count pages is cheap compared to
    rendering any of them.
    """

    document = _open_document(pdf_path)
    try:
        return len(document)
    finally:
        document.close()


def render_pdf_to_pngs(
    pdf_path: str,
    output_directory: str,
    *,
    target_height: int | None = None,
    scale: float | None = None,
    page_indexes: Sequence[int] | None = None,
    filename_prefix: str = "slide",
    on_page: Optional[Callable[[RenderedPage], None]] = None,
) -> list[RenderedPage]:
    """Render each page of `pdf_path` to its own PNG file in `output_directory`.

    Pages are rendered and written one at a time, and the bitmap for a page is
    released before the next page is rasterized, so peak memory is bounded by
    a single page's pixels rather than growing with the number of slides.

    `target_height` and `scale` are mutually exclusive: `target_height` is the
    ergonomic option (pass 720/1080/1440 and get that pixel height regardless
    of the PDF's native page size in points), while `scale` is the direct
    pdfium scale factor for callers that already know what they want. Passing
    neither renders at native size (scale 1.0). Whatever the effective scale
    works out to, it is clamped to `MAX_RENDER_SCALE` so a caller cannot
    accidentally request a frame large enough to OOM the box rendering it.

    `page_indexes`, if given, restricts rendering to those 0-based pages (in
    the order given) instead of the whole document; an index outside the
    document's range raises `PdfRenderError`. Output filenames are always
    zero-padded to the width of the full document's page count (not just the
    subset rendered), so a partial render's filenames still sort consistently
    with a full one.

    `on_page`, if given, is called after each page is written with that page's
    `RenderedPage`. It is a progress hook, not part of the render's success
    path: if it raises, the exception is logged and rendering continues.
    """

    if target_height is not None and scale is not None:
        raise ValueError("target_height and scale are mutually exclusive")

    os.makedirs(output_directory, exist_ok=True)

    document = _open_document(pdf_path)
    try:
        total_pages = len(document)
        if total_pages <= 0:
            raise PdfRenderError(f"PDF has no pages: {pdf_path}")

        indexes = _resolve_page_indexes(page_indexes, total_pages)
        pad_width = len(str(total_pages))

        log_memory(
            LOGGER,
            "pdf.render.start",
            pdf_path=pdf_path,
            total_pages=total_pages,
            pages_requested=len(indexes),
        )

        rendered: list[RenderedPage] = []
        try:
            for index in indexes:
                rendered_page = _render_single_page(
                    document=document,
                    index=index,
                    output_directory=output_directory,
                    filename_prefix=filename_prefix,
                    pad_width=pad_width,
                    target_height=target_height,
                    scale=scale,
                )
                rendered.append(rendered_page)
                if on_page is not None:
                    try:
                        on_page(rendered_page)
                    except Exception:
                        LOGGER.exception(
                            "pdf.render.on_page callback failed for page %s",
                            rendered_page.index,
                        )
        finally:
            log_memory(
                LOGGER,
                "pdf.render.finish",
                pdf_path=pdf_path,
                pages_rendered=len(rendered),
            )

        return rendered
    finally:
        document.close()


async def render_pdf_to_pngs_async(
    pdf_path: str,
    output_directory: str,
    *,
    target_height: int | None = None,
    scale: float | None = None,
    page_indexes: Sequence[int] | None = None,
    filename_prefix: str = "slide",
    on_page: Optional[Callable[[RenderedPage], None]] = None,
) -> list[RenderedPage]:
    """Async wrapper around `render_pdf_to_pngs`, for callers on an event loop.

    pdfium's rendering is synchronous, CPU-bound C code with no async
    equivalent, so this simply runs the sync function in a worker thread via
    `asyncio.to_thread` rather than blocking the caller's event loop for the
    duration of a (potentially multi-second, multi-page) render. This is the
    entry point the video service is expected to call.
    """

    return await asyncio.to_thread(
        render_pdf_to_pngs,
        pdf_path,
        output_directory,
        target_height=target_height,
        scale=scale,
        page_indexes=page_indexes,
        filename_prefix=filename_prefix,
        on_page=on_page,
    )


def _open_document(pdf_path: str) -> "pdfium.PdfDocument":
    try:
        return pdfium.PdfDocument(pdf_path)
    except PdfRenderError:
        raise
    except Exception as error:
        raise PdfRenderError(f"Failed to open PDF at {pdf_path}: {error}") from error


def _resolve_page_indexes(
    page_indexes: Sequence[int] | None, total_pages: int
) -> list[int]:
    if page_indexes is None:
        return list(range(total_pages))

    resolved = list(page_indexes)
    for index in resolved:
        if index < 0 or index >= total_pages:
            raise PdfRenderError(
                f"Page index {index} out of range for document with {total_pages} pages"
            )
    return resolved


def _effective_scale(
    page: "pdfium.PdfPage",
    target_height: int | None,
    scale: float | None,
) -> float:
    if target_height is not None:
        native_height_pt = page.get_height()
        if native_height_pt <= 0:
            raise PdfRenderError("Page has non-positive native height")
        effective = target_height / native_height_pt
    elif scale is not None:
        effective = scale
    else:
        effective = 1.0

    if effective <= 0:
        raise ValueError("Effective render scale must be positive")

    return min(effective, MAX_RENDER_SCALE)


def _render_single_page(
    document: "pdfium.PdfDocument",
    index: int,
    output_directory: str,
    filename_prefix: str,
    pad_width: int,
    target_height: int | None,
    scale: float | None,
) -> RenderedPage:
    filename = f"{filename_prefix}-{str(index + 1).zfill(pad_width)}.png"
    output_path = os.path.join(output_directory, filename)

    page = None
    bitmap = None
    pil_image = None
    try:
        page = document.get_page(index)
        effective_scale = _effective_scale(page, target_height, scale)
        bitmap = page.render(scale=effective_scale)
        pil_image = bitmap.to_pil()
        pil_image.save(output_path, format="PNG")
        width, height = pil_image.size
    except (PdfRenderError, ValueError):
        raise
    except Exception as error:
        raise PdfRenderError(f"Failed to render page {index}: {error}") from error
    finally:
        if pil_image is not None:
            pil_image.close()
        if bitmap is not None:
            bitmap.close()
        if page is not None:
            page.close()

    return RenderedPage(index=index, path=output_path, width=width, height=height)
