# Theme recolor for decorative SVGs — design

Date: 2026-11-19 · Scope: `frontend/` (Vue app), `templates/*/template.json`, one migration script. Template-based generation only.

## Intent and why

Applying a theme to a template should restyle every color on the slide. Today it doesn't: backgrounds, shapes, icon bubbles and blobs keep the template's original palette, so a theme only looks right when it happens to resemble the template.

Cause (verified): `render/retint.ts` rewrites `#rrggbb` values inside a slide's JSON. Decorative SVGs (1,792 references, **560 unique files**) are rendered as `<img src=…svg>` with the fill baked into the file, so retint never sees them. 504 of 508 icon images already follow the theme because they carry a `color` and render through a CSS mask.

## Goals

- Single-color decorative SVGs (474 of 560 files, 85%) follow the theme, in editor, present mode and anywhere else the same HTML renderer is used.
- Reuse the existing mapping (`makeColorMapper`: exact token → theme token, neutral → between bg/text, other hue → rotated). No new color logic.
- The 4 icon images without a `color` get one.

## Non-goals

- Multi-color (86 files) and gradient (26 files) SVGs: not in this pass; they keep their baked colors.
- Raster images (PNG/JPEG, ~1,160 refs): untouched.
- Fonts, radius, shadows, spacing: colors only.
- Smart presentations.

## Anti-goals

- Changing how any template looks under its own theme. Under the template's source theme, output must be pixel-equivalent to today.
- Touching AI icon/image generation: `is_icon: true` also drives `icon_query` generation in the backend (`templates/v2/schema.py`, `generation.py`), so decorative images must **not** be marked `is_icon`.

## Approaches considered

1. Runtime SVG fetch + recolor (cache per theme). No migration, works for every SVG including multi-color; costs a fetch per SVG and needs the same step in every renderer.
2. **Chosen:** bake color roles into templates. `var(--x)` inside an SVG doesn't work through `<img>`, and native `vector` items can't hold Bézier curves, so the working form is a `color` on the image item, rendered with the existing mask path, which retint already recolors.
3. Server-side per-theme SVG copies: more storage and invalidation, no benefit over 2.

## Design

1. **Marker.** A decorative `image` item whose `data` is a single-color SVG gets `"color": "<its fill>"` and `"tint": true`. `tint` is a new boolean meaning "render as a color mask" without implying `is_icon`.
2. **Renderer** (`legacy/lib/template-v2-json-to-html.ts`, `renderImage`): the mask branch triggers on `color && (is_icon || tint)`. `fit`/`clip_path` handling stays as is. Retint needs no change: it already rewrites `color` hex values.
3. **Migration script** `scripts/migrate-template-svg-tint.mjs`: for each `templates/*/template.json`, for every decorative `image` with an `.svg` source, read the file; if it has exactly one distinct `#rrggbb`, no gradient/filter/mask/image/clipPath, and a single fill, add `color` + `tint`. Skip others and print a report (migrated / skipped with reason). Idempotent; never edits the SVG files. Fix the 4 colorless icons by reading their fill.
4. **Backend.** The same JSON feeds backend schema/export. Add `tint` (optional bool) to the image element model(s) in `servers/fastapi/templates/v2/models/` so validation doesn't reject it, and confirm export (PDF/PPTX/MP4 paths) renders or at least tolerates a tinted decorative image. If export can't mask, the builder must report it before migrating.

## Constraints

- A CSS mask uses the SVG's alpha channel, so partial `opacity`/`fill-opacity`/`stroke-opacity` inside the SVG is preserved; such SVGs migrate normally. Stroke-only SVGs (single stroke hex, fills none) migrate with `color` = the stroke hex.
- Do not modify `servers/nextjs`.

## Verification

- Script report counts match: ~474 files / ~1,400 references migrated; the rest listed with reasons.
- Visual diff of each template's layouts under its own theme before vs after (should be identical), then under 2–3 other themes (decor now recolors).
- Existing frontend and fastapi template tests pass.

## Left to the builder

Exact name/placement of the migration script's report, how to treat SVGs with `stroke` only, and screenshot tooling for the visual diff. Open question the builder must answer first: does backend export handle `tint`? (Decided by reading the export path, not by assumption.)
