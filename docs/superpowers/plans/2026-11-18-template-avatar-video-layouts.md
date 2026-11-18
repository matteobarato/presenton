# Avatar-ready video layouts for every template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add avatar-ready (video placeholder) layouts to all 13 bundled templates: 7 per template, Momentum +3.

**Architecture:** An idempotent Python generator reads each `templates/<id>/template.json`, extracts the template's style, builds 5 archetype layouts (Momentum's structures) plus 2 layouts derived from the template's own image layouts, and appends them to `layouts` and `merged_components`. A data test pins the invariants across every bundled template; contact sheets verify the look.

**Tech Stack:** Python 3 (stdlib `json`), pytest (`servers/fastapi/tests/unit`), existing helpers `find_video_placeholder` / `presenter_slot_fits` in `servers/fastapi/services/slide_video_service.py`.

**Spec:** `docs/superpowers/specs/2026-11-18-template-avatar-video-layouts-design.md`

## Global Constraints

- Placeholder element, verbatim: `{"type":"image","position":{"x":0,"y":0},"size":{"width":288,"height":512},"data":"/static/images/video-placeholder.png","fit":"cover","decorative":true,"name":"avatar_video","is_icon":false,"video_placeholder":true}` inside a component with `id: "video_placeholder"`, `description: "Avatar video placeholder"`. Other aspects (e.g. 360x640) allowed.
- Exactly one placeholder per new layout; its own component so content above layers over the avatar.
- Layout id `<purpose>_pvNN` (pv01, pv02, …), unique within the template; existing 4-digit numeric suffixes are random and collide, so `_pvNN` is the marker for generated layouts (ruling).
- Layout `description` contains the phrase "presenter avatar video".
- Every text element keeps `name`, `min_length`, `max_length`.
- Never edit or remove existing layouts or components; no schema/editor/backend/export changes; do not touch `servers/nextjs`; no smart-slide features.
- Stage is 1280x720; every element fully inside it.
- Counts: 13 templates; 7 new layouts each (5 archetypes + 2 derived); Momentum: 3 derived only (its 5 archetypes exist).

## Review Focus

