# New Vue Frontend — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/frontend`, a Vue 3 + Vite + shadcn-vue + Tailwind v4 app with its own `docker-compose.frontend.yml`, covering auth, library, create (Template + Smart), the editor (render, slide management, Ask, notes, design, chat, narration, video, export) and present mode against the existing backend.

**Architecture:** A same-origin SPA whose Vite dev server proxies `/api`, `/app_data`, `/static`, `/docs`, `/openapi.json` to the running stack (`BACKEND_URL`, default `http://host.docker.internal:5001`). Server state lives in TanStack Query over a typed `openapi-fetch` client generated from `servers/fastapi/openai_spec.json`. Slides render through one `<SlideView>` built on a verbatim copy of the old pure-TS renderer.

**Tech Stack:** Vue 3.5, TypeScript 5.7, Vite 6, Tailwind v4, shadcn-vue (reka-ui 2), Pinia 3, vue-router 4, @tanstack/vue-query 5, openapi-fetch, Vitest + @vue/test-utils + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-vue-frontend-phase1-design.md`. Executors read the spec section a task cites before starting.

## Global Constraints

- **Template-based generation only** (user decision, see `CLAUDE.md`): no Smart mode and no `slide/edit-html`. Existing smart slides render via SlideView but get no new features.

- Modify nothing outside `frontend/`, `docker-compose.frontend.yml` and `docs/superpowers/`. `servers/`, `docker-compose.yml`, `nginx.conf` and `aera-frontend/` are read-only references.
- UI product name: **Presenton**. Visual system from `aera-frontend/` (tokens, DM Sans + Manrope, glass, motion grammar).
- Node 22; Vue ^3.5; TypeScript ^5.7; Vite ^6; Tailwind ^4 via `@tailwindcss/vite`; reka-ui ^2.
- Components never call `fetch` directly: only `src/api/*` modules do.
- Slide content is never copied into Pinia; the Query cache `['presentation', id]` is the single source.
- Motion: state transitions 150–250 ms; `prefers-reduced-motion` removes translation, scale and blur. Dialogs trap focus and close on Escape.
- Stage size is 1280×720 everywhere.
- Avatar video is always muted; TTS is the only soundtrack.
- Every task: `cd frontend && npm run check` passes before commit (`vue-tsc --noEmit && vitest run && eslint .`).
- Work on branch `feat/vue-frontend-phase1`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (orchestrator) or the implementing model's equivalent line.

## Review Focus

1. **Backend down or slow.** The proxy target is unreachable → one persistent banner naming the backend URL, no blank screen. Test in Task 2 (`client.test.ts › network failure flips backendStatus`) and Task 6 (`AppShell.test.ts › shows unreachable banner`).
2. **Reload mid-task.** TTS, avatars or MP4 is running and the user reloads → progress resumes from the `sessionStorage` task id; a stale id that 404s is cleared. Test in Task 2 (`useAsyncTask.test.ts › resumes and clears unknown task`).
3. **Malformed or partial stream chunks.** The SSE frame is split across reads, or slide JSON is truncated → no crash; the parser buffers, `jsonrepair` recovers or skips. Test in Task 2 (`sse.test.ts › frame split across chunks`) and Task 10 (`streamMerge.test.ts › truncated chunk skipped`).
4. **One slide fails to render.** A bad `ui` or invalid smart HTML → that slide shows "Can't render this slide" and the others render. Test in Task 5 (`SlideView.test.ts › isolates render errors`).
5. **Stale narration.** The notes are edited after TTS was generated → the slide shows *stale*, and present mode still plays the old audio rather than nothing. Test in Task 14 (`NarrationTab.test.ts › marks stale audio`).

---

## Parallel execution map

Tasks within a wave touch disjoint files and run in parallel (one Sonnet implementer per task, each in its own git worktree off `feat/vue-frontend-phase1`). The Opus orchestrator reviews each task, merges it into the branch, and starts the next wave once its dependencies have merged. Task 1 installs every dependency so no later task touches `package.json`/`package-lock.json`.

| Wave | Tasks | Depends on |
|---|---|---|
| 0 | 1 Scaffold, compose, tokens, UI kit | — |
| 1 | 2 API core · 3 Renderer port + golden · 4 Route skeleton + editor/inspector stubs | 1 |
| 2 | 5 SlideView · 6 Auth, session, shell | 2,3 / 2,4 |
| 3 | 7 Library · 8 Create view · 9 Outline + template picker · 10 Editor core | 5,6 |
| 4 | 11 Ask + notes strip · 12 Design tab · 13 Chat tab · 14 Narration tab · 15 Video tab · 16 Export tab | 10 |
| 5 | 17 Present · 18 E2E + README | 14,15 / all |

Every view, panel and tab component that a later wave fills in is created in Task 4 as a stub (with its final props and file path), so parallel tasks only *replace their own files* and never edit shared ones.

---

### Task 1: Scaffold, dev compose, design tokens, UI kit

**Files:**
- Create: `docker-compose.frontend.yml`, `frontend/{package.json,vite.config.ts,vitest.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,eslint.config.js,components.json,index.html,.gitignore,.dockerignore}`
- Create: `frontend/src/api/{schema.d.ts (generated),types.ts}`, `frontend/src/{main.ts,App.vue,env.d.ts}`, `frontend/src/styles/{tokens.css,base.css,motion.css,fonts.css}`, `frontend/src/lib/utils.ts` (`cn`)
- Create: `frontend/src/components/ui/*` (shadcn-vue: button, input, textarea, label, dialog, sheet, tabs, tooltip, dropdown-menu, select, switch, slider, checkbox, badge, card, scroll-area, separator, skeleton, progress, popover, alert, sonner)
- Create: `frontend/public/fonts/*` (copy `aera-frontend/public/fonts/*`), `frontend/public/vendor/*` (copy `servers/nextjs/public/vendor/*`, including the `fonts/` folder and LICENSE files), `frontend/public/favicon.svg`
- Test: `frontend/tests/unit/smoke.test.ts`, `frontend/tests/unit/vite-proxy.test.ts`

**Interfaces:**
- Produces: `cn(...classes)`; `@/` alias → `frontend/src`; the shadcn components above at `@/components/ui/<name>`; CSS tokens (`--color-accent`, `--color-rail`, `--color-shell`, `--color-canvas`, `--color-storyboard`, `--color-inspector`, the glass material classes and motion utilities copied from `aera-frontend/src/style.css` + `motion.css`); `export function proxyTargets(backendUrl: string): Record<string, ProxyOptions>` exported from `frontend/vite.proxy.ts`.

- [ ] **Step 1: Write package.json with all Phase 1 dependencies**
Dependencies: `vue`, `vue-router`, `pinia`, `@tanstack/vue-query`, `openapi-fetch`, `reka-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-vue-next`, `vue-sonner`, `@vueuse/core`, `dompurify`, `katex`, `jsonrepair`, `vuedraggable@next`. Dev: `vite`, `@vitejs/plugin-vue`, `typescript`, `vue-tsc`, `tailwindcss`, `@tailwindcss/vite`, `@types/node`, `@types/dompurify`, `openapi-typescript`, `vitest`, `@vue/test-utils`, `jsdom`, `@playwright/test`, `eslint`, `eslint-plugin-vue`, `typescript-eslint`, `@vue/eslint-config-typescript`.
Scripts: `dev` (`vite`), `build` (`vue-tsc -b && vite build`), `gen:api` (`openapi-typescript ../servers/fastapi/openai_spec.json -o src/api/schema.d.ts`), `test` (`vitest run`), `test:golden` (`vitest run --config vitest.golden.config.ts`), `e2e` (`playwright test`), `lint` (`eslint .`), `check` (`vue-tsc --noEmit && vitest run && eslint .`).
Run `npm install` to produce `package-lock.json`. Then run `npm run gen:api` and create `src/api/types.ts` exporting `Slide = components['schemas']['SlideModel-Output']`, `Presentation = components['schemas']['PresentationWithSlides']` and `AsyncTask = components['schemas']['AsyncTaskModel']`. Both are committed in this task.

- [ ] **Step 2: Write the failing proxy test**
```ts
// tests/unit/vite-proxy.test.ts
import { proxyTargets } from '../../vite.proxy'
test('proxies every backend prefix to BACKEND_URL', () => {
  const t = proxyTargets('http://host.docker.internal:5001')
  expect(Object.keys(t).sort()).toEqual(['/api', '/app_data', '/docs', '/openapi.json', '/static'])
  for (const v of Object.values(t)) { expect(v.target).toBe('http://host.docker.internal:5001'); expect(v.changeOrigin).toBe(false) }
})
```
`changeOrigin: false` keeps the cookie host matching the page.

- [ ] **Step 3: Run it.** `npx vitest run tests/unit/vite-proxy.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 4: Implement `vite.proxy.ts` and `vite.config.ts`**
`vite.config.ts` uses `vue()`, `tailwindcss()`, alias `@`, `server.proxy = proxyTargets(process.env.BACKEND_URL ?? 'http://localhost:5001')`, `server.host = '0.0.0.0'`, `server.port = 5173`, and `server.watch.usePolling` set from `CHOKIDAR_USEPOLLING`.

- [ ] **Step 5: Tokens, fonts, base styles and shadcn components**
Port `aera-frontend/src/style.css` and `motion.css` into `styles/` as Tailwind v4 `@theme` tokens plus utilities. Rename nothing visual, but replace "Aera" with "Presenton" wherever it appears as copy. Add the shadcn-vue components listed above (`npx shadcn-vue@latest add …`, style matched to the Aera button/dialog/slider in `aera-frontend/src/components/ui/`). `App.vue` renders `<RouterView/>` and `<Toaster/>` (a placeholder until Task 4 adds the router: render a "Presenton" heading).

- [ ] **Step 6: Smoke test** `tests/unit/smoke.test.ts` mounts a `Button` from `@/components/ui/button` and asserts that its text renders and that `cn('a', false && 'b', 'c') === 'a c'`.

- [ ] **Step 7: docker-compose.frontend.yml**
```yaml
name: presenton-frontend
services:
  frontend:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm ci && npm run dev -- --host 0.0.0.0 --port 5173"
    ports: ["${PRESENTON_FRONTEND_PORT:-5173}:5173"]
    extra_hosts: ["host.docker.internal:host-gateway"]
    environment:
      - BACKEND_URL=${PRESENTON_BACKEND_URL:-http://host.docker.internal:5001}
      - CHOKIDAR_USEPOLLING=true
    volumes:
      - ./frontend:/app
      - presenton_frontend_node_modules:/app/node_modules
volumes:
  presenton_frontend_node_modules:
```

- [ ] **Step 8: Verify.** `npm run check` passes. `npm run build` succeeds. `docker compose -f docker-compose.frontend.yml config` is valid.

- [ ] **Step 9: Commit** `feat(frontend): scaffold Vue app, dev compose and design tokens`.

---

### Task 2: API core — typed client, errors, SSE, async tasks

**Files:**
- Create: `frontend/src/api/{client.ts,errors.ts,sse.ts,tasks.ts,next-routes.ts,query.ts,presentations.ts,templates.ts,speakerNotes.ts,tts.ts}`, `frontend/src/composables/useAsyncTask.ts`
- Test: `frontend/tests/unit/api/{errors,client,sse,useAsyncTask,next-routes,resources}.test.ts`

**Interfaces:**
- Consumes: Task 1 tooling.
- Produces:
  - `errors.ts`: `class ApiError extends Error { status: number; body: unknown }`; `class BackendUnreachableError extends Error`; `extractApiErrorMessage(body: unknown, fallback: string, status?: number): string` (port of `servers/nextjs/utils/apiErrorMessages.ts`).
  - `client.ts`: `api` (`createClient<paths>` from openapi-fetch with `baseUrl: ''`, `credentials: 'include'`); `unwrap<T>(p: Promise<FetchResponse>): Promise<T>` (throws `ApiError`); `requestJson<T>(path: string, init?: RequestInit): Promise<T>` for paths outside the spec; `backendStatus: Ref<'ok' | 'unreachable'>`; `setUnauthorizedHandler(fn: () => void): void`. A 401 calls the handler and throws `ApiError`. A `TypeError` from fetch sets `backendStatus = 'unreachable'` and throws `BackendUnreachableError`; any later successful response sets it back to `'ok'`.
  - `sse.ts`: `type StreamEvent = { type: 'status'; status: string } | { type: 'chunk'; chunk: string } | { type: 'trace'; trace: unknown } | { type: 'error'; detail: string; retryable?: boolean; completed_slides?: number; total_slides?: number } | { type: 'closing' } | { type: 'complete'; [key: string]: unknown } | { type: string; [key: string]: unknown }`; `readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }>`; `streamEvents(path: string, init?: RequestInit): AsyncGenerator<StreamEvent>`. It yields `JSON.parse(data)` only for `event === 'response'` and throws `ApiError` if the response is not ok. Wire format: `servers/fastapi/models/sse_response.py`. A complete event is `{type:'complete', <key>: value}`.
  - `tasks.ts`: `getTask(id: string): Promise<AsyncTask>`, where `AsyncTask = components['schemas']['AsyncTaskModel']` (status `'pending' | 'completed' | 'error'`, plus `message`, `error`, `data`).
  - `useAsyncTask(taskId: Ref<string | null>, opts?: { storageKey?: string; onDone?: (t: AsyncTask) => void }): { task: Ref<AsyncTask | null>; status: ComputedRef<'idle' | 'pending' | 'completed' | 'error'>; error: ComputedRef<string | null>; start(id: string): void; clear(): void }`. Polls 1s, 2s, 3s, then every 5s. Stops at a terminal status. Persists the id to `sessionStorage[storageKey]` and restores it on creation. A 404 clears the id.
  - `next-routes.ts`: `getRuntimeConfig(): Promise<RuntimeConfig>`, `getTemplatesRoute(): Promise<unknown>`, `canChangeKeys(): Promise<boolean>`, `hasRequiredKey(): Promise<boolean>`. Define the types from what the routes in `servers/nextjs/app/api/<name>/route.ts` return. `RuntimeConfig` must expose `generationMode: 'template' | 'smart' | 'both'`.
  - `query.ts`: `queryClient` (staleTime 30s, retry 1, no retry on `ApiError` 4xx) and `installQuery(app)`.
  - Shared resource modules (several later tasks in the same wave consume them, so they live here):
    - `presentations.ts`: `presentationKeys = { all: ['presentations'] as const, one: (id: string) => ['presentation', id] as const }`; `listPresentations(): Promise<PresentationSummary[]>`; `getPresentation(id): Promise<Presentation>`; `duplicatePresentation(id): Promise<Presentation>`; `deletePresentation(id): Promise<void>`; `updatePresentation(body: { id: string; title?: string; slides?: Slide[]; theme?: unknown; n_slides?: number }): Promise<Presentation>`; `usePresentation(id: Ref<string>)` (a `useQuery` wrapper).
    - `templates.ts`: `listTemplates(): Promise<TemplateSummary[]>` (built-ins from `getTemplatesRoute()` merged with `GET template/all`, where `TemplateSummary = { id: string; name: string; layouts: unknown[]; theme?: unknown; fonts?: unknown }`).
    - `speakerNotes.ts`: `generateSpeakerNotes(id: string, body?: { slide_indexes?: number[]; regenerate?: boolean; verbosity?: 'low' | 'medium' | 'high' | 'very-high' })` (`POST speaker-notes`); `updateSpeakerNotes(id: string, notes: { slide_index: number; speaker_note: string }[])` (`PUT speaker-notes`, at least one item).
    - `tts.ts`: `ttsKeys.status(id, lang) = ['tts', id, lang]`; `listTtsLanguages()`; `getTtsStatus(id, language): Promise<TtsStatus>` (`GET speaker-notes/tts`; type the per-slide entries from the response schema, including `audio_url`, `stale`/up-to-date flag and duration as named there); `generateTtsAsync(id, { language, slide_indexes?, regenerate?, voice? }): Promise<AsyncTask>`; `deleteTts(id, language?)`; `slideAudioUrl(id, index, language): string`; `useTts(id, language)` (a query wrapper).

- [ ] **Step 1: Write the failing tests.**
  - `errors.test.ts`: `extractApiErrorMessage({detail:'Nope'}, 'x') === 'Nope'`; `extractApiErrorMessage({detail:[{msg:'bad'}]}, 'x')` contains `'bad'`; `extractApiErrorMessage('', 'fallback', 500) === 'fallback'`. Add the cases the old file handles.
  - `client.test.ts`: *401 calls handler* (mock fetch 401 → handler called once, `ApiError.status === 401`); *network failure flips backendStatus* (fetch rejects `TypeError` → `backendStatus.value === 'unreachable'`, then a 200 → `'ok'`); *unwrap returns data*.
  - `sse.test.ts`: *parses event/data frames*; *frame split across chunks* (`"event: resp"` + `"onse\ndata: {\"type\":\"status\",\"status\":\"a\"}\n\n"` → one event); *multi-line data joined with \n*; *ignores non-response events*; *non-ok response throws ApiError*; *abort stops iteration*.
  - `useAsyncTask.test.ts` (fake timers): *polls until completed and calls onDone*; *error status exposes message*; *resumes and clears unknown task* (`sessionStorage` has id → first poll 404 → `taskId` null and storage key removed).
  - `next-routes.test.ts`: maps the runtime-config payload to `generationMode`.
  - `resources.test.ts` (mocked fetch): `updatePresentation` sends `PATCH /api/v1/ppt/presentation/update` with the body unchanged; `updateSpeakerNotes(id, [{slide_index:2, speaker_note:'x'}])` sends `PUT …/{id}/speaker-notes` with `{notes:[…]}`; `listTemplates` merges built-in and custom templates without duplicate ids; `slideAudioUrl('p', 3, 'en')` returns a same-origin path.
- [ ] **Step 2: Run them.** `npx vitest run tests/unit/api`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules above.
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): typed API client, SSE reader, async tasks and shared resources`.

---

### Task 3: Renderer port + golden equivalence tests

**Files:**
- Create: `frontend/src/render/legacy/**`. Copy the 19 files listed in spec §1 "Slide rendering", keeping their relative tree (`lib/…`, `components/slide-editor/…`, `utils/…`). Also copy `servers/nextjs/lib/template-theme.ts`, `lib/tailwind-browser.ts` and `app/(presentation-generator)/presentation/utils/streamAssetMerge.ts` (to `legacy/presentation/streamAssetMerge.ts`) with their pure-TS imports.
- Replace: `frontend/src/render/legacy/utils/api.ts` with a shim.
- Create: `frontend/vitest.golden.config.ts`, `frontend/tests/golden/renderer.golden.test.ts`

**Interfaces:**
- Produces: `templateV2UiToHtml(ui, opts?)`, `templateV2UiToHtmlFragment(ui, opts?)`, `templateV2UiHasChart(ui)`, `templateV2ChartScripts()`, `hasTemplateV2RenderableUi(ui)`, `TEMPLATE_V2_HTML_WIDTH`, `TEMPLATE_V2_HTML_HEIGHT` from `@/render/legacy/lib/template-v2-json-to-html`; `normalizeTemplateTheme` from `@/render/legacy/lib/template-theme`; `loadChartBrowserRuntime` from `@/render/legacy/lib/chart-browser`; `mergeSingleSlidePreservingResolvedAssets`, `mergeSlidesPreservingResolvedAssets` from `@/render/legacy/presentation/streamAssetMerge`; the shim exports `resolveBackendAssetUrl`, `resolveBackendAssetSource`, `normalizeBackendAssetUrls`, `getApiErrorMessage` (a local copy of the old implementation, so this task does not depend on Task 2), with same-origin behaviour (relative `/app_data/…` and `/static/…` unchanged, absolute URLs unchanged).

- [ ] **Step 1: Copy the files.** Rewrite `@/…` imports to relative imports and add the header `// Ported from servers/nextjs/<path> @ <git rev-parse --short HEAD>` to each file. Change nothing else.
- [ ] **Step 2: Write the failing golden test.** `vitest.golden.config.ts` (jsdom) aliases `@` → `../servers/nextjs` and `@new` → `./src`. The test imports the old `@/lib/template-v2-json-to-html` and the new `@new/render/legacy/lib/template-v2-json-to-html`. For every `templates/*/template.json` (repo root) and every entry in `layouts`, it asserts `newFn(layout) === oldFn(layout)` for both `templateV2UiToHtml` and `templateV2UiToHtmlFragment` (with `{annotateElements: true}`). It also asserts `hasTemplateV2RenderableUi` matches. The suite is skipped with `describe.skipIf(!existsSync('../servers/nextjs/lib'))`.
- [ ] **Step 3: Run it.** `npm run test:golden`. Expected: FAIL before the copy compiles; PASS after. If the old and new outputs differ only because of the `utils/api` shim, fix the shim, never the copied renderer.
- [ ] **Step 4: Verify** `npm run check` (excludes golden) and `npm run test:golden`. Expected: all layouts of all 13 templates equal.
- [ ] **Step 5: Commit** `feat(frontend): port template-v2 renderer with golden equivalence tests`.

---

### Task 4: Route skeleton and component stubs

**Files:**
- Create: `frontend/src/router.ts`, `frontend/src/views/{LoginView,SetupView,LibraryView,NewView,OutlineView,EditorView,PresentView,NotFoundView}.vue` (stubs)
- Create stubs: `frontend/src/components/editor/{EditorLayout,SlideNavigator,EditorCanvas,FloatingToolbar,AskOverlay,NotesStrip,EditorHeader,Inspector}.vue`, `frontend/src/components/editor/inspector/{DesignTab,ChatTab,NarrationTab,VideoTab,ExportTab}.vue`, `frontend/src/components/editor/inspector/tabs.ts`
- Modify: `frontend/src/App.vue` (mount router)
- Test: `frontend/tests/unit/router.test.ts`

**Interfaces:**
- Produces routes (name → path): `login` `/login`, `setup` `/setup`, `library` `/`, `new` `/new`, `outline` `/new/:id/outline`, `editor` `/p/:id`, `present` `/p/:id/present`, `not-found`. Route `meta.public = true` for login and setup. `meta.layout = 'bare'` for login, setup and present; `'app'` otherwise.
- Stub props (final; later tasks keep them):
  - `EditorCanvas{ presentationId: string; slide: Slide | null }`, `SlideNavigator{ presentationId: string; slides: Slide[] }`, `AskOverlay{ open: boolean; slide: Slide }` with emits `update:open` and `edited`, `NotesStrip{ presentationId: string; slide: Slide }`, `EditorHeader{ presentation: Presentation }`.
  - Each tab: `{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }`.
  - `tabs.ts`: `export const inspectorTabs: { id: 'design' | 'chat' | 'narration' | 'video' | 'export'; label: string; icon: Component; component: Component }[]` (async components).
- Uses `Slide` and `Presentation` from `@/api/types` (Task 1).

- [ ] **Step 1: Write the failing router test.** It asserts every named route resolves (`router.resolve({name:'editor', params:{id:'x'}}).path === '/p/x'`), that `login` and `setup` have `meta.public`, and that `present` has `meta.layout === 'bare'`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the router and stubs. Each stub renders a labelled `<section data-stub="Name">` and declares its final props. Views are lazy-loaded.
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): routes and editor component stubs`.

