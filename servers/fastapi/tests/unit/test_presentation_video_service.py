import asyncio
import os
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select

import services.presentation_video_service as pvs
from constants.tts_languages import UnsupportedTTSLanguageError
from models.presentation_and_path import PresentationAndPath
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_video import PresentationVideoModel
from models.sql.slide import SlideModel
from models.sql.slide_video import SlideVideoModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
# Imported so the owner_id foreign keys can resolve their column type.
from models.sql.user import User  # noqa: F401
from services.presentation_video_service import (
    PresentationVideoConfigurationError,
    PresentationVideoRenderError,
    SlideTiming,
    VideoRenderOptions,
    build_ffmpeg_args,
    compute_video_source_hash,
    delete_presentation_videos,
    generate_presentation_video,
    presentation_video_paths,
)
from services.speaker_note_tts_service import SpeakerNoteAudioGenerationResult
from utils.ffmpeg_utils import FFmpegProgress, FFmpegResult, MediaProbe
from utils.pdf_to_images import RenderedPage


# ---------------------------------------------------------------------------
# VideoRenderOptions
# ---------------------------------------------------------------------------


def test_options_default_preset_is_deterministic():
    options = VideoRenderOptions()
    assert options.preset == "1080p-30-soft"
    assert options.width == 1920
    assert options.height == 1080


def test_options_reject_unknown_resolution():
    with pytest.raises(ValueError):
        VideoRenderOptions(resolution="4k")


def test_options_reject_unknown_fps():
    with pytest.raises(ValueError):
        VideoRenderOptions(fps=25)


def test_options_reject_unknown_subtitles_mode():
    with pytest.raises(ValueError):
        VideoRenderOptions(subtitles_mode="banana")


def test_options_reject_absurd_timings():
    with pytest.raises(ValueError):
        VideoRenderOptions(min_slide_seconds=0)
    with pytest.raises(ValueError):
        VideoRenderOptions(min_slide_seconds=-1)
    with pytest.raises(ValueError):
        VideoRenderOptions(lead_in_seconds=-0.1)
    with pytest.raises(ValueError):
        VideoRenderOptions(lead_out_seconds=-0.1)


# ---------------------------------------------------------------------------
# compute_video_source_hash
# ---------------------------------------------------------------------------


def _timing(**overrides) -> SlideTiming:
    base = dict(
        slide_index=0,
        page_index=0,
        audio_path="/tmp/a.mp3",
        text="hello",
        audio_seconds=2.0,
        start_seconds=0.0,
        duration_seconds=3.0,
        slide_id=uuid.UUID(int=1),
        audio_id=uuid.UUID(int=2),
        source_note_hash="abc123",
        audio_updated_at=None,
    )
    base.update(overrides)
    return SlideTiming(**base)


def test_source_hash_is_stable_across_calls():
    timings = [_timing()]
    options = VideoRenderOptions()
    first = compute_video_source_hash(timings=timings, language_code="en", options=options)
    second = compute_video_source_hash(timings=timings, language_code="en", options=options)
    assert first == second


def test_source_hash_changes_when_note_hash_changes():
    options = VideoRenderOptions()
    base = compute_video_source_hash(
        timings=[_timing()], language_code="en", options=options
    )
    changed = compute_video_source_hash(
        timings=[_timing(source_note_hash="different")],
        language_code="en",
        options=options,
    )
    assert base != changed


def test_source_hash_changes_when_audio_id_changes_ie_voice_changed():
    options = VideoRenderOptions()
    base = compute_video_source_hash(
        timings=[_timing()], language_code="en", options=options
    )
    changed = compute_video_source_hash(
        timings=[_timing(audio_id=uuid.UUID(int=99))],
        language_code="en",
        options=options,
    )
    assert base != changed


def test_source_hash_changes_when_fps_changes():
    base = compute_video_source_hash(
        timings=[_timing()], language_code="en", options=VideoRenderOptions(fps=30)
    )
    changed = compute_video_source_hash(
        timings=[_timing()], language_code="en", options=VideoRenderOptions(fps=24)
    )
    assert base != changed


def test_source_hash_changes_when_resolution_changes():
    base = compute_video_source_hash(
        timings=[_timing()],
        language_code="en",
        options=VideoRenderOptions(resolution="1080p"),
    )
    changed = compute_video_source_hash(
        timings=[_timing()],
        language_code="en",
        options=VideoRenderOptions(resolution="720p"),
    )
    assert base != changed


def test_source_hash_changes_when_subtitles_mode_changes():
    base = compute_video_source_hash(
        timings=[_timing()],
        language_code="en",
        options=VideoRenderOptions(subtitles_mode="soft"),
    )
    changed = compute_video_source_hash(
        timings=[_timing()],
        language_code="en",
        options=VideoRenderOptions(subtitles_mode="burned"),
    )
    assert base != changed


# ---------------------------------------------------------------------------
# _build_timings (via the private helper, exercised directly)
# ---------------------------------------------------------------------------


class _FakeAudio:
    def __init__(self, *, slide, path, text, duration_seconds, source_note_hash="h"):
        self.slide = slide
        self.id = uuid.uuid4()
        self.path = path
        self.text = text
        self.duration_seconds = duration_seconds
        self.source_note_hash = source_note_hash
        self.updated_at = None
        self.language = "en"


def _slide(index, slide_id=None):
    return SlideModel(
        id=slide_id or uuid.uuid4(),
        presentation=uuid.uuid4(),
        layout_group="general",
        layout="title",
        index=index,
        content={"title": f"Slide {index}"},
        speaker_note="Some note" if index == 0 else "",
    )


def test_timing_applies_lead_in_out_and_accumulates_start(tmp_path, monkeypatch):
    slide0 = _slide(0)
    slide1 = _slide(1)
    audio_path = str(tmp_path / "a0.mp3")
    open(audio_path, "wb").write(b"x")
    audio0 = _FakeAudio(slide=slide0.id, path=audio_path, text="hi", duration_seconds=5.0)

    async def fake_duration(path):
        return 4.0

    monkeypatch.setattr(pvs, "media_duration_seconds", fake_duration)
    options = VideoRenderOptions(lead_in_seconds=0.5, lead_out_seconds=0.5, min_slide_seconds=1.0)

    timings, skipped = asyncio.run(
        pvs._build_timings(
            ordered_slides=[slide0, slide1],
            audio_by_slide={slide0.id: audio0},
            options=options,
            already_skipped=[],
        )
    )

    assert timings[0].audio_seconds == 4.0
    assert timings[0].duration_seconds == pytest.approx(0.5 + 4.0 + 0.5)
    assert timings[0].start_seconds == 0.0
    # Slide 1 has no audio -> silence floored at min_slide_seconds, and
    # start_seconds accumulates from slide 0's duration.
    assert timings[1].start_seconds == pytest.approx(timings[0].duration_seconds)
    assert timings[1].duration_seconds == pytest.approx(1.0)
    assert [entry["slide_index"] for entry in skipped] == [1]


