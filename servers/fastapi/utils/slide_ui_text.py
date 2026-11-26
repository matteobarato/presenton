"""Plain text of a slide's JSON, in reading order."""

import re
from typing import Any, Iterator


def _line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _item_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, list):
        return _runs_text(item)
    if isinstance(item, dict):
        return _runs_text(item.get("runs")) or str(item.get("text") or "")
    return ""


def _runs_text(runs: Any) -> str:
    if not isinstance(runs, list):
        return ""
    return "".join(
        run["text"] for run in runs if isinstance(run, dict) and isinstance(run.get("text"), str)
    )


def _cell_text(cell: Any) -> str:
    if isinstance(cell, dict):
        return _runs_text(cell.get("runs")) or str(cell.get("text") or "")
    return "" if cell is None else str(cell)


def _blocks(element: Any) -> Iterator[str]:
    if not isinstance(element, dict) or element.get("decorative") is True:
        return
    kind = element.get("type")
    if kind == "image" and element.get("video_placeholder"):
        return
    if kind == "text":
        yield _line(_runs_text(element.get("runs")) or _item_text(element.get("text")))
    elif kind == "text-list":
        for item in element.get("items") or []:
            yield _line(_item_text(item))
    elif kind == "table":
        columns = element.get("columns")
        if isinstance(columns, list):
            yield _line(" | ".join(_line(_cell_text(c)) for c in columns))
        for row in element.get("rows") or []:
            if isinstance(row, list):
                yield _line(" | ".join(_line(_cell_text(c)) for c in row))
    for key in ("child", "children"):
        child = element.get(key)
        for sub in child if isinstance(child, list) else [child]:
            yield from _blocks(sub)


def slide_ui_text(ui: Any) -> str:
    if not isinstance(ui, dict):
        return ""
    blocks: list[str] = []
    for element in ui.get("elements") or []:
        blocks.extend(_blocks(element))
    for component in ui.get("components") or []:
        if isinstance(component, dict):
            for element in component.get("elements") or []:
                blocks.extend(_blocks(element))
    return "\n".join(b for b in blocks if b)
