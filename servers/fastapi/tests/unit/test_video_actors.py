from utils.speaker_indicator import SpeakerIndicatorFrames
from utils.video_actors import (
    ActorSpan,
    actor_input_args,
    actor_overlay_filters,
    fit_filter,
    plan_actor_segments,
    scale_box,
)

SPANS = [
    ActorSpan("voice", 0, 90),
    ActorSpan("voice", 90, 90),
    ActorSpan(
        "video", 180, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400), lead_in_frames=12
    ),
    ActorSpan("none", 300, 60),
]
INDICATOR = SpeakerIndicatorFrames(
    pattern="/tmp/ind/indicator-%03d.png",
    frame_count=36,
    size=92,
    x=1766,
    y=926,
    diameter=72,
)


def test_voice_slides_share_one_bubble_and_the_avatar_fades_across_its_edges():
    bubble, avatar = plan_actor_segments(SPANS, [8, 8, 8])

    assert (
        bubble.kind,
        bubble.start_frame,
        bubble.frames,
        bubble.fade_in_frames,
        bubble.fade_out_frames,
    ) == ("bubble", 0, 188, 0, 16)
    assert (
        avatar.start_frame,
        avatar.frames,
        avatar.fade_in_frames,
        avatar.fade_out_frames,
        avatar.play_from_frame,
    ) == (172, 136, 16, 16, 20)


def test_hard_cuts_without_crossfade():
    bubble, avatar = plan_actor_segments(SPANS, [0, 0, 0])

    assert (bubble.frames, avatar.start_frame, avatar.frames, avatar.fade_in_frames) == (
        180,
        180,
        120,
        0,
    )


def test_first_and_last_slides_have_no_outer_fade():
    (only,) = plan_actor_segments(
        [ActorSpan("video", 0, 90, avatar_path="/a.mp4", box=(0, 0, 2, 2))], []
    )

    assert (only.start_frame, only.fade_in_frames, only.fade_out_frames) == (0, 0, 0)


def test_consecutive_avatar_slides_are_separate_segments():
    segments = plan_actor_segments(
        [
            ActorSpan("video", 0, 60, avatar_path="/a.mp4", box=(0, 0, 2, 2)),
            ActorSpan("video", 60, 60, avatar_path="/b.mp4", box=(0, 0, 2, 2)),
        ],
        [8],
    )

    assert [segment.avatar_path for segment in segments] == ["/a.mp4", "/b.mp4"]


def test_slides_without_a_presenter_draw_nothing():
    assert plan_actor_segments([ActorSpan("none", 0, 60), ActorSpan("none", 60, 60)], [8]) == []


def test_scale_box_to_1080p():
    assert scale_box((1160, 600, 96, 96), 1920, 1080) == (1740, 900, 144, 144)


def test_fit_filters():
    assert fit_filter("fill", 240, 400) == "scale=240:400,format=yuva420p"
    assert (
        fit_filter("cover", 240, 400)
        == "scale=240:400:force_original_aspect_ratio=increase,crop=240:400,format=yuva420p"
    )
    assert (
        fit_filter("contain", 240, 400)
        == "scale=240:400:force_original_aspect_ratio=decrease,format=yuva420p,"
        "pad=240:400:(ow-iw)/2:(oh-ih)/2:color=black@0"
    )


def test_avatar_audio_is_never_read():
    _, avatar = plan_actor_segments(SPANS, [8, 8, 8])

    assert actor_input_args([avatar], None, 30) == ["-an", "-i", "/a.mp4"]


def test_bubble_input_is_cut_to_its_segment():
    bubble, _ = plan_actor_segments(SPANS, [8, 8, 8])

    assert actor_input_args([bubble], INDICATOR, 30) == [
        "-f", "image2", "-loop", "1", "-framerate", "30",
        "-t", "6.266667", "-i", "/tmp/ind/indicator-%03d.png",
    ]