def test_silent_slide_is_not_an_error(tmp_path, monkeypatch):
    slide0 = _slide(0)

    async def fake_duration(path):
        return None

    monkeypatch.setattr(pvs, "media_duration_seconds", fake_duration)
    options = VideoRenderOptions(min_slide_seconds=2.5)

    timings, skipped = asyncio.run(
        pvs._build_timings(
            ordered_slides=[slide0],
            audio_by_slide={},
            options=options,
            already_skipped=[],
        )
    )
    assert timings[0].duration_seconds == pytest.approx(2.5)
    assert len(skipped) == 1
    assert skipped[0]["slide_index"] == 0


# ---------------------------------------------------------------------------
# build_ffmpeg_args / concat file
# ---------------------------------------------------------------------------


def test_concat_file_repeats_final_image_without_duration(tmp_path):
    pages = [
        RenderedPage(index=0, path=str(tmp_path / "s1.png"), width=1920, height=1080),
        RenderedPage(index=1, path=str(tmp_path / "s2.png"), width=1920, height=1080),
    ]
    timings = [_timing(duration_seconds=3.0), _timing(duration_seconds=4.0)]
    concat_path = str(tmp_path / "concat.txt")
    pvs._write_concat_file(pages, timings, concat_path)
    content = open(concat_path).read()
    lines = [line for line in content.splitlines() if line]
    assert lines[0] == f"file '{pages[0].path}'"
    assert lines[1] == "duration 3.000"
    assert lines[2] == f"file '{pages[1].path}'"
    assert lines[3] == "duration 4.000"
    # Final image repeated once, with no trailing duration line.
    assert lines[4] == f"file '{pages[1].path}'"
    assert len(lines) == 5


def test_build_ffmpeg_args_has_one_audio_input_per_slide():
    timings = [
        _timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0),
        _timing(audio_path=None, duration_seconds=2.0),
    ]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(crossfade_seconds=0, subtitles_mode="none"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert args.count("-i") == 1 + 2  # concat input + 2 audio inputs
    assert "/tmp/a0.mp3" in args
    assert "anullsrc=r=44100:cl=stereo" in args


def test_build_ffmpeg_args_soft_subtitles_adds_input_and_codec():
    timings = [_timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0)]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(subtitles_mode="soft"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert "/tmp/subs.vtt" in args
    assert "mov_text" in args
    assert "subtitles=" not in ";".join(args)


def test_build_ffmpeg_args_burned_subtitles_uses_video_filter_not_input():
    timings = [_timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0)]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(subtitles_mode="burned"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    filter_index = args.index("-filter_complex")
    filter_complex = args[filter_index + 1]
    assert "subtitles=" in filter_complex
    assert "mov_text" not in args
    # The vtt is not a separate -i input in burned mode.
    assert "/tmp/subs.vtt" not in [a for a in args if a not in filter_complex]


def test_build_ffmpeg_args_converts_pixel_format_before_duplicating_frames():
    """Guards a memory blow-up, not a style preference.

    With the rgb24 -> yuv420p conversion left implicit, ffmpeg inserts it
    *after* `fps`, allocating a separate 1080p buffer for every duplicated
    still frame; a five-slide deck reached 10 GB resident and was killed by
    the OOM killer. Converting first means the duplicates share one buffer.
    """
    timings = [_timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0)]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png"],
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    filter_complex = args[args.index("-filter_complex") + 1]
    video_chain = filter_complex.split(";")[0]
    assert video_chain.index("format=yuv420p") < video_chain.index("fps=fps=")


def test_build_ffmpeg_args_caps_output_at_timeline_duration():
    """The concat list holds the repeated final image open past the deck's end."""
    timings = [
        _timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0, start_seconds=0.0),
        _timing(audio_path="/tmp/a1.mp3", duration_seconds=4.0, start_seconds=3.0),
    ]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(crossfade_seconds=0, subtitles_mode="none"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert args[args.index("-t") + 1] == "7.000"


def test_build_ffmpeg_args_burned_subtitles_loops_each_slide_image():
    """Burned captions need one packet per frame, or memory runs away.

    Drawing captions gives every frame its own buffer, and the `fps` filter
    hands thousands of them over in one burst that nothing can slow down.
    Looping each image at the frame rate lets the input queue push back.
    """
    timings = [
        _timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0),
        _timing(audio_path="/tmp/a1.mp3", duration_seconds=4.0),
    ]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(crossfade_seconds=0, subtitles_mode="burned", fps=30),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert "concat" not in args  # no concat demuxer
    assert args[:8] == [
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        "3.000",
        "-i",
        "/tmp/s0.png",
    ]
    assert "/tmp/s1.png" in args
    filter_complex = args[args.index("-filter_complex") + 1]
    video_chain = filter_complex.split(";")[0]
    assert video_chain.startswith("[0:v][1:v]concat=n=2:v=1:a=0")
    assert "fps=fps=" not in video_chain
    # Audio inputs come after the slide images, so their labels shift.
    assert "[2:a]" in filter_complex


# ---------------------------------------------------------------------------
# Full pipeline, with ffmpeg/export/render/narration mocked
# ---------------------------------------------------------------------------


class _Deck:
    def __init__(self, tmp_path):
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{tmp_path / 'video.db'}"
        )
        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)
        self.presentation_id = uuid.uuid4()
        self.slide_ids = [uuid.uuid4(), uuid.uuid4()]

    async def seed(self):
        async with self.engine.begin() as connection:
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)
            await connection.run_sync(SpeakerNoteAudioModel.__table__.create)
            await connection.run_sync(PresentationVideoModel.__table__.create)
            await connection.run_sync(SlideVideoModel.__table__.create)
        async with self.session_maker() as session:
            session.add(
                PresentationModel(
                    id=self.presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Annual review",
                    n_slides=2,
                    language="English",
                    title="Annual Review",
                )
            )
            session.add(
                SlideModel(
                    id=self.slide_ids[0],
                    presentation=self.presentation_id,
                    layout_group="general",
                    layout="title",
                    index=0,
                    content={"title": "Revenue"},
                    speaker_note="Revenue grew a lot this year.",
                )
            )
            session.add(
                SlideModel(
                    id=self.slide_ids[1],
                    presentation=self.presentation_id,
                    layout_group="general",
                    layout="blank",
                    index=1,
                    content={"title": "Thanks"},
                    speaker_note="",
                )
            )
            await session.commit()


