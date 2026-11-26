# Import PowerPoint as a Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users turn a `.pptx` into a custom template from the Vue frontend, using the existing backend pipeline as a server-side async task.

**Architecture:** A thin API module wraps the five backend calls and parses task progress. A composable owns the step state machine (upload → fonts → review → generating → done/error) and reuses `useAsyncTask` for polling and resume. A new `/templates/import` view renders the steps; `/templates` gains an entry button and cards for imports still running.

**Tech Stack:** Vue 3 `<script setup>` + TS, vue-router, @tanstack/vue-query, vue-i18n (en/it JSON), shadcn-vue, Tailwind v4, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-11-26-pptx-template-import-design.md`

## Global Constraints

- Frontend only: no changes to `servers/fastapi` or `servers/nextjs`.
- Template-based only; nothing for smart presentations.
- Design system reuse: `workspace-card`, `PageHeader`, shadcn-vue `Button`/`Input`/`Textarea`/`Label`/`Alert`, `AiProgress`, `skeleton-shimmer`, `anim-rise-in`, `toast` from `@/components/ui/sonner`. Extend additively; never remove existing look. Light theme must stay truly light (use existing `tx-*`/`sx-*`/`text-strong` tokens, no hard-coded dark greys).
- Limits: PPTX ≤ 100 MB, extension `.pptx`; font files `.ttf .otf .woff .woff2`, ≤ 10 MB each.
- Every user-visible string goes in both `src/i18n/locales/en/*.json` and `src/i18n/locales/it/*.json`.
- Baseline before this work (do not make worse): `vue-tsc -b` 9 errors; vitest 2 failed / 1875 passed (1 file); eslint 6 errors / 7 warnings.
- Commit per task on branch `dev`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Non-admin user**: `fonts/check` returns 403 → the flow skips the fonts step and still produces previews (Task 3 test `skips fonts on 403`).
2. **Refresh / come back mid-generation**: `/templates/import` reopens the Generating step from sessionStorage, and `/templates/import?task=<id>` adopts that task (Task 3 tests `resumes from storage`, `adopts task from query`).
3. **Stale pending tasks** after a backend restart never complete: the Templates page only shows `template.create` tasks with `status=pending` created in the last 6 hours (Task 1 test `listImportTasks sends type, status and since`).
4. **Wrong file**: a `.ppt`/`.key`/oversized file is rejected client-side with a message and no request (Task 3 test `rejects non-pptx and oversize`).
5. **Task fails** (LLM error): Generating shows the backend message with "Try again" (retry endpoint, same task id, keeps polling) and "Start over" (clears storage) (Task 3 tests `retry restarts polling`, `reset clears everything`).

---

### Task 1: API module

**Files:**
- Create: `frontend/src/api/templateImport.ts`
- Test: `frontend/tests/unit/api/templateImport.test.ts`

**Interfaces:**
- Produces:
  - `type FontInfo = components['schemas']['FontInfo']`
  - `type ImportPreview = components['schemas']['FontsUploadAndSlidesPreviewResponse']`
  - `const MAX_PPTX_BYTES = 100 * 1024 * 1024`, `MAX_FONT_BYTES = 10 * 1024 * 1024`, `FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const`
  - `checkFonts(file: File): Promise<FontInfo[] | null>` — unavailable fonts; `null` when the server answers 403 (non-admin). Other errors throw `ApiError`.
  - `interface FontReplacement { name: string; file: File }`
  - `prepareImport(file: File, fonts: FontReplacement[]): Promise<ImportPreview>` — multipart to `/api/v1/ppt/template/fonts-upload-and-slides-preview`, fields `pptx_file`, and per font `font_files` + `original_font_names` (= `name`).
  - `startImport(preview: ImportPreview, meta: { name: string; description?: string }): Promise<AsyncTask>` — `POST /api/v1/ppt/template/async` with `{ pptx_url: preview.modified_pptx_url, slide_image_urls, fonts, name, description }` (omit empty description).
  - `retryImport(taskId: string): Promise<AsyncTask>` — `POST /api/v1/ppt/template/async/{task_id}/retry`.
  - `listImportTasks(now?: Date): Promise<AsyncTask[]>` — `GET /api/v1/async-tasks` with `type=template.create`, `status=pending`, `created_at_from=<now − 6h ISO>`.
  - `interface ImportProgress { templateId: string | null; name: string | null; thumbnail: string | null; done: number; total: number; slides: ('completed' | 'pending')[] }`
  - `readImportProgress(task: AsyncTask | null): ImportProgress` — defensive parse of `task.data` (`template_v2_id`, `name`, `thumbnail`, `created_layouts`, `remaining_layouts`, `slide_layout_statuses`); `total = created + remaining`; missing/garbage → zeros/nulls/`[]`.
- Uses existing `api`, `unwrap`, `requestJson` (`@/api/client`), `ApiError` (`@/api/errors`), `AsyncTask` (`@/api/tasks`).

- [ ] **Step 1: Write failing tests** (stub `fetch` like `tests/unit/api/useAsyncTask.test.ts`):
  - `checkFonts returns unavailable fonts` — 200 `{available_fonts:[], unavailable_fonts:[{name:'Gotham Bold'}]}` → `[{name:'Gotham Bold'}]`; request is POST multipart to `/api/v1/ppt/fonts/check` with `pptx_file`.
  - `checkFonts returns null on 403`.
  - `prepareImport sends pptx and fonts` — FormData has `pptx_file`, `font_files` ×2, `original_font_names` = `['Gotham Bold','Gotham Book']`.
  - `startImport posts the preview urls` — body equals `{pptx_url:'/m.pptx', slide_image_urls:['/1.png'], fonts:{}, name:'Deck'}` (no `description` key when blank).
  - `listImportTasks sends type, status and since` — with `now = 2026-11-26T12:00:00Z`, query contains `type=template.create`, `status=pending`, `created_at_from=2026-11-26T06%3A00%3A00.000Z`.
  - `readImportProgress parses task data` — `{template_v2_id:'tpl', created_layouts:2, remaining_layouts:3, slide_layout_statuses:[{index:0,status:'completed'},{index:1,status:'completed'},{index:2,status:'pending'},...]}` → `{templateId:'tpl', done:2, total:5, slides:['completed','completed','pending','pending','pending'], ...}`; `readImportProgress(null)` → `{templateId:null,name:null,thumbnail:null,done:0,total:0,slides:[]}`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/api/templateImport.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/api/templateImport.ts`. Use `api.POST`/`api.GET` + `unwrap` for JSON endpoints; `requestJson` for the two multipart ones (catch `ApiError` with `status === 403` in `checkFonts`).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(frontend): template import API module`.

---

### Task 2: AiProgress real-progress `value`

**Files:**
- Modify: `frontend/src/components/shell/AiProgress.vue`
- Test: `frontend/tests/unit/shell/AiProgress.test.ts` (create)

**Interfaces:**
- Produces: prop `value?: number` (0–100). When defined, `progress = clamp(round(value), 0, 100)` and the time easing is ignored; when undefined, behaviour is unchanged.

- [ ] **Step 1: Write failing tests:** `uses value when given` — mount with `{stage:'x', value: 40}` → `[role=progressbar]` has `aria-valuenow="40"` and text `40%`; `clamps value` — `value: 140` → `100`; `falls back to timer` — no `value`, fake timers advanced 0 ms → `aria-valuenow="0"`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/shell/AiProgress.test.ts` → FAIL.
- [ ] **Step 3: Implement** the prop in `AiProgress.vue`.
- [ ] **Step 4: Run** → PASS; also `npx vitest run tests/unit/create` → no new failures.
- [ ] **Step 5: Commit** `feat(frontend): AiProgress accepts real progress`.

---

### Task 3: `useTemplateImport` state machine

**Files:**
- Create: `frontend/src/composables/useTemplateImport.ts`
- Test: `frontend/tests/unit/composables/useTemplateImport.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `useAsyncTask` (`@/composables/useAsyncTask`).
- Produces:
  - `type ImportStep = 'upload' | 'preparing' | 'fonts' | 'review' | 'generating' | 'done' | 'error'`
  - `const IMPORT_TASK_STORAGE_KEY = 'template-import-task'`
  - `useTemplateImport(opts?: { initialTaskId?: string | null; onDone?: (templateId: string) => void })` returning:
    - refs: `step: Ref<ImportStep>`, `file: Ref<File | null>`, `missingFonts: Ref<FontInfo[]>`, `replacements: Ref<Record<string, File>>` (keyed by font `name`), `preview: Ref<ImportPreview | null>`, `name: Ref<string>`, `description: Ref<string>`, `error: Ref<string | null>` (step-level error: validation or request), `busy: Ref<boolean>`
    - computed: `progress: ComputedRef<ImportProgress>`, `taskError: ComputedRef<string | null>`
    - actions: `selectFile(f: File): Promise<void>`, `setReplacement(fontName: string, f: File | null): string | null` (returns i18n error message or null), `continueFromFonts(): Promise<void>`, `create(): Promise<void>`, `retry(): Promise<void>`, `reset(): void`
- Flow:
  - `selectFile`: validate (`.pptx`, ≤ `MAX_PPTX_BYTES`, else set `error`, stay on `upload`, no request); set `file`; `name` defaults to file basename without extension; step `preparing`; `checkFonts`. Non-empty list → step `fonts`. Empty or `null` (403) → call `prepare()` internally.
  - `prepare()` (internal): step `preparing`, `prepareImport(file, replacements)`, → `review`. On error → back to the step it came from with `error` set.
  - `continueFromFonts` = `prepare()` (missing fonts without a replacement keep the fallback).
  - `create`: requires `preview` and trimmed `name`; `startImport` → `useAsyncTask.start(task.id)`; step `generating`.
  - Task status mapping: pending → `generating`, `error` → step `error`, `completed` → step `done` and `onDone(progress.templateId)`.
  - `retry`: `retryImport(taskId)` then `start(taskId)` again; step `generating`.
  - `reset`: clears task (and its storage), all refs, step `upload`.
  - Resume: if `initialTaskId` is given it is adopted (`start`); otherwise `useAsyncTask` reads `IMPORT_TASK_STORAGE_KEY`; either way the initial step is `generating`.

- [ ] **Step 1: Write failing tests** (mock `@/api/templateImport` and `@/api/tasks` `getTask`; fake timers; run inside `effectScope`):
  - `rejects non-pptx and oversize` — `selectFile(new File([''], 'a.key'))` → `step==='upload'`, `error` truthy, `checkFonts` not called; same for a `.pptx` whose `size` is `MAX_PPTX_BYTES + 1` (use `Object.defineProperty(file,'size',…)`).
  - `goes to fonts when fonts are missing` — `checkFonts` → `[{name:'Gotham Bold'}]` → `step==='fonts'`, `missingFonts` length 1, `name==='Quarterly Review'` for file `Quarterly Review.pptx`.
  - `skips fonts on 403` — `checkFonts` → `null` → `prepareImport` called with `(file, [])`, `step==='review'`.
  - `passes replacements to prepare` — `setReplacement('Gotham Bold', fontFile)` then `continueFromFonts()` → `prepareImport` called with `(file, [{name:'Gotham Bold', file: fontFile}])`; `setReplacement('X', new File([''],'x.exe'))` returns a non-null message and stores nothing.
  - `create starts the task and finishes` — `startImport` → `{id:'t1'}`; `getTask` → pending then completed with `data.template_v2_id='tpl'` → `step` goes `generating` → `done`, `onDone` called with `'tpl'`; `sessionStorage[IMPORT_TASK_STORAGE_KEY]==='t1'` while generating.
  - `task error shows retry` — `getTask` → `{status:'error', error:{detail:'LLM down'}}` → `step==='error'`, `taskError` contains `LLM down`.
  - `retry restarts polling` — from error, `retry()` → `retryImport('t1')` called, `step==='generating'`, polling resumes.
  - `resumes from storage` — pre-set storage to `t9`, create composable → `step==='generating'`, `getTask('t9')` polled.
  - `adopts task from query` — `useTemplateImport({ initialTaskId: 't7' })` → polls `t7`.
  - `reset clears everything` — after generating, `reset()` → `step==='upload'`, storage key removed, `file===null`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/composables/useTemplateImport.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/composables/useTemplateImport.ts`. Error strings come from `i18n.global.t('templates.import.errors.*')` (keys added in Task 4; add the `errors` block to en/it `templates.json` in this task so tests resolve real copy). Request errors use `extractApiErrorMessage` like `TemplatesView.vue`'s `errorMessage`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(frontend): template import state machine`.

---

### Task 4: Import view, step components, route, copy

**Files:**
- Create: `frontend/src/views/ImportTemplateView.vue`
- Create: `frontend/src/components/templates/import/ImportDropzone.vue`, `ImportFontsStep.vue`, `ImportReviewStep.vue`, `ImportProgressStep.vue`
- Modify: `frontend/src/router.ts` (add `{ path: '/templates/import', name: 'template-import', component: () => import('@/views/ImportTemplateView.vue'), meta: { layout: 'app' } }` **before** `/templates/:id`)
- Modify: `frontend/src/i18n/locales/{en,it}/templates.json` (block `import`), `{en,it}/views.json` (`templateImport.title`)
- Test: `frontend/tests/unit/templates/ImportTemplateView.test.ts`

**Interfaces:**
- Consumes: Task 3 composable (whole return object), Task 2 `AiProgress value`, `readImportProgress` output via `progress`.
- Component props (all emit up; no API calls inside components):
  - `ImportDropzone`: `{ disabled?: boolean; error?: string | null }`, emits `select(file: File)`. Pattern: `TopicComposer.vue` drag-over handling; hidden `<input type=file accept=".pptx">`; shows the limit hint.
  - `ImportFontsStep`: `{ fonts: FontInfo[]; replacements: Record<string, File>; busy: boolean; error?: string | null }`, emits `replace(name: string, file: File | null)`, `continue()`, `back()`. One row per font: name, "Upload replacement" (accept `.ttf,.otf,.woff,.woff2`), chosen file name + remove, otherwise "Uses a fallback font".
  - `ImportReviewStep`: `{ slides: string[]; name: string; description: string; busy: boolean; error?: string | null }`, `v-model:name`, `v-model:description`, emits `create()`, `back()`. Grid of slide PNGs (same grid classes as `PreviewStep.vue` `preview-grid`), Input + Textarea, primary "Create template" disabled when name is blank.
  - `ImportProgressStep`: `{ progress: ImportProgress; slides: string[]; status: 'generating' | 'error'; error?: string | null }`, emits `retry()`, `reset()`. `AiProgress` with `:value="total ? 100*done/total : undefined"`, stage `"Building layout {n} of {total}"`, detail `"{done} of {total} slides"`; slide grid where each card shows the PNG (`slides[i]`, falls back to `progress.thumbnail`) with a `skeleton-shimmer` overlay while pending and a check badge when completed; note "This keeps running if you leave this page". On `error`: `Alert variant="destructive"` with message + "Try again" + "Start over".
- `ImportTemplateView`: `PageHeader` with parent link to `/templates`; `workspace-card` with heading + intro (`anim-rise-in`); renders the step component for `step`; `preparing` shows `AiProgress` (`stage`: "Reading your presentation", `expected-ms` 15000). Reads `route.query.task` as `initialTaskId`. `onDone`: `queryClient.invalidateQueries({ queryKey: templatesKey })`, `toast.success(t('templates.import.done'))`, `router.replace('/templates/' + id)`.
- English copy (Italian equivalents in `it`): title "Import PowerPoint"; heading "Turn a deck into a template."; intro "Upload a .pptx and every slide becomes a reusable layout with its fonts and colours."; dropzone "Drop a .pptx here or browse" / hint "PowerPoint (.pptx), up to 100 MB"; fonts heading "Some fonts aren't installed" / text "Upload the font files to keep the original look, or continue and a similar font will be used."; review heading "{count} slide found | {count} slides found"; name label "Template name"; description label "Description (optional)"; create "Create template"; back "Back"; preparing "Reading your presentation"; progress stage "Building layout {current} of {total}"; detail "{done} of {total} slides"; leave note "This keeps running if you leave this page."; retry "Try again"; start over "Start over"; done "Template created"; errors: `notPptx` "Choose a PowerPoint file (.pptx).", `tooLarge` "The file is larger than 100 MB.", `fontType` "Use a .ttf, .otf, .woff or .woff2 font file.", `fontTooLarge` "Font files must be under 10 MB.", `prepareFailed` "Could not read the presentation.", `startFailed` "Could not start the import.".

- [ ] **Step 1: Write failing view tests** (mock `@/api/templateImport`, `getTask`, stub `SlideView` not needed; memory router with `/templates`, `/templates/import`, `/templates/:id`):
  - `routes /templates/import to the import view, not the detail view` — push `/templates/import` → finds `[data-testid=import-dropzone]`.
  - `walks upload → review → create` — trigger file input change with `deck.pptx` (`checkFonts` → `[]`, `prepareImport` → 3 PNGs) → 3 `img` in review grid, name input value `deck`; click "Create template" → `startImport` called with name `deck`; `[data-testid=import-progress]` visible.
  - `shows fonts step and continues` — `checkFonts` → one font → its name rendered; click continue → `prepareImport` called.
  - `navigates to the template when done` — task completes with `template_v2_id:'tpl'` → router path `/templates/tpl`.
  - `shows retry on failure` — task error → "Try again" button calls `retryImport`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/templates/ImportTemplateView.test.ts` → FAIL.
- [ ] **Step 3: Implement** the route, copy (en + it), four components and the view.
- [ ] **Step 4: Run** the test → PASS; `npx vitest run tests/unit/router.test.ts tests/unit/i18n.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(frontend): import PowerPoint as template view`.

---

### Task 5: Entry points and in-progress cards on /templates

**Files:**
- Create: `frontend/src/components/templates/ImportTaskCard.vue`
- Modify: `frontend/src/views/TemplatesView.vue`
- Modify: `frontend/src/i18n/locales/{en,it}/views.json` (`templates.import`, `templates.importing`), `{en,it}/templates.json` (`importCard.*`)
- Test: `frontend/tests/unit/templates/TemplatesView.test.ts` (extend)

**Interfaces:**
- Consumes: `listImportTasks`, `readImportProgress` (Task 1); `AiProgress value` (Task 2); `template-import` route (Task 4).
- `ImportTaskCard`: `{ task: AsyncTask }`. Same footprint as `TemplateCard` (16:9 cover = `progress.thumbnail` image, else `skeleton-shimmer`; title = `progress.name`; meta "Importing · {done} of {total} slides"); slim progress bar using the `AiProgress` track styling is fine, or a compact `AiProgress`; whole card is a `RouterLink` to `{ name: 'template-import', query: { task: task.id } }`.
- `TemplatesView` changes:
  - Primary `Button` "Import PowerPoint" (lucide `FileUp` icon) linking to `/templates/import`, placed in the row with the "Templates" heading, left of `TemplatesToolbar`; stacks on ≤760px like the existing row.
  - In the `kind === 'custom'` empty state, the same button under the hint.
  - `useQuery({ queryKey: ['template-import-tasks'], queryFn: () => listImportTasks(), refetchInterval: (q) => (q.state.data?.length ? 5000 : false) })`. When the count of tasks drops, `invalidateQueries({ queryKey: templatesKey })`.
  - Render `ImportTaskCard`s first in the grid when `kind` is `all` or `custom` and there is no search text. The grid and empty states must still behave as today when there are no tasks.
- Copy (en): button "Import PowerPoint"; card meta "Importing · {done} of {total} slides"; card label "Open import of {name}".

- [ ] **Step 1: Write failing tests** in `TemplatesView.test.ts` (mock `@/api/templateImport`'s `listImportTasks`; default `[]`):
  - `links to the import page` — the "Import PowerPoint" link `href` is `/templates/import`.
  - `shows running imports first` — `listImportTasks` → one task with `data:{name:'Brand deck', created_layouts:1, remaining_layouts:3, template_v2_id:'x'}` → first grid child has `data-testid="import-task-card"`, text includes `Brand deck` and `1 of 4`, link to `/templates/import?task=<id>`.
  - `hides running imports for built-in filter` — `?kind=builtin` → no `import-task-card`.
  - Existing tests in the file still pass unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/unit/templates/TemplatesView.test.ts` → new tests FAIL.
- [ ] **Step 3: Implement** `ImportTaskCard.vue`, `TemplatesView.vue` changes, copy.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(frontend): import entry point and running imports on Templates`.

---

### Task 6: Verification

- [ ] **Step 1:** `cd frontend && npx vue-tsc -b 2>&1 | grep -c "error TS"` → `9` (baseline; none in new files). `npx vitest run` → only the 2 baseline failures. `npx eslint .` → 6 errors (baseline), none in new files.
- [ ] **Step 2:** Manual end-to-end with the dev stack (`docker compose up production` already running on :5001; `docker compose -f docker-compose.frontend.yml up` for Vite on :5173), logged in as a user: import `~/Downloads/Contaminazioni AI & LLM.pptx` (or any small deck). Check: previews appear; name defaulted; Generating shows real progress and shimmer → checks; refresh mid-way resumes; leaving to `/templates` shows the running card; on completion the template opens in `/templates/<id>` and its layouts render. Check light and dark themes and a 375 px width.
- [ ] **Step 3:** Also as a non-admin user (if one exists): fonts step is skipped, import still works.
- [ ] **Step 4:** Report results to the user, including anything that failed (especially the LLM layout stage, which was not verifiable before).
