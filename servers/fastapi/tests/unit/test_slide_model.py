import uuid

from models.sql.slide import SlideModel


def test_get_new_slide_deep_copies_animation():
    slide = SlideModel(
        presentation=uuid.uuid4(),
        layout_group="g",
        layout="l",
        index=0,
        content={},
        properties=None,
        animation={"tweens": [{"id": "a"}]},
    )

    copy = slide.get_new_slide(slide.presentation)
    assert copy.animation == slide.animation

    copy.animation["tweens"].append({"id": "b"})
    assert slide.animation == {"tweens": [{"id": "a"}]}
