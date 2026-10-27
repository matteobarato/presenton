import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models.slide_video_response import StageBox
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.speaker_note_tts_service import note_digest
from services.slide_video_service import (
    InvalidStageBoxError,
    avatar_box,
    avatar_fit,
    avatar_stale_reason,
    default_placeholder_box,
    ensure_video_placeholder,
    find_video_placeholder,
    is_template_slide,
    placeholder_box,
    remove_video_placeholder,
    resolve_bubble,
    resolve_slide_actors,
    set_bubble,
    slide_videos_response,
)


def _ui(*elements, components=None):
    return {
        "id": "layout",
        "description": "",
        "components": components or [],
        "elements": list(elements),
    }


def _placeholder(x=10, y=20, width=300, height=200):
    return {
        "type": "image",
        "name": "avatar_video",
        "video_placeholder": True,
        "decorative": True,
        "position": {"x": x, "y": y},
        "size": {"width": width, "height": height},
    }


def _box(box: StageBox):
    return (box.position.x, box.position.y, box.size.width, box.size.height)


def test_only_slides_with_an_element_tree_are_template_slides():
    assert is_template_slide(SlideModel(layout_group="g", layout="l", index=0, content={}, ui=_ui()))
    assert not is_template_slide(
        SlideModel(layout_group="smart-html", layout="s", index=0, content={}, ui=None)
    )
    assert not is_template_slide(
        SlideModel(layout_group="g", layout="l", index=0, content={}, ui={"id": "x"})
    )


def test_a_layout_made_only_of_components_is_a_template_slide():
    ui = {"id": "layout", "components": [{"id": "c", "elements": []}]}
    assert is_template_slide(
        SlideModel(layout_group="g", layout="l", index=0, content={}, ui=ui)
    )

    placed = ensure_video_placeholder(ui, video_width=1280, video_height=720)
    assert placed["components"] == ui["components"]
    assert placed["elements"][0]["video_placeholder"] is True


def test_finds_a_placeholder_nested_in_components_but_not_plain_images():
    image = {"type": "image", "data": "a.png"}
    nested = _placeholder()
    ui = _ui(
        image,
        components=[{"id": "c", "elements": [{"type": "group", "children": [nested]}]}],
    )

    assert find_video_placeholder(ui) is nested
    assert find_video_placeholder(_ui(image)) is None
    assert find_video_placeholder(None) is None


def test_default_placeholder_follows_the_video_shape_within_limits():
    assert _box(default_placeholder_box(1920, 1080)) == (936, 516, 320, 180)
    assert _box(default_placeholder_box()) == (936, 516, 320, 180)
    # Square avatars stay square.
    assert _box(default_placeholder_box(1080, 1080)) == (936, 376, 320, 320)
    # Portrait video would be too tall at 320 wide, so the height is capped.
    assert _box(default_placeholder_box(1080, 1920)) == (1256 - 202, 336, 202, 360)


def test_ensure_adds_a_placeholder_once_and_returns_a_new_dict():
    ui = _ui({"type": "text", "runs": []})

    first = ensure_video_placeholder(ui, video_width=1280, video_height=720)
    second = ensure_video_placeholder(first, video_width=1280, video_height=720)

    assert first is not ui
    assert ui["elements"] == [{"type": "text", "runs": []}]
    assert len(first["elements"]) == 2
    assert first["elements"][-1]["video_placeholder"] is True
    assert first["elements"][-1]["data"].endswith("/static/images/video-placeholder.png")
    assert second == first
    assert second is not first


def test_ensure_keeps_an_existing_placeholder_and_applies_given_coordinates():
    ui = _ui(_placeholder(x=10, y=20, width=300, height=200))

    kept = ensure_video_placeholder(ui, video_width=1920, video_height=1080)
    moved = ensure_video_placeholder(ui, x=100, height=150)

    assert _box(placeholder_box(find_video_placeholder(kept))) == (10, 20, 300, 200)
    assert _box(placeholder_box(find_video_placeholder(moved))) == (100, 20, 300, 150)
    assert len(moved["elements"]) == 1


@pytest.mark.parametrize(
    "coordinates",
    [
        {"x": 1100},
        {"y": -1},
        {"width": 0},
        {"x": 0, "y": 0, "width": 1281, "height": 10},
    ],
)
def test_ensure_rejects_a_box_off_the_slide(coordinates):
    ui = _ui(_placeholder())
    with pytest.raises(InvalidStageBoxError):
        ensure_video_placeholder(ui, **coordinates)


def test_remove_takes_out_every_placeholder_and_leaves_the_rest():
    text = {"type": "text", "runs": []}
    ui = _ui(
        text,
        _placeholder(),
        components=[
            {"id": "c", "elements": [_placeholder()]},
            {"id": "d", "child": _placeholder()},
        ],
    )

    cleaned = remove_video_placeholder(ui)

    assert find_video_placeholder(cleaned) is None
    assert cleaned["elements"] == [text]
    assert cleaned["components"][0]["elements"] == []
    assert cleaned["components"][1]["child"] is None
    # The original is left alone.
    assert find_video_placeholder(ui) is not None


