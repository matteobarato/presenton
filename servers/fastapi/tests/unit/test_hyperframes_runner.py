import pytest

import utils.hyperframes_runner as runner


def test_parse_progress_line():
    assert runner.parse_progress_line("PROGRESS 42 Capturing frame 3/9\n") == (
        42.0,
        "Capturing frame 3/9",
    )
    assert runner.parse_progress_line("PROGRESS 100") == (100.0, "")
    assert runner.parse_progress_line("[INFO] Render started") is None
    assert runner.parse_progress_line("PROGRESS soon") is None


def test_resolve_runner_path_needs_installed_producer(tmp_path, monkeypatch):
    script = tmp_path / "render.mjs"
    script.write_text("")
    monkeypatch.setenv("HYPERFRAMES_RUNNER_PATH", str(script))
    with pytest.raises(runner.HyperFramesUnavailableError):
        runner.resolve_runner_path()
    assert runner.hyperframes_available() is False

    (tmp_path / "node_modules" / "@hyperframes" / "producer").mkdir(parents=True)
    assert runner.resolve_runner_path() == script


def test_runner_env_reuses_the_app_browser_and_ffmpeg(monkeypatch):
    monkeypatch.delenv("HYPERFRAMES_BROWSER_PATH", raising=False)
    monkeypatch.delenv("HYPERFRAMES_FFMPEG_PATH", raising=False)
    monkeypatch.setenv("PUPPETEER_EXECUTABLE_PATH", "/usr/bin/chromium")
    monkeypatch.setattr(runner, "get_ffmpeg_binary", lambda: "/opt/ffmpeg")
    env = runner._runner_env()
    assert env["HYPERFRAMES_BROWSER_PATH"] == "/usr/bin/chromium"
    assert env["HYPERFRAMES_FFMPEG_PATH"] == "/opt/ffmpeg"


def test_render_asks_the_runner_for_the_output_format(tmp_path, monkeypatch):
    import asyncio
    import json
    import os

    script = tmp_path / "render.mjs"
    script.write_text("")
    monkeypatch.setattr(runner, "resolve_runner_path", lambda: script)
    tasks = []

    class Process:
        pid = 1
        returncode = 0

        def __init__(self, task_path):
            tasks.append(json.loads(open(task_path).read()))
            os.makedirs(tasks[-1]["outputPath"], exist_ok=True)
            self.stdout = asyncio.StreamReader()
            self.stdout.feed_eof()
            self.stderr = asyncio.StreamReader()
            self.stderr.feed_eof()

        async def wait(self):
            return 0

    async def spawn(_node, _runner, task_path, **_kwargs):
        return Process(task_path)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    frames = str(tmp_path / "frames")

    asyncio.run(
        runner.render_hyperframes_project(
            str(tmp_path), frames, fps=30, output_format="png-sequence"
        )
    )

    assert tasks[0]["format"] == "png-sequence"
    assert tasks[0]["outputPath"] == frames
