# Import PowerPoint as a template (Vue frontend)

Date: 2026-11-26 · Status: draft for approval

## Intent

The backend can already turn an uploaded `.pptx` into a reusable template-v2 (font check → slide
previews → PPTX-to-JSON → AI layout per slide → merged blocks + theme). The new Vue frontend has no
way to reach it. Add an "Import PowerPoint" section to Templates that drives that pipeline, in the
current design system and with its existing loading animations.

## Verified backend state (2026-11-26, live container)

- `POST /api/v1/ppt/fonts/check`: works (0.1 s on a 5-slide deck). **Admin-only** (middleware blocks
  `POST /api/v1/ppt/fonts/*` for non-admins → 403).
- `POST /api/v1/ppt/template/fonts-upload-and-slides-preview` (multipart `pptx_file`, optional
  `font_files[]` + `original_font_names[]`): works (4.3 s, 5 PNGs, returns `modified_pptx_url`,
  `slide_image_urls`, `fonts`). Not admin-only.
- PPTX-to-JSON conversion used by template creation: works (0.8 s, 5 layouts).
- `POST /api/v1/ppt/template/async` → `AsyncTaskModel` (`type: "template.create"`), polled via
  `GET /api/v1/async-tasks/status/{id}`; `task.data` carries `template_v2_id`, `created_layouts`,
  `remaining_layouts`, `slide_layout_statuses[{index,status}]`, `name`, `thumbnail`, `attempt`.
  Retry: `POST /api/v1/ppt/template/async/{task_id}/retry`. Async task list:
  `GET /api/v1/async-tasks?type=template.create`.
- **Not verified end-to-end:** the LLM layout-generation stage (needs an authenticated session).
  Verify manually in the browser as the last step.
- Routing: prod and dev nginx send `/api/v1/` and `/app_data/uploads/` to FastAPI; upload limit
  110 MB (backend caps PPTX at 100 MB).
- `frontend/src/api/schema.d.ts` already types all of these endpoints.

## Approaches

- **A. Server-side async task (chosen by the user).** One `POST /template/async`, then poll. Survives
  leaving the page, has a retry endpoint, reports per-slide completion. No live per-slide layout
  preview while it runs.
- B. Client-orchestrated (`init` → `layouts/create` per slide → `PATCH layouts` → `generate-blocks`),
  as the old Next.js app does. Live per-slide previews and per-slide retry, but closing the tab
  stops the job and leaves a half-built template. Rejected.

## Goals

- Entry point: an "Import PowerPoint" button on `/templates` (header row next to the toolbar, and in
  the "no custom templates" empty state).
- New route `/templates/import` (declared before `/templates/:id`), app layout, one page with a
  step flow:
  1. **Upload**: drag-and-drop or pick one `.pptx` (≤ 100 MB, extension checked client-side).
  2. **Fonts** (only shown when `fonts/check` reports unavailable fonts): per missing font, upload
     a replacement file (`.ttf/.otf/.woff/.woff2`, ≤ 10 MB) or keep the fallback. If `fonts/check`
     returns 403 (non-admin), skip this step silently and go on.
  3. **Review**: `fonts-upload-and-slides-preview` runs (AiProgress while it does), then a grid of
     the slide PNGs, a name field (defaulted from the file name) and an optional description.
     "Create template" starts the task.
  4. **Generating**: AiProgress driven by real progress (`created / total`), plus the slide grid
     where pending slides carry the `skeleton-shimmer` overlay and completed ones a check, from
     `slide_layout_statuses`. Leaving is allowed; copy says it keeps running.
  5. **Done**: invalidate `templatesKey`, toast, navigate to `/templates/<template_v2_id>`.
  - **Error**: message from `useAsyncTask().error` + "Try again" (retry endpoint) + "Start over".
- Resume: the task id is kept by `useAsyncTask` (`storageKey`), so refreshing or returning to
  `/templates/import` reopens the Generating step.
- In-progress visibility: `/templates` shows each pending `template.create` task (from the async
  task list, recent ones only) as a card with thumbnail + compact progress, linking to
  `/templates/import?task=<id>`; it refetches the template list when one completes.
- i18n: all copy in `en` and `it` (`templates.json` / `views.json`).

## Non-goals

- Smart presentations (project rule).
- Google Fonts replacement picker (backend supports `google_font_*`; the old app had it). Possible
  follow-up.
- Editing generated layouts / schema editor from the old custom-template studio. The existing
  template detail view shows the result.
- Per-slide retry (approach B only).
- Any change to `servers/nextjs` or the backend.

## Anti-goals

- Must not look like a different app: reuse `workspace-card`, `PageHeader`, shadcn-vue Button /
  Input / Alert, `AiProgress`, `skeleton-shimmer`, `anim-rise-in`; light-theme tokens
  (`text-strong`, existing `tx-*/sx-*`), never greyed dark. Extend additively.
- No fake progress when real progress is known.

## Design decisions (builder's calls, stated)

- New `api/templateImport.ts`: `checkFonts(file)`, `prepareImport(file, fonts[])`,
  `startImport(body)`, `retryImport(taskId)`, `listImportTasks()`; typed from `schema.d.ts`.
- New `composables/useTemplateImport.ts`: step state machine + `useAsyncTask` (storageKey
  `template-import-task`). Unit-tested with vitest (step transitions, 403 font skip, progress
  maths, resume).
- `AiProgress.vue`: add an optional `value` prop (0–100). When set, the fill uses it instead of the
  time-based easing. Additive; current callers unchanged.
- Components under `components/templates/import/`: `ImportDropzone`, `ImportFontsStep`,
  `ImportReviewStep`, `ImportProgressStep`, `ImportTaskCard`.
- Verification: `npm run check` (vue-tsc, vitest, eslint), then a manual end-to-end import in the
  browser through the dev stack, including the LLM stage.