def test_bubble_defaults_to_the_corner_until_a_deck_sets_one():
    presentation = PresentationModel(content="", n_slides=1, language="Italian")

    default = resolve_bubble(presentation)
    assert default.is_default is True
    assert _box(default) == (1160, 600, 96, 96)

    placed = set_bubble(presentation, StageBox.of(24, 24, 120, 120))
    assert placed.is_default is False
    assert _box(placed) == (24, 24, 120, 120)
    assert presentation.narration == {
        "bubble": {
            "position": {"x": 24, "y": 24},
            "size": {"width": 120, "height": 120},
        }
    }

    with pytest.raises(InvalidStageBoxError):
        set_bubble(presentation, StageBox.of(1200, 0, 96, 96))
    # A rejected placement does not overwrite the stored one.
    assert _box(resolve_bubble(presentation)) == (24, 24, 120, 120)


_UPLOADED_AT = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


def _slide(note):
    return SlideModel(
        id=uuid.uuid4(),
        presentation=uuid.uuid4(),
        layout_group="g",
        layout="l",
        index=0,
        content={},
        speaker_note=note,
        ui=_ui(),
    )


def _avatar(slide, *, language, note=None):
    return SlideVideoModel(
        id=uuid.uuid4(),
        presentation=slide.presentation,
        slide=slide.id,
        source_note_hash=note_digest(slide.speaker_note if note is None else note),
        path="/tmp/avatar.mp4",
        url="/app_data/videos/avatar.mp4",
        format="mp4",
        mime_type="video/mp4",
        language=language,
        created_at=_UPLOADED_AT,
        updated_at=_UPLOADED_AT,
    )


def _narration(slide, *, language, updated_at):
    return SpeakerNoteAudioModel(
        id=uuid.uuid4(),
        presentation=slide.presentation,
        slide=slide.id,
        slide_index=slide.index,
        language=language,
        language_name=language,
        model="tts-test",
        text="testo",
        source_note_hash=note_digest(slide.speaker_note),
        path="/tmp/audio.mp3",
        url="/app_data/audio/audio.mp3",
        created_at=updated_at,
        updated_at=updated_at,
    )


def test_stale_reason_is_note_changed_when_the_note_was_edited():
    slide = _slide("new")
    video = _avatar(slide, language="en", note="old")

    assert avatar_stale_reason(video, slide, None) == "note_changed"


def test_stale_reason_is_audio_regenerated_when_its_language_audio_is_newer():
    slide = _slide("same note")
    video = _avatar(slide, language="en")
    audio = _narration(
        slide, language="en", updated_at=_UPLOADED_AT + timedelta(seconds=60)
    )

    assert avatar_stale_reason(video, slide, audio) == "audio_regenerated"


def test_note_changed_wins_over_audio_regenerated():
    slide = _slide("new")
    video = _avatar(slide, language="en", note="old")
    audio = _narration(
        slide, language="en", updated_at=_UPLOADED_AT + timedelta(seconds=60)
    )

    assert avatar_stale_reason(video, slide, audio) == "note_changed"


def test_audio_older_than_the_avatar_is_not_stale():
    slide = _slide("same note")
    video = _avatar(slide, language="en")
    audio = _narration(
        slide, language="en", updated_at=_UPLOADED_AT - timedelta(seconds=60)
    )

    assert avatar_stale_reason(video, slide, audio) is None


def test_audio_in_another_language_does_not_make_the_avatar_stale():
    slide = _slide("same note")
    video = _avatar(slide, language="en")
    italian = _narration(
        slide, language="it", updated_at=_UPLOADED_AT + timedelta(seconds=60)
    )

    response = slide_videos_response(slide.presentation, [slide], [video], [italian])

    assert response.videos[0].stale is False
    assert response.videos[0].stale_reason is None
    assert response.videos[0].language == "en"


def test_the_audio_in_the_avatars_language_is_the_one_that_counts():
    slide = _slide("same note")
    video = _avatar(slide, language="en")
    later = _UPLOADED_AT + timedelta(seconds=60)
    audios = [
        _narration(slide, language="it", updated_at=_UPLOADED_AT),
        _narration(slide, language="en", updated_at=later),
    ]

    response = slide_videos_response(slide.presentation, [slide], [video], audios)

    assert response.videos[0].stale is True
    assert response.videos[0].stale_reason == "audio_regenerated"