- Empty placeholder (transparent poster): the layout must read as intentional with no video (test: the placeholder's neighbors leave no gap larger than the frame accent; checked visually in Task 5).
- Long text at `max_length`: new text boxes must fit their size (test: char count of default runs ≤ `max_length`; visual check with max-length fill).
- Re-running the generator: must not duplicate layouts or components (test: run twice, JSON identical).
- Templates with few layouts (swift 9, modern 10, standard 11): derivation must not fail when fewer than 2 image layouts exist (test: falls back to extra archetype variants, still 7).
- Unicode/fonts: files written back with `ensure_ascii=False`, original indent preserved, so the diff only adds (test: all pre-existing layouts equal before/after).

---

### Task 1: Data test for the bundled-template invariants

**Files:**
- Create: `servers/fastapi/tests/unit/test_bundled_template_video_layouts.py`

**Interfaces:**
- Produces: `NEW_PER_TEMPLATE = {**{t: 7 for t in TEMPLATES}, "momentum": 3}` and helpers `new_layouts(template_json: dict) -> list[dict]` (layouts whose id ends `_pvNN`).

- [ ] **Step 1: Write the failing tests**, parametrized over `templates/*/template.json`:
  - `test_new_layout_count`: `len(new_layouts(t)) == NEW_PER_TEMPLATE[id]`.
  - `test_exactly_one_placeholder`: `find_video_placeholder(layout)` is not None and a recursive count of `video_placeholder: True` is 1.
  - `test_layout_ids_unique` and `test_description_mentions_presenter_avatar_video`.
  - `test_text_has_hints`: every `type == "text"` element has `name`, `min_length`, `max_length`, and `len(joined run text) <= max_length`.
  - `test_inside_stage`: absolute box (component position + element position, size) within 0..1280 x 0..720 (use `_walk`-style offsets; skip rotated and vector elements).
  - `test_components_registered`: every new layout's component id exists in `merged_components`.
- [ ] **Step 2: Run** `cd servers/fastapi && python -m pytest tests/unit/test_bundled_template_video_layouts.py -q`. Expected: FAIL (count 0 / missing) for all templates.
- [ ] **Step 3: Commit** `test: bundled template avatar layout invariants`.

### Task 2: Style extractor

**Files:**
- Create: `scripts/template_video_layouts/style.py`, `scripts/template_video_layouts/__init__.py`
- Test: `servers/fastapi/tests/unit/test_template_video_layout_style.py`

**Interfaces:**
- Produces: `@dataclass TemplateStyle(background: str, primary: str, card: str, text: str, primary_text: str, heading_font: dict, body_font: dict, heading_size: int, body_size: int)` and `extract_style(template: dict) -> TemplateStyle`.

- [ ] **Step 1: Write failing tests**: for `momentum` (primary `#213EBB`, font family `Lato`) and `modern` (heading font `Montserrat`, color `#1E4CD9`) assert those fields; for every template assert hex colors valid and sizes > 0.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `extract_style`.** Colors from `theme.colors`; heading font = font dict of the largest-size bold text across layouts, body font = the most common non-bold size 14-20; copy the font dicts verbatim (family, color, line_height).
- [ ] **Step 4: Run, expect PASS. Commit** `feat(scripts): template style extractor`.

### Task 3: Archetype builders

**Files:**
- Create: `scripts/template_video_layouts/archetypes.py`
- Test: `servers/fastapi/tests/unit/test_template_video_layout_archetypes.py`

**Interfaces:**
- Consumes: `TemplateStyle`.
- Produces: `build_archetypes(style: TemplateStyle, start: int) -> list[dict]` returning 5 layouts in the shape of `layouts[]` (`id`, `description`, `components[]`), x, `title_steps_video_right_<n+1>`, `centered_video_side_callouts_<n+2>`, `quote_panel_video_<n+3>`, `video_band_title_cards_<n+4>`; helper `placeholder_component(x, y, w=288, h=512) -> dict`.

- [ ] **Step 1: Write failing tests**: 5 layouts; each has one placeholder component at expected box (left: x 96,y 88; right: right of 700; centered: x center within 5 px of 496); background component first (lowest layer); every text in-stage and has hints; text colors come from the style (primary text on primary fills).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** by reading Momentum's five layouts (`templates/momentum/template.json` layouts 28-32) as the geometry reference: copy their coordinates and text boxes, substitute style colors, fonts and sizes, and a plain background rectangle in `style.background`; replace Momentum's decorative image accents with vector rectangles in `style.primary` so no template-specific assets are required.
- [ ] **Step 4: Run, expect PASS. Commit** `feat(scripts): avatar layout archetypes`.

### Task 4: Derived layouts

**Files:**
- Create: `scripts/template_video_layouts/derive.py`
- Test: `servers/fastapi/tests/unit/test_template_video_layout_derive.py`

**Interfaces:**
- Produces: `derive_layouts(template: dict, count: int, start: int) -> list[dict]`: picks up to `count` existing layouts having a non-icon `image` element of area ≥ 100k px² (largest first, distinct descriptions), deep-copies each, replaces that image with a portrait placeholder (fit to the old box width ≤ 360, height = 16/9 x width capped at the old box height, centered in it), renames the id to `<old_id>_video_<n>`, prepends "Presenter avatar video version: " to the description, and moves the placeholder into its own `video_placeholder` component. If fewer than `count` candidates exist, returns what it found.

- [ ] **Step 1: Write failing tests** with a small synthetic template (two image layouts): returns 2; placeholder count 1; no other `image` removed; original layouts untouched (deep-equal); with a zero-image template returns `[]`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(scripts): derive avatar layouts from image layouts`.

### Task 5: Generator CLI + run on all templates

**Files:**
- Create: `scripts/template_video_layouts/__main__.py` (run: `python -m scripts.template_video_layouts [--template id] [--check]`)
- Modify: `templates/*/template.json` (13 files, additions only)

**Interfaces:**
- Consumes: `extract_style`, `build_archetypes`, `derive_layouts`.
- Produces: idempotent `apply(template: dict) -> dict`: skips if layouts with ids ending `_pvNN` already exist; momentum gets `derive_layouts(count=3)`; others get 5 archetypes + `derive_layouts(count=2)`; when derivation returns fewer than requested, tops up with extra archetype variants (mirror horizontally, ids continue) so the total is exactly 7. Registers each new component in `merged_components` as `{id, description, variants:[{id, description, position, elements}]}` (skipping ids already present, e.g. `video_placeholder`). Writes JSON back with `ensure_ascii=False`, same indent as the original file.

- [ ] **Step 1: Write failing test** (`test_template_video_layout_apply.py`): apply twice on a copy of `swift` and equal output; pre-existing layouts byte-equal; total new == 7 despite few image layouts.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**
- [ ] **Step 5: Run on all templates:** `python -m scripts.template_video_layouts`; then `cd servers/fastapi && python -m pytest tests/unit/test_bundled_template_video_layouts.py tests/unit/test_default_templates.py tests/unit/test_templates_v2_schema.py tests/unit/test_image_target.py -q`. Expected: all PASS.
- [ ] **Step 6: Visual check.** Start the stack per CLAUDE.md, open each template in the new frontend's template detail view (`frontend/src/views/TemplateDetailView.vue`), screenshot each new layout (with the empty placeholder and with max-length text), and fix overflow/overlap/off-style layouts by editing the builders (re-run is idempotent only if generated layouts are first removed: add `--reset` flag that deletes ids ending `_pvNN` and their components, covered by a test).
- [ ] **Step 7: Commit** `feat(templates): add avatar video layouts to all bundled templates`.

### Task 6: Generation path sanity

**Files:**
- Test: `servers/fastapi/tests/unit/test_image_target.py` (extend)

- [ ] **Step 1: Write failing test:** loading the real `modern` template, `layout.slides` includes ≥ 7 with `has_video` and the video-slot selection prefers them over injection for a requested video count of 3.
- [ ] **Step 2: Run; if it fails because of existing behavior, report to the user instead of changing `image_target.py` (it has uncommitted work).**
- [ ] **Step 3: Commit** `test: video layouts feed presenter selection`.

---

## Self-review

- Spec coverage: counts (Global Constraints, Task 5), native look (Task 2, 3, 6 visual), variety (Task 4), LLM hints (Task 1), non-goals (Global Constraints), verification list (Tasks 1, 5, 6). Script placement decided: committed under `scripts/template_video_layouts/`.
- Open calls for the implementer: exact coordinates per archetype within Momentum's geometry; which layouts are derived.
