"""Add avatar-ready layouts to the bundled templates.

    python -m scripts.template_video_layouts [--template ID] [--reset | --check]

Idempotent: a template that already has `_pvNN` layouts is left alone.
`--reset` removes what this script added; `--check` exits 1 if any template lacks them.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any

from .archetypes import build_archetypes, mirror
from .derive import derive_layouts
from .style import extract_style

REPO = Path(__file__).resolve().parents[2]
NEW_LAYOUT = re.compile(r"_pv\d\d$")
PLACEHOLDER_ID = "video_placeholder"
COMPONENT_SUFFIX = "_pv"
NEW_PER_TEMPLATE = 7
# Momentum already ships five hand-made avatar layouts, so it gets five more built
# from its own image layouts (topped up with mirrored archetypes), not a copy of its set.
DERIVED_ONLY = {"momentum": 5}
ARCHETYPE_DERIVED = 2


def _is_new(layout: dict) -> bool:
    return bool(NEW_LAYOUT.search(layout["id"]))


def _register(template: dict, layout: dict) -> None:
    registered = {v["id"] for m in template["merged_components"] for v in m["variants"]}
    for comp in layout["components"]:
        if comp["id"] != PLACEHOLDER_ID and not comp["id"].endswith(COMPONENT_SUFFIX):
            comp["id"] += COMPONENT_SUFFIX
        if comp["id"] in registered:
            continue
        registered.add(comp["id"])
        template["merged_components"].append(
            {
                "id": comp["id"],
                "description": comp["description"],
                "variants": [
                    {
                        "id": comp["id"],
                        "description": comp["description"],
                        "position": copy.deepcopy(comp["position"]),
                        "elements": copy.deepcopy(comp["elements"]),
                    }
                ],
            }
        )


def apply(template: dict[str, Any]) -> dict[str, Any]:
    if any(_is_new(l) for l in template["layouts"]):
        return template
    base = build_archetypes(extract_style(template), 1)
    only = DERIVED_ONLY.get(template["id"])
    if only:
        target, new = only, derive_layouts(template, only, 1)
    else:
        target, new = NEW_PER_TEMPLATE, base + derive_layouts(template, ARCHETYPE_DERIVED, len(base) + 1)
    # A template with few usable image layouts is filled up with flipped archetypes.
    flips = 0
    while len(new) < target:
        new.append(mirror(base[flips % len(base)], len(new) + 1))
        flips += 1
    for layout in new:
        _register(template, layout)
        template["layouts"].append(layout)
    return template


def reset(template: dict[str, Any]) -> dict[str, Any]:
    template["layouts"] = [l for l in template["layouts"] if not _is_new(l)]
    in_use = {c["id"] for l in template["layouts"] for c in l["components"]}
    template["merged_components"] = [
        m
        for m in template["merged_components"]
        if not m["id"].endswith(COMPONENT_SUFFIX)
        and not (m["id"] == PLACEHOLDER_ID and PLACEHOLDER_ID not in in_use)
    ]
    return template


def _write(path: Path, template: dict, trailing_newline: bool) -> None:
    text = json.dumps(template, indent=2, ensure_ascii=False)
    path.write_text(text + ("\n" if trailing_newline else ""), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--template", help="only this template id")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--reset", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    paths = sorted((REPO / "templates").glob("*/template.json"))
    if args.template:
        paths = [p for p in paths if p.parent.name == args.template]
    missing = 0
    for path in paths:
        raw = path.read_text(encoding="utf-8")
        template = json.loads(raw)
        if args.check:
            if not any(_is_new(l) for l in template["layouts"]):
                print(f"{template['id']}: no avatar layouts")
                missing += 1
            continue
        before = len(template["layouts"])
        template = reset(template) if args.reset else apply(template)
        _write(path, template, raw.endswith("\n"))
        print(f"{template['id']}: {before} -> {len(template['layouts'])} layouts")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
