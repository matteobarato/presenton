# New Vue frontend — Phase 1 (foundation + core flows) — design

Date: 2026-11-06

## Intent

**What the user asked for:** a new frontend that will eventually replace the
Next.js app in `servers/nextjs`, written with Vue 3, Vite, shadcn-vue and
Tailwind, developed through its own docker-compose file that is linked to (but
separate from) the existing stack. The old frontend is not touched. The new one
must expose the backend features the old one never surfaced.

- **Design reference:** the Aera mockup in `aera-frontend/` (untracked) —
  tokens, fonts, materials, motion grammar, editor composition
  (`DESIGN.md`, `DIRECTION.md`, `src/style.css`, `src/motion.css`).
- **Functional reference:** the old editor in `servers/nextjs`, improved with
  the newer API features.

**Decisions made with the user:**

- The rewrite is phased. This spec is **Phase 1**. Phase 2 = direct
  manipulation editing on the slide (text, images, charts, tables,
  infographics). Phase 3 = settings/providers, admin, templates, custom
  templates, fonts, community, onboarding. Each phase gets its own spec.
- Product name in the UI stays **Presenton**; Aera contributes only the
  visual design. The app lives in **`/frontend`**; `aera-frontend/` stays a
  read-only reference.
- Present mode = classic full-screen slides **plus an optional narrated
  preview** (TTS audio + per-slide avatar video, auto-advance). The full
  narrated player (bubble ↔ avatar morphs, HyperFrames animations) stays
  outside this repo, and the MP4 export remains the full-fidelity output.
- Dev compose talks to the running stack through its HTTP port (approach A).
- **Template-based generation only** (user decision 2026-11-06, recorded in
  `CLAUDE.md`): the new frontend supports template-based generation. Smart
  presentations are ignored: no Smart mode in Create, no `slide/edit-html`.
  Future work is template-only. Existing smart slides still render through
  `<SlideView>` (already built) but get no smart-specific features.

**Success criteria:**

1. `docker compose -f docker-compose.frontend.yml up` serves the new frontend
   with HMR on `:5173`, talking to a backend started from the main compose.
2. A user can sign in, browse the library, create a deck from a template
   with live streaming, open it, see slides rendered identically to the
   old app, reorganize slides, AI-edit a slide, chat with the deck, manage
   themes, speaker notes, TTS, avatars and the voice bubble, export
   PPTX/PDF/MP4, and present it (with narrated preview).
3. No file outside `/frontend`, `docker-compose.frontend.yml` and this spec
   (and its plan) is modified.
4. `vue-tsc`, the Vitest suite, the renderer golden tests and the Playwright
   smoke suite pass.

**Assumptions (not stated by the user):** the backend API is treated as
stable; production serving of the new frontend (nginx/Dockerfile) is out of
scope for Phase 1; desktop is the primary target, with Aera's responsive
drawers below 1050px / 760px.

## Non-goals (Phase 1)

- Direct on-slide editing (Konva surface, Tiptap text, charts/tables/
  infographics editing, element selection, clipboard). → Phase 2.
- Settings/providers, admin, template management and custom-template
  creation, fonts, community, onboarding. → Phase 3. The rail shows a
  "Settings" link opening the old app's `/settings` in a new tab.
- Animation-plan UI and the `animate` generation flag (backend not shipped).
- `POST presentation/derive` and `POST presentation/edit`: they take
  structured per-slide content replacements (`[{index, content}]`) plus an
  export format — automation APIs with no prompt. Their UI belongs with
  Phase 2 content editing.
- Smart presentations entirely (user decision): Smart mode in Create,
  `POST v2/ppt/presentation/generate/smart[/async]`, `POST slide/edit-html`.
- Production Dockerfile/nginx changes; Electron.
- Any change to `servers/`, `docker-compose.yml`, `nginx.conf`,
  `aera-frontend/`.

