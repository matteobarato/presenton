#!/usr/bin/env python3
"""Inspect and edit Template V2 template files (stdlib only, any python3).

    tpl.py inspect  <template>                       # theme, fonts, style, layout table
    tpl.py show     <template> <layout_id|index>     # print one layout as JSON
    tpl.py style    <template>                       # style tokens to reuse in new layouts
    tpl.py add      <template> <layout.json>... [--replace ID] [--after ID] (--out FILE | --in-place)
    tpl.py remove   <template> <layout_id>... [--prune] (--out FILE | --in-place)
    tpl.py register <template> (--out FILE | --in-place)  # register every layout component
    tpl.py copy     <template> <dest_dir> [--id NEW_ID --name NAME]  # scaffold a new bundled template
    tpl.py restyle  <layout.json> --from <template> --to <template> [--out FILE]
                    # port a layout between templates: theme-role colors + main font family

<template> is a bundled id ("modern"), a template directory, or a path to a
template.json (bundled shape, or the API shape saved by api.py pull).
`add` registers the layout's components in merged_components and refuses duplicate
ids (unless --replace). Commands that write (add, remove, register) need either
--out FILE or an explicit --in-place, so a bare bundled id never silently edits a
shipped template.
"""

from __future__ import annotations

import argparse
import collections
import copy
import json
import shutil
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
TEMPLATES = REPO / "templates"


# ------------------------------------------------------------------ io
def resolve(ref: str) -> Path:
    p = Path(ref)
    if p.is_file():
        return p
    if p.is_dir() and (p / "template.json").is_file():
        return p / "template.json"
    bundled = TEMPLATES / ref / "template.json"
    if bundled.is_file():
        return bundled
    sys.exit(f"template not found: {ref}")


