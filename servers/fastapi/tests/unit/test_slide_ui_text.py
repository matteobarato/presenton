from utils.slide_ui_text import slide_ui_text


def _run(text):
    return {"text": text}


def _text(text, **extra):
    return {"type": "text", "runs": [_run(text)], **extra}


def _cell(text):
    return {"runs": [_run(text)]}


def test_slide_text_in_reading_order():
    ui = {
        "elements": [
            _text("Title"),
            {"type": "text-list", "items": [[_run("One")], [_run("Two")]]},
            {
                "type": "table",
                "columns": [_cell("H1"), _cell("H2")],
                "rows": [[_cell("a"), _cell("b")]],
            },
            _text("Hidden", decorative=True),
            {"type": "group", "children": [_text("Nested")]},
            {"type": "image", "video_placeholder": True},
        ],
        "components": [],
    }
    assert slide_ui_text(ui) == "Title\nOne\nTwo\nH1 | H2\na | b\nNested"


def test_components_follow_elements_and_whitespace_collapses():
    ui = {
        "elements": [_text("A  \n b")],
        "components": [{"elements": [{"type": "card", "child": _text("C")}]}],
    }
    assert slide_ui_text(ui) == "A b\nC"


def test_latex_runs_are_skipped():
    ui = {"elements": [{"type": "text", "runs": [_run("x"), {"type": "latex", "latex": "y^2"}]}]}
    assert slide_ui_text(ui) == "x"


def test_no_ui_gives_empty_text():
    assert slide_ui_text(None) == ""
