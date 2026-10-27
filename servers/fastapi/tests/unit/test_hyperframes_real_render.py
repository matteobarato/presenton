"""Drive the real HyperFrames renderer: the stubbed unit tests cannot catch a
composition Chrome refuses to play, a GSAP script that fails to load, or a
clip whose length drifts from the timeline.

Skipped unless `npm ci` has been run in `video-render-hyperframes/` and an
ffmpeg is installed, so a bare checkout still passes.
"""

import asyncio
import subprocess

import pytest

from utils.ffmpeg_utils import ffmpeg_available, get_ffprobe_binary
from utils.hyperframes_composition import CompositionSlide, write_hyperframes_project
from utils.hyperframes_runner import (
    gsap_script_path,
    hyperframes_available,
    render_hyperframes_project,
)
from utils.llm_calls.generate_slide_animations import SlideTween


pytestmark = pytest.mark.skipif(
    not (hyperframes_available() and ffmpeg_available()),
    reason="needs HyperFrames (npm ci in video-render-hyperframes/) and a real ffmpeg",
)


def _slide(slide_index: int, letter: str, start: float, tweens=()) -> CompositionSlide:
    return CompositionSlide(
        slide_index=slide_index,
        html=(
            '<div data-hf-el="e0" style="position:absolute;left:0;top:0;'
            'width:1280px;height:720px;display:flex;align-items:center;'
            f'justify-content:center;font-size:200px;background:#fff">{letter}</div>'
        ),
        start_seconds=start,
        duration_seconds=1.0,
        tweens=list(tweens),
    )


def test_two_slide_composition_renders_with_real_hyperframes(tmp_path, monkeypatch):
    # The producer probes its own output with ffprobe found on PATH. The runner
    # forwards only the ffmpeg path, so point the producer at the same ffprobe
    # this process resolves; a machine with ffmpeg on PATH is unaffected.
    monkeypatch.setenv("HYPERFRAMES_FFPROBE_PATH", get_ffprobe_binary())
    width, height, fps = 1280, 720, 30
    slides = [
        _slide(
            0,
            "A",
            0.0,
            [
                SlideTween(
                    target="e0",
                    from_values={"opacity": 0.0},
                    duration=0.5,
                    delay=0.0,
                    ease="power2.out",
                )
            ],
        ),
        _slide(1, "B", 1.0),
    ]
    project_dir = str(tmp_path / "project")
    write_hyperframes_project(
        project_dir,
        slides,
        width=width,
        height=height,
        gsap_path=str(gsap_script_path()),
    )
    output = str(tmp_path / "clip.mp4")

    asyncio.run(render_hyperframes_project(project_dir, output, fps=fps))

    probe = subprocess.run(
        [
            get_ffprobe_binary(), "-v", "error", "-select_streams", "v:0",
            "-count_frames", "-show_entries", "stream=width,height,nb_read_frames",
            "-of", "csv=p=0", output,
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    probed_width, probed_height, frames = (int(value) for value in probe.split(","))
    assert (probed_width, probed_height) == (width, height)
    # Two seconds at 30 fps; one frame either way is rounding in the producer.
    assert int(frames) in (59, 60, 61)
