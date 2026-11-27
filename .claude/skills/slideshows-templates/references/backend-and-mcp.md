# Backend, API and MCP for template work

## Contents
1. Two stores and how changes go live
2. Auth
3. REST endpoints (template work)
4. MCP server: what it can and can't do
5. Tests to run
6. Seeing it in the app

## 1. Two stores and how changes go live

**Built-in (bundled) templates**: `templates/<dir>/template.json` plus
`templates/<dir>/static/`. They are the product's shipped templates.
- `api/lifespan.py → import_default_templates_on_startup()` upserts each one into
  the `templates` DB table on **every API start** (`is_default = true`). It also
  copies `static/` to `app_data/templates/<id>/` and rewrites `static/...` asset
  paths to `/app_data/templates/<id>/static/...`.
- They are **read-only through the API**. PATCH returns 403 "Built-in templates
  are read-only".
- To apply an edit, restart the API.
  - Dev stack, where `templates/` is mounted into the container: run
    `docker compose restart production` from the repo root. The container is
    `presenton-production-1`, on :5001.
  - Prod stack (`docker-compose.prod.yml`), where templates are baked into the
    image: run `docker compose -f docker-compose.prod.yml up -d --build api`.
- A new bundled template is a new directory with a unique `id` in its JSON.
  `tpl.py copy <existing> templates/<new>` scaffolds one. Deleting a directory
  removes that template on the next start (`_remove_stale_default_templates`).
- Each bundled template also has `static/thumbnail.png` for the gallery card. If
  the look changes significantly, regenerate it from the title layout's render.

**User templates**: rows in the DB, owned by a user. They come from PPTX import
(UI `/templates/import`, or MCP `start_template_generation`). Edit them through
the API.
- `PATCH /{id}/layouts` with `{index, layout}` or `{layouts: [{index, layout}]}`
  replaces existing slots. The index can't exceed the current or raw slide count.
- `PATCH /{id}` with `{"layouts": {"layouts": [...]}, "merged_components":
  {"components": [...]}}` replaces the whole list. Use it to add or remove
  layouts. `api.py push` does this: a dry run by default, `--yes` to write.
- Existing presentations keep their own copy of each slide's UI. Editing a
  template changes future generations only.

You can't make a brand-new *user* template from JSON alone: there is no create
endpoint without a PPTX. To build a new template from scratch, make it a bundled
template. Alternatively, ask the user to import any PPTX and then replace its
layouts with `push`.

## 2. Auth

The REST API and MCP both accept `Authorization: Bearer sk-presenton-<id>.<secret>`
(`api/v1/auth/principal.py`). The user creates a personal key in the app
(Settings → API keys) and exports it:

```bash
export PRESENTON_API_KEY=sk-presenton-...        # never write it into files or commit it
export PRESENTON_BASE_URL=http://localhost:5001   # default; the nginx front of the dev stack
```

The offline tools (`tpl.py`, `validate_layout.py`, `render_layouts.mjs`) need no
key. Only `api.py` and MCP calls do. Without a key every API path returns 401:
say so and carry on offline, but don't try to get around it.

## 3. REST endpoints (prefix `/api/v1/ppt`)

| purpose | method & path | notes |
|---|---|---|
| list templates | `GET /template/all?page=1&page_size=100` | `is_default` marks built-ins |
| full template | `GET /template/{id}` | API shape (layouts nested) |
| theme only | `GET /template/{id}/theme` | |
| draft a layout with the backend LLM | `POST /template/layouts/generate` `{template_id, prompt}` | Returns `{layout, response}` **without saving it**. It's a useful first draft in the template's style; always validate and render it before saving. |
| replace layout slots | `PATCH /template/{id}/layouts` | user templates only |
| metadata, all layouts, merged components, theme, fonts | `PATCH /template/{id}` | user templates only |
| certify layouts from raw PPTX slides | `POST /template/layouts/create` `{template_id, index \| indices}` | the PPTX import pipeline; vision LLM |
| rebuild merged components | `POST /template/generate-blocks` `{template_id}` | LLM clustering |
| PPTX → new template | `POST /template/async` (after `/template/mcp-upload` or `/template/fonts-upload-and-slides-preview`) | see `docs/template-v2.md` |
| stock images | `GET /images/search?query=&limit=` | |
| AI image | `GET /images/generate?prompt=` | Costs money. Ask before generating many. |
| upload image | `POST /images/upload` (multipart `file`) | returns an asset with a URL |
| icons | `GET /icons/search?query=&limit=&icon_type=` | |
| end-to-end deck | `POST /presentation/generate/async` `{content, n_slides, template, n_videos?}` → `GET /api/v1/async-tasks/status/{id}` | Real LLM and image cost. Opt-in only. |

`scripts/api.py` wraps all of these (`api.py --help`). The OpenAPI spec is in
`servers/fastapi/openai_spec.json`; grep it for exact request models.

## 4. MCP server

`servers/fastapi/mcp_server.py` serves MCP at `http://localhost:5001/mcp`, with
the same Bearer key. It deliberately exposes a small allowlist:

| MCP tool | use in template work |
|---|---|
| `list_templates` | find template ids (`default=true` for built-ins, `false` for the user's own) |
| `upload_template_assets` → `start_template_generation` → `get_job_status` | turn a PPTX into a new **user** template (vision-LLM certification) |
| `start_standard_presentation` → `get_job_status` | generate a deck from a template: the end-to-end check |
| `upload_files` | source documents for deck generation |

Layout editing and patching are **not** on MCP. Use REST (`api.py`) for those.
If an MCP client is connected to this Claude session (tools named like
`mcp__presenton__*`), you may use it for listing and end-to-end generation
instead of `api.py`. Otherwise `api.py` covers everything.

Never use the Smart workflow (`start_smart_presentation`). This project is
template-only.

## 5. Tests to run

Run from `servers/fastapi` with `.venv/bin/python -m pytest -q`:
- Always, after editing any bundled template: `tests/unit/test_default_templates.py`,
  `tests/unit/test_templates_v2_schema.py`, `tests/unit/test_template_layout_length_hints.py`.
- Avatar layouts: `tests/unit/test_bundled_template_video_layouts.py`,
  `tests/unit/test_bundled_template_video_selection.py`, `tests/unit/test_image_target.py`.
- For an `_pvNN` count mismatch in `test_bundled_template_video_layouts.py`:
  update `NEW_PER_TEMPLATE` only when the user wants more `_pvNN` layouts in that
  template. Otherwise use a different id suffix.

Frontend tests cover the renderer, not template data. There's no need to run
them for template-only changes.

## 6. Seeing it in the app

- Vue app: `/templates` (gallery) and `/templates/<id>` (every layout rendered,
  with a lightbox) at http://localhost:5001 (prod-like) or http://localhost:5173
  (Vite dev).
- Built-in changes show only after the API restart. Hard-refresh the browser.
- `render_layouts.mjs` uses the same HTML renderer as these views, so a clean
  render there is strong evidence, with one difference. When a theme's
  `textFont.url` is a Google Fonts stylesheet, the script `<link>`s it, while the
  app passes it to `@font-face src`, which can't load a stylesheet and may fall
  back to serif. If text looks serif in the app but not in the script, that's
  the cause. The in-app view is the final confirmation.