## §1 Architecture and dev environment

### Layout

```
docker-compose.frontend.yml
frontend/
  package.json  vite.config.ts  tsconfig*.json  components.json
  index.html  public/{fonts,vendor,favicon.svg}
  src/
    main.ts  App.vue  router.ts
    styles/{tokens.css,base.css,motion.css,fonts.css}
    api/        client.ts schema.d.ts(generated) errors.ts sse.ts tasks.ts
                next-routes.ts  <resource>.ts (one module per resource)
    render/     legacy/ (ported renderer, see §1.4)  SlideView.vue
                SmartSlideFrame.vue  TemplateSlideHost.vue  slide-kind.ts
    stores/     session.ts editor.ts history.ts
    composables/ useAsyncTask.ts useStream.ts useTheme.ts ...
    components/ ui/ (shadcn-vue)  shell/  library/  create/  editor/  present/
    views/      LoginView SetupView LibraryView NewView OutlineView
                EditorView PresentView NotFoundView
  tests/        unit/ golden/ e2e/
```

### Stack

Vue 3.5, TypeScript 5.7, Vite 6, Tailwind v4 (`@tailwindcss/vite`),
shadcn-vue (reka-ui 2) + `class-variance-authority`/`clsx`/`tailwind-merge`,
`lucide-vue-next`, `vue-router` 4, Pinia 3, `@tanstack/vue-query` 5,
`openapi-fetch` + `openapi-typescript`, `vue-sonner` (toasts),
`@vueuse/core`, `dompurify`, `katex`. Node 22.

### Design system

Tokens, fonts (DM Sans, Manrope — copied from `aera-frontend/public/fonts`
with their OFL files), radii, glass materials and the motion grammar are
copied from `aera-frontend/src/style.css`, `motion.css` and `DESIGN.md` into
`src/styles/`. Rules carried over: fixed studio palette distinct from slide
themes; 150–250 ms state transitions; slide select = fade + 5px rise;
presentation transition adds restrained blur; `prefers-reduced-motion`
disables movement; visible focus states; dialogs trap focus and close on
Escape; Ask overlay never takes layout space from the slide.

### Dev compose (approach A)

`docker-compose.frontend.yml` (standalone file, own project name
`presenton-frontend`):

- service `frontend`: image `node:22-alpine`, `working_dir: /app`,
  bind-mount `./frontend:/app`, named volume for `/app/node_modules`,
  command `sh -c "npm ci && npm run dev -- --host 0.0.0.0 --port 5173"`,
  port `${PRESENTON_FRONTEND_PORT:-5173}:5173`,
  `extra_hosts: ["host.docker.internal:host-gateway"]`,
  env `BACKEND_URL=${PRESENTON_BACKEND_URL:-http://host.docker.internal:5001}`,
  `CHOKIDAR_USEPOLLING=true`.

`vite.config.ts` proxies to `BACKEND_URL` (default `http://localhost:5001`
when run outside Docker): `/api` (FastAPI `/api/v1`, `/api/v2` and Next.js
`/api/*` routes all live behind the same nginx), `/app_data`, `/static`,
`/docs`, `/openapi.json`. Same origin ⇒ the auth cookie works unchanged.
`/vendor` assets needed by the renderer (Chart.js 4.5.1,
chartjs-plugin-datalabels 2.2.0, Tailwind browser runtime if vendored) are
copied into `frontend/public/vendor/` so the new app does not depend on the
old app's public folder.

`frontend/README.md` documents: start the backend (`docker compose up
production`), then the frontend compose; or run `npm run dev` locally.

### API layer

- `npm run gen:api` runs `openapi-typescript
  ../servers/fastapi/openai_spec.json -o src/api/schema.d.ts`; the generated
  file is committed. `client.ts` exports a typed `openapi-fetch` client with
  `credentials: 'include'` and an error middleware producing `ApiError`.