---

### Task 5: SlideView — the shared slide component

Spec §1 "Slide rendering". Old references: `servers/nextjs/app/(presentation-generator)/components/{TemplateV2HtmlSlidePreview.tsx,SmartHtmlSlide.tsx,useSmartChartInjection.ts}`, `…/presentation/utils/applyPresentationThemeDom.ts`, `…/_shared/blank-slide.ts`.

**Files:**
- Create: `frontend/src/render/{slide-kind.ts,smart-html.ts,theme.ts,SlideView.vue,TemplateSlideHost.vue,SmartSlideFrame.vue,SlideRenderError.vue}`
- Test: `frontend/tests/unit/render/{slide-kind,smart-html,SlideView}.test.ts`

**Interfaces:**
- Consumes: Task 3 legacy exports; `Slide` and `Presentation` from `@/api/types`.
- Produces:
  - `slideKind(slide: Slide): 'template' | 'smart' | 'blank' | 'empty'`. The rules port `isTemplateV2Slide` and `isBlankPresentationSlide`; `smart` means a non-empty `html_content` with layout group `smart-html`, or no renderable `ui`.
  - `buildSmartSrcdoc(html: string, opts: { fonts?: unknown; theme?: unknown }): string`. It is sanitized with DOMPurify using the old config, and includes `/vendor/tailwindcss-browser-4.3.3.js`, the Chart.js + datalabels scripts and the chart injection (old `useSmartChartInjection` logic as an inline script).
  - `themeCssVars(theme: unknown): Record<string, string>`, built on `normalizeTemplateTheme` (port of the variable mapping in `applyPresentationThemeDom.ts`).
  - `<SlideView :slide :theme? :fonts? :fit="'contain'|'width'" :scale? :lazy?="false" :annotate?="false">`, which emits `rendered` and `error`. Its root element is `data-slide-id`; the stage is 1280×720 scaled by `ResizeObserver`. Template slides go through `TemplateSlideHost` (Shadow DOM: injects `templateV2UiToHtmlFragment`, theme vars on `:host`, font-face CSS; runs `loadChartBrowserRuntime` when `templateV2UiHasChart`). Smart slides go through `SmartSlideFrame` (`<iframe sandbox="allow-scripts" :srcdoc>`, `pointer-events:none` by default). Blank and empty slides render a neutral stage. With `lazy`, rendering waits for `IntersectionObserver`. Errors are caught by `onErrorCaptured` and by renderer exceptions, then render `SlideRenderError` ("Can't render this slide") and emit `error`.

