"""PPTX-to-JSON output with empty text runs (`<a:r><a:t></a:t></a:r>`).

The converter (JavaScript) emits those runs without a `text` key, since `JSON.stringify` drops
`undefined`, or with `"text": null`. Both are rejected by the JSON-to-image renderer and the
template `TextRun` model both reject. The service normalises them to empty strings.
"""

import asyncio
import json

from services.export_task_service import EXPORT_TASK_SERVICE, ExportTaskService


def _layouts_with_null_runs() -> dict:
    return {
        "layouts": [
            {
                "elements": [
                    {
                        "type": "text",
                        "runs": [
                            {"text": "Title", "font": {"family": "Merriweather"}},
                            {"text": None, "font": {"family": "Arial"}},
                            {"font": {"family": "Arial"}},
                        ],
                    },
                    {
                        "type": "group",
                        "elements": [
                            {"type": "text", "runs": [{"text": None}, {"text": "  "}]},
                        ],
                    },
                ]
            }
        ]
    }


def test_normalize_replaces_null_run_text_with_empty_string():
    data = ExportTaskService._normalize_pptx_json_text_runs(_layouts_with_null_runs())

    first = data["layouts"][0]["elements"][0]["runs"]
    nested = data["layouts"][0]["elements"][1]["elements"][0]["runs"]
    assert first == [
        {"text": "Title", "font": {"family": "Merriweather"}},
        {"text": "", "font": {"family": "Arial"}},
        {"text": "", "font": {"family": "Arial"}},
    ]
    assert nested == [{"text": ""}, {"text": "  "}]


def test_convert_pptx_to_json_normalizes_null_run_text(tmp_path, monkeypatch):
    pptx = tmp_path / "deck.pptx"
    pptx.write_bytes(b"pk")
    output = tmp_path / "out.json"
    output.write_text(json.dumps(_layouts_with_null_runs()), encoding="utf-8")

    async def fake_run_task(_payload, _message):
        return {"path": str(output)}

    monkeypatch.setattr(EXPORT_TASK_SERVICE, "_run_task", fake_run_task)
    monkeypatch.setattr(EXPORT_TASK_SERVICE, "_resolve_output_path", lambda _data: str(output))
    monkeypatch.setattr(ExportTaskService, "_absolutize_conversion_asset_urls", staticmethod(lambda _p, data, _r: data))
    monkeypatch.setattr(ExportTaskService, "_scope_conversion_artifacts", staticmethod(lambda _p, data, _r: data))

    document = asyncio.run(EXPORT_TASK_SERVICE.convert_pptx_to_json(str(pptx)))

    runs = document.layouts[0]["elements"][0]["runs"]
    assert runs[1]["text"] == ""
    assert runs[2]["text"] == ""
    assert document.layouts[0]["elements"][1]["elements"][0]["runs"][0]["text"] == ""


def test_normalize_leaves_latex_runs_alone():
    latex = {"type": "latex", "latex": "x^2", "display_mode": False}
    data = ExportTaskService._normalize_pptx_json_text_runs({"layouts": [{"elements": [{"runs": [dict(latex), {"type": "text"}]}]}]})

    runs = data["layouts"][0]["elements"][0]["runs"]
    assert runs[0] == latex
    assert runs[1] == {"type": "text", "text": ""}
