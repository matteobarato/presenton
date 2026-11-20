"""Persisted entrance-animation plans for Template-v2 slides.

The only reader and writer of `SlideModel.animation`. A plan is stored as

    {"version": 1, "source": "llm" | "fallback" | "user", "html_hash": ...,
     "targets_signature": ..., "tweens": [SlideTween.to_dict()],
     "reset_from_user": bool, "updated_at": ISO 8601}

and compared with the slide's current video composition (Next.js
`/api/video-composition/{id}`) to decide whether it still applies:

| status          | llm / fallback plan | user plan                                  |
|-----------------|---------------------|--------------------------------------------|
| fresh           | keep                | keep                                       |
| stale_content   | re-plan             | keep: re-validate, update `html_hash`      |
| stale_layout    | re-plan             | re-plan, set `reset_from_user: true`       |
| missing         | plan                | -                                          |
| unsupported     | skip                | skip                                       |

`force` re-plans every in-scope slide, hand-edited ones included. Plans in the
legacy `videos/{id}/animation-plans.json` cache are adopted (read-only) when the
slide has no stored plan and the cached `html_hash` still matches.
"""

from __future__ import annotations

import copy
import hashlib
import inspect
import json
import logging
import os
import uuid
from typing import Any, Callable, Iterable, Literal, Optional, Sequence

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from utils.asset_directory_utils import get_videos_directory
from utils.datetime_utils import get_current_utc_datetime
from utils.export_utils import get_next_app_url
from utils.llm_calls.generate_slide_animations import (
    SLIDE_ANIMATION_MAX_SECONDS,
    SlideTween,
    fallback_slide_animation,
    generate_slide_animations,
    validate_slide_animation,
)

LOGGER = logging.getLogger(__name__)

PlanStatus = Literal["fresh", "stale_content", "stale_layout", "missing", "unsupported"]
PlanSource = Literal["llm", "fallback", "user"]
ProgressCallback = Callable[[dict[str, Any]], Any]

PLAN_VERSION = 1
PROGRESS_STAGE = "animation-plan"
LEGACY_PLAN_CACHE_FILENAME = "animation-plans.json"
_COMPOSITION_FETCH_TIMEOUT_SECONDS = 120.0
_SOURCES = ("llm", "fallback", "user")


class AnimatedVideoUnavailableError(RuntimeError):
    """Raised when an animated render cannot be made; the still render is used."""


class AnimationValidationError(ValueError):
    """Raised when a hand-edited plan cannot be stored."""


