import copy
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO))

from scripts.template_video_layouts.__main__ import apply, reset  # noqa: E402

NEW = re.compile(r"_pv\d\d$")


def load(template_id):
    """The template as it was before this script ran, whether or not it has been applied on disk."""
    return reset(json.loads((REPO / "templates" / template_id / "template.json").read_text()))


def new_ids(template):
    return [l["id"] for l in template["layouts"] if NEW.search(l["id"])]


def test_swift_gets_seven_and_originals_are_untouched():
    original = load("swift")
    out = apply(copy.deepcopy(original))
    assert len(new_ids(out)) == 7
    assert out["layouts"][: len(original["layouts"])] == original["layouts"]
    assert out["merged_components"][: len(original["merged_components"])] == original["merged_components"]
    assert out["merged_components"][-1]["variants"][0]["id"]  # new components registered


def test_momentum_gets_five_new_without_touching_its_existing_video_layouts():
    original = load("momentum")
    out = apply(copy.deepcopy(original))
    assert len(new_ids(out)) == 5
    assert not any(i.endswith("_7401_pv01") for i in new_ids(out))
    assert out["layouts"][: len(original["layouts"])] == original["layouts"]


def test_short_derivation_is_topped_up_with_mirrored_archetypes_to_seven():
    out = apply(load("swift"))  # swift has a single clean image layout
    ids = new_ids(out)
    assert len(ids) == 7 and len(set(ids)) == 7
    assert any("_alt_pv" in i for i in ids)


def test_apply_twice_is_identical():
    once = apply(load("modern"))
    assert apply(copy.deepcopy(once)) == once


def test_reset_restores_the_original():
    original = load("modern")
    assert reset(apply(copy.deepcopy(original))) == original


def test_new_components_are_registered_with_pv_suffix_except_the_placeholder():
    out = apply(load("swift"))
    registered = {v["id"] for m in out["merged_components"] for v in m["variants"]}
    for layout in out["layouts"]:
        if NEW.search(layout["id"]):
            for comp in layout["components"]:
                assert comp["id"] in registered
                assert comp["id"] == "video_placeholder" or comp["id"].endswith("_pv") or comp["id"] in {
                    c["id"] for l in load("swift")["layouts"] for c in l["components"]
                }
