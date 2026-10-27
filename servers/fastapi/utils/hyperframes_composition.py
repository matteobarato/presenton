"""Build the HyperFrames project for an animated presentation video.

One composition holds every animated slide back to back. Each slide is a
timed `.clip` section whose length is only its entrance window, not its full
on-screen time. The narration-length hold after the entrance is a still frame,
and ffmpeg extends it far more cheaply than a browser can capture it (see
`build_animated_ffmpeg_args` in the video service). The slide HTML is the
Template-v2 fragment the PDF export renders, scaled from its 1280x720 layout
to the output resolution, so the last frame of every entrance is the exported
slide.

The GSAP code is generated here from validated tween data
(`utils/llm_calls/generate_slide_animations.py`); nothing in the composition is
written by the LLM. Every asset the slides reference that lives on this
server (images, fonts, chart scripts) is copied into the project, so the
render reads only local files and never goes through the app's authenticated
asset routes.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import logging
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional, Sequence
from urllib.parse import unquote, urlparse

from utils.asset_directory_utils import resolve_app_path_to_filesystem
from utils.llm_calls.generate_slide_animations import ANIMATION_PROPERTIES, SlideTween

LOGGER = logging.getLogger(__name__)

COMPOSITION_ID = "deck"
SLIDE_WIDTH = 1280
SLIDE_HEIGHT = 720

_ATTRIBUTE_URL = re.compile(r'(\s(?:src|href|xlink:href)=")([^"]*)(")')
_CSS_URL = re.compile(r"url\(\s*(&quot;|\"|')?(.*?)(?:&quot;|\"|')?\s*\)")
_LOCAL_PREFIXES = ("/app_data/", "/static/", "/vendor/")

AssetResolver = Callable[[str], Optional[str]]


@dataclass
class CompositionSlide:
    """One slide's slot in the composition, in composition seconds."""

    slide_index: int
    html: str
    start_seconds: float
    duration_seconds: float
    tweens: Sequence[SlideTween] = field(default_factory=list)
    # Where the slide's entrance is anchored on the timeline. The slot itself
    # may open slightly earlier (see `build_composition_slides`), so tween
    # delays are counted from here rather than from `start_seconds`.
    timeline_start_seconds: Optional[float] = None

    @property
    def anchor_seconds(self) -> float:
        if self.timeline_start_seconds is None:
            return self.start_seconds
        return self.timeline_start_seconds


def _nextjs_public_root() -> Path:
    return Path(__file__).resolve().parents[2] / "nextjs" / "public"


def resolve_local_asset(url: str) -> Optional[str]:
    """Filesystem path for an asset this server hosts, or None if it is remote.

    `/app_data/` paths go through the same ownership check the asset routes
    apply, so a slide can only pull in files its owner could open.
    """
    if not url or url.startswith(("data:", "blob:", "#")):
        return None
    parsed = urlparse(url)
    path = unquote(parsed.path) if parsed.scheme in ("http", "https", "file") else url
    if not path.startswith(_LOCAL_PREFIXES):
        return None
    if path.startswith("/vendor/"):
        root = _nextjs_public_root().resolve()
        candidate = (root / path.lstrip("/")).resolve()
        if root in candidate.parents and candidate.is_file():
            return str(candidate)
        return None
    return resolve_app_path_to_filesystem(path)


class _AssetCollector:
    def __init__(self, assets_dir: str, resolver: AssetResolver):
        self.assets_dir = assets_dir
        self.resolver = resolver
        self.copied: dict[str, str] = {}
        self.unresolved: set[str] = set()

    def local_reference(self, raw_url: str) -> Optional[str]:
        url = html_lib.unescape(raw_url).strip()
        if url in self.copied:
            return self.copied[url]
        source = self.resolver(url)
        if source is None:
            if urlparse(url).path.startswith(_LOCAL_PREFIXES):
                self.unresolved.add(url)
            return None
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:20]
        extension = os.path.splitext(source)[1].lower()
        if not re.fullmatch(r"\.[a-z0-9]{1,8}", extension):
            extension = ""
        name = f"{digest}{extension}"
        destination = os.path.join(self.assets_dir, name)
        if not os.path.exists(destination):
            os.makedirs(self.assets_dir, exist_ok=True)
            shutil.copyfile(source, destination)
        reference = f"assets/{name}"
        self.copied[url] = reference
        return reference

    def rewrite(self, markup: str) -> str:
        def attribute(match: re.Match[str]) -> str:
            reference = self.local_reference(match.group(2))
            if reference is None:
                return match.group(0)
            return f"{match.group(1)}{reference}{match.group(3)}"

        def css(match: re.Match[str]) -> str:
            reference = self.local_reference(match.group(2))
            if reference is None:
                return match.group(0)
            # Unquoted: the reference is hex plus an extension, and a quote
            # here could close the style attribute this url() sits in.
            return f"url({reference})"

        return _CSS_URL.sub(css, _ATTRIBUTE_URL.sub(attribute, markup))


def localize_assets(markup: str, assets_dir: str, resolver: AssetResolver = resolve_local_asset) -> str:
    collector = _AssetCollector(assets_dir, resolver)
    rewritten = collector.rewrite(markup)
    for url in sorted(collector.unresolved):
        LOGGER.warning("animated video: could not localize slide asset %s", url)
    return rewritten


