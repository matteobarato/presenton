# Handoff: Start a presentation from PowerPoint (plan + build phase)

Date: 2026-11-26 · From: design session · To: a fresh session that plans and builds

## Paste this into the new session

```
Implement "Start a presentation from PowerPoint".
Spec (approved): docs/superpowers/specs/2026-11-26-pptx-presentation-import-design.md
Handoff notes: docs/superpowers/plans/2026-11-26-pptx-presentation-import-handoff.md (read first)
The design is approved; don't re-brainstorm it. First write the implementation plan with
superpowers:writing-plans (save it as docs/superpowers/plans/2026-11-26-pptx-presentation-import.md),
then ask me how to execute it (subagent-driven or inline) and build it.
```

## Status

- Spec: **approved by the user, all of it** (including the calls marked "my call").
- Plan: **not written yet**. That is the first job of the new session.
- Nothing implemented. Branch `dev` was clean when the design started; spec and this handoff are
  committed on `dev`. Do the work on a feature branch (e.g. `feat/pptx-presentation-import`),
  ideally in a worktree (superpowers:using-git-worktrees).

## What the user wants (short)

Step 1 of the create wizard (`frontend/src/views/NewView.vue`) gets a two-option switch:
**From a topic** (today's view) | **From PowerPoint**. From PowerPoint uploads a `.pptx` and imports
it **keeping its content and design**: every slide becomes an editable slide (no template, no AI
rewrite). The deck then goes through Presenter → Preview → Narration → Export like any other deck;
the user can edit it in the classic editor.

## Decisions made with the user (binding)

1. Keep content **and** design (no re-templating).
2. Presenter videos: a **count** on the Presenter step, placed automatically, bottom-right, portrait
   9:16; the user moves them in the editor.
3. Count **Automatic** (default) = first and last slides always + AI picks others from notes and
   slide text (section intros, or ~every 3–4 slides); deterministic fallback if the LLM fails.
   Explicit N = spread evenly (`round(i*(S-1)/(N-1))`).
4. Decks that aren't 16:9 are **fitted into 16:9** at import (uniform scale, centred, bands in the
   slide's background colour).
5. Approach: **one synchronous `POST /api/v1/ppt/presentation/import`** that reuses the
   template-import upload (`fonts-upload-and-slides-preview` → `modified_pptx_url`). No async task.
6. UI: labels "From a topic"/"From PowerPoint"; after upload show file name, slide count, thumbnail
   strip, Replace; inline missing-fonts warning with Fix; only the narration language remains (no
   template grid, no other chips); state of both modes kept when switching; mode in URL
   `?start=pptx`; hint when a `.pptx` is dropped in the topic composer; Presenter primary reads
   **Import slides**; land on **Preview**; Outline of an imported deck is a **read-only summary**.
7. Calls approved with the spec: new nullable `presentations.source` column (`"pptx"`); first 50
   slides imported with a visible note (add `original_slide_count` to the preview response);
   editor chat refuses template-rebuild tools on imported decks; frontend sends `title` +
   `source_name`; font-replacement UI extracted into a shared component; one line added to
   CLAUDE.md after shipping so the "templates only" rule isn't read as forbidding imports.

## Pitfalls found during design (read before planning)

- **Outline stream trap.** Opening the Outline step mounts `OutlineStep` → `useOutlineStream`,
  which starts the AI outline stream when the deck has no outline; "Generate slides" would then
  rebuild the deck from a template. For `source === 'pptx'` never mount `OutlineStep`
  (`frontend/src/components/create/wizard/DeckWizard.vue`).
- **Aspect ratio.** The converter normalises width to 1280 and keeps the deck's aspect (4:3 →
  1280×960); see `_preview_dimensions_from_document` / `_preview_dimensions_from_pptx` in
  `servers/fastapi/templates/fonts_and_slides_preview.py`. Everything else assumes 1280×720, and
  `validate_stage_box` rejects boxes past y=720. Scaling must cover nested containers, font sizes,
  strokes, radii, paddings.
- **50-slide trim is silent.** `_trim_pptx_to_max_slides` cuts the upload to 50 slides and renames
  the file (`…-first-50.pptx`); the server can't recover the original name or count without the
  new `original_slide_count` field.
- **Speaker notes for imported slides.** `utils/llm_calls/generate_speaker_notes.py` `_slide_text`
  prefers `slide["text"]`, then HTML, then `content`; imported slides have `content={}`. Feed text
  extracted from `ui.elements` as `text`. Verify python-pptx slide order (hidden slides) matches the
  converter's before aligning notes by index.
- **Chat rebuilds.** `services/chat/memory_layer.py` (~line 1090, `_build_template_slide_ui`)
  rebuilds `slide.ui` from `presentation.layout`; imported decks have `layout=None`.
- **Presenter Automatic.** `mediaCountForRequest('')` sends `null`; the endpoint must treat `null` as
  Automatic (not "none").
- **Font check is admin-only** (`/api/v1/ppt/fonts/check` → 403); `checkFonts` returns `null` then.
- **Fonts at render time.** Confirm how a template-less deck loads its fonts (renderer reads
  `presentation.fonts`? `frontend/src/render/font-registry.ts`) in Preview, editor and export.

## Key files

- Backend: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (blank deck constants ~L216,
  `create_blank_presentation` ~L2945, `_apply_speaker_notes` ~L3136),
  `api/v1/ppt/endpoints/template.py` (`_prepare_template_source` ~L880 as the conversion model),
  `services/export_task_service.py` (`convert_pptx_to_json` L685),
  `services/slide_video_service.py` (`ensure_video_placeholder` L361, `default_placeholder_box`
  L196), `templates/v2/models/layouts.py` (`RawSlideLayout`), `models/sql/presentation.py`,
  `alembic/versions/`, `constants/presentation.py` (`MAX_NUMBER_OF_SLIDES = 50`).
- Frontend: `views/NewView.vue`, `components/create/NewPresenterStep.vue`,
  `components/create/TopicComposer.vue`, `components/create/options.ts`,
  `components/create/wizard/{DeckWizard.vue,progress.ts}`, `components/create/steps/PreviewStep.vue`,
  `api/templateImport.ts` (`checkFonts`, `prepareImport`), `composables/useTemplateImport.ts`,
  `components/templates/import/ImportDropzone.vue`, `render/slide-kind.ts`, `api/schema.d.ts`,
  `i18n/locales/{en,it}/*.json`.

## Project rules to keep

- Don't modify `servers/nextjs`. No Smart-generation features.
- Aera look and feel, extended additively; light theme tokens (`text-strong`, `theme-light.mjs`).
- The presenter/avatar keeps a prominent, dedicated step.
- Dev: `docker compose up production`, then `docker compose -f docker-compose.frontend.yml up`
  (Vite :5173 → stack :5001).

## Done means

Every item under "Verification before calling it done" in the spec passes, including a manual check
in the browser with a real `.pptx` (images, table, chart, notes, a missing font), a 4:3 deck and a
70-slide deck, plus PPTX and MP4 export of an imported deck.
