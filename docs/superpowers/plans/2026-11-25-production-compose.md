# Production Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker-compose.prod.yml` serving the Vue app behind a separate nginx, with Next.js kept only as a hidden renderer.

**Architecture:** Four services: `proxy`, `frontend`, `api`, `renderer`. The proxy's port 80 serves users; its port 8080 is container-only and routes like today's `nginx.conf`, so export and video rendering keep one origin.

**Tech Stack:** Docker Compose, nginx 1.28, Python 3.11 / FastAPI, Node 22, Vite, Next.js standalone.

**Spec:** `docs/superpowers/specs/2026-11-25-production-compose-design.md`

## Global Constraints

- No change inside `servers/nextjs`.
- `docker-compose.yml`, `Dockerfile`, `nginx.conf`, `docker-compose.frontend.yml` stay unchanged; backend defaults stay as today.
- Only `${PRESENTON_HTTP_HOST_PORT:-5001}:80` is published. No 1455; Codex is ignored.
- No TLS; pass `X-Forwarded-*` through.
- Work on branch `feat/prod-compose`, not `main`.
- New Docker files live in `docker/prod/`.
- Python tests run from `servers/fastapi` with `uv run pytest`.
- The current stack is running on 5001: verify with another port and a **copy** of `app_data`; never stop it or write to the real data.

## Review Focus

- One service recreated alone (`up -d --force-recreate api`): the proxy must reach the new IP without a restart (Task 3, Task 4).
- Export browser now loads `http://proxy:8080`, which unlike `127.0.0.1` is not a secure context: PDF/PPTX must still render, with images and fonts (Task 4).
- Saved or exported content must not contain `proxy:8080` URLs that a user's browser cannot open (Task 4).
- `/app_data/images/...` without a session must return 401 (Task 4).
- Reloading a deep link such as `/p/<id>` must load the Vue app, not 404 (Task 4).

---

### Task 1: Backend can run split from nginx and Next.js

**Files:**
- Modify: `servers/fastapi/server.py`, `servers/fastapi/mcp_server.py` (the `run_async` block, ~line 455), `servers/fastapi/templates/get_layout_by_name.py:81`, `servers/fastapi/templates/custom_layout_from_db.py:17`, `start.js`
- Create: `servers/fastapi/utils/service_urls.py`
- Test: `servers/fastapi/tests/unit/test_split_services.py`

**Interfaces:**
- Produces: `get_bind_host() -> str` (env `PRESENTON_BIND_HOST`, default `"127.0.0.1"`); `get_web_base_url() -> str` (env `NEXT_PUBLIC_URL` stripped of trailing `/`, default `"http://localhost"`); env `PRESENTON_SPLIT_SERVICES=true` for `start.js`.

- [ ] **Step 1: Write the failing tests**

```python
from utils.service_urls import get_bind_host, get_web_base_url

def test_defaults(monkeypatch):
    monkeypatch.delenv("PRESENTON_BIND_HOST", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_URL", raising=False)
    assert get_bind_host() == "127.0.0.1"
    assert get_web_base_url() == "http://localhost"

def test_overrides(monkeypatch):
    monkeypatch.setenv("PRESENTON_BIND_HOST", "0.0.0.0")
    monkeypatch.setenv("NEXT_PUBLIC_URL", "http://proxy:8080/")
    assert get_bind_host() == "0.0.0.0"
    assert get_web_base_url() == "http://proxy:8080"
```

Add `test_builtin_template_uses_web_base_url`: with `NEXT_PUBLIC_URL=http://proxy:8080`, reuse the fake-session pattern from `test_get_layout_by_name_does_not_attach_obsolete_auth_cookie` (`test_small_surfaces_coverage.py`), capture the URL, assert `== "http://proxy:8080/api/template?group=deck"`. Add `test_custom_compile_url_uses_web_base_url`: call `_compile_custom_layouts_on_nextjs("custom-x", [])` with a fake `post`, assert URL `== "http://proxy:8080/api/template/custom"`.

- [ ] **Step 2:** `uv run pytest tests/unit/test_split_services.py -v` → FAIL (no module `utils.service_urls`).
- [ ] **Step 3: Implement.** Create the two functions. Use `get_bind_host()` for the uvicorn host in `server.py` and the MCP `host=` (and its log line). `MCP_API_BASE_URL` and `MCP_ALLOWED_HOSTS` stay. Build both template URLs at call time, not import time (this replaces `_CUSTOM_COMPILE_URL`).
- [ ] **Step 4: `start.js` split mode.** When `PRESENTON_SPLIT_SERVICES === "true"`: do not call `startNginx`, do not spawn or watch Next.js, do not wait on either, skip the startup banner. MCP `stdio` becomes `"inherit"` in this mode so its failures reach container logs. Everything else (app_data dirs, user config, export runtime, Ollama, FastAPI, MCP) is unchanged.
- [ ] **Step 5:** `uv run pytest tests/unit/test_split_services.py tests/unit/test_small_surfaces_coverage.py tests/unit/test_mcp_server_auth.py -v` → PASS; `node --check start.js` → no output.
- [ ] **Step 6: Commit** `feat(backend): allow running without in-container nginx and Next.js` (include the spec and this plan).

