"""Fit slides converted from a PowerPoint deck onto the 1280x720 stage."""

import copy
from typing import Any

from services.slide_video_service import STAGE_HEIGHT, STAGE_WIDTH

_TOLERANCE = 1.0
_DEFAULT_BACKGROUND = "#FFFFFF"

# Numeric values under these keys are lengths in stage pixels. Multipliers and
# ratios (opacity, rotation, line_height, focus_*, crop_scale, tension, ...) are
# deliberately absent.
_LENGTH_KEYS = frozenset(
    {
        "x",
        "y",
        "width",
        "height",
        "size",
        "letter_spacing",
        "tl",
        "tr",
        "bl",
        "br",
        "top",
        "right",
        "bottom",
        "left",
        "gap",
        "marker_gap",
        "column_gap",
        "row_gap",
        "blur",
        "offset_x",
        "offset_y",
    }
)
_LENGTH_LIST_KEYS = frozenset({"dash", "corner_radii"})
# Chart and infographic data is not geometry.
_OPAQUE_KEYS = frozenset({"data", "series", "categories", "values"})


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _num(value: Any, default: float = 0.0) -> float:
    return float(value) if _is_number(value) else default


def _covers_canvas(element: dict[str, Any], width: float, height: float) -> bool:
    if element.get("type") == "vector":
        points = element.get("points")
        if not isinstance(points, list) or not points:
            return False
        xs = [_num(p.get("x"), float("nan")) for p in points if isinstance(p, dict)]
        ys = [_num(p.get("y"), float("nan")) for p in points if isinstance(p, dict)]
        if not xs or any(v != v for v in xs + ys):
            return False
        return (
            min(xs) <= _TOLERANCE
            and min(ys) <= _TOLERANCE
            and max(xs) >= width - _TOLERANCE
            and max(ys) >= height - _TOLERANCE
        )
    position, size = element.get("position"), element.get("size")
    if not isinstance(position, dict) or not isinstance(size, dict):
        return False
    return (
        abs(_num(position.get("x"), 1e9)) <= _TOLERANCE
        and abs(_num(position.get("y"), 1e9)) <= _TOLERANCE
        and _num(size.get("width")) >= width - _TOLERANCE
        and _num(size.get("height")) >= height - _TOLERANCE
    )


def slide_background_color(elements: list[dict], width: float, height: float) -> str:
    """Fill of the bottom-most element covering the whole source canvas."""
    for element in elements:
        fill = element.get("fill") if isinstance(element, dict) else None
        color = fill.get("color") if isinstance(fill, dict) else None
        if isinstance(color, str) and color and _covers_canvas(element, width, height):
            return color
    return _DEFAULT_BACKGROUND


def _scale_value(value: Any, scale: float) -> Any:
    if isinstance(value, dict):
        return _scale_dict(value, scale)
    if isinstance(value, list):
        return [_scale_value(item, scale) for item in value]
    return value


def _scale_dict(node: dict[str, Any], scale: float) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in _OPAQUE_KEYS:
            out[key] = copy.deepcopy(value)
        elif key in _LENGTH_KEYS and _is_number(value):
            out[key] = round(value * scale, 2)
        elif key in _LENGTH_LIST_KEYS and isinstance(value, list):
            out[key] = [
                round(item * scale, 2) if _is_number(item) else item for item in value
            ]
        else:
            out[key] = _scale_value(value, scale)
    return out


def _shift(point: Any, dx: float, dy: float) -> Any:
    if not isinstance(point, dict):
        return point
    moved = dict(point)
    if _is_number(moved.get("x")):
        moved["x"] = round(moved["x"] + dx, 2)
    if _is_number(moved.get("y")):
        moved["y"] = round(moved["y"] + dy, 2)
    return moved


def fit_slide_to_stage(elements: list[dict], width: float, height: float) -> list[dict]:
    """Scale `elements` to fit the stage, centred, behind a background band.

    Child positions are parent-relative, so lengths scale at every depth but the
    centring offset moves only top-level elements. Returns new dicts.
    """
    if (
        abs(height - STAGE_HEIGHT) <= _TOLERANCE
        and abs(width - STAGE_WIDTH) <= _TOLERANCE
    ):
        return copy.deepcopy(elements)

    scale = min(STAGE_WIDTH / width, STAGE_HEIGHT / height)
    dx = (STAGE_WIDTH - width * scale) / 2
    dy = (STAGE_HEIGHT - height * scale) / 2

    fitted: list[dict] = []
    for element in elements:
        scaled = _scale_dict(element, scale)
        if isinstance(scaled.get("points"), list):
            scaled["points"] = [_shift(p, dx, dy) for p in scaled["points"]]
        if isinstance(scaled.get("position"), dict):
            scaled["position"] = _shift(scaled["position"], dx, dy)
        fitted.append(scaled)

    band = {
        "type": "vector",
        "shape": "polygon",
        "points": [
            {"x": 0, "y": 0},
            {"x": STAGE_WIDTH, "y": 0},
            {"x": STAGE_WIDTH, "y": STAGE_HEIGHT},
            {"x": 0, "y": STAGE_HEIGHT},
        ],
        "closed": True,
        "fill": {"color": slide_background_color(elements, width, height)},
        "decorative": True,
    }
    return [band, *fitted]
