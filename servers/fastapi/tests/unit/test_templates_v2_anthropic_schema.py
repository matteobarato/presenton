"""Template-v2 structured-output schemas sent to Claude models.

Anthropic structured outputs reject `oneOf` ("use anyOf instead") and `anyOf` in the same schema
object as `type`/`properties`/`required`/`additionalProperties`. Pydantic emits `oneOf` for the
discriminated unions (visual data replacements, slide layout elements) and the flexible-plan
contract puts its exclusive variants in an `anyOf` beside the object keywords, so those passes
failed with HTTP 400 on every attempt. Claude now receives an equivalent compatible schema; other
providers keep the canonical schema.
"""

import copy
import json

import jsonschema
import pytest

from templates.v2 import certified_generation as generation
from templates.v2.models import layouts

CLAUDE_MODELS = ["anthropic/claude-haiku-5.5", "claude-sonnet-5-5"]
STRUCTURAL = {"type", "properties", "required", "additionalProperties", "items", "enum", "const"}

OUTPUT_MODELS = [
    (layouts.SemanticSlideManifest, "SemanticSlideManifestResponse"),
    (layouts.FlexibleSlidePlan, "FlexibleSlidePlanResponse"),
    (layouts.TextCapacityPlan, "TextCapacityPlanResponse"),
    (layouts.VisualDataReplacementPlan, "VisualDataReplacementPlanResponse"),
    (layouts.SlideLayout, "SlideLayoutResponse"),
    (layouts.SimilarComponentsList, "SimilarComponentsListResponse"),
]


def _violations(value, path="#"):
    found = []
    if isinstance(value, dict):
        if "oneOf" in value:
            found.append(f"{path}: oneOf")
        if "discriminator" in value:
            found.append(f"{path}: discriminator")
        if "anyOf" in value and STRUCTURAL & set(value):
            found.append(f"{path}: anyOf beside {sorted(STRUCTURAL & set(value))}")
        for key, nested in value.items():
            found.extend(_violations(nested, f"{path}/{key}"))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            found.extend(_violations(nested, f"{path}[{index}]"))
    return found


def _claude_schema(output_model, response_name, model=CLAUDE_MODELS[0]):
    return generation._response_schema_for_model(
        model=model,
        response_name=response_name,
        response_schema=generation._llm_output_json_schema(output_model),
    )


@pytest.mark.parametrize("model", CLAUDE_MODELS)
@pytest.mark.parametrize("output_model,response_name", OUTPUT_MODELS)
def test_claude_schemas_have_no_unsupported_combinators(model, output_model, response_name):
    assert _violations(_claude_schema(output_model, response_name, model)) == []


def test_canonical_schema_is_not_mutated():
    canonical = generation._llm_output_json_schema(layouts.VisualDataReplacementPlan)
    before = copy.deepcopy(canonical)
    generation._response_schema_for_model(
        model=CLAUDE_MODELS[0],
        response_name="VisualDataReplacementPlanResponse",
        response_schema=canonical,
    )
    assert canonical == before


@pytest.mark.parametrize("model", ["gpt-5.4", "llama3.3:70b", "models/gemini-3.7-flash"])
def test_other_models_keep_their_schema(model):
    canonical = generation._llm_output_json_schema(layouts.FlexibleSlidePlan)
    assert generation._response_schema_for_model(
        model=model,
        response_name="FlexibleSlidePlanResponse",
        response_schema=canonical,
    ) is canonical


def _flow_item_validators():
    def item_validator(schema):
        return jsonschema.Draft202012Validator(
            {"$defs": schema["$defs"], "$ref": "#/$defs/FlexibleFlowItemPlan"}
        )

    canonical = generation._llm_output_json_schema(layouts.FlexibleSlidePlan)
    claude = _claude_schema(layouts.FlexibleSlidePlan, "FlexibleSlidePlanResponse")
    return item_validator(canonical), item_validator(claude)


@pytest.mark.parametrize(
    "item,valid",
    [
        ({"indices": [0, 1], "flow_id": None}, True),
        ({"indices": None, "flow_id": "row_a"}, True),
        ({"indices": None, "flow_id": None}, False),
        ({"indices": [0], "flow_id": "row_a"}, False),
        ({"indices": [], "flow_id": None}, False),
        ({"indices": [0]}, False),
        ({"indices": [0], "flow_id": None, "extra": 1}, False),
    ],
)
def test_flexible_flow_item_accepts_the_same_documents(item, valid):
    canonical, claude = _flow_item_validators()
    assert canonical.is_valid(item) is valid
    assert claude.is_valid(item) is valid


def test_visual_data_replacements_keep_every_variant():
    schema = _claude_schema(layouts.VisualDataReplacementPlan, "VisualDataReplacementPlanResponse")
    items = schema["properties"]["replacements"]["items"]
    refs = sorted(alternative["$ref"].rsplit("/", 1)[-1] for alternative in items["anyOf"])
    assert refs == [
        "VisualChartReplacement",
        "VisualInfographicReplacement",
        "VisualTableReplacement",
        "VisualTextListReplacement",
    ]
    # Still a usable JSON Schema.
    jsonschema.Draft202012Validator.check_schema(json.loads(json.dumps(schema)))
