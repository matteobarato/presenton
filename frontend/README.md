# Presenton frontend (Vue 3)

The new Presenton web app: Vue 3, Vite, shadcn-vue (reka-ui), Tailwind v4, TanStack Query and Pinia.
It will replace the Next.js app in `servers/nextjs` in phases; the old app is not modified.

## Phase 1 scope

Phase 1 is the foundation and the core flows: sign in and setup, the library, creating a deck from a
**template** (prompt, files, outline, template, streamed slides), the editor (slide navigator,
canvas, reorder, duplicate, delete, AI edit, chat, themes, speaker notes, TTS, avatars, voice bubble,
PPTX/PDF/MP4 export), and present mode with a narrated preview.

- **Template-based generation only.** There is no Smart mode in the create screen and no
  `slide/edit-html`. Smart slides in existing decks still render, but get no smart-specific features.
- Out of scope until later phases: direct on-slide editing (Phase 2); settings and providers, admin,
  template management, fonts, community and onboarding (Phase 3). The nav rail's **Settings (classic app)**
  link opens the old app's `/settings` in a new tab.

The design spec is `docs/superpowers/specs/2026-11-06-vue-frontend-phase1-design.md`.

## Running it

The app talks to the FastAPI backend through Vite's dev proxy (`/api`, `/app_data`, `/static`, `/docs`,
`/openapi.json`). Start the backend first.

### With Docker Compose

```bash
# 1. The backend stack (serves the API on :5001)
docker compose up production

# 2. The frontend (Vite with HMR on :5173)
docker compose -f docker-compose.frontend.yml up
```

Both commands run from the repository root. Two variables adjust the frontend container:

| Variable                  | Default                             | Meaning                                  |
| ------------------------- | ----------------------------------- | ---------------------------------------- |
| `PRESENTON_BACKEND_URL`   | `http://host.docker.internal:5001`  | Where the dev proxy forwards API calls   |
| `PRESENTON_FRONTEND_PORT` | `5173`                              | Host port the dev server is published on |

### Locally

```bash
cd frontend
npm ci
BACKEND_URL=http://localhost:5001 npm run dev   # BACKEND_URL defaults to http://localhost:5001
```

Open http://localhost:5173. If the backend is unreachable the app shows a banner instead of a blank
screen.

## API types

`src/api/schema.d.ts` is generated from `servers/fastapi/openai_spec.json`. After the backend API changes:

```bash
npm run gen:api
```

## Tests

All commands run from `frontend/`.

| Command                  | What it runs                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `npm run check`          | `vue-tsc -b`, the Vitest unit suite, and ESLint. Run this before every commit.                |
| `npm run test:golden`    | Renderer golden tests: the ported renderer must emit the same HTML as `servers/nextjs`.       |
| `npm run e2e`            | Playwright smoke suites. The mocked suite always runs; the live suite is skipped by default.  |
| `npm run build`          | Type-check and production build.                                                              |

**Golden tests** import the old renderer from `OLD_FRONTEND_DIR` (default `../servers/nextjs`). That
directory needs its `node_modules` installed; if it lacks them, point at a checkout that has them:

```bash
OLD_FRONTEND_DIR=/path/to/presenton/servers/nextjs npm run test:golden
```

**E2E, mocked.** The first run needs a browser: `npx playwright install chromium`. Playwright starts
`npm run dev -- --port 5173` itself (or reuses a server already on that port), and every API call is
intercepted in the browser, so no backend is needed. A call without a mock fails the test.

**E2E, live.** Against a running backend (`docker compose up production`) and an existing account:

```bash
E2E_BACKEND=1 E2E_USER=<username> E2E_PASSWORD=<password> npm run e2e
```

The dev server proxies to `BACKEND_URL` (default `http://localhost:5001`). The live suite signs in,
opens the first deck, checks that no slide fails to render, and enters and leaves present mode.

## Layout

```
frontend/
  src/
    main.ts  App.vue  router.ts
    styles/        design tokens, base, motion, fonts
    api/           one module per backend resource, the fetch client, SSE parser, generated schema.d.ts
    render/        SlideView, the ported template-v2 renderer (legacy/), smart-slide frame
    stores/        Pinia: session, editor selection and panels, undo history (never slide content)
    composables/   async tasks, streams, chat, narrated playback, slide mutations, shortcuts
    components/    ui/ (shadcn-vue), shell/, library/, create/, editor/, present/
    views/         Login, Setup, Library, New, Outline, Editor, Present, NotFound
  tests/
    unit/          Vitest + Vue Test Utils (backend mocked)
    golden/        renderer equivalence against servers/nextjs
    e2e/           Playwright: mocked.spec.ts, live.spec.ts, fixtures/
  playwright.config.ts
```

Server state lives in the TanStack Query cache (`['presentation', id]` is the single source for slide
content); components never call `fetch` directly, only the modules in `src/api/` do.
