"""Generating lip-synced avatar videos for slides.

Planning decides, per slide, whether a generation is queued or skipped (and
why). The run then sends each queued slide's narration and the deck's portrait
to HeyGen, waits for the clip and stores it as the slide's avatar video,
reporting every step on its async task.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional, Sequence

from fastapi import HTTPException
from sqlmodel import select

from api.v1.auth.context import (
    reset_current_owner_id,
    reset_current_owner_is_admin,
    set_current_owner_id,
    set_current_owner_is_admin,
)
from enums.async_task_status import AsyncTaskStatus
from models.api_error_model import APIErrorModel
from models.sql.async_task import AsyncTaskModel
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.database import async_session_maker
from services.heygen_lipsync import (
    LipsyncStatus,
    HeyGenConfigurationError,
    HeyGenLipsyncClient,
    HeyGenRequestError,
    lipsync_client_from_env,
    lipsync_concurrency,
)
from services.slide_avatar_portrait import read_portrait
from services.slide_video_service import (
    avatar_stale_reason,
    find_video_placeholder,
    is_template_slide,
    store_slide_video_bytes,
)
from services.speaker_note_tts_service import note_digest
from utils.asset_directory_utils import get_videos_directory
from utils.datetime_utils import get_current_utc_datetime
from utils.ffmpeg_utils import (
    FFmpegNotAvailableError,
    FFmpegRuntimeError,
    get_ffmpeg_binary,
)
from utils.video_files import (
    get_slide_video_max_upload_bytes,
    remove_file,
    store_video_bytes,
    video_metadata,
)

LOGGER = logging.getLogger(__name__)

ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION = "slide_avatar_generation"
LIPSYNC_AUDIO_MIME = {"mp3": "audio/mpeg", "wav": "audio/wav"}


@dataclass
class SlidePlan:
    slide_index: int
    slide_id: uuid.UUID
    state: Literal["queued", "skipped"]
    reason: Optional[str] = None

    def to_dict(self) -> dict:
        entry: dict = {
            "slide_index": self.slide_index,
            "slide_id": str(self.slide_id),
            "state": self.state,
        }
        if self.reason is not None:
            entry["reason"] = self.reason
        return entry


def _has_placeholder(slide: SlideModel) -> bool:
    return is_template_slide(slide) and find_video_placeholder(slide.ui) is not None


def _plan_slide(
    slide: SlideModel,
    video: Optional[SlideVideoModel],
    audio: Optional[SpeakerNoteAudioModel],
    force: bool,
    can_transcode: bool,
    language: str,
) -> SlidePlan:
    def result(state, reason=None):
        return SlidePlan(slide.index, slide.id, state, reason)

    if not _has_placeholder(slide):
        return result("skipped", "no_placeholder")
    if audio is None:
        return result("skipped", "no_audio")
    if audio.source_note_hash != note_digest(slide.speaker_note or ""):
        return result("skipped", "audio_stale")
    if audio.format not in LIPSYNC_AUDIO_MIME and not can_transcode:
        return result("skipped", "unsupported_audio_format")
    if (
        video is not None
        and not force
        # A slide holds one avatar; another language's is replaced.
        and (video.language is None or video.language == language)
        and avatar_stale_reason(video, slide, audio) is None
    ):
        return result("skipped", "up_to_date")
    return result("queued")


def plan_avatar_generation(
    slides: Sequence[SlideModel],
    videos: Sequence[SlideVideoModel],
    audios: Sequence[SpeakerNoteAudioModel],
    *,
    language: str,
    slide_indices: Optional[Sequence[int]],
    force: bool,
    can_transcode: bool,
) -> list[SlidePlan]:
    """Plan every requested slide, in slide order.

    `audios` are already narrowed to `language`. Without explicit indices only
    slides that have a placeholder are listed; explicit indices are all
    reported, so the caller can say why a chosen slide was left out.
    """
    video_by_slide = {video.slide: video for video in videos}
    audio_by_slide = {audio.slide: audio for audio in audios}
    wanted = None if slide_indices is None else set(slide_indices)
    plans: list[SlidePlan] = []
    for slide in sorted(slides, key=lambda s: s.index):
        if wanted is None:
            if not _has_placeholder(slide):
                continue
        elif slide.index not in wanted:
            continue
        plans.append(
            _plan_slide(
                slide,
                video_by_slide.get(slide.id),
                audio_by_slide.get(slide.id),
                force,
                can_transcode,
                language,
            )
        )
    return plans


async def lipsync_audio(path: str, audio_format: str) -> tuple[bytes, str]:
    """Narration bytes and MIME type in a format HeyGen accepts.

    mp3 and wav go as stored; anything else is transcoded to mp3 in memory.
    """
    mime = LIPSYNC_AUDIO_MIME.get(audio_format)
    if mime is not None:
        return await asyncio.to_thread(_read_bytes, path), mime
    process = await asyncio.create_subprocess_exec(
        get_ffmpeg_binary(), "-v", "error", "-i", path, "-f", "mp3", "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise FFmpegRuntimeError(
            "ffmpeg could not convert the narration audio to mp3.",
            returncode=process.returncode,
            stderr_tail=stderr.decode("utf-8", "replace")[-2000:],
        )
    return stdout, "audio/mpeg"


def _read_bytes(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def _task_data(
    presentation_id: uuid.UUID | str,
    *,
    language: str,
    phase: str,
    slides: list[dict],
) -> dict[str, Any]:
    states = [entry["state"] for entry in slides]
    return {
        "presentation_id": str(presentation_id),
        "language": language,
        "phase": phase,
        "total": len(states),
        # Not finished yet: waiting for a slot or being generated.
        "queued": sum(state in ("queued", "generating") for state in states),
        "completed": states.count("done"),
        "failed": states.count("failed"),
        "skipped": states.count("skipped"),
        "slides": slides,
    }


def initial_task_data(
    presentation_id: uuid.UUID,
    *,
    language: str,
    plans: Sequence[SlidePlan],
) -> dict[str, Any]:
    return _task_data(
        presentation_id,
        language=language,
        phase="queued",
        slides=[plan.to_dict() for plan in plans],
    )


def _summary(data: dict[str, Any]) -> str:
    return (
        f"{data['completed']} generated, {data['failed']} failed, "
        f"{data['skipped']} skipped"
    )


class _SlideFailed(Exception):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


class _SlideSkipped(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class _AvatarGenerationRun:
    """One run of a generation task; `slides` mirrors `task.data["slides"]`."""

    def __init__(
        self,
        task_id: str,
        presentation_id: uuid.UUID,
        *,
        poll_interval: float,
        slide_timeout: float,
        session_maker,
    ):
        self.task_id = task_id
        self.presentation_id = presentation_id
        self.poll_interval = poll_interval
        self.slide_timeout = slide_timeout
        self.session_maker = session_maker
        self.language = ""
        self.phase = "queued"
        self.slides: list[dict] = []
        # (status code, message) once the run can no longer reach HeyGen.
        self.configuration_error: Optional[tuple[int, str]] = None
        # Concurrent slides report through one writer, in order.
        self._write_lock = asyncio.Lock()

    def data(self) -> dict[str, Any]:
        return _task_data(
            self.presentation_id,
            language=self.language,
            phase=self.phase,
            slides=[dict(entry) for entry in self.slides],
        )

    async def write(
        self,
        *,
        status: Optional[AsyncTaskStatus] = None,
        message: Optional[str] = None,
        error: Optional[dict] = None,
    ) -> None:
        """Save progress in a short session of its own, so polling sees it at once."""
        async with self._write_lock:
            async with self.session_maker() as session:
                task = await session.get(AsyncTaskModel, self.task_id)
                if task is None:
                    return
                data = self.data()
                task.data = data
                task.message = message or f"Generating avatars: {_summary(data)}"
                if status is not None:
                    task.status = status
                if error is not None:
                    task.error = error
                task.updated_at = get_current_utc_datetime()
                session.add(task)
                await session.commit()

    async def update(self, entry: dict, **fields: Any) -> None:
        entry.update(fields)
        await self.write()

    async def run(self, client_factory: Callable[[], HeyGenLipsyncClient]) -> None:
        async with self.session_maker() as session:
            task = await session.get(AsyncTaskModel, self.task_id)
            if task is None:
                return
            presentation = await session.get(PresentationModel, self.presentation_id)
            if presentation is None:
                raise HTTPException(status_code=404, detail="Presentation not found")
            data = task.data or {}
            self.language = data.get("language", "")
            self.slides = [dict(entry) for entry in data.get("slides", [])]
        queued = [entry for entry in self.slides if entry["state"] == "queued"]
        self.phase = "generating"
        await self.write()

        if queued:
            portrait = read_portrait(presentation)
            if portrait is None:
                self.configuration_error = (422, "This deck has no presenter portrait")
            else:
                await self._generate_all(client_factory, portrait, queued)
            if self.configuration_error is not None:
                for entry in queued:
                    if entry["state"] in ("queued", "generating"):
                        entry.update(
                            state="failed",
                            reason="configuration",
                            message=self.configuration_error[1],
                        )

        self.phase = "done"
        data = self.data()
        error: Optional[APIErrorModel] = None
        if self.configuration_error is not None:
            error = APIErrorModel(
                status_code=self.configuration_error[0],
                detail=self.configuration_error[1],
            )
        elif queued and data["failed"] == len(queued):
            error = APIErrorModel(
                status_code=502, detail="No avatar could be generated"
            )
        await self.write(
            status=AsyncTaskStatus.ERROR if error else AsyncTaskStatus.COMPLETED,
            message=_summary(data),
            error=error.model_dump(mode="json") if error else None,
        )

    async def _generate_all(
        self,
        client_factory: Callable[[], HeyGenLipsyncClient],
        portrait: tuple[bytes, str],
        queued: list[dict],
    ) -> None:
        client: Optional[HeyGenLipsyncClient] = None
        slides: list[asyncio.Task] = []
        try:
            client = client_factory()
            semaphore = asyncio.Semaphore(lipsync_concurrency())
            slides = [
                asyncio.ensure_future(self._slide(semaphore, client, portrait, entry))
                for entry in queued
            ]
            await asyncio.gather(*slides)
        except HeyGenConfigurationError as exc:
            self.configuration_error = (503, str(exc))
        finally:
            # A slide that raised leaves its siblings running: stop them all
            # before the client closes and before the final status is written,
            # so none of them reports over it.
            for slide in slides:
                slide.cancel()
            await asyncio.gather(*slides, return_exceptions=True)
            if client is not None:
                await client.aclose()

    async def _slide(
        self,
        semaphore: asyncio.Semaphore,
        client: HeyGenLipsyncClient,
        portrait: tuple[bytes, str],
        entry: dict,
    ) -> None:
        async with semaphore:
            # Left queued; marked `configuration` once every slide has stopped.
            if self.configuration_error is not None:
                return
            try:
                video_id = await self._generate(client, portrait, entry)
            except _SlideSkipped as exc:
                await self.update(entry, state="skipped", reason=exc.reason)
            except _SlideFailed as exc:
                await self.update(
                    entry, state="failed", reason=exc.reason, message=exc.message
                )
            except HeyGenConfigurationError as exc:
                self.configuration_error = (503, str(exc))
                await self.update(
                    entry, state="failed", reason="configuration", message=str(exc)
                )
            except Exception as exc:
                # One slide's bug must not stop the slides running beside it.
                LOGGER.exception(
                    "[slide_avatar_generation] slide %s failed", entry["slide_id"]
                )
                await self.update(
                    entry, state="failed", reason="internal_error", message=str(exc)
                )
            else:
                await self.update(entry, state="done", video_id=video_id)

    async def _generate(
        self,
        client: HeyGenLipsyncClient,
        portrait: tuple[bytes, str],
        entry: dict,
    ) -> str:
        audio = await self._current_audio(entry)
        try:
            audio_bytes, audio_mime = await lipsync_audio(audio.path, audio.format)
        except (OSError, FFmpegRuntimeError, FFmpegNotAvailableError) as exc:
            raise _SlideFailed("audio_error", str(exc))

        image, image_mime = portrait
        try:
            generation_id = await client.create(
                image=image,
                image_mime=image_mime,
                audio=audio_bytes,
                audio_mime=audio_mime,
            )
        except HeyGenRequestError as exc:
            raise _SlideFailed("request_error", str(exc))
        await self.update(entry, state="generating", generation_id=generation_id)

        try:
            status = await asyncio.wait_for(
                self._poll(client, generation_id), self.slide_timeout
            )
        except asyncio.TimeoutError:
            raise _SlideFailed(
                "timeout",
                f"HeyGen did not finish within {self.slide_timeout:g} seconds",
            )
        except HeyGenRequestError as exc:
            raise _SlideFailed("request_error", str(exc))
        if status.state == "failed":
            raise _SlideFailed(
                status.failure_reason or "unknown",
                status.error_message or "HeyGen could not generate the video",
            )

        if not status.output_url:
            raise _SlideFailed("invalid_output", "HeyGen returned no video")
        try:
            data = await client.download(
                status.output_url, max_bytes=get_slide_video_max_upload_bytes()
            )
        # A refused signed URL means the link expired, not that the key is wrong.
        except (HeyGenRequestError, HeyGenConfigurationError) as exc:
            raise _SlideFailed("invalid_output", str(exc))
        return await self._save(entry, audio, generation_id, data)

    async def _current_audio(self, entry: dict) -> SpeakerNoteAudioModel:
        """The slide's narration as it is now, checked again before spending credits.

        Slides wait their turn, so the note may have been edited or the audio
        regenerated since the plan was made.
        """
        slide_id = uuid.UUID(entry["slide_id"])
        async with self.session_maker() as session:
            slide = await session.get(SlideModel, slide_id)
            if slide is None:
                raise _SlideSkipped("placeholder_removed")
            if not _has_placeholder(slide):
                raise _SlideSkipped("placeholder_removed")
            audio = (
                await session.scalars(
                    select(SpeakerNoteAudioModel).where(
                        SpeakerNoteAudioModel.slide == slide_id,
                        SpeakerNoteAudioModel.language == self.language,
                    )
                )
            ).first()
        if audio is None:
            raise _SlideFailed("audio_error", "The slide's narration audio is gone")
        if audio.source_note_hash != note_digest(slide.speaker_note or ""):
            raise _SlideSkipped("audio_stale")
        return audio

    async def _poll(
        self, client: HeyGenLipsyncClient, generation_id: str
    ) -> LipsyncStatus:
        while True:
            await asyncio.sleep(self.poll_interval)
            status = await client.get(generation_id)
            if status is not None and status.state in ("completed", "failed"):
                return status

    async def _save(
        self,
        entry: dict,
        audio: SpeakerNoteAudioModel,
        generation_id: str,
        data: bytes,
    ) -> str:
        """Store the clip on the slide, by id: its index may have moved meanwhile."""
        async with self.session_maker() as session:
            slide = await session.get(SlideModel, uuid.UUID(entry["slide_id"]))
            presentation = await session.get(PresentationModel, self.presentation_id)
            # Generation takes minutes; the user may have removed the slot.
            if slide is None or presentation is None or not _has_placeholder(slide):
                raise _SlideSkipped("placeholder_removed")
            try:
                stored = await asyncio.to_thread(
                    store_video_bytes,
                    data,
                    directory=os.path.join(
                        get_videos_directory(), str(presentation.id)
                    ),
                    stem=f"{slide.id}-{uuid.uuid4().hex[:8]}",
                    max_bytes=get_slide_video_max_upload_bytes(),
                )
            except HTTPException as exc:
                raise _SlideFailed("invalid_output", str(exc.detail))
            # A clip that passes the container check but cannot be read is not
            # a usable avatar.
            if video_metadata(stored.path, stored.format).duration_seconds is None:
                remove_file(stored.path)
                raise _SlideFailed(
                    "invalid_output", "HeyGen returned a video with no readable duration"
                )
            video = await store_slide_video_bytes(
                sql_session=session,
                presentation=presentation,
                slide=slide,
                stored=stored,
                original_filename=f"heygen-{generation_id}.{stored.format}",
                # What the avatar actually says, so it reads as fresh.
                language=audio.language,
                source_note_hash=audio.source_note_hash,
                source="heygen",
            )
            return str(video.id)


async def _fail_task(session_maker, task_id: str, exc: Exception) -> None:
    async with session_maker() as session:
        task = await session.get(AsyncTaskModel, task_id)
        if task is None:
            return
        task.status = AsyncTaskStatus.ERROR
        task.message = "Avatar generation failed"
        task.error = APIErrorModel.from_exception(exc).model_dump(mode="json")
        task.data = {**(task.data or {}), "phase": "done"}
        task.updated_at = get_current_utc_datetime()
        session.add(task)
        await session.commit()


async def run_avatar_generation_task(
    task_id: str,
    presentation_id: uuid.UUID,
    owner_id: Optional[uuid.UUID],
    *,
    client_factory: Callable[[], HeyGenLipsyncClient] = lipsync_client_from_env,
    poll_interval: float = 10.0,
    slide_timeout: float = 1800.0,
    session_maker=async_session_maker,
) -> None:
    """Generate the avatars planned in the task's data, reporting on the task.

    Up to `lipsync_concurrency()` slides are generated at once. A slide that
    fails is reported and the others carry on; the task ends in error only
    when HeyGen cannot be used at all or every queued slide failed.
    """
    owner_token = set_current_owner_id(owner_id)
    admin_token = set_current_owner_is_admin(False)
    try:
        run = _AvatarGenerationRun(
            task_id,
            presentation_id,
            poll_interval=poll_interval,
            slide_timeout=slide_timeout,
            session_maker=session_maker,
        )
        await run.run(client_factory)
    except Exception as exc:
        LOGGER.exception(
            "[slide_avatar_generation] run failed task_id=%s", task_id
        )
        await _fail_task(session_maker, task_id, exc)
    finally:
        reset_current_owner_is_admin(admin_token)
        reset_current_owner_id(owner_token)