- [ ] **Step 1: Write the failing tests.**
  - `slide-kind.test.ts`: a template slide (`ui` from `templates/modern/template.json` layouts[0]) → `'template'`; `{html_content:'<div/>', layout_group:'smart-html'}` → `'smart'`; `layout:'blank'` → `'blank'`.
  - `smart-html.test.ts`: `<script>alert(1)</script><div class="p-4">x</div>` → the user script is stripped, the div is kept, the output contains `tailwindcss-browser-4.3.3.js`.
  - `SlideView.test.ts`: *renders template slide into shadow root* (shadowRoot innerHTML non-empty); *smart slide renders iframe with sandbox="allow-scripts"*; *isolates render errors* (a `ui` that makes the renderer throw → `SlideRenderError` text visible and `error` emitted, while a sibling SlideView still renders); *scales to container* (mock ResizeObserver 640px wide → transform `scale(0.5)`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): SlideView with shadow-DOM template host and sandboxed smart frame`.

---

### Task 6: Auth, session store, guard and app shell

**Files:**
- Create: `frontend/src/api/auth.ts`, `frontend/src/stores/session.ts`, `frontend/src/components/shell/{AppShell,NavRail,UserMenu,BackendBanner}.vue`
- Replace stubs: `frontend/src/views/{LoginView,SetupView}.vue`
- Modify: `frontend/src/router.ts` (add `installGuards(router)`), `frontend/src/App.vue` (layout switch by `meta.layout`), `frontend/src/main.ts` (Pinia, Query, guard, unauthorized handler)
- Test: `frontend/tests/unit/{auth-guard,LoginView,AppShell}.test.ts`

**Interfaces:**
- Consumes: Task 2 `api`, `unwrap`, `setUnauthorizedHandler`, `backendStatus`, `getRuntimeConfig`.
- Produces:
  - `auth.ts`: `getAuthStatus(): Promise<AuthStatus>` where `AuthStatus = { setupRequired: boolean; authenticated: boolean; user: { username: string; role?: string } | null }`, mapped from `GET /api/v1/auth/status` (read `servers/fastapi/api/v1/auth/router.py` for the real fields); `login(username, password)`, `setup(username, password)`, `logout()`.
  - `useSessionStore()`: state `user`, `runtime: RuntimeConfig | null`, `ready: boolean`; actions `load()` (fetches auth status and runtime config once), `signOut()`.
  - `installGuards(router)`: a non-public route with `setupRequired` → `/setup`; unauthenticated → `/login?next=<fullPath>`; an authenticated user on login/setup → `next` or `/`.
  - `NavRail` items: Library (`/`), New (`/new`), Settings (an external link to `/settings` with `target="_blank"`, labelled "Settings (classic app)"), user menu with Sign out.

- [ ] **Step 1: Write the failing tests.** `auth-guard.test.ts`: the 3 redirect rules above plus preserving `next`. `LoginView.test.ts`: submit calls `login` and routes to `next`; a 401 shows the server message inline; the submit button is disabled while pending. `AppShell.test.ts`: *shows unreachable banner* when `backendStatus` is `'unreachable'` and the banner names the backend; the rail has the 3 items; the Settings link opens in a new tab.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The shell follows the Aera rail and shell surfaces. The banner sets `backendStatus` back to `'ok'` on window focus by retrying `getAuthStatus`.
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): auth flow, route guard and app shell`.

