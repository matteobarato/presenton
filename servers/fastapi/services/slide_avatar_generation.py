"""Generating lip-synced avatar videos for slides.

This part decides, per slide, whether a generation is queued or skipped (and
why), and prepares the narration audio in a format ElevenLabs accepts.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Literal, Optional, Sequence

from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from services.slide_video_service import (
    avatar_stale_reason,
    find_video_placeholder,
    is_template_slide,
)
from services.speaker_note_tts_service import note_digest
from utils.ffmpeg_utils import FFmpegRuntimeError, get_ffmpeg_binary

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
            )
        )
    return plans


async def lipsync_audio(path: str, audio_format: str) -> tuple[bytes, str]:
    """Narration bytes and MIME type in a format ElevenLabs accepts.

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
