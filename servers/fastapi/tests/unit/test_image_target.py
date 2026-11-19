from models.presentation_layout import PresentationLayoutModel, SlideLayoutModel
from utils.image_target import (
    enforce_image_target,
    image_layout_indexes,
    image_target_instruction,
)
from utils.llm_calls.generate_presentation_structure import (
    get_messages,
    get_messages_for_slides_markdown,
)


def _image_schema(title: str) -> dict:
    return {
        "type": "object",
        "title": title,
        "properties": {
            "heading": {"type": "string"},
            "visual": {
                "type": "object",
                "properties": {"image_prompt": {"type": "string"}},
            },
        },
    }


def _text_schema(title: str) -> dict:
    return {"type": "object", "title": title, "properties": {"heading": {"type": "string"}}}


def _layout() -> PresentationLayoutModel:
    # 0 title_intro (image), 1 title_bullet_points, 2 title_image_bullet_points (image),
    # 3 title_table_description, 4 title_description_image (image), 5 title_description
    return PresentationLayoutModel(
        name="test",
        slides=[
            SlideLayoutModel(id="title_intro", json_schema=_image_schema("title_intro")),
            SlideLayoutModel(id="title_bullet_points", json_schema=_text_schema("title_bullet_points")),
            SlideLayoutModel(id="title_image_bullet_points", json_schema=_image_schema("title_image_bullet_points")),
            SlideLayoutModel(id="title_table_description", json_schema=_text_schema("title_table_description")),
            SlideLayoutModel(id="title_description_image", json_schema=_image_schema("title_description_image")),
            SlideLayoutModel(id="title_description", json_schema=_text_schema("title_description")),
        ],
    )


def _text_only_layout() -> PresentationLayoutModel:
    return PresentationLayoutModel(
        name="text",
        slides=[
            SlideLayoutModel(id="a", json_schema=_text_schema("a")),
            SlideLayoutModel(id="b", json_schema=_text_schema("b")),
        ],
    )


def _count_images(selection, layout) -> int:
    images = set(image_layout_indexes(layout))
    return sum(1 for index in selection if index in images)


def test_image_layouts_are_found_by_their_image_prompt_slot():
    assert image_layout_indexes(_layout()) == [0, 2, 4]
    assert image_layout_indexes(_text_only_layout()) == []


def test_auto_leaves_the_selection_alone():
    selection = [0, 2, 4, 2, 4]
    assert enforce_image_target(selection, _layout(), None) == selection


def test_too_many_image_slides_are_swapped_to_matching_text_layouts():
    layout = _layout()
    selection = [0, 2, 4, 2, 4, 1]
    result = enforce_image_target(selection, layout, 2)

    assert len(result) == len(selection)
    assert _count_images(result, layout) == 2
    # An image bullet slide becomes the plain bullet slide, never the table layout.
    assert 3 not in result
    swapped = [i for i, (old, new) in enumerate(zip(selection, result)) if old != new]
    for position in swapped:
        if selection[position] == 2:
            assert result[position] == 1


def test_too_few_image_slides_are_swapped_to_image_layouts():
    layout = _layout()
    selection = [1, 5, 1, 5, 3, 1]
    result = enforce_image_target(selection, layout, 3)

    assert _count_images(result, layout) == 3
    # The table slide keeps its table: special layouts are not given up for images.
    assert result[4] == 3


def test_none_removes_every_image_layout():
    layout = _layout()
    result = enforce_image_target([0, 2, 4, 1], layout, 0)
    assert _count_images(result, layout) == 0


def test_a_target_above_the_deck_size_fills_what_it_can():
    layout = _layout()
    result = enforce_image_target([1, 5], layout, 10)
    assert _count_images(result, layout) == 2


def test_a_template_without_image_layouts_is_left_alone():
    layout = _text_only_layout()
    assert enforce_image_target([0, 1, 0], layout, 2) == [0, 1, 0]
    assert enforce_image_target([0, 1, 0], layout, 0) == [0, 1, 0]


def test_auto_keeps_both_structure_prompts_byte_identical():
    layout = _layout()
    assert image_target_instruction(layout, None, 6) == ""
    for build in (get_messages, get_messages_for_slides_markdown):
        before = build(layout, 6, "outline", "Be bold", "Topic")
        after = build(layout, 6, "outline", "Be bold", "Topic", "")
        assert [m.content for m in before] == [m.content for m in after]
        assert "Image Target" not in str(before[0].content)


