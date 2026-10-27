from utils.video_crossfade import (
    plan_half_fades,
    segment_padding,
    slide_frames,
    xfade_chain,
)


def test_slide_frames_round_cumulative_boundaries():
    # 1.01 s at 30 fps is 30.3 frames; rounding each slide on its own would
    # drift, rounding the cumulative boundaries never does.
    assert slide_frames([(0.0, 1.01), (1.01, 1.01), (2.02, 1.01)], 30) == [
        (0, 30),
        (30, 31),
        (61, 30),
    ]


def test_half_fades_are_centred_and_rounded():
    assert plan_half_fades([90, 120, 60], 0.5, 30) == [8, 8]


def test_half_fades_never_exceed_the_shorter_neighbour():
    assert plan_half_fades([10, 120], 1.5, 30) == [5]


def test_zero_crossfade_means_hard_cuts():
    assert plan_half_fades([90, 120], 0, 30) == [0]


def test_a_crossfade_is_at_least_one_frame_each_side():
    assert plan_half_fades([90, 90], 0.01, 30) == [1]


def test_segment_padding_is_the_half_fade_on_each_inner_edge():
    assert segment_padding(0, [8, 5]) == (0, 8)
    assert segment_padding(1, [8, 5]) == (8, 5)
    assert segment_padding(2, [8, 5]) == (5, 0)


def test_xfade_offsets_keep_the_timeline():
    assert xfade_chain(["s0", "s1", "s2"], [90, 210], [8, 8], 30, "vcf") == [
        "[s0][s1]xfade=transition=fade:duration=0.533333:offset=2.733333[x1]",
        "[x1][s2]xfade=transition=fade:duration=0.533333:offset=6.733333[vcf]",
    ]
