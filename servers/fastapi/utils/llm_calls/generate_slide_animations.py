"""Entrance animations for Template-v2 slides in an exported video.

The LLM decides how each element of a slide enters: which elements move, in
what order, from where, and with what easing. It never writes code. It
returns a list of tweens in a fixed JSON shape, and `validate_slide_animation`
turns that into a plan that can only describe what the video composition
knows how to render safely: known targets, an allow-list of properties with
clamped ranges, a fixed set of eases, and a hard limit on how long the
entrance may run. The composition then writes the GSAP code itself
(`utils/hyperframes_composition.py`). So text on a slide, which ends up in the
prompt, can never become script running in the server's headless Chrome.

Every tween animates *from* its values to the element's resting layout, so
the last frame of the entrance is always the slide exactly as it exports.

A slide whose plan fails to generate or validate gets `fallback_slide_animation`
(fade up, in reading order) instead of failing the video.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from dataclasses import asdict, dataclass
from typing import Any, Optional, Sequence

from llmai import get_client
from llmai.shared import JSONSchemaResponse, SystemMessage, UserMessage

from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import generate_structured_with_schema_retries

LOGGER = logging.getLogger(__name__)

SLIDE_ANIMATION_CONCURRENCY = 4
# Entrance has to be finished well before the narration is: the slide then
# holds still, which is also what lets the renderer capture only this window.
SLIDE_ANIMATION_MAX_SECONDS = 2.5
SLIDE_ANIMATION_MAX_TWEENS = 24
SLIDE_ANIMATION_MAX_ELEMENTS_IN_PROMPT = 40

ANIMATION_EASES = (
    "power1.out",
    "power2.out",
    "power3.out",
    "power4.out",
    "expo.out",
    "sine.out",
    "circ.out",
    "back.out(1.4)",
)

# (minimum, maximum, neutral) for each "from" property. Values are in slide
# pixels (the 1280x720 layout), degrees, or plain factors.
ANIMATION_PROPERTIES: dict[str, tuple[float, float, float]] = {
    "opacity": (0.0, 1.0, 1.0),
    "x": (-400.0, 400.0, 0.0),
    "y": (-300.0, 300.0, 0.0),
    "scale": (0.3, 1.5, 1.0),
    "rotation": (-30.0, 30.0, 0.0),
    "blur": (0.0, 20.0, 0.0),
}

_MIN_DURATION = 0.2
_MAX_DURATION = 1.2
_FALLBACK_STAGGER = 0.12
_FALLBACK_DURATION = 0.6
# An element covering nearly the whole slide is a background; animating it in
# reads as the slide flashing, so the fallback leaves it still.
_BACKGROUND_COVERAGE = 0.9


@dataclass(frozen=True)
class SlideTween:
    target: str
    from_values: dict[str, float]
    duration: float
    delay: float
    ease: str

    @property
    def end_seconds(self) -> float:
        return self.delay + self.duration

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SlideTween":
        return cls(
            target=str(data["target"]),
            from_values={k: float(v) for k, v in dict(data["from_values"]).items()},
            duration=float(data["duration"]),
            delay=float(data["delay"]),
            ease=str(data["ease"]),
        )


def slide_animation_end_seconds(tweens: Sequence[SlideTween]) -> float:
    return max((tween.end_seconds for tween in tweens), default=0.0)


SLIDE_ANIMATION_SYSTEM_PROMPT = (
    "You are a motion designer animating a presentation slide for a narrated "
    "video. You get the slide's elements (id, kind, position and size on a "
    "1280x720 canvas, and any visible text) and decide how each one enters "
    "when the slide appears. The slide then holds still while the narrator "
    "speaks. "
    "Rules: every tween animates FROM the values you give TO the element's "
    "final position, so give only starting offsets; reveal content in "
    "reading order, title first, then supporting text, then visuals; group "
    "related elements with the same motion and a small stagger; keep "
    "backgrounds and full-slide decorative shapes still by leaving them out; "
    "prefer subtle, professional motion (fades, short slides of 20-80px, "
    "gentle scale from 0.9) over spectacle; never rotate body text; all "
    f"motion must finish within {SLIDE_ANIMATION_MAX_SECONDS} seconds of the "
    "slide appearing. Use null for any property you do not animate."
)

SLIDE_ANIMATION_USER_PROMPT = """# Deck Title:
{deck_title}

