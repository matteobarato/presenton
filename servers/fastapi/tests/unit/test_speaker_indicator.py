import os

from PIL import Image

from utils.speaker_indicator import (
    speaker_indicator_input_args,
    speaker_indicator_intervals,
    speaker_indicator_overlay,
    write_speaker_indicator_frames,
)


def test_consecutive_narrated_slides_merge_into_one_interval():
    spans = [(0.0, 3.0, True), (3.0, 2.0, True), (5.0, 1.0, False), (6.0, 2.0, True)]
    assert speaker_indicator_intervals(spans) == [(0.0, 5.0), (6.0, 8.0)]
    assert speaker_indicator_intervals([(0.0, 3.0, False)]) == []


_BOX = (1160, 600, 96, 96)


def test_frames_form_a_loop_of_round_bubbles(tmp_path):
    frames = write_speaker_indicator_frames(
        str(tmp_path), box=_BOX, width=1920, height=1080, fps=30
    )

    files = sorted(os.listdir(tmp_path))
    assert len(files) == frames.frame_count == 36
    first = Image.open(tmp_path / files[0])
    assert first.mode == "RGBA"
    assert first.size == (frames.size, frames.size)
    # Fully transparent corners, opaque centre: a round bubble, not a square.
    assert first.getpixel((0, 0))[3] == 0
    assert first.getpixel((frames.size // 2, frames.size // 2))[3] > 200
    # The bars actually move over the loop.
    assert Image.open(tmp_path / files[0]).tobytes() != Image.open(tmp_path / files[9]).tobytes()


def test_frames_sit_centred_in_the_bubble_box(tmp_path):
    frames = write_speaker_indicator_frames(
        str(tmp_path), box=(1160, 600, 96, 96), width=1920, height=1080, fps=30
    )
    assert (frames.x, frames.y, frames.size, frames.frame_count) == (1720, 880, 184, 36)


def test_non_square_box_uses_its_shorter_side(tmp_path):
    frames = write_speaker_indicator_frames(
        str(tmp_path), box=(100, 100, 200, 80), width=1280, height=720, fps=30
    )
    # diameter 80 -> padding 12 -> size 104, centred on (200, 140)
    assert (frames.size, frames.x, frames.y) == (104, 148, 88)


def test_frames_scale_with_resolution(tmp_path):
    small = write_speaker_indicator_frames(
        str(tmp_path / "a"), box=_BOX, width=1280, height=720, fps=24
    )
    large = write_speaker_indicator_frames(
        str(tmp_path / "b"), box=_BOX, width=2560, height=1440, fps=24
    )
    assert large.size > small.size
    assert small.frame_count == 29


def test_overlay_filter_enables_only_narrated_time_and_ends_with_the_video(tmp_path):
    frames = write_speaker_indicator_frames(
        str(tmp_path), box=_BOX, width=1920, height=1080, fps=30
    )
    graph = speaker_indicator_overlay(
        video_label="vbase",
        indicator_input_index=7,
        frames=frames,
        intervals=[(0.0, 5.0), (6.0, 8.5)],
        output_label="vout",
    )
    assert graph.startswith("[7:v]format=rgba[indicator];[vbase][indicator]overlay=")
    assert "enable='between(t,0.000,5.000)+between(t,6.000,8.500)'" in graph
    assert "shortest=1" in graph
    assert graph.endswith("format=yuv420p[vout]")
    assert speaker_indicator_input_args(frames, 30)[:4] == ["-f", "image2", "-loop", "1"]