def scope_slide_targets(markup: str, slide_index: int) -> str:
    """Make the fragment's `e{n}` ids unique across the whole composition."""
    return markup.replace('data-hf-el="e', f'data-hf-el="s{slide_index}-e')


def target_selector(slide_index: int, target: str) -> str:
    return f'[data-hf-el="s{slide_index}-{target}"]'


def _tween_vars(tween: SlideTween) -> tuple[dict[str, object], dict[str, object]]:
    from_vars: dict[str, object] = {}
    to_vars: dict[str, object] = {}
    for name, value in tween.from_values.items():
        if name not in ANIMATION_PROPERTIES:
            continue
        neutral = ANIMATION_PROPERTIES[name][2]
        if name == "blur":
            from_vars["filter"] = f"blur({value:g}px)"
            to_vars["filter"] = "blur(0px)"
        else:
            from_vars[name] = value
            to_vars[name] = neutral
    to_vars["duration"] = tween.duration
    to_vars["ease"] = tween.ease
    return from_vars, to_vars


def timeline_entries(slides: Sequence[CompositionSlide]) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for slide in slides:
        for tween in slide.tweens:
            from_vars, to_vars = _tween_vars(tween)
            if not from_vars:
                continue
            entries.append(
                {
                    "sel": target_selector(slide.slide_index, tween.target),
                    "from": from_vars,
                    "to": to_vars,
                    "at": round(slide.anchor_seconds + tween.delay, 4),
                }
            )
    return entries


def _script_json(value: object) -> str:
    return json.dumps(value, separators=(",", ":")).replace("</", "<\\/")


def timeline_script(entries: Sequence[dict[str, object]], total_seconds: float) -> str:
    # The timeline is registered only once fonts and charts have settled, so
    # HyperFrames never captures a frame of a half-drawn slide.
    return (
        "(function(){"
        f"var entries={_script_json(list(entries))};"
        "var tl=gsap.timeline({paused:true});"
        "entries.forEach(function(e){var el=document.querySelectorAll(e.sel);"
        "if(el.length)tl.fromTo(el,e.from,e.to,e.at)});"
        f"tl.set({{}},{{}},{total_seconds:.4f});"
        "function register(){window.__timelines=window.__timelines||{};"
        f"window.__timelines[{_script_json(COMPOSITION_ID)}]=tl}}"
        "function chartsSettled(){var c=window.__PRESENTON_JSON_CHARTS__;"
        "return !c||c.status!==\"pending\"}"
        "var fonts=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();"
        "fonts.then(function(){(function wait(){if(chartsSettled())register();"
        "else setTimeout(wait,50)})()})"
        "})();"
    )


def _seconds(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def build_composition_html(
    slides: Sequence[CompositionSlide],
    *,
    width: int,
    height: int,
    chart_scripts: Optional[str] = None,
) -> str:
    total_seconds = sum(slide.duration_seconds for slide in slides)
    scale = width / SLIDE_WIDTH
    sections = "".join(
        f'<section id="s{slide.slide_index}" class="clip" '
        f'data-start="{_seconds(slide.start_seconds)}" '
        f'data-duration="{_seconds(slide.duration_seconds)}" data-track-index="0">'
        f'<div class="hf-slide">{scope_slide_targets(slide.html, slide.slide_index)}</div>'
        "</section>"
        for slide in slides
    )
    return (
        "<!doctype html>\n"
        '<html lang="en"><head><meta charset="UTF-8">'
        f'<meta name="viewport" content="width={width}, height={height}">'
        '<script src="vendor/gsap.min.js"></script>'
        "<style>"
        "html,body{margin:0;background:#000}"
        "body{font-family:Arial,Helvetica,sans-serif}"
        "*,*::before,*::after{box-sizing:border-box}"
        f"#root{{position:relative;width:{width}px;height:{height}px;overflow:hidden;background:#fff}}"
        "#root>.clip{position:absolute;inset:0;overflow:hidden}"
        f".hf-slide{{position:absolute;left:0;top:0;width:{SLIDE_WIDTH}px;height:{SLIDE_HEIGHT}px;"
        f"transform-origin:0 0;transform:scale({scale:g})}}"
        "</style></head><body>"
        f'<div id="root" data-composition-id="{COMPOSITION_ID}" data-start="0" '
        f'data-duration="{_seconds(total_seconds)}" data-width="{width}" data-height="{height}">'
        f"{sections}</div>"
        f"{chart_scripts or ''}"
        f"<script>{timeline_script(timeline_entries(slides), total_seconds)}</script>"
        "</body></html>\n"
    )


def write_hyperframes_project(
    project_dir: str,
    slides: Sequence[CompositionSlide],
    *,
    width: int,
    height: int,
    gsap_path: str,
    chart_scripts: Optional[str] = None,
    resolver: AssetResolver = resolve_local_asset,
) -> str:
    """Write `index.html`, GSAP and every local asset into `project_dir`."""
    os.makedirs(os.path.join(project_dir, "vendor"), exist_ok=True)
    shutil.copyfile(gsap_path, os.path.join(project_dir, "vendor", "gsap.min.js"))
    markup = build_composition_html(
        slides, width=width, height=height, chart_scripts=chart_scripts
    )
    markup = localize_assets(markup, os.path.join(project_dir, "assets"), resolver)
    index_path = os.path.join(project_dir, "index.html")
    with open(index_path, "w", encoding="utf-8") as handle:
        handle.write(markup)
    return index_path
