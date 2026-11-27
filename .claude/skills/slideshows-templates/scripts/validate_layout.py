#!/usr/bin/env python3
"""Validate Template V2 layouts against the backend's own rules.

Run with the FastAPI virtualenv so the real Pydantic models are used:

    servers/fastapi/.venv/bin/python .claude/skills/slideshows-templates/scripts/validate_layout.py \
        templates/modern/template.json [--layouts id1,id2] [--json report.json]

Input can be a full template.json (bundled shape, or the DB/API shape where
`layouts` is {"layouts": [...]}), a single layout JSON, or a JSON list of layouts.

Exit code: 0 = no errors (warnings allowed), 1 = errors found, 2 = bad input.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator

REPO = Path(__file__).resolve().parents[4]
FASTAPI = REPO / "servers" / "fastapi"
sys.path.insert(0, str(FASTAPI))

try:
    from pydantic import ValidationError
    from templates.v2.models.layouts import MergedComponents, SlideLayout, SlideLayouts
    from templates.v2.schema import get_template_schema
    from services.slide_video_service import find_video_placeholder, presenter_slot_fits
except Exception as exc:  # pragma: no cover - environment problem
    print(
        "Could not import backend modules. Run with servers/fastapi/.venv/bin/python "
        f"(or inside the API container). Import error: {exc}",
        file=sys.stderr,
    )
    sys.exit(2)

STAGE_W, STAGE_H = 1280, 720
TOL = 1.0
PLACEHOLDER_DATA = "/static/images/video-placeholder.png"
PLACEHOLDER_COMPONENT = "video_placeholder"
CONTENT_TYPES = {"text", "text-list", "table", "chart", "infographic", "image"}
FLOW_TYPES = {"flex", "grid"}


# ---------------------------------------------------------------- loading
def load_input(path: Path) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return None, data
    if isinstance(data, dict) and "components" in data and "id" in data:
        return None, [data]
    if isinstance(data, dict) and "layouts" in data:
        layouts = data["layouts"]
        if isinstance(layouts, dict):  # DB/API shape
            layouts = layouts.get("layouts", [])
        mc = data.get("merged_components")
        if isinstance(mc, dict):
            data = {**data, "merged_components": mc.get("components", [])}
        return data, list(layouts or [])
    raise ValueError("Unrecognised JSON: expected template, layout, or list of layouts")


# ---------------------------------------------------------------- walking
def walk(elements: list[Any], ox: float, oy: float, path: str, in_flow: bool = False
         ) -> Iterator[tuple[dict[str, Any], float, float, str, bool]]:
    """Yield (element, abs_x, abs_y, path, inside_flex_or_grid)."""
    for i, el in enumerate(elements or []):
        if not isinstance(el, dict):
            continue
        pos = el.get("position") or {}
        x = ox + float(pos.get("x", 0) or 0)
        y = oy + float(pos.get("y", 0) or 0)
        p = f"{path}[{i}]"
        yield el, x, y, p, in_flow
        t = el.get("type")
        if t == "group":
            yield from walk(el.get("children") or [], x, y, p + ".children", in_flow)
        elif t == "container" and isinstance(el.get("child"), dict):
            pad = el.get("padding") or {}
            yield from walk([el["child"]], x + float(pad.get("left", 0) or 0),
                            y + float(pad.get("top", 0) or 0), p + ".child", in_flow)
        elif t in FLOW_TYPES:
            # Children positions are computed by the flow layout at render time.
            yield from walk(el.get("children") or [], x, y, p + ".children", True)


def layout_nodes(layout: dict[str, Any]):
    for ci, comp in enumerate(layout.get("components") or []):
        cpos = comp.get("position") or {}
        for item in walk(comp.get("elements") or [], float(cpos.get("x", 0)),
                         float(cpos.get("y", 0)), f"components[{ci}:{comp.get('id')}].elements"):
            yield comp, *item


def run_text(el: dict[str, Any]) -> str:
    return "".join(r.get("text", "") for r in el.get("runs") or [] if isinstance(r, dict))


def box(el, x, y):
    size = el.get("size") or {}
    w, h = size.get("width"), size.get("height")
    if not isinstance(w, (int, float)) or not isinstance(h, (int, float)):
        return None
    return (x, y, float(w), float(h))


def overlap(a, b) -> float:
    w = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    h = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


# ---------------------------------------------------------------- checks
class Report:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def add(self, level: str, layout: str, msg: str, where: str = "") -> None:
        self.items.append({"level": level, "layout": layout, "message": msg, "where": where})

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


def theme_palette(template: dict[str, Any] | None) -> set[str]:
    if not template:
        return set()
    colors = ((template.get("theme") or {}).get("colors") or {}).values()
    return {c.upper() for c in colors if isinstance(c, str)}


def check_layout(layout: dict[str, Any], rep: Report, palette: set[str],
                 registered: set[str] | None) -> dict[str, Any]:
    lid = str(layout.get("id", "?"))
    summary: dict[str, Any] = {"id": lid, "editable_fields": [], "avatar": None}

    # 1. Backend model validation (exactly what the API/seeder will do).
    try:
        SlideLayout.model_validate(layout)
    except ValidationError as exc:
        for err in exc.errors()[:15]:
            rep.add("error", lid, f"model: {err['msg']}", ".".join(map(str, err["loc"])))
        return summary

    if not re.fullmatch(r"[a-z0-9_]+", lid):
        rep.add("warning", lid, "layout id should be snake_case ascii (e.g. kpi_grid_avatar_0412)")
    desc = layout.get("description") or ""
    if len(desc) < 40:
        rep.add("warning", lid, "description is short; the layout picker LLM selects layouts by it — "
                "describe structure + purpose (what content fits)")

    # 2. Content schema: what the generator LLM will be asked to fill.
    try:
        schema = get_template_schema({"layouts": [layout]})["layouts"][0]
        props = (schema.get("schema") or schema.get("content_schema") or schema)
        summary["schema"] = props
    except Exception as exc:  # noqa: BLE001
        rep.add("error", lid, f"content schema build failed: {exc}")

    names: dict[str, int] = {}
    placeholders = []
    content_boxes = []
    for comp, el, x, y, path, in_flow in layout_nodes(layout):
        t = el.get("type")
        name = el.get("name")
        editable = t in CONTENT_TYPES and el.get("decorative") is False
        if editable:
            names[name] = names.get(name, 0) + 1
            summary["editable_fields"].append(f"{t}:{name}")
        b = box(el, x, y)

        # bounds
        if b and not in_flow and not el.get("rotation") and t != "vector":
            if b[0] < -TOL or b[1] < -TOL or b[0] + b[2] > STAGE_W + TOL or b[1] + b[3] > STAGE_H + TOL:
                rep.add("error" if editable else "info", lid,
                        f"{t} '{name or ''}' leaves the 1280x720 stage "
                        f"(x={b[0]:.0f}, y={b[1]:.0f}, w={b[2]:.0f}, h={b[3]:.0f})", path)
        if t == "vector":
            for pt in el.get("points") or []:
                px, py = x + pt.get("x", 0), y + pt.get("y", 0)
                if px < -2 or py < -2 or px > STAGE_W + 2 or py > STAGE_H + 2:
                    rep.add("info", lid, "vector point outside stage (fine for bleed shapes)", path)
                    break

        # text hints
        if t == "text":
            text = run_text(el)
            mn, mx = el.get("min_length"), el.get("max_length")
            if not el.get("decorative"):
                if not isinstance(mn, int) or not isinstance(mx, int) or mn > mx or mx <= 0:
                    rep.add("error", lid, f"text '{name}' needs integer min_length <= max_length", path)
                elif not mn <= len(text) <= mx:
                    rep.add("warning", lid, f"text '{name}' sample length {len(text)} outside "
                            f"[{mn},{mx}] — the sample should be realistic content", path)
                if b and isinstance(mx, int):
                    fsize = float((el.get("font") or {}).get("size") or 16)
                    lh = float((el.get("font") or {}).get("line_height") or 1.2)
                    chars_per_line = max(1.0, b[2] / (fsize * 0.55))
                    lines = max(1, int(b[3] // (fsize * lh) + 0.15))
                    capacity = int(chars_per_line * lines)
                    if mx > capacity * 1.1:
                        rep.add("warning", lid,
                                f"text '{name}': max_length {mx} likely overflows its box "
                                f"(~{capacity} chars fit at {fsize:.0f}px, {lines} line(s)); "
                                "confirm with the max-length render", path)
            for r in el.get("runs") or []:
                c = ((r.get("font") or {}).get("color") or "").upper()
                if palette and c and c not in palette:
                    rep.add("info", lid, f"text color {c} is not a theme token (won't retint cleanly)", path)
                    break
        if t == "text-list" and not el.get("decorative"):
            for k in ("max_items", "min_items", "max_item_length", "min_item_length"):
                if not isinstance(el.get(k), int):
                    rep.add("error", lid, f"text-list '{name}' missing {k}", path)
        if t in FLOW_TYPES:
            kids = len(el.get("children") or [])
            if not el.get("min_children", 0) <= kids <= el.get("max_children", 0):
                rep.add("warning", lid, f"{t} '{name}' has {kids} children outside "
                        f"[{el.get('min_children')},{el.get('max_children')}]", path)

        # images / icons
        if t == "image":
            if el.get("video_placeholder") is True:
                placeholders.append((comp, el, b, path))
            if el.get("is_icon") and not el.get("icon_type"):
                rep.add("info", lid, f"icon '{name}' has no icon_type (template default used)", path)
            data = str(el.get("data") or "")
            if el.get("decorative") and data.endswith(".svg") and not el.get("tint") and not el.get("is_icon"):
                rep.add("info", lid, f"decorative SVG '{name or path}' has no color+tint; "
                        "it will not follow theme changes", path)
        if editable and b and t != "image":
            content_boxes.append((t, name, b, path))

    # 3. Avatar / presenter video placeholder contract.
    if len(placeholders) > 1:
        rep.add("error", lid, f"{len(placeholders)} video placeholders; a layout may hold exactly one")
    if placeholders:
        comp, el, b, path = placeholders[0]
        summary["avatar"] = {"box": b, "component": comp.get("id")}
        if find_video_placeholder(layout) is None:
            rep.add("error", lid, "backend find_video_placeholder() does not find the placeholder", path)
        expect = {"name": "avatar_video", "decorative": True, "fit": "cover", "is_icon": False}
        for k, v in expect.items():
            if el.get(k) != v:
                rep.add("error", lid, f"placeholder {k} must be {v!r} (is {el.get(k)!r})", path)
        if el.get("data") != PLACEHOLDER_DATA:
            rep.add("warning", lid, f"placeholder data should be {PLACEHOLDER_DATA}", path)
        if comp.get("id") != PLACEHOLDER_COMPONENT:
            rep.add("error", lid, f"placeholder must sit in its own component with id "
                    f"'{PLACEHOLDER_COMPONENT}' (is '{comp.get('id')}')", path)
        elif len(comp.get("elements") or []) != 1:
            rep.add("error", lid, "the video_placeholder component must contain only the placeholder", path)
        if "presenter avatar video" not in desc.lower():
            rep.add("error", lid, "description must contain 'presenter avatar video' so has_video "
                    "layout selection can find it")
        if b:
            ratio = b[3] / b[2] if b[2] else 0
            if not (1.6 <= ratio <= 1.85 or 0.5 <= ratio <= 0.62 or 0.95 <= ratio <= 1.05):
                rep.add("warning", lid, f"placeholder aspect {b[2]:.0f}x{b[3]:.0f} is not 9:16, "
                        "16:9 or 1:1; avatar video will be cropped heavily", path)
            if b[2] < 200 or b[3] < 200:
                rep.add("warning", lid, "placeholder is small (<200px); the presenter will be hard to see", path)
            for t, name, cb, cpath in content_boxes:
                ov = overlap(b, cb)
                if ov > 0.15 * cb[2] * cb[3]:
                    rep.add("warning", lid, f"{t} '{name}' overlaps the avatar slot "
                            f"({ov / (cb[2] * cb[3]):.0%} of the field) — content would cover the presenter",
                            cpath)
        layer_order = [c.get("id") for c in layout.get("components") or []]
        summary["avatar"]["layer_index"] = layer_order.index(comp.get("id"))
    else:
        if "presenter avatar video" in desc.lower():
            rep.add("error", lid, "description promises a presenter avatar video but no placeholder exists")
        try:
            summary["presenter_corner_free"] = presenter_slot_fits(layout)
        except Exception:  # noqa: BLE001
            pass

    # 4. merged_components registration (bundled templates; editor variant swaps).
    if registered is not None:
        for comp in layout.get("components") or []:
            if comp.get("id") not in registered:
                rep.add("warning", lid, f"component '{comp.get('id')}' not registered in merged_components "
                        "(run tpl.py add/register)")

    if not summary["editable_fields"]:
        rep.add("warning", lid, "layout has no editable content; generation can only reuse it verbatim")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path)
    ap.add_argument("--layouts", help="comma-separated layout ids to check (default: all)")
    ap.add_argument("--json", type=Path, help="write the full report as JSON here")
    ap.add_argument("--quiet", action="store_true", help="print only errors and warnings")
    args = ap.parse_args()

    try:
        template, layouts = load_input(args.input)
    except Exception as exc:  # noqa: BLE001
        print(f"Cannot read {args.input}: {exc}", file=sys.stderr)
        return 2

    rep = Report()
    palette = theme_palette(template)
    registered = None
    if template is not None and template.get("merged_components") is not None:
        try:
            MergedComponents.model_validate({"components": template["merged_components"]})
        except ValidationError as exc:
            rep.add("error", "<template>", f"merged_components invalid: {exc.errors()[0]['msg']}")
        registered = {c.get("id") for c in template["merged_components"]} | {
            v.get("id") for c in template["merged_components"] for v in c.get("variants") or []}
    try:
        SlideLayouts.model_validate({"layouts": layouts})
    except ValidationError as exc:
        for err in exc.errors()[:5]:
            if "unique" in err["msg"]:
                rep.add("error", "<template>", err["msg"])

    wanted = set(args.layouts.split(",")) if args.layouts else None
    summaries = []
    for layout in layouts:
        if wanted and layout.get("id") not in wanted:
            continue
        summaries.append(check_layout(layout, rep, palette, registered))
    if wanted:
        missing = wanted - {s["id"] for s in summaries}
        for m in missing:
            rep.add("error", m, "layout id not found")

    order = {"error": 0, "warning": 1, "info": 2}
    for item in sorted(rep.items, key=lambda i: (i["layout"], order[i["level"]])):
        if args.quiet and item["level"] == "info":
            continue
        where = f"  @ {item['where']}" if item["where"] else ""
        print(f"[{item['level'].upper():7}] {item['layout']}: {item['message']}{where}")
    for s in summaries:
        av = s["avatar"]
        av_txt = f"avatar {av['box'][2]:.0f}x{av['box'][3]:.0f} @({av['box'][0]:.0f},{av['box'][1]:.0f})" if av and av.get("box") else "no avatar"
        if not args.quiet:
            print(f"  - {s['id']}: {len(s['editable_fields'])} editable field(s) "
                  f"[{', '.join(s['editable_fields'][:8])}{'…' if len(s['editable_fields']) > 8 else ''}]; {av_txt}")
    print(f"\n{len(summaries)} layout(s) checked: {rep.count('error')} error(s), "
          f"{rep.count('warning')} warning(s), {rep.count('info')} info")
    if args.json:
        args.json.write_text(json.dumps({"items": rep.items, "layouts": summaries}, indent=2, default=str))
    return 1 if rep.count("error") else 0


if __name__ == "__main__":
    sys.exit(main())
