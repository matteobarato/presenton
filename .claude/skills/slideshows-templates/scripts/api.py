#!/usr/bin/env python3
"""Thin client for the Presenton REST API used by template work (stdlib only).

Auth: export PRESENTON_API_KEY=sk-presenton-...   (Settings → API keys in the app)
Base: export PRESENTON_BASE_URL=http://localhost:5001   (default; nginx → API)

    api.py whoami                                   # check the key and base URL work
    api.py list                                     # all templates (id, name, default?, layouts)
    api.py pull  <template_id> [--out FILE]         # save full template JSON (API shape)
    api.py push  <template_id> <FILE> [--yes]       # replace layouts + merged_components (user templates only)
    api.py patch-layout <template_id> <index> <layout.json>   # replace one existing layout slot
    api.py gen-layout <template_id> "<prompt>" [--out FILE]  # backend LLM drafts a layout in the template's style
    api.py meta <template_id> [--name N] [--description D] [--theme theme.json]
    api.py images-search "<query>" [--limit 6]      # stock photo URLs
    api.py image-generate "<prompt>"                # AI image (uses the configured image provider; costs money)
    api.py icons-search "<query>" [--type bold] [--limit 10]
    api.py upload-image <file>                      # returns a URL usable as image `data`
    api.py deck <template_id> "<content>" [--n 4] [--avatar] [--wait]   # end-to-end generation test (costly)
    api.py task <task_id>                           # async task status
    api.py get <path>                               # raw GET, e.g. /api/v1/ppt/template/<id>/theme

Built-in (is_default) templates are read-only through the API (403). Edit their
templates/<dir>/template.json and restart the API container to re-seed them.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

BASE = os.environ.get("PRESENTON_BASE_URL", "http://localhost:5001").rstrip("/")
KEY = os.environ.get("PRESENTON_API_KEY", "")
T = "/api/v1/ppt/template"


def request(method: str, path: str, body: Any = None, *, raw: bytes | None = None,
            content_type: str = "application/json", timeout: float = 600) -> Any:
    if not KEY:
        sys.exit("PRESENTON_API_KEY is not set. Create a personal key in the app (Settings → API keys) "
                 "and `export PRESENTON_API_KEY=sk-presenton-...`.")
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode() or "null"
            return json.loads(text) if text.strip()[:1] in "[{\"n0123456789tf" else text
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:2000]
        sys.exit(f"{method} {path} -> HTTP {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        sys.exit(f"cannot reach {BASE}: {exc.reason}. Is the stack up? (docker compose up production)")


def out(obj: Any) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def load_layouts_file(path: str) -> tuple[list, list | None, dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    layouts = data["layouts"]
    if isinstance(layouts, dict):
        layouts = layouts.get("layouts", [])
    mc = data.get("merged_components")
    if isinstance(mc, dict):
        mc = mc.get("components", [])
    return layouts, mc, data


# ---------------------------------------------------------------- commands
def cmd_whoami(a):
    res = request("GET", f"{T}/all?page=1&page_size=1")
    print(f"key OK at {BASE} ({res.get('total')} templates visible)")


def cmd_list(a):
    res = request("GET", f"{T}/all?page=1&page_size=100")
    for t in res.get("items", []):
        flag = "built-in" if t.get("is_default") else "user"
        print(f"{t['id']:<40} {flag:<9} {t.get('layout_count', 0):>3} layouts  {t['name']}")
    print(f"total: {res.get('total')}")


def cmd_pull(a):
    res = request("GET", f"{T}/{urllib.parse.quote(a.template_id)}")
    dest = Path(a.out or f"{a.template_id}.template.json")
    dest.write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    n = len((res.get("layouts") or {}).get("layouts", []))
    print(f"saved {dest} ({n} layouts, built-in={res.get('is_default')})")


def cmd_push(a):
    layouts, mc, _ = load_layouts_file(a.file)
    current = request("GET", f"{T}/{urllib.parse.quote(a.template_id)}")
    if current.get("is_default"):
        sys.exit("This is a built-in template: the API refuses edits (403). Edit templates/<dir>/template.json "
                 "and restart the API instead, or push to a user template.")
    before = [l["id"] for l in (current.get("layouts") or {}).get("layouts", [])]
    after = [l["id"] for l in layouts]
    print(f"layouts: {len(before)} -> {len(after)}")
    print(f"  added:   {sorted(set(after) - set(before))}")
    print(f"  removed: {sorted(set(before) - set(after))}")
    if not a.yes:
        sys.exit("dry run: re-run with --yes to write these layouts to the database")
    body: dict[str, Any] = {"layouts": {"layouts": layouts}}
    if mc is not None:
        body["merged_components"] = {"components": mc}
    res = request("PATCH", f"{T}/{urllib.parse.quote(a.template_id)}", body)
    print(f"pushed: {len((res.get('layouts') or {}).get('layouts', []))} layouts stored")


def cmd_patch_layout(a):
    layout = json.loads(Path(a.layout).read_text(encoding="utf-8"))
    res = request("PATCH", f"{T}/{urllib.parse.quote(a.template_id)}/layouts",
                  {"index": int(a.index), "layout": layout})
    print(f"patched slot {a.index}; template now has {len((res.get('layouts') or {}).get('layouts', []))} layouts")


def cmd_gen_layout(a):
    res = request("POST", f"{T}/layouts/generate", {"template_id": a.template_id, "prompt": a.prompt})
    dest = Path(a.out or "generated-layout.json")
    dest.write_text(json.dumps(res["layout"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{res.get('response')}\nsaved {dest} (not stored in the template yet)")


def cmd_meta(a):
    body: dict[str, Any] = {}
    if a.name:
        body["name"] = a.name
    if a.description:
        body["description"] = a.description
    if a.theme:
        body["theme"] = json.loads(Path(a.theme).read_text(encoding="utf-8"))
    if not body:
        sys.exit("nothing to update")
    res = request("PATCH", f"{T}/{urllib.parse.quote(a.template_id)}", body)
    print(f"updated {res['id']}: {res['name']}")


def cmd_images_search(a):
    out(request("GET", f"/api/v1/ppt/images/search?{urllib.parse.urlencode({'query': a.query, 'limit': a.limit})}"))


def cmd_image_generate(a):
    out(request("GET", f"/api/v1/ppt/images/generate?{urllib.parse.urlencode({'prompt': a.prompt})}"))


def cmd_icons_search(a):
    q = {"query": a.query, "limit": a.limit}
    if a.type:
        q["icon_type"] = a.type
    out(request("GET", f"/api/v1/ppt/icons/search?{urllib.parse.urlencode(q)}"))


def cmd_upload_image(a):
    path = Path(a.file)
    boundary = uuid.uuid4().hex
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    out(request("POST", "/api/v1/ppt/images/upload", raw=body,
                content_type=f"multipart/form-data; boundary={boundary}"))


def cmd_task(a):
    out(request("GET", f"/api/v1/async-tasks/status/{urllib.parse.quote(a.task_id)}"))


def cmd_deck(a):
    body: dict[str, Any] = {"content": a.content, "n_slides": a.n, "template": a.template_id,
                            "export_as": "pptx"}
    if a.avatar:
        body["n_videos"] = a.n
    task = request("POST", "/api/v1/ppt/presentation/generate/async", body)
    print(f"task {task.get('id')} status={task.get('status')}")
    if not a.wait:
        return
    for _ in range(180):
        time.sleep(5)
        st = request("GET", f"/api/v1/async-tasks/status/{urllib.parse.quote(task['id'])}")
        print(f"  {st.get('status')} {json.dumps(st.get('data') or {})[:160]}")
        if st.get("status") in ("completed", "failed", "error", "cancelled"):
            out(st)
            return
    print("still running; check later with: api.py task", task["id"])


def cmd_get(a):
    out(request("GET", a.path))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest="cmd", required=True)
    s.add_parser("whoami").set_defaults(fn=cmd_whoami)
    s.add_parser("list").set_defaults(fn=cmd_list)
    p = s.add_parser("pull"); p.add_argument("template_id"); p.add_argument("--out"); p.set_defaults(fn=cmd_pull)
    p = s.add_parser("push"); p.add_argument("template_id"); p.add_argument("file")
    p.add_argument("--yes", action="store_true"); p.set_defaults(fn=cmd_push)
    p = s.add_parser("patch-layout"); p.add_argument("template_id"); p.add_argument("index"); p.add_argument("layout")
    p.set_defaults(fn=cmd_patch_layout)
    p = s.add_parser("gen-layout"); p.add_argument("template_id"); p.add_argument("prompt"); p.add_argument("--out")
    p.set_defaults(fn=cmd_gen_layout)
    p = s.add_parser("meta"); p.add_argument("template_id"); p.add_argument("--name"); p.add_argument("--description")
    p.add_argument("--theme"); p.set_defaults(fn=cmd_meta)
    p = s.add_parser("images-search"); p.add_argument("query"); p.add_argument("--limit", type=int, default=6)
    p.set_defaults(fn=cmd_images_search)
    p = s.add_parser("image-generate"); p.add_argument("prompt"); p.set_defaults(fn=cmd_image_generate)
    p = s.add_parser("icons-search"); p.add_argument("query"); p.add_argument("--type")
    p.add_argument("--limit", type=int, default=10); p.set_defaults(fn=cmd_icons_search)
    p = s.add_parser("upload-image"); p.add_argument("file"); p.set_defaults(fn=cmd_upload_image)
    p = s.add_parser("task"); p.add_argument("task_id"); p.set_defaults(fn=cmd_task)
    p = s.add_parser("deck"); p.add_argument("template_id"); p.add_argument("content")
    p.add_argument("--n", type=int, default=4); p.add_argument("--avatar", action="store_true")
    p.add_argument("--wait", action="store_true"); p.set_defaults(fn=cmd_deck)
    p = s.add_parser("get"); p.add_argument("path"); p.set_defaults(fn=cmd_get)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