def test_a_target_is_spelled_out_in_both_structure_prompts():
    layout = _layout()
    target = image_target_instruction(layout, 2, 6)
    assert "Exactly 2 of the 6 slides" in target
    assert "Layouts with an image: 0, 2, 4." in target
    for build in (get_messages, get_messages_for_slides_markdown):
        prompt = str(build(layout, 6, "outline", None, None, target)[0].content)
        assert "# Image Target" in prompt

    assert "No slide may use a layout with an image." in image_target_instruction(
        layout, 0, 6
    )
    assert image_target_instruction(_text_only_layout(), 2, 6) == ""


def _general_like_layout() -> PresentationLayoutModel:
    """Like the built-in `general` template: every layout without an image
    needs chart, table, metrics or contents data."""
    return PresentationLayoutModel(
        name="general-like",
        slides=[
            SlideLayoutModel(id="title_intro", json_schema=_image_schema("title_intro")),
            SlideLayoutModel(id="title_image_bullet_points", json_schema=_image_schema("title_image_bullet_points")),
            SlideLayoutModel(id="title_description_chart_cards", json_schema=_text_schema("title_description_chart_cards")),
            SlideLayoutModel(id="title_metrics_description", json_schema=_text_schema("title_metrics_description")),
            SlideLayoutModel(id="title_table_description", json_schema=_text_schema("title_table_description")),
            SlideLayoutModel(id="table_of_contents", json_schema=_text_schema("table_of_contents")),
        ],
    )


def test_prompt_lists_only_plain_layouts_as_image_free_options():
    target = image_target_instruction(_layout(), 0, 6)
    assert "No slide may use a layout with an image." in target
    assert "Layouts without an image for ordinary slides: 1, 5." in target
    assert "Never use a table, chart, metrics or contents layout" in target


def test_none_never_pushes_text_onto_chart_or_table_layouts():
    layout = _general_like_layout()
    # The prompt does not ask for an image-free deck it cannot build.
    assert image_target_instruction(layout, 0, 6) == ""
    assert "No slide may" not in image_target_instruction(layout, 2, 6)
    # Enforcement keeps image slides rather than swapping them to special layouts.
    selection = [0, 1, 1, 2, 1]
    assert enforce_image_target(selection, layout, 0) == selection


def test_metric_layouts_are_not_plain():
    layout = PresentationLayoutModel(
        name="metric",
        slides=[
            SlideLayoutModel(id="title_image_points", json_schema=_image_schema("title_image_points")),
            SlideLayoutModel(id="title_metric_cards", json_schema=_text_schema("title_metric_cards")),
        ],
    )
    assert enforce_image_target([0, 0], layout, 0) == [0, 0]


# --- Presenter videos -------------------------------------------------------

from utils.image_target import (  # noqa: E402
    enforce_media_targets,
    media_target_instruction,
    plain_layout_indexes,
    video_layout_indexes,
    video_slot_positions,
)


def _momentum_like_layout() -> PresentationLayoutModel:
    # 0 title_intro (image), 1 title_bullet_points (plain),
    # 2 video_left_title_points (video), 3 title_image_points (image),
    # 4 quote_panel_video (video), 5 table_of_contents, 6 title_description (plain)
    return PresentationLayoutModel(
        name="momentum-like",
        slides=[
            SlideLayoutModel(id="title_intro", json_schema=_image_schema("title_intro")),
            SlideLayoutModel(id="title_bullet_points", json_schema=_text_schema("title_bullet_points")),
            SlideLayoutModel(id="video_left_title_points", json_schema=_text_schema("video_left_title_points"), has_video=True),
            SlideLayoutModel(id="title_image_points", json_schema=_image_schema("title_image_points")),
            SlideLayoutModel(id="quote_panel_video", json_schema=_text_schema("quote_panel_video"), has_video=True),
            SlideLayoutModel(id="table_of_contents", json_schema=_text_schema("table_of_contents")),
            SlideLayoutModel(id="title_description", json_schema=_text_schema("title_description")),
        ],
    )


def _count_videos(selection, layout) -> int:
    videos = set(video_layout_indexes(layout))
    return sum(1 for index in selection if index in videos)


def test_video_layouts_are_never_plain():
    layout = _momentum_like_layout()
    assert video_layout_indexes(layout) == [2, 4]
    assert plain_layout_indexes(layout) == [1, 6]