def test_avatar_without_language_only_checks_the_note():
    slide = _slide("same note")
    video = _avatar(slide, language=None)
    audio = _narration(
        slide, language="en", updated_at=_UPLOADED_AT + timedelta(seconds=60)
    )

    assert avatar_stale_reason(video, slide, audio) is None
    response = slide_videos_response(slide.presentation, [slide], [video], [audio])
    assert response.videos[0].stale is False
    assert response.videos[0].language is None


# One presenter per slide: both the playback plan and the MP4 export ask
# resolve_slide_actors who it is, so they cannot disagree.


def _actors(slide, *, video=None, audio=None, language="it", **options):
    return resolve_slide_actors(
        [slide],
        {slide.id: audio} if audio else {},
        {slide.id: video} if video else {},
        language=language,
        **options,
    )[0]


def test_avatar_wins_when_it_matches_the_language():
    slide = _slide("nota")
    video = _avatar(slide, language="it")
    audio = _narration(slide, language="it", updated_at=_UPLOADED_AT)

    resolved = _actors(slide, video=video, audio=audio)

    assert resolved.actor == "video"
    assert resolved.video is video
    assert resolved.audio is audio
    assert resolved.slide is slide
    assert resolved.avatar_skipped is None


def test_voice_when_avatars_are_disabled():
    slide = _slide("nota")
    video = _avatar(slide, language="it")
    audio = _narration(slide, language="it", updated_at=_UPLOADED_AT)

    resolved = _actors(slide, video=video, audio=audio, avatars=False)

    assert resolved.actor == "voice"
    assert resolved.video is None
    assert resolved.audio is audio
    assert resolved.avatar_skipped == "disabled"


def test_voice_when_avatar_language_differs():
    slide = _slide("nota")
    video = _avatar(slide, language="en")
    audio = _narration(slide, language="it", updated_at=_UPLOADED_AT)

    resolved = _actors(slide, video=video, audio=audio, language="it")

    assert resolved.actor == "voice"
    assert resolved.video is None
    assert resolved.avatar_skipped == "language"


def test_avatar_without_language_matches_any_language():
    slide = _slide("nota")
    video = _avatar(slide, language=None)
    audio = _narration(slide, language="it", updated_at=_UPLOADED_AT)

    assert _actors(slide, video=video, audio=audio, language="it").actor == "video"
    assert _actors(slide, video=video, audio=audio, language=None).actor == "video"


def test_avatar_with_a_language_plays_when_no_narration_language_is_in_play():
    slide = _slide("")
    video = _avatar(slide, language="en")

    resolved = _actors(slide, video=video, audio=None, language=None)

    assert resolved.actor == "video"
    assert resolved.avatar_skipped is None


def test_silent_avatar_slide_is_still_video():
    slide = _slide("")
    video = _avatar(slide, language="it")

    resolved = _actors(slide, video=video)

    assert resolved.actor == "video"
    assert resolved.audio is None
    assert resolved.video is video


def test_none_without_audio_or_avatar():
    resolved = _actors(_slide(""))

    assert resolved.actor == "none"
    assert resolved.audio is None
    assert resolved.video is None
    assert resolved.avatar_skipped is None


def test_a_skipped_avatar_without_audio_leaves_the_slide_without_presenter():
    slide = _slide("nota")
    video = _avatar(slide, language="en")

    resolved = _actors(slide, video=video, language="it")

    assert resolved.actor == "none"
    assert resolved.avatar_skipped == "language"


def test_actors_come_back_in_slide_order_one_per_slide():
    first, second = _slide("uno"), _slide("due")
    audio = _narration(second, language="it", updated_at=_UPLOADED_AT)

    resolved = resolve_slide_actors(
        [first, second], {second.id: audio}, {}, language="it"
    )

    assert [item.slide for item in resolved] == [first, second]
    assert [item.actor for item in resolved] == ["none", "voice"]


def test_avatar_box_falls_back_to_default_when_placeholder_was_removed():
    slide = _slide("nota")  # its ui has no placeholder
    video = _avatar(slide, language="it")
    video.width, video.height = 720, 1280

    assert _box(avatar_box(slide, video)) == _box(default_placeholder_box(720, 1280))


def test_avatar_box_is_the_slides_placeholder_when_it_has_one():
    slide = _slide("nota")
    slide.ui = _ui(_placeholder(x=10, y=20, width=300, height=200))

    assert _box(avatar_box(slide, _avatar(slide, language="it"))) == (10, 20, 300, 200)


def test_avatar_fit_mirrors_the_editor():
    def fit_of(**props):
        slide = _slide("nota")
        slide.ui = _ui({**_placeholder(), **props})
        return avatar_fit(slide)

    assert fit_of(fit="fill") == "fill"
    assert fit_of(fit="cover") == "cover"
    assert fit_of(fit="contain") == "contain"
    assert fit_of() == "contain"
    assert fit_of(fit="stretch") == "contain"
    assert avatar_fit(_slide("nota")) == "contain"  # no placeholder at all
