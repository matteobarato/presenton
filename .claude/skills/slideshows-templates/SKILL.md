---
name: slideshows-templates
description: Create, edit, verify and render Presenton Template V2 slide templates and layouts (templates/*/template.json bundled templates, or user templates in the database via the REST API/MCP). Use this whenever the user wants new slide layouts or a whole new template, wants to change, fix, restyle or port existing layouts, add presenter/avatar video placeholder slots, add charts, infographics, tables, vector graphics, SVG art, icons or images to template layouts, check that layouts render correctly or don't overflow, or preview/screenshot template layouts — even if they just say "make a slide design for X", "add a layout with the avatar", "the template looks broken", or "make the Studio template have a KPI slide". Not for generating a presentation's content from an existing template (that's the normal app flow), and never for Smart/HTML presentations.
---

# Slideshows template studio

You design and verify **Template V2 layouts**: the reusable slide designs that
Presenton fills with generated content (outline → template → slides). A layout
is only good when it validates against the backend models, renders cleanly at
its **worst-case** content length, works with an empty and a filled avatar slot,
and looks native to its template. This skill gives you the tools to prove all of
that, so don't hand back a layout you haven't rendered and looked at.

`<skill>` below means this skill's directory (`.claude/skills/slideshows-templates`).
Run commands from the repo root.

## Ground rules (from the project)

- **Templates only.** Never build anything for Smart presentations
  (`generation_mode: "smart"`, `/generate/smart*`, `slide/edit-html`).
- Don't modify `servers/nextjs` (the old frontend). Don't change app code
  (renderer, backend) for template work. If you find a renderer bug, report it
  and don't patch around it in the data.
- Bundled templates are shipped product files. When you're experimenting, or the
  user hasn't said to change a real template, work on a copy (`tpl.py copy`, or
  `--out` into a scratch dir) and say where it is.
- Never print, store or commit API keys. The key comes from `$PRESENTON_API_KEY`.

## The model in one screen

```
template: theme.colors (primary, background, card, stroke, primary_text, background_text, graph_0..9),
          fonts, icon_type, layouts[], merged_components[]
layout:   {id, description, components[]}        1280×720 stage; components paint in array order
component:{id, description, position, elements[]}
element:  text | text-list | image | container | group | flex | grid | vector | chart | table | infographic
```
- `decorative: false` on text, text-list, image, chart, table or infographic makes
  it a **content field**: the generator LLM writes it, bounded by `min/max_length`,
  `max_items` and so on. Everything else is fixed design.
- A `flex`/`grid` of identical children is a **repeatable region** (an array from
  `min_children` to `max_children`).
- The structure LLM picks layouts by `description`, and media steering matches by
  the words in the layout `id`. Both matter as much as the visuals.
- The avatar slot is an `image` with `video_placeholder: true` in its own
  `video_placeholder` component.

Details: `references/element-model.md`. Read it before writing elements you
haven't used before.

## Tools (all in `<skill>/scripts/`)

| script | what it does | needs |
|---|---|---|
| `tpl.py inspect\|style\|show <template> [layout]` | Layout table; the template's real style tokens (fonts, sizes, colors, radii, backgrounds); dump a layout | python3 |
| `tpl.py add\|remove\|register\|copy\|restyle` | Insert or replace layouts, auto-registering components in `merged_components`; scaffold a new bundled template; port a layout between templates (a first pass, check it by eye) | python3 |
| `validate_layout.py <file> [--layouts ids]` | The backend's own Pydantic models, plus content-schema build, stage bounds, text-capacity estimates, avatar contract, registration and palette checks. Exits 1 on errors. | `servers/fastapi/.venv/bin/python` |
| `render_layouts.mjs <file> [--layouts ids] [--variants sample,max,avatar] [--out DIR] [--fonts-from T]` | Renders with the app's real renderer in headless Chromium: PNG per layout × variant, `contact-sheet.png`, `report.json`, and **measured** overflow, off-stage text, broken assets and text over the presenter. Exits 1 on issues. | node; frontend `node_modules`; backend optional |
| `api.py …` | REST client: list, pull and push user templates, patch a slot, backend-LLM layout draft, image search and generation, icons, uploads, end-to-end deck test | `$PRESENTON_API_KEY` |

`<template>` can be a bundled id (`modern`), a directory, a `template.json`
(bundled or API shape), a single layout JSON, or a JSON list of layouts. For
loose layout files, pass `--fonts-from <template>` to the renderer so fonts and
theme load.

## Workflow

### 1. Orient
- Which store? A bundled template means `templates/<dir>/template.json`, applied
  by an API restart. A user template means the DB, reached through `api.py`. If
  that's unclear, run `api.py list` (it marks built-ins) or ask. See
  `references/backend-and-mcp.md`.
- Learn the template's visual language before drawing anything:
  `tpl.py inspect <t>` and `tpl.py style <t>`. Render a few existing layouts with
  `render_layouts.mjs <t> --layouts a,b,c --variants sample` and **look at the
  contact sheet**. New layouts must feel like siblings of these: the same
  background treatment, heading size and weight, color roles, corner radii,
  margins (often 40–72 px) and accent devices.

### 2. Plan
For each new layout, write down its purpose (what content it fits), its
arrangement, its editable fields with capacities, and its graphics. For a set,
aim for structural variety: don't ship five "title + bullets" clones. If the user
asked for a whole template, cover a deck's needs: cover, agenda,
section divider, text + image, bullets, comparison, metrics/KPIs, chart, table,
process/timeline, quote, team, closing. Add avatar variants of 4–7 of these.

### 3. Author
Pick the fastest path to a correct draft:
- **Edit or derive**: `tpl.py show <t> <id> > draft.json`, change it, give it a
  new id. This is the most native-looking path.
- **Skeleton**: `<skill>/assets/skeletons/*.json` (avatar split, chart + KPI
  cards, infographic process) are valid, verified starting points. Run
  `tpl.py restyle skeleton.json --from modern --to <t> --out draft.json`, then fix
  the colors it reports as unmapped.
- **Backend draft** (user templates, or any template once seeded): run
  `api.py gen-layout <id> "prompt" --out draft.json`. The backend LLM drafts in
  the template's style. Treat the draft like your own: validate and render it.
- **From scratch**, using `references/element-model.md`.

Authoring rules that prevent most failures:
- Size every editable text box for its `max_length` at its font size, not for
  the sample text. Keep `line_height` consistent with the box:
  `height ≈ lines × size × line_height`.
- Use the template's exact hex colors (`tpl.py style`). Chart and infographic
  colors come from `graph_*`. Check that text contrasts with whatever is behind
  it.
- Background component first. Keep a safe margin of ≥ 40 px for content. Align
  to a few shared x positions, not arbitrary ones.
- Repeated cards and rows go in a `flex`/`grid` with identical children and
  honest `min/max_children`. Size the container for `max_children`.
- Graphics: prefer native vector, container, chart and infographic elements.
  Make single-color decorative SVGs `color` + `tint: true`. Put assets in the
  template's `static/` (bundled) or upload them (DB). See
  `references/graphics-and-assets.md`.
- Avatar layouts follow `references/avatar-placeholder.md` exactly. In short:
  one 9:16 slot in its own `video_placeholder` component, "presenter avatar
  video" in the description, a backdrop so the empty state looks designed, and
  no content over the face.
- Write a `description` that states the arrangement and the content it suits.
  Use a snake_case id with purpose words (`title_kpi_cards_chart_0412`).

### 4. Validate, then render, then look (loop until clean)
```bash
servers/fastapi/.venv/bin/python <skill>/scripts/validate_layout.py draft.json
node <skill>/scripts/render_layouts.mjs draft.json --fonts-from <t> --out <scratch>/render
```
- Fix every validator **error**. Fix warnings unless you can say why one is
  fine (e.g. a deliberate bleed).
- The renderer's `max` variant fills every field to its limit and expands
  repeats to `max_children`. Most real-world breakage shows up here. Fix
  overflow by resizing the box, lowering `max_length`, or reducing
  `max_children`, in that order of preference.
- **Open the PNGs with the Read tool and look at them.** Read the contact sheet
  first, then any single render that looks off. The automated checks can't see
  white-on-white text, an infographic whose labels disappear, awkward
  whitespace, a clashing color, or a layout that doesn't match its siblings.
  Judge it as a designer: hierarchy, alignment, balance, breathing room, and
  consistency with the template.
- Iterate. A typical good layout takes 2–4 render loops.

### 5. Integrate
Restarting the API, pushing to the database and generating decks or images change
the user's running system or cost money. Do them when the user wants the change
live, not as a reflex.
- **Bundled:** `tpl.py add <dir> draft.json [--after <id>] --in-place`, or `--out copy.json`
  while the user is still reviewing. It registers components and refuses duplicate ids. Then re-validate the whole
  file with `--quiet`, run the tests in `references/backend-and-mcp.md` §5,
  restart the API (§1), and check `/templates/<id>` in the app.
- **User template:** `api.py pull <id> --out t.json`, then
  `tpl.py add t.json draft.json --in-place`, validate and render `t.json`, then
  `api.py push <id> t.json` (dry run), then `--yes`. Use `api.py patch-layout` to
  replace a single slot.
- **Optional end-to-end** (costs LLM and image credits, so ask first):
  `api.py deck <template_id> "topic" --n 4 [--avatar] --wait`. Then open the deck
  in the app and confirm the new layouts were picked and filled sensibly.

### 6. Report
Tell the user what you created or changed (ids, file or template), where the
contact sheet is (full path), what you verified (validator result, render
issues = 0, tests), and anything you couldn't verify. For example, "no API key,
so the DB push and in-app check were not done". If you skipped the max-length
render or didn't look at the images, say so plainly.

## Editing existing layouts
- Keep element `name`s stable (they're schema keys) unless the user wants the
  content model changed.
- Use the validator's `@ components[i:id].elements[j]...` paths to locate
  elements quickly. Re-render the original and the edited version side by side
  (two `--out` dirs) and compare.
- For "make it look like X" requests, change style tokens consistently across
  all affected layouts, not just one.

## When something doesn't render
- `renderer returned no HTML`: the layout has no components or elements.
- `broken image` / `asset: 404`: a wrong `data` path. Bundled assets are
  `static/<file>` relative to the template dir. Absolute `/static/...` paths come
  from `servers/fastapi/static`.
- Fonts look wrong: check `fonts` in the template JSON, and the
  weight-named-family convention (see element-model §3).
- The stack isn't running: rendering still works offline, because assets are
  served from disk. Only `api.py` needs the stack.
