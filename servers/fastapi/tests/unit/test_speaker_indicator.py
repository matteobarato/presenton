import os

from PIL import Image

from utils.speaker_indicator import write_speaker_indicator_frames

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
    # Half of the 144px box: a 72px bubble plus 10px of shadow room each side,
    # centred on (1812, 972).
    assert (frames.x, frames.y, frames.size, frames.frame_count) == (1766, 926, 92, 36)
    assert frames.diameter == 72
    assert frames.centre == (1812, 972)


def test_non_square_box_uses_its_shorter_side(tmp_path):
    frames = write_speaker_indicator_frames(
        str(tmp_path), box=(100, 100, 200, 80), width=1280, height=720, fps=30
    )
    # diameter 40 -> padding 6 -> size 52, centred on (200, 140)
    assert (frames.size, frames.x, frames.y) == (52, 174, 114)


def test_frames_scale_with_resolution(tmp_path):
    small = write_speaker_indicator_frames(
        str(tmp_path / "a"), box=_BOX, width=1280, height=720, fps=24
    )
    large = write_speaker_indicator_frames(
        str(tmp_path / "b"), box=_BOX, width=2560, height=1440, fps=24
    )
    assert large.size > small.size
    assert small.frame_count == 29
