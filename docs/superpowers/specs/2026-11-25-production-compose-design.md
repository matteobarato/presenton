# Production compose with the Vue frontend

## Intent

The Vue app in `frontend/` is ready. Production should serve it instead of the
Next.js UI, with nginx as its own container in front. Next.js still renders
exports and video slides, so it stays for now as a hidden renderer.

## Goals

- A new `docker-compose.prod.yml` where users only ever see the Vue app.
- PDF/PPTX export, video export, built-in and custom templates, and MCP keep working.
- Existing `app_data` is reused as is.

## Non-goals

- Porting the Next.js jobs to FastAPI or Vue (later work; removes the renderer).
- TLS. An outer proxy terminates it; `X-Forwarded-*` headers are passed through.
- Publishing images, or changing `docker-compose.yml` / the current dev setup.
- Any change inside `servers/nextjs`.
- Codex sign-in in this deployment, so port 1455 is not published.

## Approaches

1. Move the Next.js jobs first, then drop Next. Cleanest end state, much more work.
2. **Keep Next as a hidden renderer (chosen).** Fastest route to production; Next
   still has to be built and maintained.
3. Drop Next now and fix later. Breaks export, video and templates.

## Services

| Service | Contents | Published |
|---|---|---|
| `proxy` | nginx | `${PRESENTON_HTTP_HOST_PORT:-5001}:80` |
| `frontend` | built Vue `dist` served statically, SPA fallback | no |
| `api` | FastAPI, MCP, Chromium, export and video tooling. No Next.js server, no nginx; only the static files in `servers/nextjs/public` | no |
| `renderer` | current Next.js standalone build | no |

## Routing

`proxy` has two listeners.

**Port 80 (users)**

| Path | Goes to |
|---|---|
| `/api/v1/`, `/api/v2/`, `/docs`, `/openapi.json`, `/static/` | `api:8000` |
| `/mcp` | `api:8001`, keeping `Host: localhost:8001` |
| `/app_data/*` | files from a read-only mount, same auth checks as today |
| exactly `/api/runtime-config`, `/api/templates`, `/api/has-required-key`, `/api/can-change-keys`, `/api/update-svg` | `renderer:3000` |
| everything else | `frontend` |

**Port 8080 (containers only)** behaves like today's single-container nginx:
`/api/v1`, `/api/v2`, `/app_data`, `/static` as above, everything else to
`renderer`. The `api` service uses `http://proxy:8080` to reach `/pdf-maker`,
`/api/video-composition` and the template routes, so the export browser sees one
origin and cookies work as they do now.

Upload size limits and 30 minute timeouts are carried over from `nginx.conf`.

## Backend changes

Defaults stay as today, so the existing single-container setup is unaffected.

- `templates/get_layout_by_name.py` and `templates/custom_layout_from_db.py`
  hardcode `http://localhost`; use `NEXT_PUBLIC_URL`, falling back to it.
- FastAPI (`server.py`) and MCP (`mcp_server.py`) bind `127.0.0.1`; make the bind
  address configurable. The MCP host allowlist stays unchanged.
- `start.js` gets a mode that does not start Next.js or nginx.
- `layouts.py` calls a Next route that does not exist. Left alone.

The `api` image copies `servers/nextjs/public` to the same path, because video
export and asset resolution read `/vendor/...` files from disk.

## Configuration

- `api` sets `NEXT_PUBLIC_URL=http://proxy:8080`. This also becomes FastAPI's only
  CORS origin, which is harmless because browser traffic is same-origin.
- `api` and `renderer` share the `app_data` mount and the environment block
  (provider keys, `CAN_CHANGE_KEYS`, `PRESENTATION_GENERATION_MODE`, auth
  settings), written once with a YAML anchor.
- `renderer` also needs what `start.js` and the `Dockerfile` provide today:
  `FAST_API_INTERNAL_URL=http://api:8000`, `HOSTNAME=0.0.0.0`,
  `APP_DATA_DIRECTORY=/app_data`, `USER_CONFIG_PATH=/app_data/userConfig.json`,
  `TEMP_DIRECTORY=/tmp/presenton`, `PRESENTON_APP_ROOT=/app`, `NODE_ENV=production`.
- The `renderer` image copies the same Next.js build outputs the current
  `Dockerfile` does (standalone, `public`, `.next-build/static`).

## New files

`docker-compose.prod.yml`, the proxy nginx config, and Dockerfiles for `api`,
`frontend` and `renderer`, kept outside `servers/nextjs`.

## Done when

On a fresh `docker compose -f docker-compose.prod.yml up --build`:

- login, library, creating a deck from a template, editing and presenting work;
- PDF, PPTX and MP4 export succeed and their output looks like the current stack's;
- a custom template loads, and MCP responds through `/mcp`;
- no port other than 5001 is published, and `/` never serves the old UI;
- backend tests pass.

## Left to the builder

Dockerfile layout and base images, health checks and start order, and whether the
`api` mode is a flag in `start.js` or a separate entry script.