def test_no_images_never_moves_slides_onto_video_layouts():
    layout = _momentum_like_layout()
    selection = [0, 3, 3, 1, 3, 0]
    result = enforce_media_targets(selection, layout, 0, None)
    assert _count_images(result, layout) == 0
    assert _count_videos(result, layout) == 0
    assert "video" not in image_target_instruction(layout, 0, 6).split("Layouts without")[1]


def test_video_target_swaps_onto_and_off_video_layouts():
    layout = _momentum_like_layout()
    more = enforce_media_targets([0, 1, 6, 1, 6, 1], layout, None, 2)
    assert _count_videos(more, layout) == 2

    fewer = enforce_media_targets([2, 4, 2, 1, 4], layout, None, 1)
    assert _count_videos(fewer, layout) == 1
    none = enforce_media_targets([2, 4, 2, 1, 4], layout, None, 0)
    assert _count_videos(none, layout) == 0
    # With images on auto a former video slide may take the closest image layout.
    # With no images either, they all land on plain layouts.
    both_none = enforce_media_targets([2, 4, 2, 1, 4], layout, 0, 0)
    assert _count_videos(both_none, layout) == 0
    assert _count_images(both_none, layout) == 0


def test_image_pass_keeps_video_slides_in_place():
    layout = _momentum_like_layout()
    result = enforce_media_targets([2, 1, 6, 1, 6, 4], layout, 3, 2)
    assert result[0] == 2 and result[5] == 4
    assert _count_videos(result, layout) == 2
    assert _count_images(result, layout) == 3


def test_presenter_slots_fill_what_video_layouts_do_not():
    layout = _momentum_like_layout()
    # One slide already sits on a video layout; the TOC slide is never chosen.
    positions = video_slot_positions([0, 5, 2, 1, 6, 1], layout, 3)
    assert len(positions) == 2
    assert 1 not in positions and 2 not in positions
    assert positions == sorted(positions)
    # Same inputs, same slides: the stream and the save agree.
    assert positions == video_slot_positions([0, 5, 2, 1, 6, 1], layout, 3)

    assert video_slot_positions([0, 1, 6], layout, None) == []
    assert video_slot_positions([0, 1, 6], layout, 0) == []
    assert video_slot_positions([2, 4], layout, 1) == []


def test_templates_without_video_layouts_get_slots_on_spread_slides():
    layout = _layout()
    assert video_slot_positions([0, 1, 2, 5, 1, 4], layout, 2) == [1, 4]
    assert media_target_instruction(layout, None, 6, 2) == ""


def test_auto_videos_keep_both_structure_prompts_byte_identical():
    layout = _momentum_like_layout()
    assert media_target_instruction(layout, None, 6, None) == ""
    for build in (get_messages, get_messages_for_slides_markdown):
        before = build(layout, 6, "outline", "Be bold", "Topic")
        after = build(layout, 6, "outline", "Be bold", "Topic", media_target_instruction(layout, None, 6, None))
        assert [m.content for m in before] == [m.content for m in after]


def test_video_target_is_spelled_out_for_templates_with_video_layouts():
    layout = _momentum_like_layout()
    text = media_target_instruction(layout, None, 6, 2)
    assert "# Presenter Video Target" in text
    assert "at most 2 of the 6 slides" in text
    assert "Presenter video layouts: 2, 4." in text
    assert "No slide may use a presenter video layout." in media_target_instruction(layout, None, 6, 0)


def test_presenter_slots_prefer_slides_with_a_clear_corner():
    layout = _layout()
    layout.slides[1].presenter_fits = False  # title_bullet_points is crowded
    # Slides 1 and 3 use the crowded layout; 2 and 4 have a clear corner.
    assert video_slot_positions([0, 1, 5, 1, 5], layout, 2) == [0, 4]
    # Asking for more than the clear slides falls back to the crowded ones.
    assert len(video_slot_positions([0, 1, 5, 1, 5], layout, 5)) == 5


def test_raising_a_count_never_moves_table_or_chart_slides():
    layout = _layout()
    # The middle slides are tables; an even spread would land on slide 2.
    result = enforce_media_targets([1, 3, 3, 3, 1], layout, 1, None)
    assert result[1:4] == [3, 3, 3]
    assert _count_images(result, layout) == 1

    momentum = _momentum_like_layout()
    momentum.slides[1] = SlideLayoutModel(
        id="title_table_description",
        json_schema=_text_schema("title_table_description"),
    )
    result = enforce_media_targets([6, 1, 1, 1, 6], momentum, None, 1)
    assert result[1:4] == [1, 1, 1]
    assert _count_videos(result, momentum) == 1
