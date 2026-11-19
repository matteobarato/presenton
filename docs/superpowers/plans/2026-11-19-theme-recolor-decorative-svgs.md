# Theme Recolor for Decorative SVGs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-color decorative SVGs in bundled templates follow the applied theme, like icons already do.

**Architecture:** Decorative `image` items whose SVG has one fill get `color` + `tint: true`. `renderImage` draws them through the existing CSS-mask path (so `retintUi` recolors `color` with no change). A migration script edits only `templates/*/template.json`.

**Tech Stack:** Vue 3/Vite/vitest (`frontend/`), FastAPI/pydantic (`servers/fastapi`), Node ESM script (`scripts/`).

**Spec:** `docs/superpowers/specs/2026-11-19-theme-recolor-decorative-svgs-design.md`

## Global Constraints

- Do not modify `servers/nextjs`.
- Never set `is_icon` on decorative images (it drives `icon_query` generation in `servers/fastapi/templates/v2/schema.py`/`generation.py`).
- Migration edits `template.json` only; SVG files are never changed.
- Under a template's own theme, rendering must be visually identical to today.
- Skipped (unchanged): SVGs with >1 distinct `#rrggbb`, gradients, `filter`, `mask`, `clipPath`, `<image>`, any `opacity`/`fill-opacity` < 1, stroke-only SVGs; all rasters.
- Colors only; no font/radius changes. Template-based generation only.

## Review Focus

- SVG with `fill-opacity`/`opacity` < 1 → must be skipped, not flattened to opaque (test in Task 2).
- Same SVG used by several items/layouts → every reference migrated, idempotent on re-run (Task 2).
- A `tint` image with `fit: "cover"`/`clip_path`/`rotation` → mask keeps clip and size (Task 1).
- Existing deck whose slide `ui` has no `tint` → renders exactly as before (Task 1).
- Backend validation/chat-edit round trip keeps `tint` instead of dropping or rejecting it (Task 3).

---

### Task 1: Renderer mask path for `tint`

**Files:**
- Modify: `frontend/src/render/legacy/lib/template-v2-json-to-html.ts` (`renderImage`, ~line 575)
- Create: `frontend/tests/unit/tint-image.test.ts`
- Modify: `frontend/tests/golden/renderer.golden.test.ts`

**Interfaces:**
- Consumes: `templateV2UiToHtml(ui, opts?)`, `retintUi(ui, theme)` from `@/render/retint`.
- Produces: item field `tint?: boolean` on `image` (read as `item.tint`).

- [ ] **Step 1: Write failing tests** in `tint-image.test.ts`: (a) image `{type:"image",data:"static/a.svg",color:"#1A3DB3",tint:true,decorative:true,is_icon:false,size,position}` renders HTML containing `mask:url(` and `color:#1A3DB3` and no `<img`; (b) same without `tint` renders `<img`; (c) with `clip_path` the output still contains the clip-path style; (d) `retintUi` of a ui holding that item with a theme carrying `source_theme` changes the `color` value and keeps `tint: true`.
- [ ] **Step 2:** `cd frontend && npx vitest run tests/unit/tint-image.test.ts` → FAIL on (a).
- [ ] **Step 3:** In `renderImage`, change the mask condition to `color && (readBoolean(item.isIcon ?? item.is_icon) || readBoolean(item.tint))`.
- [ ] **Step 4:** Golden test: add a `stripTint(ui)` helper (deep clone; for image items with `tint`, delete `tint` and `color`) and run both renderers on `stripTint(layout)` so the old-renderer comparison stays valid. Tint behaviour is covered by the unit test.
- [ ] **Step 5:** `npx vitest run && npm run test:golden` → PASS (golden skips if old frontend dir is absent; note that in the report).
- [ ] **Step 6:** Commit `feat(frontend): render tint images through the color mask`.

### Task 2: Migration script

**Files:**
- Create: `scripts/migrate-template-svg-tint.mjs` (exports `migrateTemplate(json, readSvg) -> { json, migrated, skipped: {reason,count}[] }`; CLI runs over `templates/*/template.json`, default dry run, `--write` to apply)
- Test: `scripts/migrate-template-svg-tint.test.mjs` (same style as `convert-template.test.mjs`)

