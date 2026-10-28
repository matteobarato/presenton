import asyncio
import io
import os
import struct
import uuid
from datetime import datetime, timezone

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import services.slide_avatar_generation as generation
from enums.async_task_status import AsyncTaskStatus
from models.sql.async_task import AsyncTaskModel
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from models.sql.user import User
from services.elevenlabs_lipsync import (
    ElevenLabsConfigurationError,
    LipsyncStatus,
)
from services.slide_avatar_generation import (
    ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION,
    initial_task_data,
    plan_avatar_generation,
    run_avatar_generation_task,
)
from services.slide_avatar_portrait import save_portrait
from services.slide_video_service import avatar_stale_reason
from services.speaker_note_tts_service import note_digest

_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + kind + payload


def _mp4() -> bytes:
    mvhd = _box(b"mvhd", b"\x00" * 4 + struct.pack(">IIII", 0, 0, 1000, 3000) + b"\x00" * 80)
    return _box(b"ftyp", b"isom\x00\x00\x02\x00isom") + _box(b"moov", mvhd)


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, "PNG")
    return buffer.getvalue()


def _ui(placeholder=True):
    elements = [{"type": "text", "position": {"x": 0, "y": 0}, "size": {"width": 10, "height": 10}}]
    if placeholder:
        elements.append(
            {
                "type": "image",
                "video_placeholder": True,
                "position": {"x": 900, "y": 500},
                "size": {"width": 320, "height": 180},
            }
        )
    return {"id": "l", "elements": elements}


class FakeClient:
    """Scripted ElevenLabs: each slide's create returns an id whose polls follow a script."""

    def __init__(self, scripts=None, *, default=None, create_error=None, video=None):
        self.scripts = scripts or {}
        self.default = default or ["generating", "completed"]
        self.create_error = create_error
        self.video = _mp4() if video is None else video
        self.created = []
        self.polls = {}
        self.in_flight = 0
        self.max_in_flight = 0
        self.closed = False
        self.used_after_close = False
        self.on_completed = None

    async def create(self, *, image, image_mime, audio, audio_mime, resolution):
        self.used_after_close |= self.closed
        if self.create_error is not None:
            raise self.create_error
        generation_id = f"gen-{len(self.created)}"
        self.created.append(
            {"id": generation_id, "audio": audio, "image_mime": image_mime,
             "audio_mime": audio_mime, "resolution": resolution}
        )
        self.polls[generation_id] = list(
            self.scripts.get(audio.decode(), self.default)
        )
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        return generation_id

    async def get(self, generation_id):
        self.used_after_close |= self.closed
        script = self.polls[generation_id]
        state = script.pop(0) if len(script) > 1 else script[0]
        if state in ("completed", "failed") or isinstance(state, LipsyncStatus):
            self.in_flight -= 1
            self.polls[generation_id] = ["generating"]
        if isinstance(state, LipsyncStatus):
            return state
        if state == "completed":
            if self.on_completed is not None:
                await self.on_completed(generation_id)
            return LipsyncStatus("completed", content_url=f"https://cdn/{generation_id}.mp4")
        if state == "failed":
            return LipsyncStatus("failed", failure_reason="moderated", error_message="Flagged")
        return LipsyncStatus(state)

    async def download(self, url, *, max_bytes):
        return self.video

    async def aclose(self):
        self.closed = True