# Slide:
Position: {slide_position} of {slide_count}

# Elements (JSON): START
{elements}
# Elements (JSON): END

Return the entrance tweens for this slide. Use only the element ids above.
"""


def _response_schema() -> dict[str, Any]:
    nullable_number = {"type": ["number", "null"]}
    return {
        "type": "object",
        "properties": {
            "tweens": {
                "type": "array",
                "maxItems": SLIDE_ANIMATION_MAX_TWEENS,
                "items": {
                    "type": "object",
                    "properties": {
                        "target": {
                            "type": "string",
                            "description": "Element id, e.g. e0",
                        },
                        "opacity": nullable_number,
                        "x": nullable_number,
                        "y": nullable_number,
                        "scale": nullable_number,
                        "rotation": nullable_number,
                        "blur": nullable_number,
                        "duration": {"type": "number"},
                        "delay": {"type": "number"},
                        "ease": {"type": "string", "enum": list(ANIMATION_EASES)},
                    },
                    "required": [
                        "target",
                        "opacity",
                        "x",
                        "y",
                        "scale",
                        "rotation",
                        "blur",
                        "duration",
                        "delay",
                        "ease",
                    ],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["tweens"],
        "additionalProperties": False,
    }


def _prompt_elements(elements: Sequence[dict[str, Any]]) -> str:
    rows = []
    for element in list(elements)[:SLIDE_ANIMATION_MAX_ELEMENTS_IN_PROMPT]:
        box = element.get("box") or {}
        rows.append(
            {
                "id": element.get("id"),
                "kind": element.get("kind"),
                "x": _round(box.get("x")),
                "y": _round(box.get("y")),
                "width": _round(box.get("width")),
                "height": _round(box.get("height")),
                "text": str(element.get("text") or "")[:200],
            }
        )
    return json.dumps(rows, ensure_ascii=False)


def _round(value: Any) -> Optional[float]:
    number = _finite(value)
    return round(number) if number is not None else None


def _finite(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def validate_slide_animation(
    raw_tweens: Any,
    element_ids: Sequence[str],
    *,
    max_seconds: float = SLIDE_ANIMATION_MAX_SECONDS,
) -> list[SlideTween]:
    """Keep only what the composition can render; clamp everything else.

    Unknown targets and second tweens on the same target are dropped. A tween
    that starts from the resting state on every property would be invisible,
    so it becomes a plain fade. A tween that would run past `max_seconds` is
    pulled earlier, then shortened, rather than dropped.
    """
    known = set(element_ids)
    seen: set[str] = set()
    tweens: list[SlideTween] = []
    if not isinstance(raw_tweens, list):
        return tweens

    for raw in raw_tweens[:SLIDE_ANIMATION_MAX_TWEENS]:
        if not isinstance(raw, dict):
            continue
        target = str(raw.get("target") or "")
        if target not in known or target in seen:
            continue

        from_values: dict[str, float] = {}
        for name, (minimum, maximum, neutral) in ANIMATION_PROPERTIES.items():
            value = _finite(raw.get(name))
            if value is None:
                continue
            value = _clamp(value, minimum, maximum)
            if not math.isclose(value, neutral, abs_tol=1e-6):
                from_values[name] = round(value, 3)
        if not from_values:
            from_values = {"opacity": 0.0}

        duration = _finite(raw.get("duration"))
        duration = _clamp(duration if duration is not None else 0.6, _MIN_DURATION, _MAX_DURATION)
        delay = _finite(raw.get("delay"))
        delay = max(0.0, delay if delay is not None else 0.0)
        duration = min(duration, max_seconds)
        delay = min(delay, max_seconds - duration)

        ease = str(raw.get("ease") or "")
        if ease not in ANIMATION_EASES:
            ease = "power2.out"

        seen.add(target)
        tweens.append(
            SlideTween(
                target=target,
                from_values=from_values,
                duration=round(duration, 3),
                delay=round(delay, 3),
                ease=ease,
            )
        )
    return tweens


def _is_background(element: dict[str, Any], width: float, height: float) -> bool:
    box = element.get("box") or {}
    box_width = _finite(box.get("width")) or 0.0
    box_height = _finite(box.get("height")) or 0.0
    return box_width * box_height >= _BACKGROUND_COVERAGE * width * height


def fallback_slide_animation(
    elements: Sequence[dict[str, Any]],
    *,
    slide_width: float = 1280,
    slide_height: float = 720,
    max_seconds: float = SLIDE_ANIMATION_MAX_SECONDS,
) -> list[SlideTween]:
    """Fade every non-background element up, in reading order."""
    def reading_order(element: dict[str, Any]) -> tuple[float, float]:
        box = element.get("box") or {}
        return (_finite(box.get("y")) or 0.0, _finite(box.get("x")) or 0.0)

    candidates = [
        element
        for element in elements
        if element.get("id") and not _is_background(element, slide_width, slide_height)
    ]
    latest_delay = max(0.0, max_seconds - _FALLBACK_DURATION)
    return [
        SlideTween(
            target=str(element["id"]),
            from_values={"opacity": 0.0, "y": 24.0},
            duration=_FALLBACK_DURATION,
            delay=round(min(position * _FALLBACK_STAGGER, latest_delay), 3),
            ease="power2.out",
        )
        for position, element in enumerate(sorted(candidates, key=reading_order))
    ]


async def generate_slide_animation(
    *,
    elements: Sequence[dict[str, Any]],
    slide_position: int,
    slide_count: int,
    deck_title: str,
) -> list[SlideTween]:
    """Ask the LLM for one slide's entrance and return it validated."""
    client = get_client(config=get_llm_config())
    model = get_model()
    response_schema = _response_schema()
    try:
        response = await generate_structured_with_schema_retries(
            client,
            model,
            messages=[
                SystemMessage(content=SLIDE_ANIMATION_SYSTEM_PROMPT),
                UserMessage(
                    content=SLIDE_ANIMATION_USER_PROMPT.format(
                        deck_title=deck_title.strip() or "Untitled Presentation",
                        slide_position=slide_position,
                        slide_count=slide_count,
                        elements=_prompt_elements(elements),
                    )
                ),
            ],
            response_format=JSONSchemaResponse(
                name="response",
                json_schema=response_schema,
                strict=True,
            ),
            json_schema=response_schema,
            strict=False,
            validate_schema=True,
        )
    except Exception as e:
        raise handle_llm_client_exceptions(e)
    return validate_slide_animation(
        (response or {}).get("tweens"),
        [str(element.get("id")) for element in elements if element.get("id")],
    )


async def generate_slide_animations(
    *,
    slides: Sequence[tuple[int, Sequence[dict[str, Any]]]],
    slide_count: int,
    deck_title: str,
    concurrency: int = SLIDE_ANIMATION_CONCURRENCY,
) -> dict[int, list[SlideTween]]:
    """Plan the entrance of every given `(slide_index, elements)` pair.

    Animation is decoration, so a slide whose plan fails or comes back empty
    gets the fallback rather than failing the whole video.
    """
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def plan(index: int, elements: Sequence[dict[str, Any]]) -> list[SlideTween]:
        if not elements:
            return []
        async with semaphore:
            try:
                tweens = await generate_slide_animation(
                    elements=elements,
                    slide_position=index + 1,
                    slide_count=slide_count,
                    deck_title=deck_title,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.warning(
                    "slide animation plan failed for slide %s; using fallback",
                    index,
                    exc_info=True,
                )
                tweens = []
        return tweens or fallback_slide_animation(elements)

    indexes = [index for index, _ in slides]
    results = await asyncio.gather(*(plan(index, elements) for index, elements in slides))
    return dict(zip(indexes, results))