def _make_env(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    monkeypatch.setenv("PRESENTATION_VIDEO_ENCODE_CONCURRENCY", "1")


def _fake_narration(deck, audio_dir, *, with_audio_for=(0,), texts=None):
    """Build a fake `generate_speaker_note_audios` that hands back canned audio."""
    texts = texts or {0: "Revenue grew a lot this year."}
    os.makedirs(audio_dir, exist_ok=True)
    cache: dict = {}

    async def fake(*, presentation, slides, language, sql_session, voice=None, on_progress=None, **_kwargs):
        audios = []
        skipped = []
        for slide in sorted(slides, key=lambda s: s.index):
            if slide.index in with_audio_for:
                path = os.path.join(audio_dir, f"{slide.id}.mp3")
                if not os.path.exists(path):
                    open(path, "wb").write(b"fake-audio-bytes")
                if slide.id not in cache:
                    cache[slide.id] = _FakeAudio(
                        slide=slide.id,
                        path=path,
                        text=texts.get(slide.index, ""),
                        duration_seconds=4.0,
                        source_note_hash=f"hash-{slide.index}",
                    )
                audios.append(cache[slide.id])
            else:
                skipped.append(
                    {"slide_index": slide.index, "reason": "This slide has no speaker note to read aloud"}
                )
        if on_progress is not None:
            await on_progress(len(audios), max(1, len(audios)))
        return SpeakerNoteAudioGenerationResult(
            language=pvs.resolve_tts_language(language),
            audios=audios,
            generated_slide_indexes=[],
            skipped=skipped,
        )

    return fake


def _fake_export(pdf_path):
    async def fake(presentation_id, title, export_as, cookie_header=None):
        return PresentationAndPath(presentation_id=presentation_id, path=pdf_path)

    return fake


def _fake_render(page_count, prefix="slide"):
    async def fake(pdf_path, output_directory, *, target_height=None, **kwargs):
        pages = []
        for i in range(page_count):
            path = os.path.join(output_directory, f"{prefix}-{i}.png")
            open(path, "wb").write(b"fake-png")
            pages.append(RenderedPage(index=i, path=path, width=1920, height=1080))
        return pages

    return fake


def _fake_run_ffmpeg(calls, duration_holder):
    async def fake(args, *, total_duration_seconds=None, on_progress=None, timeout_seconds=900):
        calls.append(args)
        duration_holder["value"] = total_duration_seconds
        if on_progress is not None:
            await on_progress(
                FFmpegProgress(
                    out_time_seconds=total_duration_seconds or 0.0,
                    fraction=1.0,
                    speed="2x",
                    done=True,
                )
            )
        output_path = args[-1]
        with open(output_path, "wb") as handle:
            handle.write(b"FAKEMP4")
        return FFmpegResult(
            returncode=0, stderr_tail="", duration_seconds_elapsed=total_duration_seconds
        )

    return fake


async def _fake_probe(path):
    size = os.path.getsize(path) if os.path.exists(path) else 0
    return MediaProbe(
        duration_seconds=8.0,
        size_bytes=size,
        format_name="mov,mp4,m4a,3gp,3g2,mj2",
        has_audio=True,
        has_video=True,
        width=1920,
        height=1080,
    )


def _patched(monkeypatch, tmp_path, *, page_count=2, calls=None, duration_holder=None, with_audio_for=(0,)):
    calls = calls if calls is not None else []
    duration_holder = duration_holder if duration_holder is not None else {}
    pdf_path = str(tmp_path / "deck.pdf")
    open(pdf_path, "wb").write(b"%PDF-1.4 fake")
    audio_dir = str(tmp_path / "audio")

    monkeypatch.setattr(pvs, "ffmpeg_available", lambda: True)
    monkeypatch.setattr(
        pvs, "generate_speaker_note_audios", _fake_narration(None, audio_dir, with_audio_for=with_audio_for)
    )
    monkeypatch.setattr(pvs, "export_presentation", _fake_export(pdf_path))
    monkeypatch.setattr(pvs, "render_pdf_to_pngs_async", _fake_render(page_count))
    monkeypatch.setattr(pvs, "run_ffmpeg", _fake_run_ffmpeg(calls, duration_holder))
    monkeypatch.setattr(pvs, "probe_media", _fake_probe)

    async def fake_media_duration(path):
        return 4.0

    monkeypatch.setattr(pvs, "media_duration_seconds", fake_media_duration)
    return calls, duration_holder


def test_full_pipeline_renders_and_persists(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            return await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
            )

    result = asyncio.run(scenario())
    assert result.reused is False
    assert os.path.isfile(result.video.path)
    assert result.video.url.startswith("/app_data/videos/")
    assert result.video.subtitle_path is not None
    assert os.path.isfile(result.video.subtitle_path)
    assert [entry["slide_index"] for entry in result.skipped] == [1]
    assert len(calls) == 1


@pytest.mark.parametrize(
    "narration, expected",
    [
        (None, (1160.0, 600.0, 96.0, 96.0)),
        (
            {"bubble": {"position": {"x": 40, "y": 40}, "size": {"width": 120, "height": 120}}},
            (40.0, 40.0, 120.0, 120.0),
        ),
    ],
    ids=["default-bottom-right", "stored-box"],
)
def test_bubble_is_drawn_at_the_decks_bubble_box(tmp_path, monkeypatch, narration, expected):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    _patched(monkeypatch, tmp_path)
    boxes = []
    real_write = pvs.write_speaker_indicator_frames

    def capture(directory, *, box, **kwargs):
        boxes.append(box)
        return real_write(directory, box=box, **kwargs)

    monkeypatch.setattr(pvs, "write_speaker_indicator_frames", capture)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            if narration is not None:
                presentation.narration = narration
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            return await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
            )

    asyncio.run(scenario())
    assert boxes == [expected]