def _deck(tmp_path, monkeypatch, *, notes=("one", "two"), placeholders=None):
    """Seed a deck with narrated, placeholder-bearing slides; return a context dict."""
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    monkeypatch.delenv("NEXT_PUBLIC_FAST_API", raising=False)
    monkeypatch.delenv("SLIDE_VIDEO_MAX_UPLOAD_MB", raising=False)
    monkeypatch.delenv("ELEVENLABS_LIPSYNC_CONCURRENCY", raising=False)
    placeholders = placeholders or [True] * len(notes)
    ctx = {"engine": create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'run.db'}")}
    ctx["sessions"] = async_sessionmaker(ctx["engine"], expire_on_commit=False)
    presentation_id = uuid.uuid4()
    ctx["presentation_id"] = presentation_id
    ctx["slide_ids"] = [uuid.uuid4() for _ in notes]
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    async def seed():
        async with ctx["engine"].begin() as connection:
            for model in (
                User, PresentationModel, SlideModel, SpeakerNoteAudioModel,
                SlideVideoModel, AsyncTaskModel,
            ):
                await connection.run_sync(model.__table__.create)
        async with ctx["sessions"]() as session:
            presentation = PresentationModel(
                id=presentation_id, version=PresentationVersion.V2_STANDARD,
                content="Deck", n_slides=len(notes), language="English", title="Deck",
            )
            session.add(presentation)
            for index, (slide_id, note) in enumerate(zip(ctx["slide_ids"], notes)):
                session.add(
                    SlideModel(
                        id=slide_id, presentation=presentation_id, layout_group="g",
                        layout="l", index=index, content={}, speaker_note=note,
                        ui=_ui(placeholders[index]),
                    )
                )
                path = audio_dir / f"{index}.mp3"
                # The audio bytes name the slide, so the fake client can script it.
                path.write_bytes(note.encode())
                session.add(
                    SpeakerNoteAudioModel(
                        presentation=presentation_id, slide=slide_id, slide_index=index,
                        language="en", language_name="English", model="m", text=note,
                        source_note_hash=note_digest(note), path=str(path), url="/a.mp3",
                        format="mp3", created_at=_AT, updated_at=_AT,
                    )
                )
            await session.commit()
            await save_portrait(session, presentation, _png())

    asyncio.run(seed())
    return ctx


def _create_task(ctx, *, slide_indices=None, force=False):
    async def go():
        async with ctx["sessions"]() as session:
            slides = list(await session.scalars(select(SlideModel)))
            audios = list(await session.scalars(select(SpeakerNoteAudioModel)))
            videos = list(await session.scalars(select(SlideVideoModel)))
            plans = plan_avatar_generation(
                slides, videos, audios, language="en", slide_indices=slide_indices,
                force=force, can_transcode=False,
            )
            task = AsyncTaskModel(
                type=ASYNC_TASK_TYPE_SLIDE_AVATAR_GENERATION,
                status=AsyncTaskStatus.PENDING,
                data=initial_task_data(
                    ctx["presentation_id"], language="en", resolution="720p", plans=plans
                ),
            )
            session.add(task)
            await session.commit()
            return task.id

    return asyncio.run(go())


def _run(ctx, task_id, client, **kwargs):
    kwargs.setdefault("poll_interval", 0)
    asyncio.run(
        run_avatar_generation_task(
            task_id, ctx["presentation_id"], None,
            client_factory=lambda: client, session_maker=ctx["sessions"], **kwargs,
        )
    )


def _read(ctx, task_id):
    async def go():
        async with ctx["sessions"]() as session:
            task = await session.get(AsyncTaskModel, task_id)
            videos = list(await session.scalars(select(SlideVideoModel)))
            slides = {s.id: s for s in await session.scalars(select(SlideModel))}
            audios = {a.slide: a for a in await session.scalars(select(SpeakerNoteAudioModel))}
        await ctx["engine"].dispose()
        return task, videos, slides, audios

    return asyncio.run(go())


def _video_files(tmp_path, ctx):
    folder = tmp_path / "app_data" / "videos" / str(ctx["presentation_id"])
    return sorted(p.name for p in folder.iterdir() if not p.name.startswith("portrait-"))


