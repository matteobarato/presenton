"""Run the HyperFrames renderer (`video-render-hyperframes/render.mjs`).

HyperFrames is a Node package that drives a paused GSAP timeline frame by
frame in headless Chrome and encodes the captured frames with ffmpeg. The
FastAPI side only ever talks to it through this module: a task file in, a
silent mp4 out, `PROGRESS <percent> <message>` lines on stdout in between.

The runner directory is found the same way the LiteParse runner is: an
explicit `HYPERFRAMES_RUNNER_PATH`, then the Docker location, then the repo
checkout. Chrome and ffmpeg are pointed at the binaries this process already
uses (`PUPPETEER_EXECUTABLE_PATH`, `FFMPEG_BINARY`) unless HyperFrames' own
variables are set, so the render never downloads a browser of its own.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Awaitable, Callable, Optional, Union

from utils.ffmpeg_utils import FFmpegNotAvailableError, get_ffmpeg_binary
from utils.runtime_limits import BoundedTextBuffer

LOGGER = logging.getLogger(__name__)

RUNNER_FILENAME = "render.mjs"
_STDERR_TAIL_LIMIT = 8192
_DEFAULT_TIMEOUT_SECONDS = 1800.0
# Rendered close to lossless: the clip is encoded once more when the narration
# is muxed in, and a second lossy pass on top of a lossy one shows on text.
_CLIP_CRF = 12

ProgressCallback = Callable[[float, str], Union[None, Awaitable[None]]]


class HyperFramesUnavailableError(RuntimeError):
    """Raised when the runner script or its node_modules cannot be found."""


class HyperFramesRenderError(RuntimeError):
    """Raised when the renderer exits non-zero or times out."""

    def __init__(self, message: str, *, stderr_tail: str = ""):
        super().__init__(message)
        self.stderr_tail = stderr_tail


def _runner_candidates() -> list[Path]:
    repo_root = Path(__file__).resolve().parents[3]
    return [
        Path("/app/video-render-hyperframes") / RUNNER_FILENAME,
        repo_root / "video-render-hyperframes" / RUNNER_FILENAME,
    ]


def resolve_runner_path() -> Path:
    override = (os.getenv("HYPERFRAMES_RUNNER_PATH") or "").strip()
    candidates = [Path(override)] if override else _runner_candidates()
    for candidate in candidates:
        if candidate.is_file() and (
            candidate.parent / "node_modules" / "@hyperframes" / "producer"
        ).is_dir():
            return candidate
    raise HyperFramesUnavailableError(
        "The HyperFrames renderer is not installed. Run `npm ci` in "
        "video-render-hyperframes/ (or set HYPERFRAMES_RUNNER_PATH) to render "
        "animated videos."
    )


def hyperframes_available() -> bool:
    """Never raises: callers use this to fall back to still slides."""
    try:
        resolve_runner_path()
        return True
    except HyperFramesUnavailableError:
        return False


def gsap_script_path() -> Path:
    """GSAP as installed beside the runner, so a render never needs a CDN."""
    path = resolve_runner_path().parent / "node_modules" / "gsap" / "dist" / "gsap.min.js"
    if not path.is_file():
        raise HyperFramesUnavailableError(f"GSAP is missing from {path.parent}")
    return path


def _runner_env() -> dict[str, str]:
    env = dict(os.environ)
    if not env.get("HYPERFRAMES_BROWSER_PATH"):
        browser = (env.get("PUPPETEER_EXECUTABLE_PATH") or "").strip()
        if browser:
            env["HYPERFRAMES_BROWSER_PATH"] = browser
    if not env.get("HYPERFRAMES_FFMPEG_PATH"):
        try:
            env["HYPERFRAMES_FFMPEG_PATH"] = get_ffmpeg_binary()
        except FFmpegNotAvailableError:
            pass
    return env


def _workers() -> Optional[int]:
    raw = (os.getenv("PRESENTATION_VIDEO_ANIMATION_WORKERS") or "").strip()
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def _timeout_seconds() -> float:
    raw = (os.getenv("PRESENTATION_VIDEO_ANIMATION_TIMEOUT_SECONDS") or "").strip()
    try:
        value = float(raw)
    except ValueError:
        return _DEFAULT_TIMEOUT_SECONDS
    return value if value > 0 else _DEFAULT_TIMEOUT_SECONDS


def parse_progress_line(line: str) -> Optional[tuple[float, str]]:
    if not line.startswith("PROGRESS "):
        return None
    parts = line.rstrip("\n").split(" ", 2)
    try:
        percent = float(parts[1])
    except (IndexError, ValueError):
        return None
    return percent, parts[2] if len(parts) > 2 else ""


async def _report(on_progress: Optional[ProgressCallback], percent: float, message: str) -> None:
    if on_progress is None:
        return
    try:
        result = on_progress(percent, message)
        if inspect.isawaitable(result):
            await result
    except Exception:
        LOGGER.warning("hyperframes on_progress callback raised", exc_info=True)


async def render_hyperframes_project(
    project_dir: str,
    output_path: str,
    *,
    fps: int,
    on_progress: Optional[ProgressCallback] = None,
) -> None:
    """Render `project_dir/index.html` to a silent mp4 at `output_path`."""
    runner = resolve_runner_path()
    node_binary = (os.getenv("HYPERFRAMES_NODE_BINARY") or "node").strip() or "node"

    task: dict[str, object] = {
        "projectDir": os.path.abspath(project_dir),
        "outputPath": os.path.abspath(output_path),
        "fps": fps,
        "quality": "high",
        "crf": _CLIP_CRF,
    }
    workers = _workers()
    if workers is not None:
        task["workers"] = workers

    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", prefix="hyperframes-task-", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(task, handle)
        task_path = handle.name

    stderr_tail = BoundedTextBuffer(limit=_STDERR_TAIL_LIMIT)
    try:
        process = await asyncio.create_subprocess_exec(
            node_binary,
            str(runner),
            task_path,
            cwd=str(runner.parent),
            env=_runner_env(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        LOGGER.info("[hyperframes] started pid=%s project=%s", process.pid, project_dir)

        async def read_stdout() -> None:
            assert process.stdout is not None
            while True:
                raw = await process.stdout.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace")
                parsed = parse_progress_line(line)
                if parsed is not None:
                    await _report(on_progress, *parsed)
                else:
                    # The producer also logs to stdout; keep the tail for errors.
                    stderr_tail.append(raw)

        async def drain_stderr() -> None:
            assert process.stderr is not None
            while True:
                chunk = await process.stderr.read(65536)
                if not chunk:
                    break
                stderr_tail.append(chunk)

        stdout_task = asyncio.create_task(read_stdout())
        stderr_task = asyncio.create_task(drain_stderr())
        timeout = _timeout_seconds()
        try:
            await asyncio.wait_for(
                asyncio.gather(process.wait(), stdout_task, stderr_task),
                timeout=timeout,
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.wait()
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
            raise HyperFramesRenderError(
                f"HyperFrames render timed out after {timeout:.0f} seconds",
                stderr_tail=stderr_tail.get(),
            ) from exc

        LOGGER.info(
            "[hyperframes] exited pid=%s returncode=%s", process.pid, process.returncode
        )
        if process.returncode != 0:
            raise HyperFramesRenderError(
                f"HyperFrames render exited with code {process.returncode}",
                stderr_tail=stderr_tail.get(),
            )
        if not os.path.isfile(output_path):
            raise HyperFramesRenderError(
                "HyperFrames render finished without writing its output",
                stderr_tail=stderr_tail.get(),
            )
    finally:
        try:
            os.remove(task_path)
        except OSError:
            pass