def test_avatar_holds_its_first_and_last_frame_and_fades():
    _, avatar = plan_actor_segments(SPANS, [8, 8, 8])

    graph = ";".join(
        actor_overlay_filters(
            [avatar],
            first_input_index=5,
            indicator=None,
            fps=30,
            video_label="vbase",
            output_label="vout",
        )
    )

    assert "tpad=start=20:start_mode=clone:stop=-1:stop_mode=clone,trim=end_frame=136" in graph
    assert "fade=t=in:s=0:n=16:alpha=1" in graph
    assert "fade=t=out:s=120:n=16:alpha=1" in graph
    assert "overlay=x=1000:y=400:eof_action=pass" in graph
    assert graph.endswith("format=yuv420p[vout]")


def test_bubble_is_placed_at_its_frames_and_shifted_to_its_start():
    _, avatar = plan_actor_segments(SPANS, [8, 8, 8])
    bubble, _ = plan_actor_segments(SPANS, [8, 8, 8])

    parts = actor_overlay_filters(
        [bubble, avatar],
        first_input_index=5,
        indicator=INDICATOR,
        fps=30,
        video_label="vbase",
        output_label="vout",
    )

    # Whole-frame timestamps: a float start can round down a frame early.
    assert parts[0].startswith("[5:v]format=rgba,trim=end_frame=188,settb=1/30,setpts=N+0")
    assert "fade=t=in" not in parts[0]
    assert "overlay=x=1766:y=926:eof_action=pass" in ";".join(parts)
    assert parts[2].startswith("[6:v]setpts=PTS-STARTPTS,fps=30,")
    assert "settb=1/30,setpts=N+172" in parts[2]


AVATAR_THEN_VOICE = [
    ActorSpan(
        "video", 0, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400), lead_in_frames=12
    ),
    ActorSpan("voice", 120, 90),
]
VOICE_AVATAR_VOICE = [
    ActorSpan("voice", 0, 90),
    ActorSpan(
        "video", 90, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400), lead_in_frames=12
    ),
    ActorSpan("voice", 210, 90),
]


def test_avatar_and_bubble_morph_into_each_other_over_the_morph_window():
    bubble_before, avatar, bubble_after = plan_actor_segments(
        VOICE_AVATAR_VOICE, [8, 8], INDICATOR, [12, 12]
    )

    # The morph reaches 12 frames into each slide: a 24-frame window per change.
    assert (avatar.start_frame, avatar.frames) == (78, 144)
    assert (avatar.morph_in_frames, avatar.morph_out_frames) == (24, 24)
    assert (avatar.fade_in_frames, avatar.fade_out_frames) == (0, 0)
    assert avatar.collapse_to == (1812.0, 972.0, 72)
    # The bubble dissolves out in the first moments of the window the avatar
    # grows from it, and in during the last moments of the one it collapses to.
    assert (bubble_before.frames, bubble_before.fade_out_start, bubble_before.fade_out_frames) == (
        102, 78, 4)
    assert (bubble_after.start_frame, bubble_after.fade_in_start, bubble_after.fade_in_frames) == (
        198, 20, 4)


def test_without_a_drawn_bubble_a_crossfade_or_a_morph_window_the_presenter_just_fades():
    no_bubble = plan_actor_segments(AVATAR_THEN_VOICE, [8], None, [12])[0]
    hard_cut = plan_actor_segments(AVATAR_THEN_VOICE, [0], INDICATOR, [12])[0]
    no_window = plan_actor_segments(AVATAR_THEN_VOICE, [8], INDICATOR, None)[0]
    avatar_to_none = plan_actor_segments(
        [AVATAR_THEN_VOICE[0], ActorSpan("none", 120, 90)], [8], INDICATOR, [12]
    )[0]

    for avatar in (no_bubble, hard_cut, no_window, avatar_to_none):
        assert avatar.collapse_to is None
        assert (avatar.morph_in_frames, avatar.morph_out_frames) == (0, 0)
    assert (no_bubble.fade_out_frames, hard_cut.fade_out_frames) == (16, 0)