### Task 2: Images for `api`, `renderer`, `frontend`

**Files:**
- Create: `docker/prod/api.Dockerfile`, `docker/prod/renderer.Dockerfile`, `docker/prod/frontend.Dockerfile`, `docker/prod/frontend.nginx.conf`, `docker/prod/frontend.Dockerfile.dockerignore`

**Interfaces:**
- Consumes: `PRESENTON_SPLIT_SERVICES`, `PRESENTON_BIND_HOST` (Task 1).
- Produces: `api` listens 8000 and 8001; `renderer` 3000; `frontend` 80. All three build with repository root as context.

- [ ] **Step 1: `api.Dockerfile`.** Copy the root `Dockerfile` stages `fastapi-builder`, `assets-builder`, `runtime`. Drop `nextjs-builder`, the `nginx` apt package, the `nginx.conf` copy, and the three Next COPY lines; keep only `COPY servers/nextjs/public /app/servers/nextjs/public` (from the build context). Add `ENV PRESENTON_SPLIT_SERVICES=true PRESENTON_BIND_HOST=0.0.0.0`, `EXPOSE 8000 8001`.
- [ ] **Step 2: `renderer.Dockerfile`.** Stage `nextjs-builder` copied from the root `Dockerfile`; runtime `node:22-bookworm-slim` with the same three COPY lines into `/app/servers/nextjs`, plus `COPY servers/fastapi/static /app/servers/fastapi/static` (`/api/update-svg` reads icons from disk). `ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 PRESENTON_APP_ROOT=/app`, `WORKDIR /app/servers/nextjs`, `CMD ["node","server.js"]`.
- [ ] **Step 3: `frontend.Dockerfile`.** `node:22-alpine`: `npm ci`, then `BACKEND_URL= npm run build` (empty, so the baked "classic settings" link is relative, not `localhost:5001`). Runtime `nginx:1.28-alpine` serving `dist`; `frontend.nginx.conf` uses `try_files $uri $uri/ /index.html`, `/assets/` immutable for 1y, `index.html` `no-cache`. The dockerignore excludes `**/node_modules`, `frontend/dist`, `frontend/.env`, `frontend/test-results`.
- [ ] **Step 4: Build.** `for s in api renderer frontend; do docker build -f docker/prod/$s.Dockerfile -t presenton-prod-$s . || break; done` → three successful builds. Run in the background; it is slow.
- [ ] **Step 5: Check contents.**
  - `docker run --rm presenton-prod-api sh -c 'test ! -e /app/servers/nextjs/server.js && test -d /app/servers/nextjs/public/vendor/fonts && ! command -v nginx && echo OK'` → `OK`
  - `docker run --rm presenton-prod-frontend sh -c '! grep -rq "localhost:5001" /usr/share/nginx/html && echo OK'` → `OK`
- [ ] **Step 6: Commit** `build: production images for api, renderer and frontend`.

### Task 3: Proxy config and compose file

**Files:**
- Create: `docker/prod/proxy.nginx.conf`, `docker-compose.prod.yml`
- Test: `servers/fastapi/tests/unit/test_prod_proxy_config.py`

**Interfaces:**
- Consumes: the images and ports from Task 2.

- [ ] **Step 1: Write the failing test** (read the files as `test_nginx_mcp_config.py` does)

```python
def test_public_renderer_routes_are_exact():
    for route in ["/api/runtime-config", "/api/templates", "/api/has-required-key",
                  "/api/can-change-keys", "/api/update-svg"]:
        assert f"location = {route} " in public_server

def test_listeners_and_defaults():
    assert "listen 80;" in public_server and "proxy_pass http://frontend_up" in public_server
    assert "listen 8080;" in internal_server and "proxy_pass http://renderer_up" in internal_server
    assert "frontend_up" not in internal_server

def test_only_one_published_port():
    assert re.findall(r'^\s*-\s*"[^"]*:\d+"\s*$', compose, re.M) == [
        '      - "${PRESENTON_HTTP_HOST_PORT:-5001}:80"']
    assert "1455" not in compose
```

`public_server` and `internal_server` are the two `server { }` blocks split out of the config.

