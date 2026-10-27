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