**Interfaces:**
- Produces: tinted items `{...image, color: "#RRGGBB", tint: true}`; for the 4 colorless `is_icon` images, only `color` is added.

- [ ] **Step 1: Write failing tests** with inline SVG strings: single-fill SVG → migrated, `color` equals the fill (original case); two-color SVG, gradient SVG, `fill-opacity="0.5"`, SVG with `<filter>` → skipped with a reason; `is_icon:true` image without color → gets `color`, no `tint`; same SVG referenced twice → both migrated; running `migrateTemplate` on its own output → `migrated: 0`, JSON unchanged; non-decorative and raster images untouched; `is_icon` never set on a migrated item.
- [ ] **Step 2:** `node --test scripts/migrate-template-svg-tint.test.mjs` → FAIL.
- [ ] **Step 3:** Implement. Walk the whole layout tree (`child`, `children`, `elements`). Eligibility per Global Constraints; color = the single distinct `#rrggbb` found in `fill=` attributes.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Run dry on real templates; expect roughly 474 unique files / ~1,400 references migrated and the remainder listed by reason. Record the report in the PR description. Do not apply yet.
- [ ] **Step 6:** Commit `feat: script to mark single-color decorative svgs as theme-tinted`.

### Task 3: Backend accepts `tint`, export path checked

**Files:**
- Modify: `servers/fastapi/templates/v2/models/elements.py` (class `Image`, near `color`): add `tint: Optional[bool] = None` with a comment that it marks a decorative image drawn as a color mask.
- Test: `servers/fastapi/tests/unit/test_templates_v2_elements.py`

- [ ] **Step 1: Failing test** `test_image_keeps_tint`: `Image(**{..., "tint": True, "color": "#1A3DB3", "decorative": True, "is_icon": False}).model_dump(exclude_none=True)["tint"] is True`.
- [ ] **Step 2:** `cd servers/fastapi && pytest tests/unit/test_templates_v2_elements.py -k tint` → FAIL; add the field; PASS.
- [ ] **Step 3: Check export.** Read how `packages/export-core` (via `scripts/run-presentation-export.mjs`) renders slides for PDF/PPTX/MP4. If it uses this repo's `frontend` renderer, nothing more. If it uses `servers/nextjs` (which we must not change), tinted decor will keep its baked color in exports: **stop and report to the user before Task 4**, with the options (accept, or gate migration).
- [ ] **Step 4:** `pytest tests/unit -k "template"` → PASS. Commit `feat(fastapi): accept tint on template images`.

### Task 4: Apply migration and verify visually

**Files:** Modify `templates/*/template.json` (via script `--write`).

- [ ] **Step 1:** `node scripts/migrate-template-svg-tint.mjs --write`; confirm re-run reports 0 migrated and `git diff --stat` touches only `template.json` files (note: `templates/momentum/template.json` already has unrelated local edits; review its diff and keep them separate in the commit).
- [ ] **Step 2:** `cd frontend && npm run check && npm run test:golden` → PASS; `cd servers/fastapi && pytest tests/unit` → PASS.
- [ ] **Step 3:** Run the stack per `CLAUDE.md` (`docker compose up production`, then `docker compose -f docker-compose.frontend.yml up`). For at least momentum, one other template, and one with many decor shapes: open a deck under the template's own theme and compare against `git stash`-ed (pre-migration) rendering: identical. Then apply 2 other themes: backgrounds, bubbles and shapes recolor; photos unchanged. Screenshot evidence in the report.
- [ ] **Step 4:** Commit `feat(templates): tint single-color decorative svgs`.

---

## Self-review

- Spec coverage: marker + renderer (T1), migration + 4 icons + skip rules (T2), backend/export constraint (T3), visual verification and golden handling (T4). Multi-color/gradient/raster explicitly out.
- Names consistent: `tint`, `migrateTemplate`, `stripTint`.
- Risk called out: export path may use `servers/nextjs`; Task 3 step 3 is a hard stop.
