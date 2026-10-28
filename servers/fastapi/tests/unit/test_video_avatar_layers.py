from utils.video_avatar_layers import (
    OverAvatarLayer,
    over_avatar_filters,
    over_avatar_input_args,
    plan_over_avatar_layers,
)


def test_a_layer_spans_its_slide_and_the_reach_of_its_fades():
    spans = [(0, 90), (90, 120), (210, 60)]

    [layer] = plan_over_avatar_layers(spans, [8, 6], {1: "/tmp/above.png"})

    assert layer == OverAvatarLayer(
        path="/tmp/above.png",
        start_frame=82,
        frames=8 + 120 + 6,
        fade_in_frames=16,
        fade_out_frames=12,
        lead_frames=8,
    )


def test_hard_cuts_and_the_decks_edges_never_fade():
    spans = [(0, 90), (90, 120)]

    first, last = plan_over_avatar_layers(spans, [], {0: "/a.png", 1: "/b.png"})

    assert (first.start_frame, first.frames, first.fade_in_frames, first.fade_out_frames) == (0, 90, 0, 0)
    assert (last.start_frame, last.frames, last.fade_in_frames, last.fade_out_frames) == (90, 120, 0, 0)


def test_an_animated_layer_reads_its_slot_of_the_clip():
    [layer] = plan_over_avatar_layers(
        [(0, 90), (90, 120)], [0], {1: "/tmp/over.mov"}, clip_slots={1: (24, 30)}
    )

    assert (layer.clip_start_frame, layer.clip_frames) == (24, 30)
    assert over_avatar_input_args([layer], 30) == [
        "-ss", f"{23.5 / 30:.6f}", "-t", f"{31 / 30:.6f}", "-i", "/tmp/over.mov",
    ]


def test_a_still_is_one_frame_held_and_placed_on_the_timeline():
    layer = OverAvatarLayer(
        path="/tmp/above.png",
        start_frame=82,
        frames=134,
        fade_in_frames=16,
        fade_out_frames=12,
        lead_frames=8,
    )

    assert over_avatar_input_args([layer], 30) == ["-framerate", "30", "-i", "/tmp/above.png"]
    parts = over_avatar_filters(
        [layer], first_input_index=5, fps=30, video_label="vact", output_label="vout"
    )

    assert parts == [
        "[5:v]trim=end_frame=1,format=yuva420p,"
        "tpad=start=8:start_mode=clone:stop=125:stop_mode=clone,"
        "trim=end_frame=134,settb=1/30,setpts=N+82,"
        "fade=t=in:s=0:n=16:alpha=1,fade=t=out:s=122:n=12:alpha=1[over0]",
        "[vact][over0]overlay=x=0:y=0:eof_action=pass:format=auto[ovl0]",
        "[ovl0]format=yuv420p[vout]",
    ]


def test_a_clip_plays_its_entrance_then_holds_its_last_frame():
    layer = OverAvatarLayer(
        path="/tmp/over.mov",
        start_frame=90,
        frames=120,
        fade_in_frames=0,
        fade_out_frames=0,
        clip_start_frame=0,
        clip_frames=30,
    )

    [chain, *_] = over_avatar_filters(
        [layer], first_input_index=2, fps=30, video_label="vbase", output_label="vout"
    )

    assert chain == (
        "[2:v]trim=end_frame=30,format=yuva420p,tpad=stop=90:stop_mode=clone,"
        "trim=end_frame=120,settb=1/30,setpts=N+90[over0]"
    )