def _graph(spans, half_fades, morph_halves):
    segments = plan_actor_segments(spans, half_fades, INDICATOR, morph_halves)
    return ";".join(
        actor_overlay_filters(
            segments,
            first_input_index=1,
            indicator=INDICATOR,
            fps=30,
            video_label="vbase",
            output_label="vout",
        )
    )


def test_avatar_is_split_into_morph_in_plain_playback_and_morph_out():
    graph = _graph(VOICE_AVATAR_VOICE, [8, 8], [12, 12])

    assert "[prep1]split=3[av1in][av1mid][av1out]" in graph
    # Plain playback between the two 24-frame morphs, placed by the frame.
    assert "[av1mid]trim=start_frame=24:end_frame=120,settb=1/30,setpts=N+102" in graph
    assert "[av1in]trim=end_frame=24,settb=1/30,setpts=N+78,format=yuva420p,geq=" in graph
    assert "[av1out]trim=start_frame=120,settb=1/30,setpts=N+198,format=yuva420p,geq=" in graph
    # Sharp: only a short dissolve at the bubble's end of each morph.
    assert "fade=t=in:s=0:n=4:alpha=1,scale=w='" in graph
    assert "fade=t=out:s=20:n=4:alpha=1,scale=w='" in graph


def test_morph_rounds_the_avatar_into_a_circle_and_moves_it_to_the_bubble():
    graph = _graph(AVATAR_THEN_VOICE, [8], [12])

    # The mask rounds a centred rectangle down to the placeholder's largest
    # circle (240 wide: radius 120), per frame, with an eased progress.
    assert "geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='st(0,clip(N/23,0,1))" in graph
    assert "st(3,120.0*ld(0))" in graph
    # The canvas shrinks until that circle is the bubble's 72px diameter, and
    # its centre travels to the bubble's.
    assert "(1+(0.300000-1)*" in graph
    assert "overlay=x='(1120.0+(1812.000-1120.0)*" in graph
    assert "(600.0+(972.000-600.0)*" in graph
    # Expanding runs the same progress backwards.
    expanding = _graph(
        [ActorSpan("voice", 0, 90), AVATAR_THEN_VOICE[0].__class__(
            "video", 90, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400))],
        [8], [12],
    )
    assert "st(0,1-ld(0))" in expanding


def test_avatar_that_morphs_on_one_side_fades_on_the_other():
    segments = plan_actor_segments(
        [
            ActorSpan("none", 0, 90),
            ActorSpan("video", 90, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400)),
            ActorSpan("voice", 210, 90),
        ],
        [8, 8],
        INDICATOR,
        [12, 12],
    )
    avatar = segments[0]

    assert (avatar.morph_in_frames, avatar.morph_out_frames) == (0, 24)
    assert (avatar.fade_in_frames, avatar.fade_out_frames) == (16, 0)
    graph = _graph(
        [
            ActorSpan("none", 0, 90),
            ActorSpan("video", 90, 120, avatar_path="/a.mp4", box=(1000, 400, 240, 400)),
            ActorSpan("voice", 210, 90),
        ],
        [8, 8],
        [12, 12],
    )
    assert "[prep0]split=2[av0mid][av0out]" in graph
    assert "fade=t=in:s=0:n=16:alpha=1" in graph


def test_avatar_radius_rounds_the_plain_playback_and_starts_the_morph():
    from utils.video_actors import _circle_mask, _rounded_mask, scale_radius

    assert _rounded_mask(100, 60, 0) == ""
    assert "geq=" in _rounded_mask(100, 60, 12)
    # Clamped to half the shorter side, scaled to the output.
    assert scale_radius(1000, (0, 0, 100, 60), 1280) == 30
    assert scale_radius(10, (0, 0, 100, 60), 640) == 5
    assert "st(3,12.0+(30.0-12.0)*ld(0))" in _circle_mask(
        100, 60, 10, expanding=True, radius=12.0
    )