- [ ] **Step 2:** `uv run pytest tests/unit/test_prod_proxy_config.py -v` → FAIL (file missing).
- [ ] **Step 3: `proxy.nginx.conf`.** Start from `nginx.conf` and carry over every header, timeout, body size, the 413 handler, both MCP locations (`Host localhost:8001`), the forwarded-proto/host maps, `/_auth_check`, and every `/app_data/*` block with `disable_symlinks`. Changes:
  - `user nginx;`
  - Upstreams `api_up` (api:8000), `mcp_up` (api:8001), `renderer_up` (renderer:3000), `frontend_up` (frontend:80), each with `zone` and `server <name>:<port> resolve;`, plus `resolver 127.0.0.11 valid=10s;`.
  - `/static/` proxies to `api_up` instead of `alias`.
  - Port 80: the five exact renderer routes (all with the forwarded headers), `/` to `frontend_up`.
  - Port 8080: `/api/v1/`, `/api/v2/`, `/static/`, `/app_data/*` and `/_auth_check` as on port 80; `/` to `renderer_up`. Put the shared locations in `docker/prod/proxy.locations.conf` and `include` it in both servers.
- [ ] **Step 4: `docker-compose.prod.yml`.**
  - `name: presenton-prod`; `restart: unless-stopped` on all; builds use context `.` and the Task 2 Dockerfiles.
  - `x-app-env: &app-env` as a **mapping** with every variable from `docker-compose.yml`'s `production.environment`, same defaults, except `PUPPETEER_EXECUTABLE_PATH` and all `CODEX_*`. Add `DISABLE_AUTH: ${DISABLE_AUTH:-}` only if `docker-compose.yml` sets it (it does not today, so omit).
  - `api`: `<<: *app-env`, `NEXT_PUBLIC_URL: http://proxy:8080`, `PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium`; volumes `${PRESENTON_APP_DATA_PATH:-./app_data}:/app_data`, `./secrets:/secrets`; healthcheck `curl -fsS http://127.0.0.1:8000/api/v1/auth/status`, `start_period: 120s`. Templates are baked into the image, not mounted.
  - `renderer`: `<<: *app-env`, `FAST_API_INTERNAL_URL: http://api:8000`, `APP_DATA_DIRECTORY: /app_data`, `USER_CONFIG_PATH: /app_data/userConfig.json`, `TEMP_DIRECTORY: /tmp/presenton`; same `app_data` volume; `depends_on: api: service_healthy`.
  - `proxy`: `nginx:1.28-alpine`, the one published port, config files and `app_data` mounted `:ro`; `depends_on` the other three being started.
- [ ] **Step 5:** the test passes; `docker compose -f docker-compose.prod.yml config -q` → no output.
- [ ] **Step 6: Commit** `feat: production compose with separate nginx proxy`.

### Task 4: End-to-end verification and docs

**Files:**
- Modify: `CLAUDE.md` (Frontend section), `README.md` (a short production section)

- [ ] **Step 1: Start on a copy.** `cp -a app_data <scratchpad>/prod-app-data`, then `PRESENTON_APP_DATA_PATH=<scratchpad>/prod-app-data PRESENTON_HTTP_HOST_PORT=5002 docker compose -f docker-compose.prod.yml up -d --build` → all four services up, `api` healthy.
- [ ] **Step 2: HTTP checks** against `localhost:5002`:
  - `/` and `/p/anything` → 200 with the Vue `index.html`; no `/_next/` in the body.
  - `/api/v1/auth/status` → 200. `/api/templates` → 200.
  - `/app_data/images/x.png` without cookie → 401.
  - `/mcp` without token → 401 (not 502 or 421).
  - `docker compose ... ps` → only 5002 published.
- [ ] **Step 3: In the browser** (needs a login; ask the user for one if none is available): library, create a deck from a built-in template, edit, present, open a deck that uses a custom template.
- [ ] **Step 4: Exports.** PDF, PPTX and MP4 of one deck with images, custom fonts and a chart; render the same deck on the current stack (:5001) and compare page by page. Then `grep -c "proxy:8080"` over the exported files and the copied `fastapi.db` → 0.
- [ ] **Step 5: Recreate.** `docker compose ... up -d --force-recreate api renderer`; within 2 minutes `/api/v1/auth/status` and `/api/templates` return 200 with the proxy untouched.
- [ ] **Step 6: Full tests.** `uv run pytest` in `servers/fastapi`. Report any failure that also happens on `main` as pre-existing.
- [ ] **Step 7: Docs.** State the command `docker compose -f docker-compose.prod.yml up -d --build`, that `renderer` is the old Next.js kept for export/video/templates, and that Codex sign-in and TLS are not covered.
- [ ] **Step 8:** `docker compose -f docker-compose.prod.yml down`, then commit `docs: production deployment`.