def test_ffmpeg_not_available_raises_configuration_error(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    monkeypatch.setattr(pvs, "ffmpeg_available", lambda: False)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            await generate_presentation_video(
                presentation=presentation, slides=slides, language="en", sql_session=session
            )

    with pytest.raises(PresentationVideoConfigurationError):
        asyncio.run(scenario())


def test_unsupported_language_raises_before_any_work(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            await generate_presentation_video(
                presentation=presentation, slides=slides, language="Klingon", sql_session=session
            )

    with pytest.raises(UnsupportedTTSLanguageError):
        asyncio.run(scenario())
    assert calls == []


def test_page_count_mismatch_raises_render_error(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path, page_count=99)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            await generate_presentation_video(
                presentation=presentation, slides=slides, language="en", sql_session=session
            )

    with pytest.raises(PresentationVideoRenderError) as excinfo:
        asyncio.run(scenario())
    assert "99" in str(excinfo.value)
    assert "2" in str(excinfo.value)
    assert calls == []


def test_reused_when_fresh_and_regenerate_forces_rebuild(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            first = await generate_presentation_video(
                presentation=presentation, slides=slides, language="en", sql_session=session
            )
            second = await generate_presentation_video(
                presentation=presentation, slides=slides, language="en", sql_session=session
            )
            third = await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
                regenerate=True,
            )
            return first, second, third

    first, second, third = asyncio.run(scenario())
    assert first.reused is False
    assert second.reused is True
    assert second.video.id == first.video.id
    assert third.reused is False
    assert len(calls) == 2  # first render + forced regenerate; second was a no-op


def test_on_progress_receives_all_phases_and_survives_raising_callback(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    phases_seen = []

    def flaky_on_progress(event):
        phases_seen.append(event["phase"])
        raise RuntimeError("boom")

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            return await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
                on_progress=flaky_on_progress,
            )

    result = asyncio.run(scenario())
    assert result.reused is False
    assert "narration" in phases_seen
    assert "render" in phases_seen
    assert "encode" in phases_seen


def test_delete_removes_rows_and_files(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    _patched(monkeypatch, tmp_path)

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            result = await generate_presentation_video(
                presentation=presentation, slides=slides, language="en", sql_session=session
            )
            paths_before = await presentation_video_paths(
                session, presentation_id=deck.presentation_id
            )
            deleted = await delete_presentation_videos(
                session, presentation_id=deck.presentation_id
            )
            remaining = (
                await session.scalars(
                    select(PresentationVideoModel).where(
                        PresentationVideoModel.presentation == deck.presentation_id
                    )
                )
            ).all()
            return result, paths_before, deleted, remaining

    result, paths_before, deleted, remaining = asyncio.run(scenario())
    assert result.video.path in paths_before
    assert deleted == 1
    assert list(remaining) == []
    assert not os.path.exists(result.video.path)
    if result.video.subtitle_path:
        assert not os.path.exists(result.video.subtitle_path)


# ---------------------------------------------------------------------------
# Animated videos (HyperFrames), with the renderer and LLM mocked
# ---------------------------------------------------------------------------

from services.presentation_video_service import (  # noqa: E402
    AnimatedSegment,
    build_animated_ffmpeg_args,
    build_composition_slides,
    plan_animated_segments,
)
from utils.hyperframes_runner import HyperFramesRenderError  # noqa: E402
from utils.llm_calls.generate_slide_animations import SlideTween  # noqa: E402


def test_animate_changes_preset_and_source_hash():
    still = VideoRenderOptions()
    animated = VideoRenderOptions(animate=True)
    assert animated.preset == f"{still.preset}-anim"
    timings = [_timing()]
    assert compute_video_source_hash(
        timings=timings, language_code="en", options=still
    ) != compute_video_source_hash(
        timings=timings, language_code="en", options=animated
    )


def test_plan_animated_segments_aligns_to_cumulative_frames():
    timings = [
        _timing(slide_index=0, start_seconds=0.0, duration_seconds=3.333),
        _timing(slide_index=1, start_seconds=3.333, duration_seconds=3.333),
        _timing(slide_index=2, start_seconds=6.666, duration_seconds=0.1),
    ]
    segments = plan_animated_segments(timings, [1.0, None, 2.0], 30)

    assert [s.output_start_frame for s in segments] == [0, 100, 200]
    assert sum(s.frames for s in segments) == round(6.766 * 30)
    # Entrance plus the settle time, rounded up to whole frames.
    assert segments[0].clip_frames == 39
    # A still slide needs a single clip frame.
    assert segments[1].clip_frames == 1
    # An entrance never outlasts the slide's own time on screen.
    assert segments[2].clip_frames == segments[2].frames == 3
    assert [s.clip_start_frame for s in segments] == [0, 39, 40]


def test_composition_slots_open_half_a_frame_early():
    segments = [
        AnimatedSegment(slide_index=0, output_start_frame=0, frames=90, clip_start_frame=0, clip_frames=30),
        AnimatedSegment(slide_index=1, output_start_frame=90, frames=60, clip_start_frame=30, clip_frames=1),
    ]
    tween = SlideTween(target="e0", from_values={"opacity": 0.0}, duration=0.5, delay=0.2, ease="power2.out")
    slides = build_composition_slides(segments, ["<p>a</p>", "<p>b</p>"], [[tween], []], 30)

    assert slides[0].start_seconds == 0.0
    assert slides[0].duration_seconds == pytest.approx(29.5 / 30)
    assert slides[1].start_seconds == pytest.approx(29.5 / 30)
    assert slides[1].duration_seconds == pytest.approx(1 / 30)
    assert slides[1].anchor_seconds == pytest.approx(1.0)


def test_build_animated_ffmpeg_args_reads_each_slide_and_holds_its_last_frame():
    timings = [
        _timing(slide_index=0, audio_path="/tmp/a0.mp3", start_seconds=0.0, duration_seconds=3.0),
        _timing(slide_index=1, audio_path=None, start_seconds=3.0, duration_seconds=2.0),
    ]
    segments = plan_animated_segments(timings, [1.0, None], 30)
    args = build_animated_ffmpeg_args(
        clip_path="/tmp/clip.mp4",
        segments=segments,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(crossfade_seconds=0, subtitles_mode="none", animate=True),
        language_code="en",
        output_path="/tmp/out.mp4",
    )

    # One seeked clip input per slide, half a frame before its first frame.
    assert args[:6] == ["-ss", "0.000000", "-t", f"{40 / 30:.6f}", "-i", "/tmp/clip.mp4"]
    assert args[6:12] == ["-ss", f"{38.5 / 30:.6f}", "-t", f"{2 / 30:.6f}", "-i", "/tmp/clip.mp4"]
    assert args.count("-i") == 2 + 2
    graph = args[args.index("-filter_complex") + 1].split(";")
    # Slide 0: 39 clip frames, held for the other 51; slide 1: 1 frame + 59.
    # No retiming between the cut and tpad: ffmpeg 7 then pads nothing.
    assert graph[0] == "[0:v]trim=end_frame=39,format=yuv420p,tpad=stop_mode=clone:stop=51[v0]"
    assert graph[1] == "[1:v]trim=end_frame=1,format=yuv420p,tpad=stop_mode=clone:stop=59[v1]"
    assert graph[2] == "[v0][v1]concat=n=2:v=1:a=0,setpts=N/30/TB,fps=fps=30[vout]"
    assert graph[3].startswith("[2:a]adelay=")
    # The output cap is the last `-t`; earlier ones belong to inputs.
    assert args[len(args) - 1 - args[::-1].index("-t") + 1] == "5.000"


def test_build_animated_ffmpeg_args_burns_or_maps_subtitles():
    timings = [_timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0)]
    segments = plan_animated_segments(timings, [1.0], 30)
    burned = build_animated_ffmpeg_args(
        clip_path="/tmp/clip.mp4",
        segments=segments,
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(subtitles_mode="burned", animate=True),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert "subtitles='/tmp/subs.vtt'" in burned[burned.index("-filter_complex") + 1]
    assert "/tmp/subs.vtt" not in burned[: burned.index("-filter_complex")]

    soft = build_animated_ffmpeg_args(
        clip_path="/tmp/clip.mp4",
        segments=segments,
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(subtitles_mode="soft", animate=True),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    assert "2:s:0" in soft
    assert "mov_text" in soft


def _patched_animation(monkeypatch, tmp_path, deck, *, html_for=(0, 1), render_error=None):
    """Mock everything the animated render reaches outside this process."""
    gsap = tmp_path / "gsap.min.js"
    gsap.write_text("/* gsap */")
    state = {"llm_calls": 0, "projects": [], "exports": 0}

    async def fake_fetch(presentation_id, cookie_header):
        return {
            "width": 1280,
            "height": 720,
            "chart_scripts": None,
            "slides": [
                {
                    "id": str(slide_id),
                    "index": index,
                    "html": (
                        f'<div data-hf-el="e0" data-hf-kind="text"><p>Slide {index}</p></div>'
                        if index in html_for
                        else None
                    ),
                    "elements": (
                        [{"id": "e0", "kind": "text", "box": {"x": 10, "y": 10, "width": 300, "height": 60}, "text": f"Slide {index}"}]
                        if index in html_for
                        else []
                    ),
                }
                for index, slide_id in enumerate(deck.slide_ids)
            ],
        }

    async def fake_plans(*, slides, slide_count, deck_title, **_kwargs):
        state["llm_calls"] += 1
        return {
            index: [SlideTween(target="e0", from_values={"opacity": 0.0, "y": 30.0}, duration=0.6, delay=0.1, ease="power2.out")]
            for index, _ in slides
        }

    async def fake_render(project_dir, output_path, *, fps, on_progress=None):
        state["projects"].append(open(os.path.join(project_dir, "index.html")).read())
        state["stills"] = sorted(os.listdir(os.path.join(project_dir, "stills"))) if os.path.isdir(os.path.join(project_dir, "stills")) else []
        if render_error is not None:
            raise render_error
        if on_progress is not None:
            await on_progress(100, "done")
        open(output_path, "wb").write(b"CLIP")

    original_export = pvs.export_presentation

    async def counting_export(*args, **kwargs):
        state["exports"] += 1
        return await original_export(*args, **kwargs)

    monkeypatch.setattr(pvs, "export_presentation", counting_export)
    monkeypatch.setattr(pvs, "hyperframes_available", lambda: True)
    monkeypatch.setattr(pvs, "gsap_script_path", lambda: gsap)
    monkeypatch.setattr(pvs, "_fetch_video_composition", fake_fetch)
    monkeypatch.setattr(pvs, "generate_slide_animations", fake_plans)
    monkeypatch.setattr(pvs, "render_hyperframes_project", fake_render)
    return state


def _run_animated(deck, *, regenerate=False):
    async def scenario():
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            return await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
                options=VideoRenderOptions(crossfade_seconds=0, animate=True),
                regenerate=regenerate,
            )

    return asyncio.run(scenario())


def test_animated_pipeline_renders_clip_and_caches_plans(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)
    state = _patched_animation(monkeypatch, tmp_path, deck)
    asyncio.run(deck.seed())

    result = _run_animated(deck)

    assert result.animation == {"requested": True, "applied": True, "animated_slides": 2}
    assert result.video.preset.endswith("-anim-cut")
    # Every slide is animated, so the PDF export is never needed.
    assert state["exports"] == 0
    assert state["llm_calls"] == 1
    project = state["projects"][0]
    assert 'data-hf-el="s0-e0"' in project and 'data-hf-el="s1-e0"' in project
    assert '"sel":"[data-hf-el=\\"s0-e0\\"]"' in project
    args = calls[0]
    assert args[5].endswith("animated.mp4")
    assert "tpad=stop_mode=clone" in args[args.index("-filter_complex") + 1]

    paths = asyncio.run(_paths(deck))
    assert any(path.endswith("animation-plans.json") for path in paths)

    # A forced re-render reuses the cached plans instead of asking again.
    _run_animated(deck, regenerate=True)
    assert state["llm_calls"] == 1


async def _paths(deck):
    async with deck.session_maker() as session:
        return await presentation_video_paths(session, presentation_id=deck.presentation_id)


def test_animated_pipeline_places_other_slides_as_stills(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    _patched(monkeypatch, tmp_path)
    state = _patched_animation(monkeypatch, tmp_path, deck, html_for=(0,))
    asyncio.run(deck.seed())

    result = _run_animated(deck)

    assert result.animation["animated_slides"] == 1
    assert state["exports"] == 1
    assert state["stills"] == ["slide-1.png"]
    assert 'src="stills/slide-1.png"' in state["projects"][0]


def test_animated_render_failure_falls_back_to_stills_and_retries(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)
    _patched_animation(
        monkeypatch, tmp_path, deck, render_error=HyperFramesRenderError("chrome crashed")
    )
    asyncio.run(deck.seed())

    first = _run_animated(deck)
    assert first.animation["applied"] is False
    assert "chrome crashed" in first.animation["reason"]
    assert first.video.source_hash.endswith(":stills")
    assert calls[0][:4] == ["-f", "concat", "-safe", "0"]

    # The still fallback is never served as the animated video.
    second = _run_animated(deck)
    assert second.reused is False


@pytest.mark.skipif(not pvs.ffmpeg_available(), reason="needs a real ffmpeg")
def test_animated_encode_holds_every_slide_for_its_narration_with_real_ffmpeg(tmp_path):
    """Run the real filter graph: every slide must last as long as its audio.

    Guards the ffmpeg 7 regression where retiming before `tpad` made every
    hold vanish, so the video was only the entrances back to back.
    """
    import subprocess

    from utils.ffmpeg_utils import get_ffmpeg_binary, get_ffprobe_binary, run_ffmpeg

    fps = 30
    timings = [
        _timing(slide_index=0, audio_path=None, start_seconds=0.0, duration_seconds=4.0),
        _timing(slide_index=1, audio_path=None, start_seconds=4.0, duration_seconds=4.0),
        _timing(slide_index=2, audio_path=None, start_seconds=8.0, duration_seconds=2.0),
    ]
    segments = plan_animated_segments(timings, [0.8, 1.0, None], fps)
    clip_frames = sum(segment.clip_frames for segment in segments)
    clip = str(tmp_path / "clip.mp4")
    subprocess.run(
        [
            get_ffmpeg_binary(), "-v", "error", "-y", "-f", "lavfi",
            "-i", f"testsrc=size=320x180:rate={fps}",
            "-frames:v", str(clip_frames), "-pix_fmt", "yuv420p", clip,
        ],
        check=True,
    )
    output = str(tmp_path / "out.mp4")
    args = build_animated_ffmpeg_args(
        clip_path=clip,
        segments=segments,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", animate=True),
        language_code="en",
        output_path=output,
    )
    asyncio.run(run_ffmpeg(args, total_duration_seconds=10.0))

    probe = subprocess.run(
        [
            get_ffprobe_binary(), "-v", "error", "-select_streams", "v:0",
            "-count_frames", "-show_entries", "stream=nb_read_frames,r_frame_rate",
            "-of", "csv=p=0", output,
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    frame_rate, frames = probe.split(",")
    assert frame_rate == f"{fps}/1"
    assert int(frames) == sum(segment.frames for segment in segments) == 300


def test_speaker_indicator_is_on_by_default_and_part_of_the_cache_key():
    plain = VideoRenderOptions(speaker_indicator=False)
    assert VideoRenderOptions().preset == "1080p-30-soft"
    assert plain.preset == "1080p-30-soft-plain"
    assert compute_video_source_hash(
        timings=[_timing()], language_code="en", options=VideoRenderOptions()
    ) != compute_video_source_hash(timings=[_timing()], language_code="en", options=plain)


def _indicator(tmp_path):
    from utils.speaker_indicator import write_speaker_indicator_frames

    return write_speaker_indicator_frames(
        str(tmp_path / "ind"), box=(1160, 600, 96, 96), width=1920, height=1080, fps=30
    )


def test_build_ffmpeg_args_overlays_indicator_under_burned_subtitles(tmp_path):
    timings = [
        _timing(audio_path="/tmp/a0.mp3", duration_seconds=3.0),
        _timing(audio_path=None, start_seconds=3.0, duration_seconds=2.0),
    ]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png", "/tmp/s1.png"],
        timings=timings,
        vtt_path="/tmp/subs.vtt",
        options=VideoRenderOptions(crossfade_seconds=0, subtitles_mode="burned"),
        language_code="en",
        output_path="/tmp/out.mp4",
        speaker_indicator=_indicator(tmp_path),
    )
    # Two slide images, two audio inputs, then the bubble last.
    assert args.count("-i") == 5
    assert args[args.index("image2") + 2 : args.index("image2") + 3] == ["1"]
    graph = args[args.index("-filter_complex") + 1].split(";")
    assert graph[0].endswith("format=yuv420p[vbase]")
    # The bubble is cut to the narrated slide and placed at its start.
    assert graph[1] == "[4:v]format=rgba,trim=end_frame=90,setpts=N/30/TB+0.000000/TB[actor0]"
    assert graph[2].startswith("[vbase][actor0]overlay=")
    assert graph[3] == "[ov0]format=yuv420p[vact]"
    assert graph[4] == "[vact]subtitles='/tmp/subs.vtt'[vout]"


def test_no_indicator_input_when_no_slide_is_narrated(tmp_path):
    timings = [_timing(audio_path=None, duration_seconds=3.0)]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/s0.png"],
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none"),
        language_code="en",
        output_path="/tmp/out.mp4",
        speaker_indicator=_indicator(tmp_path),
    )
    assert "image2" not in args
    assert args[args.index("-filter_complex") + 1].split(";")[0].endswith("[vout]")


@pytest.mark.skipif(not pvs.ffmpeg_available(), reason="needs a real ffmpeg")
def test_animated_encode_shows_indicator_only_on_narrated_slides_with_real_ffmpeg(tmp_path):
    import subprocess

    from PIL import Image

    from utils.ffmpeg_utils import get_ffmpeg_binary, run_ffmpeg

    fps = 30
    ffmpeg = get_ffmpeg_binary()
    voice = str(tmp_path / "voice.wav")
    subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", voice],
        check=True,
    )
    timings = [
        _timing(slide_index=0, audio_path=voice, start_seconds=0.0, duration_seconds=4.0),
        _timing(slide_index=1, audio_path=None, start_seconds=4.0, duration_seconds=2.0),
    ]
    segments = plan_animated_segments(timings, [0.5, None], fps)
    clip = str(tmp_path / "clip.mp4")
    subprocess.run(
        [
            ffmpeg, "-v", "error", "-y", "-f", "lavfi",
            "-i", f"color=c=white:size=1920x1080:rate={fps}",
            "-frames:v", str(sum(s.clip_frames for s in segments)), "-pix_fmt", "yuv420p", clip,
        ],
        check=True,
    )
    indicator = _indicator(tmp_path)
    output = str(tmp_path / "out.mp4")
    args = build_animated_ffmpeg_args(
        clip_path=clip,
        segments=segments,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", animate=True),
        language_code="en",
        output_path=output,
        speaker_indicator=indicator,
    )
    asyncio.run(run_ffmpeg(args, total_duration_seconds=6.0))

    centre = (indicator.x + indicator.size // 2, indicator.y + indicator.size // 2)
    for second, narrated in ((2.0, True), (5.0, False)):
        still = str(tmp_path / f"at-{second}.png")
        subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-ss", str(second), "-i", output, "-frames:v", "1", still],
            check=True,
        )
        red, green, blue = Image.open(still).convert("RGB").getpixel(centre)
        # Slide background is white; the bubble is dark with white bars, so
        # sample just off-centre between bars.
        ring = Image.open(still).convert("RGB").getpixel((centre[0], centre[1] - indicator.size // 3))
        assert (sum(ring) < 300) is narrated, (second, ring, (red, green, blue))


def test_crossfade_presets():
    assert VideoRenderOptions().preset == "1080p-30-soft"
    assert VideoRenderOptions(crossfade_seconds=0).preset == "1080p-30-soft-cut"
    assert VideoRenderOptions(crossfade_seconds=1.0).preset == "1080p-30-soft-xf1000"


@pytest.mark.parametrize("value", [-0.1, 1.6])
def test_options_reject_crossfade_out_of_range(value):
    with pytest.raises(ValueError, match="crossfade_seconds must be between 0 and 1.5"):
        VideoRenderOptions(crossfade_seconds=value)


def test_source_hash_changes_when_crossfade_changes():
    def source_hash(crossfade):
        return compute_video_source_hash(
            timings=[_timing()],
            language_code="en",
            options=VideoRenderOptions(crossfade_seconds=crossfade),
        )

    assert source_hash(0.5) != source_hash(0.75)


def _two_slides():
    return [
        _timing(slide_index=0, duration_seconds=3.0),
        _timing(slide_index=1, page_index=1, start_seconds=3.0, duration_seconds=2.0),
    ]


def _filter_graph(args):
    return args[args.index("-filter_complex") + 1]


def test_build_ffmpeg_args_with_crossfade_loops_each_slide_and_chains_xfade():
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/0.png", "/tmp/1.png"],
        timings=_two_slides(),
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none"),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    graph = _filter_graph(args)

    assert "concat" not in args
    assert args.count("-loop") == 2
    # 90 frames + 8 cloned after; 8 cloned before + 60 frames.
    assert "[0:v]format=yuv420p,fps=fps=30,trim=end_frame=98" in graph
    assert "[1:v]format=yuv420p,fps=fps=30,trim=end_frame=68" in graph
    assert "xfade=transition=fade:duration=0.533333:offset=2.733333" in graph


def test_build_ffmpeg_args_without_crossfade_keeps_the_concat_path():
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/0.png", "/tmp/1.png"],
        timings=_two_slides(),
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", crossfade_seconds=0),
        language_code="en",
        output_path="/tmp/out.mp4",
    )

    assert args[:4] == ["-f", "concat", "-safe", "0"]
    assert "xfade" not in _filter_graph(args)


def test_build_animated_ffmpeg_args_pads_segments_for_crossfade():
    timings = [
        _timing(slide_index=0, duration_seconds=3.0),
        _timing(slide_index=1, start_seconds=3.0, duration_seconds=4.0),
    ]
    args = build_animated_ffmpeg_args(
        clip_path="/tmp/clip.mp4",
        segments=plan_animated_segments(timings, [1.0, None], 30),
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", animate=True),
        language_code="en",
        output_path="/tmp/out.mp4",
    )
    parts = _filter_graph(args).split(";")
    slide_parts = [part for part in parts if part.startswith(("[0:v]", "[1:v]"))]

    assert "tpad=start=8:start_mode=clone:stop=119:stop_mode=clone" in slide_parts[1]
    for part in slide_parts:
        # ffmpeg 7.x pads nothing when frames are retimed between trim and tpad.
        assert part.index("trim") < part.index("tpad") < part.index("setpts")
    assert any("xfade=transition=fade" in part for part in parts)


def _probe_frames(path):
    import subprocess

    from utils.ffmpeg_utils import get_ffprobe_binary

    return int(
        subprocess.run(
            [
                get_ffprobe_binary(), "-v", "error", "-select_streams", "v:0",
                "-count_frames", "-show_entries", "stream=nb_read_frames",
                "-of", "csv=p=0", path,
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    )


@pytest.mark.skipif(not pvs.ffmpeg_available(), reason="needs a real ffmpeg")
def test_crossfaded_still_video_keeps_the_narration_length_with_real_ffmpeg(tmp_path):
    import subprocess

    from utils.ffmpeg_utils import get_ffmpeg_binary, run_ffmpeg

    fps = 30
    timings = [
        _timing(slide_index=0, audio_path=None, start_seconds=0.0, duration_seconds=3.0),
        _timing(slide_index=1, audio_path=None, start_seconds=3.0, duration_seconds=2.0),
        _timing(slide_index=2, audio_path=None, start_seconds=5.0, duration_seconds=0.3),
    ]
    images = []
    for index, color in enumerate(("red", "green", "blue")):
        image = str(tmp_path / f"slide-{index}.png")
        subprocess.run(
            [
                get_ffmpeg_binary(), "-v", "error", "-y", "-f", "lavfi",
                "-i", f"color={color}:size=320x180", "-frames:v", "1", image,
            ],
            check=True,
        )
        images.append(image)
    output = str(tmp_path / "out.mp4")
    args = build_ffmpeg_args(
        concat_path=str(tmp_path / "concat.txt"),
        image_paths=images,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(
            subtitles_mode="none", crossfade_seconds=1.5, min_slide_seconds=0.3
        ),
        language_code="en",
        output_path=output,
    )
    asyncio.run(run_ffmpeg(args, total_duration_seconds=5.3))

    assert abs(_probe_frames(output) - round(5.3 * fps)) <= 1


@pytest.mark.skipif(not pvs.ffmpeg_available(), reason="needs a real ffmpeg")
def test_crossfaded_animated_video_keeps_every_hold_with_real_ffmpeg(tmp_path):
    import subprocess

    from utils.ffmpeg_utils import get_ffmpeg_binary, run_ffmpeg

    fps = 30
    timings = [
        _timing(slide_index=0, audio_path=None, start_seconds=0.0, duration_seconds=4.0),
        _timing(slide_index=1, audio_path=None, start_seconds=4.0, duration_seconds=4.0),
        _timing(slide_index=2, audio_path=None, start_seconds=8.0, duration_seconds=2.0),
    ]
    segments = plan_animated_segments(timings, [0.8, 1.0, None], fps)
    clip = str(tmp_path / "clip.mp4")
    subprocess.run(
        [
            get_ffmpeg_binary(), "-v", "error", "-y", "-f", "lavfi",
            "-i", f"testsrc=size=320x180:rate={fps}",
            "-frames:v", str(sum(segment.clip_frames for segment in segments)),
            "-pix_fmt", "yuv420p", clip,
        ],
        check=True,
    )
    output = str(tmp_path / "out.mp4")
    args = build_animated_ffmpeg_args(
        clip_path=clip,
        segments=segments,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", animate=True),
        language_code="en",
        output_path=output,
    )
    asyncio.run(run_ffmpeg(args, total_duration_seconds=10.0))

    assert abs(_probe_frames(output) - 300) <= 1


def test_avatars_are_on_by_default_and_off_changes_the_preset():
    assert VideoRenderOptions().avatars is True
    assert VideoRenderOptions(avatars=False).preset == "1080p-30-soft-noavatar"


def _avatar_timing(**overrides):
    base = dict(
        slide_index=1,
        page_index=1,
        audio_path="/tmp/a1.mp3",
        start_seconds=3.0,
        duration_seconds=4.0,
        actor="video",
        avatar_id=uuid.UUID(int=9),
        avatar_path="/tmp/avatar.mp4",
        avatar_box=(1000.0, 400.0, 240.0, 400.0),
        avatar_fit="fill",
    )
    base.update(overrides)
    return _timing(**base)


def test_avatar_slide_keeps_tts_audio_and_shows_no_bubble(tmp_path):
    timings = [
        _timing(audio_path="/tmp/a0.mp3", actor="voice", duration_seconds=3.0),
        _avatar_timing(),
    ]
    args = build_ffmpeg_args(
        concat_path="/tmp/concat.txt",
        image_paths=["/tmp/0.png", "/tmp/1.png"],
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(subtitles_mode="none", crossfade_seconds=0),
        language_code="en",
        output_path="/tmp/out.mp4",
        speaker_indicator=_indicator(tmp_path),
    )
    graph = _filter_graph(args)

    assert "/tmp/a0.mp3" in args and "/tmp/a1.mp3" in args
    assert args[args.index("/tmp/avatar.mp4") - 2] == "-an"
    # One bubble, cut to slide 0 alone.
    assert args.count("image2") == 1
    assert args[args.index("image2") + 6] == "3.000000"
    assert "overlay=x=1500:y=600:eof_action=pass" in graph


def _source_hash(timings, **kwargs):
    return compute_video_source_hash(
        timings=timings, language_code="en", options=VideoRenderOptions(), **kwargs
    )


def test_source_hash_changes_when_avatar_is_replaced():
    from datetime import datetime

    assert _source_hash([_avatar_timing(avatar_updated_at=datetime(2026, 1, 1))]) != (
        _source_hash([_avatar_timing(avatar_updated_at=datetime(2026, 1, 2))])
    )


def test_source_hash_changes_when_placeholder_moves():
    assert _source_hash([_avatar_timing()]) != _source_hash(
        [_avatar_timing(avatar_box=(10.0, 400.0, 240.0, 400.0))]
    )


def test_source_hash_changes_when_bubble_box_moves():
    assert _source_hash([_timing()], bubble_box=(1160.0, 600.0, 96.0, 96.0)) != (
        _source_hash([_timing()], bubble_box=(40.0, 40.0, 96.0, 96.0))
    )


async def _add_avatars(deck, tmp_path, rows):
    from services.speaker_note_tts_service import note_digest

    async with deck.session_maker() as session:
        for index, (note, language, seconds) in rows.items():
            path = str(tmp_path / f"avatar-{index}.mp4")
            open(path, "wb").write(b"fake-video")
            session.add(
                SlideVideoModel(
                    presentation=deck.presentation_id,
                    slide=deck.slide_ids[index],
                    source_note_hash=note_digest(note),
                    path=path,
                    url=f"/app_data/videos/avatar-{index}.mp4",
                    format="mp4",
                    mime_type="video/mp4",
                    duration_seconds=seconds,
                    width=720,
                    height=1280,
                    language=language,
                )
            )
        await session.commit()


def _run_with_avatars(deck, tmp_path, rows, **options):
    async def scenario():
        await deck.seed()
        await _add_avatars(deck, tmp_path, rows)
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [await session.get(SlideModel, sid) for sid in deck.slide_ids]
            return await generate_presentation_video(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
                options=VideoRenderOptions(**options),
            )

    return asyncio.run(scenario())


# Slide 0's avatar was made from an older note and runs a second longer than
# its 4 s narration; slide 1's was synced to Italian narration.
_AVATARS = {0: ("An older note.", None, 5.0), 1: ("", "it", 2.0)}


def test_response_reports_stale_skipped_and_mismatched_avatars(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    result = _run_with_avatars(deck, tmp_path, _AVATARS)

    assert result.avatars == {
        "requested": True,
        "applied_slides": [0],
        "stale": [{"slide_index": 0, "reason": "note_changed"}],
        "skipped": [{"slide_index": 1, "reason": "language"}],
        "duration_mismatch": [
            {"slide_index": 0, "video_seconds": 5.0, "audio_seconds": 4.0}
        ],
    }
    args = calls[0]
    assert args[args.index(str(tmp_path / "avatar-0.mp4")) - 2] == "-an"
    assert str(tmp_path / "avatar-1.mp4") not in args


def test_avatars_false_falls_back_to_the_bubble(tmp_path, monkeypatch):
    _make_env(tmp_path, monkeypatch)
    deck = _Deck(tmp_path)
    calls, _ = _patched(monkeypatch, tmp_path)

    result = _run_with_avatars(deck, tmp_path, _AVATARS, avatars=False)

    assert result.video.preset.endswith("-noavatar")
    assert result.avatars["applied_slides"] == []
    assert result.avatars["skipped"] == [
        {"slide_index": 0, "reason": "disabled"},
        {"slide_index": 1, "reason": "disabled"},
    ]
    assert "-an" not in calls[0]
    assert "image2" in calls[0]


@pytest.mark.skipif(not pvs.ffmpeg_available(), reason="needs a real ffmpeg")
def test_avatar_appears_in_its_box_only_on_its_slide_with_real_ffmpeg(tmp_path):
    import subprocess

    from PIL import Image

    from utils.ffmpeg_utils import get_ffmpeg_binary, run_ffmpeg

    ffmpeg = get_ffmpeg_binary()
    images = []
    for index in range(3):
        image = str(tmp_path / f"slide-{index}.png")
        subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "color=white:size=1280x720",
             "-frames:v", "1", image],
            check=True,
        )
        images.append(image)
    avatar = str(tmp_path / "avatar.mp4")
    subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=240x400:r=30:d=1",
         "-pix_fmt", "yuv420p", avatar],
        check=True,
    )
    timings = [
        _timing(slide_index=0, audio_path=None, actor="none", start_seconds=0.0, duration_seconds=2.0),
        _avatar_timing(
            audio_path=None, start_seconds=2.0, duration_seconds=2.0, avatar_path=avatar,
            avatar_box=(1000.0, 300.0, 240.0, 400.0),
        ),
        _timing(slide_index=2, audio_path=None, actor="none", start_seconds=4.0, duration_seconds=2.0),
    ]
    output = str(tmp_path / "out.mp4")
    concat = str(tmp_path / "concat.txt")
    pvs._write_concat_file([SimpleNamespace(path=image) for image in images], timings, concat)
    args = build_ffmpeg_args(
        concat_path=concat,
        image_paths=images,
        timings=timings,
        vtt_path=None,
        options=VideoRenderOptions(resolution="720p", subtitles_mode="none", crossfade_seconds=0),
        language_code="en",
        output_path=output,
    )
    asyncio.run(run_ffmpeg(args, total_duration_seconds=6.0))

    def pixel(second):
        still = str(tmp_path / f"at-{second}.png")
        subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-ss", str(second), "-i", output,
             "-frames:v", "1", still],
            check=True,
        )
        return Image.open(still).convert("RGB").getpixel((1120, 500))

    def is_red(rgb):
        red, green, blue = rgb
        return red > 180 and green < 80 and blue < 80

    assert not is_red(pixel(1.0))
    assert is_red(pixel(3.0))
    # The 1 s avatar ended at 3.4 s; its last frame holds to the slide's end.
    assert is_red(pixel(3.9))
    assert not is_red(pixel(5.5))