- One module per resource (`presentations.ts`, `slides.ts`, `outlines.ts`,
  `themes.ts`, `templates.ts`, `files.ts`, `images.ts`, `chat.ts`,
  `speakerNotes.ts`, `tts.ts`, `videos.ts`, `playback.ts`, `exports.ts`,
  `auth.ts`, `tasks.ts`) wrapping the typed client — components never call
  `fetch` directly.
- `next-routes.ts` covers the Next.js routes the backend flow still needs
  (`/api/runtime-config`, `/api/user-config`, `/api/can-change-keys`,
  `/api/has-required-key`, `/api/templates`), typed by hand.
- `sse.ts` (see §3).

### Slide rendering

Two slide kinds exist (detected in `render/slide-kind.ts` with the same rules
as the old `_shared/blank-slide.ts` `isTemplateV2Slide`):

1. **Template-v2 slides**: `slide.ui` JSON → HTML via
   `templateV2UiToHtml*`.
2. **Smart slides**: stored HTML that needs the Tailwind browser runtime,
   DOMPurify sanitizing and Chart injection (old `SmartHtmlSlide.tsx` +
   `useSmartChartInjection.ts`).

**Ported renderer (`src/render/legacy/`).** The import closure of
`servers/nextjs/lib/template-v2-json-to-html.ts` is 19 files / ~12k lines,
with no React and one external dependency (`katex`):

```
lib/template-v2-json-to-html.ts      lib/chart-browser.ts  lib/math.ts
lib/svg-color.ts                     utils/api.ts  utils/apiErrorMessages.ts
components/slide-editor/types.ts
components/slide-editor/charts/chart-data.ts
components/slide-editor/infographics/{infographic-editing,infographic-icons}.ts
components/slide-editor/layout/{flowLayout,wrappedFlexLayout}.ts
components/slide-editor/text/{local-fonts,markdown-text,template-v2-text,
  template-v2-text-editing,text-line-height,text-runs}.ts
components/slide-editor/video/video-placeholder.ts
```

They are copied verbatim, keeping their relative tree under
`src/render/legacy/`, with only import paths rewritten and a header
`// Ported from servers/nextjs/<path> @ <commit>`. `utils/api.ts` is the one
exception: replaced by a small shim exporting the functions the renderer uses
(`resolveBackendAssetUrl` etc.) for a same-origin app. Smart-slide logic is
ported from the React files into `SmartSlideFrame.vue` +
`render/smart-html.ts`.

**`<SlideView :slide :theme :scale|fit :mode>`** — the one shared slide
component (canvas, thumbnails, template previews, present):

- Fixed 1280×720 stage scaled with CSS `transform` to fit its box
  (`ResizeObserver`).
- Template-v2: `TemplateSlideHost.vue` renders into a **Shadow DOM** root
  (style isolation from the app); fonts and theme CSS variables are injected
  into the root; charts initialized via the ported chart-browser.
- Smart: `SmartSlideFrame.vue` renders into a **sandboxed `srcdoc` iframe**
  (`sandbox="allow-scripts"`), with the Tailwind runtime and Chart.js loaded
  from `/vendor`, HTML sanitized with DOMPurify using the old config.
- Thumbnails render lazily (`IntersectionObserver`) and are memoized on
  `slide.id + updated hash`.
- Each slide is wrapped in an error boundary (`onErrorCaptured`) that shows a
  quiet "Can't render this slide" placeholder.

## §2 Screens and features

### Shell

Aera's slim left rail (Library, New, Settings → old `/settings` in new tab,
user menu with logout), a quiet document bar inside the editor, toasts,
backend-unreachable banner.

### Auth — `/login`, `/setup`

`GET auth/status` decides: setup required → `/setup` (`POST auth/setup`);
unauthenticated → `/login` (`POST auth/login`); `POST auth/logout` from user
menu. Router guard enforces it and preserves `?next=`.

### Library — `/`

