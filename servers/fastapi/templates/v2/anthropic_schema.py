"""Make template-v2 structured-output schemas acceptable to Anthropic structured outputs.

Anthropic rejects two constructs the canonical schemas use:

* `oneOf` (Pydantic's discriminated unions). Every union here has a distinct `kind` const per
  variant, so the variants are mutually exclusive and `anyOf` accepts exactly the same documents.
  Pydantic's OpenAPI-style `discriminator` keyword goes with it.
* `anyOf` in the same object as `type`/`properties`/`required`/`additionalProperties` (the
  flexible-plan item contract). The sibling keywords are distributed into each variant: a variant
  sees the shared properties with its own narrowed ones taking precedence, which is what the
  conjunction means when, as here, each variant only narrows shared properties.

The response is still validated against the Pydantic model afterwards; this only changes what the
model is constrained to produce.
"""

import copy
from typing import Any

# Keywords that must not sit beside `anyOf` and so move into each variant.
_DISTRIBUTED_KEYWORDS = ("type", "properties", "required", "additionalProperties")


def is_anthropic_model(model: str) -> bool:
    name = model.lower()
    return "claude" in name or name.startswith("anthropic/")


def anthropic_compatible_json_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Return a converted deep copy; the input schema is not modified."""
    return _convert(copy.deepcopy(schema))


def _convert(value: Any) -> Any:
    if isinstance(value, list):
        return [_convert(item) for item in value]
    if not isinstance(value, dict):
        return value

    node = {key: _convert(nested) for key, nested in value.items()}
    if "oneOf" in node:
        node["anyOf"] = node.pop("oneOf") + node.get("anyOf", [])
        node.pop("discriminator", None)
    if "anyOf" in node and any(key in node for key in _DISTRIBUTED_KEYWORDS):
        node = _distribute_into_variants(node)
    return node


def _distribute_into_variants(node: dict[str, Any]) -> dict[str, Any]:
    shared = {key: node.pop(key) for key in _DISTRIBUTED_KEYWORDS if key in node}
    variants = []
    for variant in node["anyOf"]:
        if not isinstance(variant, dict) or "$ref" in variant:
            # A referenced variant cannot be merged in place; keep it beside the shared shape.
            variants.append({"allOf": [shared, variant]} if shared else variant)
            continue
        merged = {**shared, **{k: v for k, v in variant.items() if k not in ("properties", "required")}}
        if "properties" in shared or "properties" in variant:
            merged["properties"] = {**shared.get("properties", {}), **variant.get("properties", {})}
        required = list(shared.get("required", [])) + [
            name for name in variant.get("required", []) if name not in shared.get("required", [])
        ]
        if required:
            merged["required"] = required
        variants.append(merged)
    node["anyOf"] = variants
    return node