async def _fetch_video_composition(
    presentation_id: uuid.UUID, cookie_header: Optional[str]
) -> dict[str, Any]:
    url = f"{get_next_app_url().rstrip('/')}/api/video-composition/{presentation_id}"
    headers = {"x-export-cookie": cookie_header} if cookie_header else {}
    async with httpx.AsyncClient(timeout=_COMPOSITION_FETCH_TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers=headers)
    if response.status_code != 200:
        raise AnimatedVideoUnavailableError(
            f"Slide HTML for the animated video could not be loaded "
            f"(HTTP {response.status_code})"
        )
    data = response.json()
    if not isinstance(data, dict) or not isinstance(data.get("slides"), list):
        raise AnimatedVideoUnavailableError("Slide HTML response was malformed")
    return data


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def html_hash(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


def targets_signature(elements: Sequence[dict[str, Any]]) -> str:
    """sha256 of the ordered `[id, kind]` list; boxes and text do not count."""
    pairs = [[str(element.get("id")), str(element.get("kind"))] for element in elements]
    return hashlib.sha256(json.dumps(pairs).encode("utf-8")).hexdigest()


def _entry_html(entry: dict[str, Any]) -> Optional[str]:
    html = entry.get("html")
    return html if isinstance(html, str) and html else None


def _entry_elements(entry: dict[str, Any]) -> list[dict[str, Any]]:
    elements = entry.get("elements")
    return [e for e in elements if isinstance(e, dict)] if isinstance(elements, list) else []


def _element_ids(elements: Iterable[dict[str, Any]]) -> list[str]:
    return [str(element["id"]) for element in elements if element.get("id")]


def _is_plan(stored: Any) -> bool:
    return (
        isinstance(stored, dict)
        and stored.get("source") in _SOURCES
        and isinstance(stored.get("html_hash"), str)
        and isinstance(stored.get("tweens"), list)
    )


def plan_status(stored: Optional[dict[str, Any]], entry: dict[str, Any]) -> PlanStatus:
    html = _entry_html(entry)
    if html is None:
        return "unsupported"
    if not _is_plan(stored):
        return "missing"
    if stored["html_hash"] == html_hash(html):
        return "fresh"
    if stored.get("targets_signature") != targets_signature(_entry_elements(entry)):
        return "stale_layout"
    return "stale_content"


def _build_plan(
    *,
    source: PlanSource,
    entry: dict[str, Any],
    tweens: Sequence[SlideTween] | Sequence[dict[str, Any]],
    reset_from_user: bool,
) -> dict[str, Any]:
    return {
        "version": PLAN_VERSION,
        "source": source,
        "html_hash": html_hash(_entry_html(entry) or ""),
        "targets_signature": targets_signature(_entry_elements(entry)),
        "tweens": [t.to_dict() if isinstance(t, SlideTween) else dict(t) for t in tweens],
        "reset_from_user": bool(reset_from_user),
        "updated_at": get_current_utc_datetime().isoformat(),
    }


def _flatten_tweens(tweens: Any) -> list[Any]:
    """Stored shape (`from_values`) to the validator's raw, flat shape."""
    if not isinstance(tweens, list):
        return []
    flat: list[Any] = []
    for tween in tweens:
        if not isinstance(tween, dict):
            continue
        from_values = tween.get("from_values")
        flat.append(
            {
                **(from_values if isinstance(from_values, dict) else {}),
                "target": tween.get("target"),
                "duration": tween.get("duration"),
                "delay": tween.get("delay"),
                "ease": tween.get("ease"),
            }
        )
    return flat


def _validate_stored_tweens(tweens: Any, entry: dict[str, Any]) -> list[SlideTween]:
    return validate_slide_animation(
        _flatten_tweens(tweens),
        _element_ids(_entry_elements(entry)),
        max_seconds=SLIDE_ANIMATION_MAX_SECONDS,
    )


def set_user_animation(
    slide: SlideModel, entry: dict[str, Any], tweens: list[dict[str, Any]]
) -> dict[str, Any]:
    """Validate a hand-edited plan and store it on `slide` (not committed).

    An empty list is valid and means "no animation". Raises
    `AnimationValidationError` when the slide cannot be animated, or when
    tweens were sent and none survive validation.
    """
    if _entry_html(entry) is None:
        raise AnimationValidationError("This slide cannot be animated")
    validated = _validate_stored_tweens(tweens, entry)
    if tweens and not validated:
        raise AnimationValidationError(
            "None of the tweens target an element of this slide"
        )
    plan = _build_plan(source="user", entry=entry, tweens=validated, reset_from_user=False)
    slide.animation = plan
    return plan


# ---------------------------------------------------------------------------
# Resolve
# ---------------------------------------------------------------------------


def _legacy_cache(presentation_id: uuid.UUID) -> dict[str, Any]:
    path = os.path.join(
        get_videos_directory(), str(presentation_id), LEGACY_PLAN_CACHE_FILENAME
    )
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _adopt_legacy(cached: Any, entry: dict[str, Any]) -> Optional[dict[str, Any]]:
    html = _entry_html(entry)
    if html is None or not isinstance(cached, dict) or cached.get("html_hash") != html_hash(html):
        return None
    try:
        tweens = [SlideTween.from_dict(item) for item in cached.get("tweens") or []]
    except (KeyError, TypeError, ValueError, AttributeError):
        return None
    return _build_plan(source="llm", entry=entry, tweens=tweens, reset_from_user=False)


async def _emit(on_progress: Optional[ProgressCallback], done: int, total: int) -> None:
    if on_progress is None:
        return
    try:
        result = on_progress({"stage": PROGRESS_STAGE, "done": done, "total": total})
        if inspect.isawaitable(result):
            await result
    except Exception:
        LOGGER.warning("slide animation on_progress callback raised", exc_info=True)


async def resolve_slide_animations(
    sql_session: AsyncSession,
    presentation: PresentationModel,
    cookie_header: Optional[str],
    *,
    slide_ids: Optional[Iterable[uuid.UUID]] = None,
    force: bool = False,
    on_progress: Optional[ProgressCallback] = None,
    composition: Optional[dict[str, Any]] = None,
    stored_only: bool = False,
) -> dict[uuid.UUID, dict[str, Any]]:
    """Plan missing and stale slides (all in scope with `force`) and store them.

    With `stored_only` nothing is planned: slides keep the plan made at
    generation or editing time (a plan whose layout changed is left out).

    Returns the stored plan of every in-scope slide that has one. Composition
    fetch errors propagate; an LLM failure becomes a `fallback` plan.
    """
    if composition is None:
        composition = await _fetch_video_composition(presentation.id, cookie_header)
    entries = {
        str(entry.get("id")): entry
        for entry in composition.get("slides") or []
        if isinstance(entry, dict)
    }
    slides = list(
        await sql_session.scalars(
            select(SlideModel)
            .where(SlideModel.presentation == presentation.id)
            .order_by(SlideModel.index)
        )
    )
    scope = {str(slide_id) for slide_id in slide_ids} if slide_ids is not None else None
    legacy: Optional[dict[str, Any]] = None

    in_scope: list[tuple[int, SlideModel, dict[str, Any]]] = []
    for position, slide in enumerate(slides):
        if scope is not None and str(slide.id) not in scope:
            continue
        entry = entries.get(str(slide.id))
        if entry is None or _entry_html(entry) is None:
            continue
        in_scope.append((position, slide, entry))

    # Nothing is assigned until the end: the LLM call can take a while, and a
    # hand edit (PUT) or clear committed meanwhile must not be overwritten.
    snapshots = {slide.id: copy.deepcopy(slide.animation) for _, slide, _ in in_scope}
    writes: dict[int, tuple[SlideModel, dict[str, Any]]] = {}
    to_plan: dict[int, tuple[SlideModel, dict[str, Any], bool]] = {}
    for position, slide, entry in in_scope:
        stored = slide.animation
        if stored is None and not force:
            if legacy is None:
                legacy = _legacy_cache(presentation.id)
            adopted = _adopt_legacy(legacy.get(str(slide.id)), entry)
            if adopted is not None:
                writes[position] = (slide, adopted)
                continue

        status = plan_status(stored, entry)
        previous_reset = bool(stored.get("reset_from_user")) if _is_plan(stored) else False
        if force:
            # An explicit regenerate: nothing is lost silently, so no flag.
            to_plan[position] = (slide, entry, False)
        elif status == "fresh":
            continue
        elif status == "stale_content" and stored["source"] == "user":
            validated = _validate_stored_tweens(stored["tweens"], entry)
            writes[position] = (
                slide,
                _build_plan(
                    source="user",
                    entry=entry,
                    tweens=validated,
                    reset_from_user=previous_reset,
                ),
            )
        elif status == "stale_layout" and stored["source"] == "user":
            to_plan[position] = (slide, entry, True)
        else:
            to_plan[position] = (slide, entry, previous_reset)

    unplanned: set[uuid.UUID] = set()
    if stored_only:
        unplanned = {
            slide.id
            for slide, entry, _ in to_plan.values()
            if plan_status(slide.animation, entry) == "stale_layout"
        }
        to_plan = {}

    total = len(in_scope)
    done = total - len(to_plan)
    await _emit(on_progress, done, total)

    if to_plan:
        generated = await generate_slide_animations(
            slides=[(position, _entry_elements(entry)) for position, (_, entry, _) in to_plan.items()],
            slide_count=len(slides),
            deck_title=presentation.title or "",
        )
        for position, (slide, entry, reset_from_user) in to_plan.items():
            tweens = generated.get(position) or []
            elements = _entry_elements(entry)
            is_fallback = bool(tweens) and tweens == fallback_slide_animation(elements)
            writes[position] = (
                slide,
                _build_plan(
                    source="fallback" if is_fallback else "llm",
                    entry=entry,
                    tweens=tweens,
                    reset_from_user=reset_from_user,
                ),
            )

    if writes:
        # Nothing is pending yet: end the read transaction, so the re-read
        # below sees edits committed meanwhile (MySQL's REPEATABLE READ would
        # otherwise keep returning the snapshot taken before the LLM call).
        await sql_session.commit()
    changed = False
    for position in sorted(writes):
        slide, plan = writes[position]
        # Re-read: a slide whose stored animation changed since it was read
        # (edited or cleared by hand meanwhile) keeps the newer value.
        await sql_session.refresh(slide, ["animation"])
        if slide.animation != snapshots[slide.id]:
            LOGGER.info("slide %s animation changed while planning; kept", slide.id)
        else:
            slide.animation = plan
            sql_session.add(slide)
            changed = True

    if changed:
        await sql_session.commit()
    if to_plan:
        # After the commit: the progress callback writes through its own session.
        await _emit(on_progress, total, total)

    return {
        slide.id: slide.animation
        for _, slide, _ in in_scope
        if _is_plan(slide.animation)
        and slide.id not in unplanned
    }