---

### Task 7: Library

Spec §2 "Library".

**Files:**
- Create: `frontend/src/components/library/{PresentationCard,PresentationRow,LibraryToolbar,DeleteDeckDialog,EmptyLibrary}.vue`
- Replace stub: `frontend/src/views/LibraryView.vue`
- Test: `frontend/tests/unit/library/LibraryView.test.ts`

**Interfaces:**
- Consumes: `presentations.ts` (Task 2), `SlideView`.

- [ ] **Step 1: Write the failing test.** Mocked module: renders one card per presentation with its first slide in `SlideView` (lazy); search filters by title (case-insensitive); the grid/list toggle persists in `localStorage['presenton.library.view']`; duplicate invalidates `['presentations']`; delete asks for confirmation and removes the card optimistically, restoring it and showing a toast on error; the empty state links to `/new`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Sort by `updated_at` desc. The card shows title, slide count and relative date.
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): presentation library`.

---

### Task 8: Create view (prompt, files, options, mode, smart generation)

Spec §2 "Create". Old reference: `servers/nextjs/app/(presentation-generator)/upload/components/*` (submit flow in `UploadPage.tsx`).

**Files:**
- Create: `frontend/src/api/{files.ts,generation.ts}`, `frontend/src/components/create/{PromptField,FileDropzone,GenerationOptions,ModeSwitch}.vue`
- Replace stub: `frontend/src/views/NewView.vue`
- Test: `frontend/tests/unit/create/NewView.test.ts`

**Interfaces:**
- Consumes: `useSessionStore().runtime.generationMode`.
- Produces: `uploadFiles(files: File[]): Promise<unknown[]>` (`POST files/upload` multipart); `decomposeFiles(documents: unknown[], language: string): Promise<string[]>` (`POST files/decompose`, returns extracted document paths; port `getDocumentPaths` from `UploadPage.tsx`); `getGenerationDefaults(): Promise<GenerationDefaults>`; `createPresentation(body: CreateBody): Promise<{ id: string }>` (`components['schemas']['Body_create_presentation_api_v1_ppt_presentation_create_post']`).

- [ ] **Step 1: Write the failing test.**
  - The mode switch shows only the modes `generationMode` allows (`'template'` → no switch).
  - Options are prefilled from `getGenerationDefaults`.
  - Submit with files: `uploadFiles` → `decomposeFiles(docs, language)` → `createPresentation` receives the decomposed paths as `file_paths`. Without files, neither is called.
  - Submit in Template mode: `createPresentation({…, generation_mode:'template'})` → routes to `/new/:id/outline`.
  - (Superseded by the template-only decision: no Smart mode, no mode switch.)
  - The submit button shows a pending state and stays disabled until navigation, and an upload/decompose/create failure shows the server message inline.
  - An empty prompt with no files → the submit button is disabled.
  - The slide count is clamped to 1–50 (match the old `NumberOfSlide.tsx` limits from `utils/presentationLimits.ts`).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Options cover the create schema fields (tone, verbosity, language, instructions, title slide, table of contents, web search).
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): create flow with template and smart modes`.

---

### Task 9: Outline editor and template picker

Spec §2 "Create" (Template mode). Old reference: `…/outline/components/*`, `…/outline/hooks/useOutlineStreaming.ts`.

**Files:**
- Create: `frontend/src/api/outlines.ts`, `frontend/src/components/create/{OutlineList,OutlineItem,TemplatePicker}.vue`, `frontend/src/composables/useOutlineStream.ts`
- Replace stub: `frontend/src/views/OutlineView.vue`
- Test: `frontend/tests/unit/create/{useOutlineStream,OutlineView}.test.ts`

**Interfaces:**
- Consumes: `streamEvents`, `listTemplates` (Task 2), `SlideView`.
- Produces: `getOutline(id)`, `saveOutline(id, outlines)`, `preparePresentation({ presentation_id, outlines, layout, title? })`; `useOutlineStream(id: Ref<string>): { items: Ref<OutlineItem[]>; status: Ref<string>; streaming: Ref<boolean>; error: Ref<string | null>; abort(): void }`, which accumulates `chunk` text, runs `jsonrepair` + parse to update `items` progressively, and finishes on the `complete` event's outline payload.

- [ ] **Step 1: Write the failing tests.** `useOutlineStream`: chunks arrive progressively → `items` grows; a truncated chunk does not throw; `error` event → `error` set and `streaming` false. `OutlineView`: items are editable, reorderable by drag and keyboard (Alt+↑/↓), addable and deletable; edits save debounced (500 ms) via `saveOutline`; the template picker shows the first 3 layouts of each template through `SlideView`; Generate is disabled until a template is chosen; Generate calls `preparePresentation` with the chosen template id as `layout` and routes to `/p/:id?stream=1`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): streamed outline editing and template picker`.

---

### Task 10: Editor core — layout, navigator, canvas, header, history, generation stream

Spec §2 "Editor" (navigator, canvas, header) and §3. Old reference: `…/presentation/components/{PresentationPage,SidePanel,SortableSlide,SlideThumbnailCard,NewSlide,PresentationHeader,StreamingGenerationMetrics}.tsx`, `…/presentation/hooks/usePresentationStreaming.ts`.

**Files:**
- Create: `frontend/src/stores/{editor.ts,history.ts}`, `frontend/src/composables/{usePresentationStream.ts,useSlideMutations.ts}`, `frontend/src/editor/streamMerge.ts`, `frontend/src/components/editor/{LayoutPickerDialog,GenerationMetrics,SlideStatusDots}.vue`
- Replace stubs: `frontend/src/views/EditorView.vue`, `frontend/src/components/editor/{EditorLayout,SlideNavigator,EditorCanvas,FloatingToolbar,EditorHeader,Inspector}.vue`
- Test: `frontend/tests/unit/editor/{streamMerge,history,useSlideMutations,EditorView}.test.ts`

**Interfaces:**
- Consumes: `presentations.ts` and `listTemplates` (Task 2), `SlideView`, `inspectorTabs`.
- Produces:
  - `useEditorStore()`: `activeSlideId`, `inspectorOpen`, `inspectorTab: 'design' | 'chat' | 'narration' | 'video' | 'export'`, `zoom` (0.5–2), `notesOpen`, `askOpen`; `select(id)`, `next()`, `prev()`.
  - `useHistoryStore()`: `push(cmd: { label: string; do: () => Promise<void>; undo: () => Promise<void> })`, `undo()`, `redo()`, `canUndo`, `canRedo`; cleared on deck change; max 50.
  - `useSlideMutations(presentationId: Ref<string>)`: `reorder(from: number, to: number)`, `removeSlide(id)`, `duplicateSlide(id)`, `addSlide(afterIndex: number, layout: unknown | null)`, `rename(title: string)`. Each one is an optimistic `updatePresentation` with a re-indexed `slides` array, pushes a history command and rolls back on error with a toast.
  - `applyStreamEvent(prev: Presentation | undefined, ev: StreamEvent, acc: { chunks: string }): Presentation | undefined` in `streamMerge.ts`. Handles `chunk` (jsonrepair over accumulated chunks), `slide_html`, `slide_assets`, `fonts`, `generation_metrics` and `complete`, using `mergeSingleSlidePreservingResolvedAssets`. It mirrors `usePresentationStreaming.ts`.
  - `usePresentationStream(id, enabled: Ref<boolean>)`: writes into the `['presentation', id]` cache, exposes `metrics` and `status`, and refetches on `complete`/`closing`.
  - The keyboard map in `EditorView`: ↑/↓ or PgUp/PgDn select slides; Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z redo; Cmd/Ctrl+K toggles Ask; Delete removes the selected slide when focus is in the navigator.

- [ ] **Step 1: Write the failing tests.**
  - `streamMerge`: a `slide_html` event appends a smart slide at its index; a `chunk` with `{"slides":[{"index":0,…` progressively yields slide 0; *truncated chunk skipped* (invalid JSON even after repair leaves `prev` unchanged); `slide_assets` keeps resolved image URLs over placeholders (`isPlaceholderAssetUrl`).
  - `history`: push/undo/redo order; a failing `undo` keeps the command on the stack and rethrows; the 51st push drops the oldest.
  - `useSlideMutations`: reorder sends `slides` with updated `index` values in order; a failed reorder restores the cache.
  - `EditorView`: renders navigator thumbnails (lazy SlideView), the canvas shows the active slide, ↓ selects the next slide, the inspector tabs come from `inspectorTabs`, `?stream=1` starts the stream and shows `GenerationMetrics`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Aera three-column layout: navigator with numbered thumbnails, each including `<SlideStatusDots :presentation-id :slide-index>` (a stub here that renders nothing; Task 15 fills it in). Center canvas card with `FloatingToolbar` (prev/next, Ask toggle, Present link). Bottom row with slide number/total and zoom. `NotesStrip` toggle. Right inspector, collapsible, a `Sheet` drawer below 1050px; the navigator becomes a drawer below 760px.
  - Drag reorder uses `vuedraggable`. `LayoutPickerDialog` lists the deck template's layouts (match the template by the slide `layout_group`/`layout` prefix, as in `NewSlide.tsx`) plus "Blank".
  - The header has inline title rename, undo/redo buttons, duplicate deck (navigates to the copy) and Present.
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): editor layout, slide management, history and generation stream`.

---

### Task 11: Ask overlay and speaker-notes strip

Spec §2 "Center canvas".

**Files:**
- Create: `frontend/src/api/slides.ts`
- Replace stubs: `frontend/src/components/editor/{AskOverlay,NotesStrip}.vue`
- Test: `frontend/tests/unit/editor/{AskOverlay,NotesStrip}.test.ts`

**Interfaces:**
- Consumes: `slideKind`, `presentationKeys`, `useEditorStore().askOpen`.
- Consumes: `generateSpeakerNotes`, `updateSpeakerNotes` (Task 2).
- Produces: `slides.ts`: `editSlide(id, prompt)` (template slides only; smart slides show Ask disabled with a tooltip).

- [ ] **Step 1: Write the failing tests.**
  - `AskOverlay`: when open, the input has focus and the slide layout box size is unchanged (overlay is absolutely positioned); Escape closes it and returns focus to the Ask button; a template slide calls `editSlide`; a smart slide shows the Ask button disabled with a tooltip ("AI edit is available for template slides") and never calls an endpoint; while pending one thinking indicator shows and submit is disabled; success updates the `['presentation', id]` cache with the returned slide and emits `edited`; failure keeps the prompt text and shows the error inline. The three suggestion chips fill the input.
  - `NotesStrip`: collapsed by default (`editor.notesOpen`); typing saves after a 800 ms debounce via `updateSpeakerNotes` for only that slide index; "Generate" calls `generateSpeakerNotes` for that slide and replaces the text; switching slides flushes the pending save.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use Aera glass overlay styling.
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): Ask overlay and speaker notes strip`.

---

### Task 12: Design tab (themes)

Spec §2 "Design". Old reference: `…/presentation/components/ThemeSelector.tsx`, `servers/nextjs/app/(presentation-generator)/services/api/*` theme calls.

**Files:**
- Create: `frontend/src/api/themes.ts`, `frontend/src/components/editor/inspector/{ThemeSwatch,ThemeEditorDialog}.vue`
- Replace stub: `frontend/src/components/editor/inspector/DesignTab.vue`
- Test: `frontend/tests/unit/editor/DesignTab.test.ts`

**Interfaces:**
- Produces: `listThemes()`, `getDefaultTheme()`, `createTheme(body)`, `updateTheme(id, body)`, `deleteTheme(id)`, `generateTheme(prompt: string)` (`POST theme/generate`). Applying a theme = `updatePresentation({ id, theme })` with an optimistic cache update, so `SlideView` re-renders through `themeCssVars`.

- [ ] **Step 1: Write the failing test.** Lists default and custom themes with swatches; clicking applies the theme and the optimistic cache shows the new `theme` before the response; failure rolls back; "Generate from prompt" shows pending, then adds the generated theme; edit and delete only appear on custom themes, and delete asks for confirmation; the applied theme is marked selected (`aria-pressed`).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** The theme editor edits the fields of the create/update schemas (colors, fonts).
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): design tab with themes`.

---

### Task 13: Chat tab

Spec §2 "Chat". Old reference: `…/presentation/components/Chat.tsx` and `chat/*` (event handling, tool activity, which tools mutate slides).

**Files:**
- Create: `frontend/src/api/chat.ts`, `frontend/src/composables/useChat.ts`, `frontend/src/components/editor/inspector/chat/{ChatMessage,ChatActivityRow,ConversationMenu}.vue`
- Replace stub: `frontend/src/components/editor/inspector/ChatTab.vue`
- Test: `frontend/tests/unit/editor/{useChat,ChatTab}.test.ts`

**Interfaces:**
- Produces: `listConversations(presentationId)`, `getHistory(presentationId, conversationId?)`, `deleteConversation(…)` (exact params from the spec schemas); `streamMessage(body): AsyncGenerator<StreamEvent>` over `POST chat/message/stream`; `useChat(presentationId: Ref<string>)`, returning `{ messages: Ref<ChatMsg[]>; activity: Ref<ChatActivity[]>; sending: Ref<boolean>; send(text: string): Promise<void>; stop(): void; conversationId: Ref<string | null>; newConversation(): void }`. `chunk` appends assistant text, `trace` becomes an activity row, `status` updates the live status line, and `complete` stores the turn and invalidates `['presentation', id]` when the turn reports slide changes (detect it the way `chat-adapter.ts` does).

- [ ] **Step 1: Write the failing tests.** `useChat`: streamed chunks build one assistant message; `stop()` aborts and keeps the partial text marked "stopped"; an error event shows the detail and re-enables input; `complete` with slide changes invalidates the presentation query. `ChatTab`: Enter sends, Shift+Enter adds a newline; history loads on mount; the conversation menu can start a new conversation and delete one with confirmation.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Assistant text renders as sanitized markdown (DOMPurify).
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): deck chat tab`.

---

### Task 14: Narration tab (notes, TTS)

Spec §2 "Narration".

**Files:**
- Create: `frontend/src/components/editor/inspector/narration/{SlideAudioRow,TtsLanguageSelect}.vue`
- Replace stub: `frontend/src/components/editor/inspector/NarrationTab.vue`
- Test: `frontend/tests/unit/editor/NarrationTab.test.ts`

**Interfaces:**
- Consumes: `speakerNotes.ts` and `tts.ts` (Task 2), `useAsyncTask`.

- [ ] **Step 1: Write the failing test.** "Generate notes for all slides" calls `generateSpeakerNotes` and refreshes the presentation; the language select is filled from `listTtsLanguages`, and the choice persists in `localStorage['presenton.tts.lang']`; "Generate narration" starts the task, shows progress, persists `presenton.task.tts.<id>`, and refetches status when done; each slide row shows *missing*, *ready* or *stale* with a play button (an `<audio>` with `preload="none"`); *marks stale audio* (status `stale` → badge "Stale", and "Regenerate selected" sends `slide_indexes` with `regenerate: true`); delete narration asks for confirmation.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): narration tab with TTS generation`.

---

### Task 15: Video tab (portrait, placeholders, avatars, voice bubble)

Spec §2 "Video". Old reference: `…/presentation/components/{VideosPanel,GenerateAvatarsDialog,PortraitBlock,AvatarChipBadge}.tsx`, `…/presentation/utils/{avatarGeneration,slideVideoActions}.ts`, `…/presentation/hooks/useSlideVideo.ts`.

**Files:**
- Create: `frontend/src/api/{videos.ts,playback.ts}`, `frontend/src/components/editor/inspector/video/{PortraitCard,SlideVideoRow,AvatarChip,GenerateAvatarsDialog,BubblePlacer}.vue`
- Replace stubs: `frontend/src/components/editor/inspector/VideoTab.vue`, `frontend/src/components/editor/SlideStatusDots.vue` (one dot each for narration ready/stale via `useTts`, and avatar/video present via `getVideos`; nothing while loading)
- Test: `frontend/tests/unit/editor/{VideoTab,BubblePlacer}.test.ts`

**Interfaces:**
- Consumes: `useTts` (Task 2) for the "up-to-date narration" requirement, `SlideView`, `useAsyncTask`.
- Produces (reused by Task 17): `videoKeys.all(id) = ['videos', id]`; `getVideos(id)`, `uploadSlideVideo(id, index, file)`, `deleteSlideVideo(id, index)`, `addPlaceholder(id, index)`, `removePlaceholder(id, index)`, `getPortrait(id)`, `uploadPortrait(id, file)`, `deletePortrait(id)`, `startAvatarGeneration(id, { slide_indices?, language?, force? })`, `getAvatarGeneration(id)`, `avatarPreviewUrl(id, …)`; `playbackKeys.one(id) = ['playback', id]`; `getPlayback(id): Promise<components['schemas']['PresentationPlaybackResponse']>`; `updateBubble(id, box: { x: number; y: number; width: number; height: number })` (match the `PUT playback/bubble` request schema). `BubblePlacer{ presentationId; slide }` uses 1280×720 slide coordinates.

- [ ] **Step 1: Write the failing tests.**
  - `VideoTab`: portrait upload and remove; per-slide rows show the placeholder toggle, uploaded video or avatar chip; "Generate avatars" is disabled with a reason when there is no portrait, or when the chosen slides lack a placeholder or up-to-date narration; generation resumes on mount from `getAvatarGeneration` while it is running; a failed slide chip shows the provider message; a slide with stale narration shows "Narration changed — regenerate"; `SlideStatusDots` shows a stale narration dot with `aria-label="Narration out of date"`.
  - `BubblePlacer`: dragging by (64px, 36px) on a 640px-wide overlay saves `x + 128, y + 72` in slide units; resizing clamps inside 1280×720 and to a minimum of 80×80; Arrow keys move by 8 units (Shift ×5); the save is debounced at 500 ms.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): video tab with avatars and voice bubble placer`.

---

### Task 16: Export tab (PPTX, PDF, MP4)

Spec §2 "Export".

**Files:**
- Create: `frontend/src/api/exports.ts`, `frontend/src/components/editor/inspector/export/{FileExportCard,VideoExportCard,VideoExportOptions}.vue`
- Replace stub: `frontend/src/components/editor/inspector/ExportTab.vue`
- Test: `frontend/tests/unit/editor/ExportTab.test.ts`

**Interfaces:**
- Produces: `exportPresentation(id, export_as: 'pptx' | 'pdf'): Promise<{ path: string }>` (map the real response field); `startVideoExport(id, req: components['schemas']['PresentationVideoRequest']): Promise<AsyncTask>`; `getVideoExport(id)`; `deleteVideoExport(id)`.

- [ ] **Step 1: Write the failing test.** PPTX and PDF buttons call `exportPresentation`, then show a download link (`download` attribute, same-origin `/app_data/exports/…` path); both buttons are disabled while one runs. MP4: the basic options (language defaulting to the narration language, resolution, subtitles, avatars) are visible, and the rest (voice, fps, min slide seconds, padding, crossfade, generate missing audio, speaker indicator, animate, regenerate) sit under "Advanced". Start persists `presenton.task.mp4.<id>` and shows progress with the task `message`. When done, a video preview plus download and delete (with confirmation) appear. An existing export is loaded on mount via `getVideoExport`. A validation error from the endpoint (422 or 400) shows inline.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Default values come from the schema defaults.
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): export tab for PPTX, PDF and MP4`.

---

### Task 17: Present mode with narrated preview

Spec §2 "Present". Old reference: `…/presentation/components/PresentationMode.tsx`.

**Files:**
- Create: `frontend/src/composables/useNarratedPlayback.ts`, `frontend/src/components/present/{PresentStage,PresentControls,AvatarLayer}.vue`
- Replace stub: `frontend/src/views/PresentView.vue`
- Test: `frontend/tests/unit/present/{useNarratedPlayback,PresentView}.test.ts`

**Interfaces:**
- Consumes: `usePresentation`, `getPlayback` (Task 15; it has the per-slide audio URL, duration and avatar video/placeholder rect for the chosen language), `SlideView`.
- Produces: `useNarratedPlayback(presentationId, index: Ref<number>, enabled: Ref<boolean>)`, returning `{ playing: Ref<boolean>; audio: HTMLAudioElement; avatar: ComputedRef<{ src: string; rect: { x: number; y: number; width: number; height: number } } | null>; toggle(): void }`. With narration on, it plays the slide's audio, emits `advance` on `ended`, advances after 1500 ms on slides without audio, pauses on `visibilitychange` hidden, and resumes on visible if it was playing.

- [ ] **Step 1: Write the failing tests.** `useNarratedPlayback` (mock Audio): on → plays slide 0; `ended` → index 1; a slide with no audio advances after 1500 ms (fake timers); hidden document → paused; turning narration off pauses. `PresentView`: →, Space and click go next; ← goes back; Esc returns to `/p/:id`; the counter shows "3 / 12"; the transition class is absent under reduced motion; the avatar `<video>` is `muted` and positioned from `rect` scaled to the stage; the narration toggle is hidden when the playback response has no audio for any slide.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Full screen via `requestFullscreen` on entry, with a fallback to a fixed overlay. Aera transition: fade plus restrained blur, 250 ms. Controls auto-hide after 2 s idle.
- [ ] **Step 4: Run them.** Expected: PASS. Then `npm run check`.
- [ ] **Step 5: Commit** `feat(frontend): present mode with narrated preview`.

---

### Task 18: E2E smoke suites and README

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/tests/e2e/{mocked.spec.ts,live.spec.ts}`, `frontend/tests/e2e/fixtures/*.json`, `frontend/README.md`

**Interfaces:**
- Consumes: the whole app.

- [ ] **Step 1: Mocked suite.** `page.route` serves fixtures for auth status (logged in), runtime-config, `presentation/all` (2 decks), `presentation/{id}` (3 slides: 2 template slides using `templates/modern` layouts and 1 smart slide), themes, `tts` status and playback. Flow: library shows 2 cards → open a deck → 3 thumbnails → ↓ selects slide 2 → the inspector Narration tab shows rows → Present → → advances → Esc returns. Also test that a backend 503 on `presentation/all` shows a toast and no crash, and that an aborted network connection shows the unreachable banner.
- [ ] **Step 2: Live suite**, gated by `test.skip(!process.env.E2E_BACKEND)` against `BACKEND_URL`: login with `E2E_USER`/`E2E_PASSWORD` → library loads → the first deck opens → every thumbnail renders without `SlideRenderError` → present and exit.
- [ ] **Step 3: Run.** `npx playwright install chromium && npm run e2e`. Expected: the mocked suite passes and the live suite is skipped. With the stack running, `E2E_BACKEND=1 npm run e2e` passes.
- [ ] **Step 4: README.** Cover the two ways to run (compose and local `npm run dev` with `BACKEND_URL`); start the backend first (`docker compose up production`); `npm run gen:api` after backend API changes; the test commands (`check`, `test:golden`, `e2e`); Phase 1 scope and the "Settings (classic app)" link.
- [ ] **Step 5: Final verification.** `npm run check && npm run test:golden && npm run build && npm run e2e`, all green. `git diff --stat main -- . ':!frontend' ':!docker-compose.frontend.yml' ':!docs/superpowers'` is empty.
- [ ] **Step 6: Commit** `test(frontend): e2e smoke suites and README`.
