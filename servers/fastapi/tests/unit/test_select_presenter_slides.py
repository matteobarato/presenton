import asyncio
import json
from unittest.mock import AsyncMock, patch

from tests.unit.test_templates_v2_anthropic_schema import _violations
from utils.llm_calls import select_presenter_slides as module

MODULE = "utils.llm_calls.select_presenter_slides"


def _slides(count):
    return [{"text": f"slide {i}", "note": ""} for i in range(count)]


def _run(count, **patches):
    return asyncio.run(module.select_presenter_slides(_slides(count), deck_title="Deck"))


def _patched(structured):
    return (
        patch(f"{MODULE}.get_client"),
        patch(f"{MODULE}.get_llm_config"),
        patch(f"{MODULE}.get_model"),
        patch(f"{MODULE}.generate_structured_with_schema_retries", structured),
    )


def test_llm_choice_is_normalised():
    structured = AsyncMock(return_value={"indexes": [5, 40, 5]})
    a, b, c, d = _patched(structured)
    with a, b, c, d:
        assert _run(10) == [0, 5, 9]


def test_llm_failure_falls_back():
    structured = AsyncMock(side_effect=RuntimeError("boom"))
    a, b, c, d = _patched(structured)
    with a, b, c, d:
        assert _run(12) == [0, 4, 8, 11]


def test_missing_llm_config_falls_back():
    structured = AsyncMock()
    with patch(f"{MODULE}.get_llm_config", side_effect=ValueError("no config")), patch(
        f"{MODULE}.generate_structured_with_schema_retries", structured
    ):
        assert _run(12) == [0, 4, 8, 11]
    structured.assert_not_awaited()


def test_tiny_decks_skip_the_llm():
    structured = AsyncMock()
    a, b, c, d = _patched(structured)
    with a, b, c, d:
        assert _run(2) == [0, 1]
    structured.assert_not_awaited()


def test_schema_is_claude_compatible():
    schema = module.presenter_slides_schema()
    assert _violations(schema) == []
    for keyword in ("minItems", "maxItems", "minimum", "maximum"):
        assert keyword not in json.dumps(schema)
    assert schema == {
        "type": "object",
        "properties": {"indexes": {"type": "array", "items": {"type": "integer"}}},
        "required": ["indexes"],
        "additionalProperties": False,
    }


def test_llm_call_that_never_returns_falls_back(monkeypatch):
    async def never_returns(*args, **kwargs):
        await asyncio.sleep(60)

    monkeypatch.setattr(module, "PRESENTER_SELECTION_TIMEOUT_SECONDS", 0.01)
    a, b, c, d = _patched(never_returns)
    with a, b, c, d:
        assert _run(12) == [0, 4, 8, 11]


def test_llm_picking_too_many_slides_falls_back():
    structured = AsyncMock(return_value={"indexes": list(range(10))})
    a, b, c, d = _patched(structured)
    with a, b, c, d:
        assert _run(10) == [0, 4, 8, 9]


def test_llm_picking_up_to_half_is_kept():
    structured = AsyncMock(return_value={"indexes": [0, 2, 4, 6, 9]})
    a, b, c, d = _patched(structured)
    with a, b, c, d:
        assert _run(10) == [0, 2, 4, 6, 9]