- `GET presentation/all` → grid (cover rendered by `<SlideView>`) or list,
  client search by title, sort by updated.
- Card actions: open, duplicate (`POST presentation/{id}/duplicate`),
  delete (`DELETE presentation/{id}`, confirm dialog).
- Empty state with "New presentation".

### Create — `/new`, `/new/:id/outline`

- **Inputs:** prompt; supporting files (`files/upload` →
  `files/decompose(documents, language)` → extracted paths sent as
  `file_paths`, chips with remove); slide count; language; advanced (tone, verbosity,
  instructions, include title/table-of-contents slide, web grounding, image
  options) prefilled from `POST generation/defaults`.
- **Template generation** (the only mode): `POST presentation/create` with
  `generation_mode: 'standard'` → `/new/:id/outline`: outline
  streams in (`GET outlines/stream/{id}`), items editable, reorderable,
  addable, deletable (saved with `PUT outlines/{id}`); template picker
  (`GET template/all` + built-in templates via `/api/templates`, previews via
  `<SlideView>`); Generate → `POST presentation/prepare` → navigate to editor,
  which consumes `GET presentation/stream/{id}` and shows slides as they
  arrive with generation metrics.

### Editor — `/p/:id`

Aera three-column composition.

- **Left navigator:** numbered thumbnails; drag to reorder
  (`PATCH presentation/update` with the reordered `slides` array); add slide
  from the deck template's layouts (picker of `<SlideView>` previews, inserted
  as a blank-content slide of that layout, mirroring the old `NewSlide.tsx`
  flow, persisted with `PATCH presentation/update`); duplicate and delete
  slide (same endpoint). Narration/avatar status dots per thumbnail.
- **Center canvas:** `<SlideView>` of the active slide; floating inset
  toolbar (prev/next, Ask, Present). **Ask** opens a glass overlay over the
  slide (Escape/close restore focus) with three suggestions; submits to
  `POST slide/edit` (template slides; smart slides show Ask disabled), shows the
  single "thinking" indicator, then updates the slide. Bottom row: slide
  info + zoom. Collapsible **speaker notes** strip: edit
  (`PUT speaker-notes`, debounced) or generate for this slide.
- **Right inspector tabs** (collapsible; drawer below 1050px):
  - **Design** — themes: list (`themes/all`, `themes/default`), apply to the
    deck, generate from prompt (`theme/generate`), create/update/delete
    custom themes. Applying updates canvas and thumbnails immediately.
  - **Chat** — deck-wide chat (`chat/message/stream`), history
    (`chat/history`), conversation list/new/delete; tool activity rendered as
    compact rows; slide changes from chat invalidate the presentation query.
  - **Narration** — generate notes for all slides (`POST speaker-notes`) or
    edit each; TTS language select (`speaker-notes/tts/languages`); generate
    TTS (`speaker-notes/tts/async`, task progress); per-slide audio player
    (`speaker-notes/tts/{slide_index}`) with *missing* / *stale* badges;
    regenerate selected slides (`slide_indexes`, `regenerate`, `voice`);
    delete narration.
  - **Video** — deck portrait upload/remove (`videos/portrait`); per-slide
    avatar placeholder add/remove (`videos/{i}/placeholder`); upload a slide
    video (`PUT videos/{i}`) or delete it; generate HeyGen avatars for chosen
    slides (`POST videos/generate` with `{slide_indices, language, force}`,
    resume with `GET videos/generate`,
    preview via `videos/generate/preview`); avatar chips show state and the
    provider's error message. **Voice-bubble placer:** a draggable/resizable
    box over a 1280×720 overlay of the active slide, saved with
    `PUT playback/bubble`; current value from `GET playback`.
  - **Export** — PPTX / PDF (`POST presentation/{id}/export` with
    `export_as`, then download link); MP4 (`POST video-export/async` with
    `PresentationVideoRequest`: language, voice, resolution, fps, subtitles,
    min slide seconds, padding, crossfade, `generate_missing_audio`,
    `speaker_indicator`, `avatars`, `regenerate`; `animate` is exposed as a
    toggle since export plans missing animations itself), progress via
    `useAsyncTask`, download, delete (`DELETE video-export`). Basic options
    shown by default, the rest under "Advanced".