def load(path: Path) -> tuple[dict[str, Any], bool]:
    """Return (template in bundled shape, was_api_shape)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    api_shape = isinstance(data.get("layouts"), dict)
    if api_shape:
        data = dict(data)
        data["layouts"] = data["layouts"].get("layouts", [])
        mc = data.get("merged_components")
        data["merged_components"] = (mc or {}).get("components", []) if isinstance(mc, dict) else (mc or [])
    data.setdefault("merged_components", [])
    return data, api_shape


def write_target(args, path: Path) -> Path:
    if getattr(args, "out", None):
        return Path(args.out)
    if getattr(args, "in_place", False):
        return path
    sys.exit(f"refusing to write: pass --out FILE, or --in-place to modify {path}")


def save(data: dict[str, Any], path: Path, api_shape: bool) -> None:
    out = copy.deepcopy(data)
    if api_shape:
        out["layouts"] = {"layouts": out["layouts"]}
        out["merged_components"] = {"components": out["merged_components"]}
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def find_layout(data: dict[str, Any], key: str) -> tuple[int, dict[str, Any]]:
    layouts = data["layouts"]
    if key.isdigit() and int(key) < len(layouts):
        return int(key), layouts[int(key)]
    for i, l in enumerate(layouts):
        if l.get("id") == key:
            return i, l
    sys.exit(f"layout not found: {key}")


# ------------------------------------------------------------------ analysis
def iter_elements(elements, depth=0):
    for el in elements or []:
        if not isinstance(el, dict):
            continue
        yield el
        yield from iter_elements(el.get("children"), depth + 1)
        if isinstance(el.get("child"), dict):
            yield from iter_elements([el["child"]], depth + 1)


def layout_elements(layout):
    for comp in layout.get("components") or []:
        yield from iter_elements(comp.get("elements"))


def layout_summary(layout) -> dict[str, Any]:
    types = collections.Counter()
    editable = 0
    avatar = None
    for el in layout_elements(layout):
        types[el.get("type")] += 1
        if el.get("decorative") is False:
            editable += 1
        if el.get("video_placeholder"):
            s = el.get("size") or {}
            avatar = f"{s.get('width', '?'):.0f}x{s.get('height', '?'):.0f}" if s else "yes"
    return {"types": types, "editable": editable, "avatar": avatar}


def style_tokens(data) -> dict[str, Any]:
    fonts = collections.Counter()
    sizes = collections.Counter()
    text_colors = collections.Counter()
    fills = collections.Counter()
    radii = collections.Counter()
    bg = collections.Counter()
    for layout in data["layouts"]:
        comps = layout.get("components") or []
        if comps:
            first = (comps[0].get("elements") or [{}])[0]
            if first.get("type") == "vector" and first.get("fill"):
                bg[first["fill"]["color"].upper()] += 1
            elif first.get("type") == "image":
                bg[f"image:{first.get('data')}"] += 1
        for el in layout_elements(layout):
            f = el.get("font") or {}
            if el.get("type") in ("text", "text-list"):
                if f.get("family"):
                    fonts[f["family"]] += 1
                if f.get("size"):
                    sizes[(round(f["size"]), bool(f.get("bold")))] += 1
                if f.get("color"):
                    text_colors[f["color"].upper()] += 1
            if el.get("fill") and el.get("type") in ("vector", "container"):
                fills[el["fill"]["color"].upper()] += 1
            br = el.get("border_radius")
            if br:
                radii[br.get("tl")] += 1
            if el.get("corner_radii"):
                radii[el["corner_radii"][0]] += 1
    return {
        "fonts": fonts.most_common(4),
        "text_sizes(size,bold)": sorted(sizes.most_common(12), key=lambda x: -x[0][0]),
        "text_colors": text_colors.most_common(6),
        "shape_fills": fills.most_common(8),
        "corner_radii": radii.most_common(5),
        "slide_backgrounds": bg.most_common(4),
    }


# ------------------------------------------------------------------ commands
def cmd_inspect(args):
    path = resolve(args.template)
    data, api_shape = load(path)
    print(f"{data.get('name')}  id={data.get('id')}  file={path}  shape={'api' if api_shape else 'bundled'}")
    if data.get("description"):
        print(f"  {data['description']}")
    theme = data.get("theme") or {}
    print("theme.colors:", json.dumps(theme.get("colors", {})))
    print("fonts:", list((data.get("fonts") or {}).keys()) or theme.get("fonts"))
    print(f"icon_type: {data.get('icon_type')}   merged_components: {len(data['merged_components'])}")
    print(f"\n{'#':>3}  {'layout id':<58} {'edit':>4}  avatar   element types")
    for i, l in enumerate(data["layouts"]):
        s = layout_summary(l)
        types = ",".join(f"{k}:{v}" for k, v in s["types"].most_common(5))
        print(f"{i:>3}  {l.get('id', '?')[:58]:<58} {s['editable']:>4}  {(s['avatar'] or '-'):<8} {types}")


def cmd_show(args):
    data, _ = load(resolve(args.template))
    _, layout = find_layout(data, args.layout)
    print(json.dumps(layout, indent=2, ensure_ascii=False))


def cmd_style(args):
    data, _ = load(resolve(args.template))
    for k, v in style_tokens(data).items():
        print(f"{k}: {v}")
    print("theme.colors:", json.dumps((data.get("theme") or {}).get("colors", {})))


def register_components(data, layout) -> int:
    registered = {m["id"] for m in data["merged_components"]} | {
        v["id"] for m in data["merged_components"] for v in m.get("variants") or []}
    by_id = {}
    for m in data["merged_components"]:
        for v in m.get("variants") or []:
            by_id.setdefault(v["id"], []).append(v)
    added = 0
    for comp in layout.get("components") or []:
        if comp["id"] in registered:
            same = any(v.get("elements") == comp.get("elements") for v in by_id.get(comp["id"], []))
            if same or comp["id"] == "video_placeholder":
                continue
            # Same id, different content: registering by id alone would silently skip it,
            # and the editor's variant swap would bring back the other component. Give it
            # its own id (component ids are schema keys, so do this before the layout ships).
            base, n = comp["id"], 2
            while f"{base}_{n}" in registered:
                n += 1
            comp["id"] = f"{base}_{n}"
            print(f"  component id '{base}' already registered with different content -> renamed '{comp['id']}'")
        registered.add(comp["id"])
        data["merged_components"].append({
            "id": comp["id"],
            "description": comp.get("description", comp["id"]),
            "variants": [{
                "id": comp["id"],
                "description": comp.get("description", comp["id"]),
                "position": copy.deepcopy(comp.get("position", {"x": 0, "y": 0})),
                "elements": copy.deepcopy(comp.get("elements", [])),
            }],
        })
        added += 1
    return added


def cmd_add(args):
    path = resolve(args.template)
    data, api_shape = load(path)
    ids = {l["id"] for l in data["layouts"]}
    for src in args.layouts:
        payload = json.loads(Path(src).read_text(encoding="utf-8"))
        new_layouts = payload if isinstance(payload, list) else [payload]
        for layout in new_layouts:
            lid = layout["id"]
            if args.replace:
                idx, _ = find_layout(data, args.replace)
                data["layouts"][idx] = layout
                ids = {l["id"] for l in data["layouts"]}
                print(f"replaced layout #{idx} {args.replace} -> {lid}")
            else:
                if lid in ids:
                    sys.exit(f"layout id already exists: {lid} (use --replace {lid})")
                at = len(data["layouts"])
                if args.after:
                    at = find_layout(data, args.after)[0] + 1
                data["layouts"].insert(at, layout)
                ids.add(lid)
                print(f"added layout {lid} at #{at}")
            n = register_components(data, layout)
            if n:
                print(f"  registered {n} component(s) in merged_components")
    save(data, write_target(args, path), api_shape)


def cmd_remove(args):
    path = resolve(args.template)
    data, api_shape = load(path)
    for lid in args.ids:
        idx, _ = find_layout(data, lid)
        data["layouts"].pop(idx)
        print(f"removed layout {lid}")
    used = {c["id"] for l in data["layouts"] for c in l.get("components") or []}
    if args.prune:
        before = len(data["merged_components"])
        data["merged_components"] = [m for m in data["merged_components"]
                                     if m["id"] in used or any(v["id"] in used for v in m.get("variants") or [])]
        print(f"pruned {before - len(data['merged_components'])} unused merged component(s)")
    save(data, write_target(args, path), api_shape)


def cmd_register(args):
    path = resolve(args.template)
    data, api_shape = load(path)
    total = sum(register_components(data, l) for l in data["layouts"])
    print(f"registered {total} component(s)")
    save(data, write_target(args, path), api_shape)


def cmd_copy(args):
    src = resolve(args.template)
    dest = Path(args.dest)
    if (dest / "template.json").exists():
        sys.exit(f"{dest}/template.json already exists")
    dest.mkdir(parents=True, exist_ok=True)
    data, _ = load(src)
    if (src.parent / "static").is_dir():
        shutil.copytree(src.parent / "static", dest / "static", dirs_exist_ok=True)
    data["id"] = args.id or dest.name
    if args.name:
        data["name"] = args.name
    save(data, dest / "template.json", False)
    print("Remember: bundled template ids must be unique; restart the API to seed it.")


def _hex_rgb(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _sat_lum(c: str):
    import colorsys
    h, l, sat = colorsys.rgb_to_hls(*_hex_rgb(c))
    return sat, l


def _text_role(el) -> str:
    f = el.get("font") or {}
    size = float(f.get("size") or 16)
    if size >= 26:
        return "heading"
    return "label" if f.get("bold") else "body"


def usage_roles(data) -> dict[str, Any]:
    """Roles inferred from how the template actually uses colors and fonts."""
    color = {r: collections.Counter() for r in ("heading", "body", "label")}
    family = {r: collections.Counter() for r in ("heading", "body", "label")}
    fills, bgs = collections.Counter(), collections.Counter()
    for layout in data["layouts"]:
        comps = layout.get("components") or []
        if comps:
            first = (comps[0].get("elements") or [{}])[0]
            if first.get("type") == "vector" and first.get("fill"):
                bgs[first["fill"]["color"].upper()] += 1
        for el in layout_elements(layout):
            f = el.get("font") or {}
            if el.get("type") in ("text", "text-list"):
                role = _text_role(el)
                if f.get("color"):
                    color[role][f["color"].upper()] += 1
                if f.get("family"):
                    family[role][f["family"]] += 1
            elif el.get("type") in ("vector", "container") and el.get("fill"):
                fills[el["fill"]["color"].upper()] += 1
    bg = bgs.most_common(1)[0][0] if bgs else "#FFFFFF"
    accent = next((c for c, _ in fills.most_common() if c.startswith("#") and len(c) == 7
                   and _sat_lum(c)[0] > 0.35 and 0.2 < _sat_lum(c)[1] < 0.8), None)
    card = next((c for c, _ in fills.most_common() if c != bg and len(c) == 7 and _sat_lum(c)[1] > 0.9), None)
    pick = lambda ctr: ctr.most_common(1)[0][0] if ctr else None
    roles = {f"{r}_color": pick(color[r]) for r in color} | {f"{r}_family": pick(family[r]) for r in family}
    roles |= {"background": bg, "accent": accent, "card": card}
    if not roles["label_family"]:
        roles["label_family"] = roles["heading_family"]
    if not roles["label_color"]:
        roles["label_color"] = roles["heading_color"]
    return roles


def cmd_restyle(args):
    src, _ = load(resolve(args.src))
    dst, _ = load(resolve(args.dst))
    sr, dr = usage_roles(src), usage_roles(dst)
    cmap: dict[str, str] = {}
    for role in ("background", "heading_color", "body_color", "label_color", "accent", "card"):
        if sr.get(role) and dr.get(role):
            cmap.setdefault(sr[role].upper(), dr[role])
    payload = json.loads(Path(args.layout).read_text(encoding="utf-8"))
    hits = collections.Counter()

    def recolor(v):
        if not (isinstance(v, str) and len(v) == 7 and v.startswith("#")):
            return v
        if v.upper() in cmap:
            hits[f"{v.upper()} -> {cmap[v.upper()]}"] += 1
            return cmap[v.upper()]
        sat, lum = _sat_lum(v)
        if dr.get("accent") and sat > 0.35 and 0.2 < lum < 0.8:  # any saturated accent
            hits[f"{v.upper()} -> {dr['accent']} (accent)"] += 1
            return dr["accent"]
        return v

    def fix_font(font, role):
        if not isinstance(font, dict):
            return
        fam = dr.get(f"{role}_family")
        if fam and font.get("family") and font["family"] != fam:
            hits[f"font {font['family']} -> {fam} ({role})"] += 1
            font["family"] = fam
        c = font.get("color")
        if isinstance(c, str) and len(c) == 7 and c.startswith("#"):
            # dark or saturated text takes the target's color for its role; light text
            # (on dark panels) keeps its color
            if _sat_lum(c)[1] < 0.75 and dr.get(f"{role}_color"):
                if c.upper() != dr[f"{role}_color"].upper():
                    hits[f"text {c.upper()} -> {dr[f'{role}_color']} ({role})"] += 1
                font["color"] = dr[f"{role}_color"]
            else:
                font["color"] = recolor(c)

    def visit(node, role=None):
        if isinstance(node, list):
            for v in node:
                visit(v, role)
            return
        if not isinstance(node, dict):
            return
        if node.get("type") in ("text", "text-list"):
            role = _text_role(node)
        for k, v in list(node.items()):
            if k == "font":
                fix_font(v, role or "body")
            elif isinstance(v, str):
                node[k] = recolor(v)
            elif isinstance(v, list) and k == "colors":
                graph = [c for r, c in sorted(((dst.get("theme") or {}).get("colors") or {}).items())
                         if r.startswith("graph_")]
                if graph and node.get("type") in ("chart", "infographic"):
                    node[k] = [graph[i % len(graph)] for i in range(len(v))]  # series colors = theme graph_*
                    hits["chart/infographic colors -> theme graph_*"] += 1
                else:
                    node[k] = [recolor(c) for c in v]
            else:
                visit(v, role)

    visit(payload)
    dest = Path(args.out) if args.out else Path(args.layout)
    dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"restyled {args.layout} -> {dest}")
    print("  source roles:", {k: v for k, v in sr.items() if v})
    print("  target roles:", {k: v for k, v in dr.items() if v})
    for k, v in hits.most_common():
        print(f"  {k}  x{v}")
    palette = {c.upper() for c in ((dst.get("theme") or {}).get("colors") or {}).values()} | {
        v.upper() for v in dr.values() if isinstance(v, str) and v.startswith("#")}
    left = collections.Counter()

    def scan(n):
        if isinstance(n, dict):
            for v in n.values():
                if isinstance(v, str) and len(v) == 7 and v.startswith("#") and v.upper() not in palette:
                    left[v.upper()] += 1
                scan(v)
        elif isinstance(n, list):
            for v in n:
                scan(v)
    scan(payload)
    if left:
        print("  colors not in the target's palette — pick replacements by eye:", dict(left.most_common(8)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("inspect"); p.add_argument("template"); p.set_defaults(fn=cmd_inspect)
    p = sub.add_parser("show"); p.add_argument("template"); p.add_argument("layout"); p.set_defaults(fn=cmd_show)
    p = sub.add_parser("style"); p.add_argument("template"); p.set_defaults(fn=cmd_style)
    p = sub.add_parser("add"); p.add_argument("template"); p.add_argument("layouts", nargs="+")
    p.add_argument("--replace"); p.add_argument("--after"); p.add_argument("--out")
    p.add_argument("--in-place", action="store_true"); p.set_defaults(fn=cmd_add)
    p = sub.add_parser("remove"); p.add_argument("template"); p.add_argument("ids", nargs="+")
    p.add_argument("--prune", action="store_true", help="drop merged components no layout uses")
    p.add_argument("--out"); p.add_argument("--in-place", action="store_true"); p.set_defaults(fn=cmd_remove)
    p = sub.add_parser("register"); p.add_argument("template"); p.add_argument("--out")
    p.add_argument("--in-place", action="store_true"); p.set_defaults(fn=cmd_register)
    p = sub.add_parser("copy"); p.add_argument("template"); p.add_argument("dest")
    p.add_argument("--id"); p.add_argument("--name"); p.set_defaults(fn=cmd_copy)
    p = sub.add_parser("restyle"); p.add_argument("layout"); p.add_argument("--from", dest="src", required=True)
    p.add_argument("--to", dest="dst", required=True); p.add_argument("--out"); p.set_defaults(fn=cmd_restyle)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