def test_initial_task_data_counts_the_plan(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a", "b"), placeholders=[True, False])
    task_id = _create_task(ctx, slide_indices=[0, 1])
    task, *_ = _read(ctx, task_id)
    data = task.data
    assert data["phase"] == "queued"
    assert (data["total"], data["queued"], data["skipped"]) == (2, 1, 1)
    assert (data["completed"], data["failed"]) == (0, 0)
    assert data["resolution"] == "720p" and data["language"] == "en"
    assert data["presentation_id"] == str(ctx["presentation_id"])


def test_run_happy_path(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("hello",))
    task_id = _create_task(ctx)
    client = FakeClient()

    _run(ctx, task_id, client)

    task, videos, slides, audios = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.COMPLETED
    assert task.message == "1 generated, 0 failed, 0 skipped"
    assert task.data["phase"] == "done"
    [entry] = task.data["slides"]
    [video] = videos
    assert entry["state"] == "done"
    assert entry["generation_id"] == "gen-0"
    assert entry["video_id"] == str(video.id)
    assert video.source == "elevenlabs"
    assert video.language == "en"
    audio = audios[video.slide]
    assert video.source_note_hash == audio.source_note_hash
    assert video.original_filename == "elevenlabs-gen-0.mp4"
    assert avatar_stale_reason(video, slides[video.slide], audio) is None
    assert os.path.exists(video.path)
    assert client.created[0]["image_mime"] == "image/png"
    assert client.created[0]["audio_mime"] == "audio/mpeg"
    assert client.created[0]["resolution"] == "720p"
    assert client.closed


def test_run_partial_failure_completes(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("ok", "bad"))
    task_id = _create_task(ctx)
    client = FakeClient({"bad": ["generating", "failed"]})

    _run(ctx, task_id, client)

    task, videos, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.COMPLETED
    assert task.message == "1 generated, 1 failed, 0 skipped"
    states = {e["slide_index"]: e for e in task.data["slides"]}
    assert states[0]["state"] == "done"
    assert states[1]["state"] == "failed"
    assert states[1]["reason"] == "moderated"
    assert states[1]["message"] == "Flagged"
    assert states[1]["generation_id"] == "gen-1"
    assert len(videos) == 1


def test_run_all_failed_is_error(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a", "b"))
    task_id = _create_task(ctx)

    _run(ctx, task_id, FakeClient(default=["failed"]))

    task, videos, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.ERROR
    assert task.message == "0 generated, 2 failed, 0 skipped"
    assert task.error is not None
    assert videos == []


def test_run_timeout(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("slow",))
    task_id = _create_task(ctx)

    _run(ctx, task_id, FakeClient(default=["generating"]), poll_interval=0.001, slide_timeout=0.01)

    task, videos, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("failed", "timeout")
    assert entry["generation_id"] == "gen-0"
    assert task.status == AsyncTaskStatus.ERROR
    assert videos == []


def test_run_configuration_error_marks_rest(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a", "b", "c"))
    monkeypatch.setenv("ELEVENLABS_LIPSYNC_CONCURRENCY", "1")
    task_id = _create_task(ctx)
    client = FakeClient(create_error=ElevenLabsConfigurationError("bad key"))

    _run(ctx, task_id, client)

    task, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.ERROR
    assert [(e["state"], e["reason"]) for e in task.data["slides"]] == [
        ("failed", "configuration")
    ] * 3
    assert client.closed


def test_run_client_factory_configuration_error(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",))
    task_id = _create_task(ctx)

    def factory():
        raise ElevenLabsConfigurationError("ELEVENLABS_API_KEY is not set")

    asyncio.run(
        run_avatar_generation_task(
            task_id, ctx["presentation_id"], None, client_factory=factory,
            poll_interval=0, session_maker=ctx["sessions"],
        )
    )

    task, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.ERROR
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("failed", "configuration")


def test_run_respects_concurrency(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a", "b", "c", "d", "e"))
    monkeypatch.setenv("ELEVENLABS_LIPSYNC_CONCURRENCY", "2")
    task_id = _create_task(ctx)
    client = FakeClient(default=["generating", "generating", "generating", "completed"])

    _run(ctx, task_id, client)

    task, videos, *_ = _read(ctx, task_id)
    assert client.max_in_flight == generation.lipsync_concurrency() == 2
    assert task.data["completed"] == 5
    assert len(videos) == 5


def test_run_placeholder_removed_mid_run(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",))
    task_id = _create_task(ctx)
    client = FakeClient()

    async def remove_placeholder(_generation_id):
        async with ctx["sessions"]() as session:
            slide = await session.get(SlideModel, ctx["slide_ids"][0])
            slide.ui = _ui(placeholder=False)
            session.add(slide)
            await session.commit()

    client.on_completed = remove_placeholder

    _run(ctx, task_id, client)

    task, videos, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("skipped", "placeholder_removed")
    assert task.status == AsyncTaskStatus.COMPLETED
    assert task.message == "0 generated, 0 failed, 1 skipped"
    assert videos == []
    assert _video_files(tmp_path, ctx) == []


def test_run_slide_deleted_mid_run_is_skipped(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",))
    task_id = _create_task(ctx)
    client = FakeClient()

    async def delete_slide(_generation_id):
        async with ctx["sessions"]() as session:
            await session.delete(await session.get(SlideModel, ctx["slide_ids"][0]))
            await session.commit()

    client.on_completed = delete_slide

    _run(ctx, task_id, client)

    task, videos, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("skipped", "placeholder_removed")
    assert videos == []


def test_run_uses_slide_id_not_index(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("first", "second"), placeholders=[True, False])
    task_id = _create_task(ctx, slide_indices=[0])

    async def swap():
        async with ctx["sessions"]() as session:
            first = await session.get(SlideModel, ctx["slide_ids"][0])
            second = await session.get(SlideModel, ctx["slide_ids"][1])
            first.index, second.index = 1, 0
            second.ui = _ui(placeholder=True)
            session.add_all([first, second])
            await session.commit()

    asyncio.run(swap())
    client = FakeClient()

    _run(ctx, task_id, client)

    _task, videos, *_ = _read(ctx, task_id)
    [video] = videos
    assert video.slide == ctx["slide_ids"][0]
    assert client.created[0]["audio"] == b"first"


def test_run_reads_portrait_once(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a", "b", "c"))
    task_id = _create_task(ctx)
    calls = []
    real = generation.read_portrait

    def counting(presentation):
        calls.append(presentation.id)
        return real(presentation)

    monkeypatch.setattr(generation, "read_portrait", counting)

    _run(ctx, task_id, FakeClient())

    assert calls == [ctx["presentation_id"]]


def test_run_invalid_output_leaves_no_file(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",))
    task_id = _create_task(ctx)

    _run(ctx, task_id, FakeClient(video=b"definitely not a video"))

    task, videos, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("failed", "invalid_output")
    assert videos == []
    assert _video_files(tmp_path, ctx) == []


def test_run_audio_error_when_file_missing(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",))
    task_id = _create_task(ctx)
    os.remove(tmp_path / "audio" / "0.mp3")
    client = FakeClient()

    _run(ctx, task_id, client)

    task, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("failed", "audio_error")
    assert client.created == []


def test_run_with_nothing_queued_completes(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("a",), placeholders=[False])
    task_id = _create_task(ctx, slide_indices=[0])
    client = FakeClient()

    _run(ctx, task_id, client)

    task, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.COMPLETED
    assert task.message == "0 generated, 0 failed, 1 skipped"
    assert client.created == []


def test_run_skips_a_slide_whose_note_changed_after_planning(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("before",))
    task_id = _create_task(ctx)

    async def edit_note():
        async with ctx["sessions"]() as session:
            slide = await session.get(SlideModel, ctx["slide_ids"][0])
            slide.speaker_note = "after"
            session.add(slide)
            await session.commit()

    asyncio.run(edit_note())
    client = FakeClient()

    _run(ctx, task_id, client)

    task, videos, *_ = _read(ctx, task_id)
    [entry] = task.data["slides"]
    assert (entry["state"], entry["reason"]) == ("skipped", "audio_stale")
    assert client.created == []
    assert videos == []
    assert task.status == AsyncTaskStatus.COMPLETED


def test_run_stops_every_slide_before_a_failed_write_ends_it(tmp_path, monkeypatch):
    ctx = _deck(tmp_path, monkeypatch, notes=("bad", "slow"))
    monkeypatch.setenv("ELEVENLABS_LIPSYNC_CONCURRENCY", "2")
    task_id = _create_task(ctx)
    client = FakeClient({"bad": ["failed"], "slow": ["generating"]})
    real_update = generation._AvatarGenerationRun.update

    async def update(self, entry, **fields):
        if fields.get("state") == "failed":
            raise RuntimeError("database went away")
        await real_update(self, entry, **fields)

    monkeypatch.setattr(generation._AvatarGenerationRun, "update", update)

    _run(ctx, task_id, client, poll_interval=0.001)

    task, *_ = _read(ctx, task_id)
    assert task.status == AsyncTaskStatus.ERROR
    assert task.message == "Avatar generation failed"
    assert task.error["detail"] == "database went away"
    assert client.closed
    assert not client.used_after_close