- **Header:** inline title rename (`PATCH presentation/update`); undo/redo
  (§3); duplicate deck; Present button.

### Present — `/p/:id/present`

Full-screen `<SlideView>`; ←/→/Space/Esc and click navigation; slide counter;
Aera transition (fade + restrained blur, none under reduced motion).
**Play narration** toggle: plays the slide's TTS audio, shows the slide's
avatar video in its placeholder rect if present (muted — TTS is the only
soundtrack), and auto-advances when the audio ends; slides without audio
advance after a short pause. Pauses when the document is hidden.

## §3 Data flow, state, errors, testing

### Server state — TanStack Query

Keys: `['presentations']`, `['presentation', id]`, `['outline', id]`,
`['themes']`, `['templates']`, `['tts', id]`, `['videos', id]`,
`['playback', id]`, `['chat', id, conversationId]`, `['task', taskId]`.
Mutations invalidate only affected keys; optimistic updates only for
reorder, delete slide, title, notes.

`useAsyncTask(taskId)` polls `GET async-tasks/status/{id}` (1s → 5s
backoff), stops on a terminal status, exposes `status`, `progress`, `error`,
`result`. Active task ids are stored in `sessionStorage` per deck and kind
(`tts`, `avatars`, `mp4`), so polling resumes after reload; avatar
generation additionally resumes from `GET videos/generate`.

### Streams

`api/sse.ts`: `fetch` + `ReadableStream` SSE parser (supports POST bodies and
cookies, which `EventSource` does not), exposing an async iterator of typed
events and cancellation via `AbortController`. Used by outline stream,
presentation stream and chat stream. During generation, incoming slide
events are merged into the `['presentation', id]` cache using the old
`streamAssetMerge` rules (ported as pure TS); on stream end the
presentation is refetched.

### Client state — Pinia

- `session`: current user, runtime config, generation modes.
- `editor`: active slide id, inspector tab/open, zoom, notes strip open,
  Ask overlay open.
- `history`: undo/redo stack of reversible commands `{label, do(), undo()}`
  whose bodies are API calls (reorder, delete slide → restore via update,
  title, notes). Slide content is never duplicated into Pinia.

### Errors

- `ApiError {status, message, body}`; message extraction ported from
  `utils/apiErrorMessages.ts`.
- 401 → `/login?next=…`. Network failure → one persistent banner naming the
  backend URL; retries when the window regains focus.
- Mutation failures → toast. Task failures → inline message at the owning
  item (avatar chip, MP4 row, TTS row).
- Slide render failure → per-slide placeholder; never breaks the deck.

### Testing

- **Unit (Vitest + @vue/test-utils, jsdom):** SSE parser, `useAsyncTask`,
  history store, `ApiError` extraction, stream merge, slide-kind detection,
  router guard, each resource module against mocked fetch.
- **Renderer golden tests:** a script runs the *old*
  `servers/nextjs/lib/template-v2-json-to-html.ts` (via `tsx`, read-only,
  with path aliases) on every layout in `templates/*/template.json`, writes
  HTML snapshots to `frontend/tests/golden/fixtures/`; the Vitest golden
  suite asserts the ported copy produces identical HTML.
- **E2E (Playwright):** smoke against the linked dev stack (login → library
  → open deck → navigate → present) gated by `E2E_BACKEND=1`; a mocked
  variant (`page.route` fixtures) runs without LLM keys.
- `npm run check` = `vue-tsc --noEmit && vitest run && eslint`.
  Every plan task ships with tests (TDD).
