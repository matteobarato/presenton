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
    pattern="/tmp/ind/indicator-%03d.png", frame_count=36, size=184, x=1720, y=880
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

    assert parts[0].startswith("[5:v]format=rgba,trim=end_frame=188,setpts=N/30/TB+0.000000/TB")
    assert "fade=t=in" not in parts[0]
    assert "overlay=x=1720:y=880:eof_action=pass" in ";".join(parts)
    assert parts[2].startswith("[6:v]setpts=PTS-STARTPTS,fps=30,")
    assert "+5.733333/TB" in parts[2]
