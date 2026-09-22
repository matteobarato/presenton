import asyncio
import os
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import services.speaker_note_tts_service as tts_service
from constants.tts_languages import UnsupportedTTSLanguageError
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
# Imported so the owner_id foreign keys can resolve their column type.
from models.sql.user import User  # noqa: F401
from services.speaker_note_tts_service import (
    SpeakerNoteTTSConfigurationError,
    delete_speaker_note_audios,
    generate_speaker_note_audios,
    get_speaker_note_tts_config,
    list_speaker_note_audios,
    mp3_duration_seconds,
)

# MPEG 1 Layer III, 128 kbps, 44100 Hz, no padding: 417 bytes per frame,
# 1152 samples per frame.
MP3_FRAME = b"\xff\xfb\x90\x00" + b"\x00" * 413


def _mp3(frames: int = 8) -> bytes:
    return MP3_FRAME * frames


def _configure_tts(monkeypatch):
    monkeypatch.setenv("OPENAI_COMPAT_TTS_BASE_URL", "https://tts.example/v1")
    monkeypatch.setenv("OPENAI_COMPAT_TTS_API_KEY", "test-key")
    monkeypatch.setenv(
        "OPENAI_COMPAT_TTS_MODEL", "google/gemini-3.1-flash-tts-preview"
    )
    monkeypatch.delenv("OPENAI_COMPAT_TTS_VOICE", raising=False)


class _Deck:
    """A two-slide deck on its own SQLite database."""

    def __init__(self, tmp_path, language="English"):
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{tmp_path / 'tts.db'}"
        )
        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)
        self.presentation_id = uuid.uuid4()
        self.slide_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        self.language = language

    async def seed(self):
        async with self.engine.begin() as connection:
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)
            await connection.run_sync(SpeakerNoteAudioModel.__table__.create)
        async with self.session_maker() as session:
            session.add(
                PresentationModel(
                    id=self.presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Annual review",
                    n_slides=3,
                    language=self.language,
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
                    speaker_note="Revenue grew thirty four percent this year.",
                )
            )
            session.add(
                SlideModel(
                    id=self.slide_ids[1],
                    presentation=self.presentation_id,
                    layout_group="general",
                    layout="bulleted-list",
                    index=1,
                    content={"title": "Next steps"},
                    speaker_note="We are hiring eight engineers next quarter.",
                )
            )
            session.add(
                SlideModel(
                    id=self.slide_ids[2],
                    presentation=self.presentation_id,
                    layout_group="general",
                    layout="blank",
                    index=2,
                    content={"title": "Thanks"},
                    speaker_note="",
                )
            )
            await session.commit()


async def _run(tmp_path, monkeypatch, *, language, deck_language="English", **kwargs):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    _configure_tts(monkeypatch)
    deck = _Deck(tmp_path, language=deck_language)
    await deck.seed()
    async with deck.session_maker() as session:
        presentation = await session.get(PresentationModel, deck.presentation_id)
        slides = [
            await session.get(SlideModel, slide_id) for slide_id in deck.slide_ids
        ]
        result = await generate_speaker_note_audios(
            presentation=presentation,
            slides=slides,
            language=language,
            sql_session=session,
            **kwargs,
        )
    return deck, result


def test_missing_configuration_is_reported(monkeypatch):
    monkeypatch.delenv("OPENAI_COMPAT_TTS_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_COMPAT_TTS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_COMPAT_TTS_MODEL", raising=False)
    with pytest.raises(SpeakerNoteTTSConfigurationError):
        get_speaker_note_tts_config()


def test_configuration_prefers_the_requested_voice(monkeypatch):
    _configure_tts(monkeypatch)
    assert get_speaker_note_tts_config().voice == "alloy"
    monkeypatch.setenv("OPENAI_COMPAT_TTS_VOICE", "Kore")
    assert get_speaker_note_tts_config().voice == "Kore"
    assert get_speaker_note_tts_config("Puck").voice == "Puck"


def test_unsupported_language_is_rejected_before_any_synthesis(tmp_path, monkeypatch):
    with patch.object(tts_service, "synthesize_speech") as synthesize:
        with pytest.raises(UnsupportedTTSLanguageError):
            asyncio.run(_run(tmp_path, monkeypatch, language="Klingon"))
    synthesize.assert_not_called()


def test_notes_are_translated_when_the_deck_speaks_another_language(
    tmp_path, monkeypatch
):
    async def fake_translate(*, notes, target_language, **_kwargs):
        assert target_language == "Italian"
        return {index: f"[it] {note}" for index, note in notes.items()}

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()) as synth, \
         patch.object(tts_service, "translate_speaker_notes", side_effect=fake_translate):
        deck, result = asyncio.run(
            _run(tmp_path, monkeypatch, language="Italian", deck_language="English")
        )

    assert result.language.code == "it"
    assert result.generated_slide_indexes == [0, 1]
    # The slide with no note is reported, never synthesized.
    assert [entry["slide_index"] for entry in result.skipped] == [2]
    assert synth.call_count == 2
    spoken = {audio.slide_index: audio for audio in result.audios}
    assert spoken[0].text.startswith("[it] ")
    assert spoken[0].translated is True
    assert spoken[0].language == "it"
    assert spoken[0].duration_seconds == pytest.approx(0.209, abs=0.002)
    assert os.path.isfile(spoken[0].path)
    assert spoken[0].url.startswith("/app_data/audio/")


def test_notes_are_not_translated_when_the_deck_already_speaks_the_language(
    tmp_path, monkeypatch
):
    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()), \
         patch.object(tts_service, "translate_speaker_notes") as translate:
        deck, result = asyncio.run(
            _run(tmp_path, monkeypatch, language="it", deck_language="Italiano")
        )

    translate.assert_not_called()
    assert all(audio.translated is False for audio in result.audios)
    assert result.audios[0].text.startswith("Revenue grew")


def test_a_slide_whose_translation_fails_gets_no_audio(tmp_path, monkeypatch):
    async def partial_translate(*, notes, **_kwargs):
        return {min(notes): "[it] solo questa"}

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()) as synth, \
         patch.object(
             tts_service, "translate_speaker_notes", side_effect=partial_translate
         ):
        _deck, result = asyncio.run(
            _run(tmp_path, monkeypatch, language="Italian", deck_language="English")
        )

    assert synth.call_count == 1
    assert result.generated_slide_indexes == [0]
    reasons = {entry["slide_index"]: entry["reason"] for entry in result.skipped}
    assert "translate" in reasons[1]


def test_a_second_run_reuses_current_audio_and_regenerate_replaces_it(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    _configure_tts(monkeypatch)
    deck = _Deck(tmp_path, language="Italian")

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [
                await session.get(SlideModel, slide_id) for slide_id in deck.slide_ids
            ]
            first = await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
            )
            # Rows are re-read into the same session on every run, so the paths
            # of the first run are snapshotted before a later run updates them.
            first_paths = {audio.slide_index: audio.path for audio in first.audios}
            second = await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
            )
            third = await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
                regenerate=True,
            )
            return first, second, third, first_paths

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()) as synth:
        first, second, third, first_paths = asyncio.run(scenario())

    assert first.generated_slide_indexes == [0, 1]
    assert second.generated_slide_indexes == []
    assert second.reused_slide_indexes == [0, 1]
    assert third.generated_slide_indexes == [0, 1]
    assert synth.call_count == 4

    # Regeneration replaces the file rather than overwriting it, and the stale
    # one is removed so a cached URL cannot serve old narration.
    third_paths = {audio.slide_index: audio.path for audio in third.audios}
    assert first_paths[0] != third_paths[0]
    assert not os.path.exists(first_paths[0])
    assert os.path.isfile(third_paths[0])
    # One row per slide and language, not one per run.
    assert len(third.audios) == 2


def test_an_edited_note_is_read_again_without_being_asked_to(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    _configure_tts(monkeypatch)
    deck = _Deck(tmp_path, language="Italian")

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [
                await session.get(SlideModel, slide_id) for slide_id in deck.slide_ids
            ]
            await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
            )
            slides[1].speaker_note = "Assumeremo dodici ingegneri il prossimo trimestre."
            session.add(slides[1])
            await session.commit()
            return await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
            )

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()):
        result = asyncio.run(scenario())

    assert result.generated_slide_indexes == [1]
    assert result.reused_slide_indexes == [0]


def test_readings_are_listed_in_slide_order_and_can_be_deleted(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    _configure_tts(monkeypatch)
    deck = _Deck(tmp_path, language="Italian")

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [
                await session.get(SlideModel, slide_id) for slide_id in deck.slide_ids
            ]
            await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
                slide_indexes=[1],
            )
            await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
                slide_indexes=[0],
            )
            listed = await list_speaker_note_audios(
                session, presentation_id=deck.presentation_id
            )
            paths = [audio.path for audio in listed]
            deleted = await delete_speaker_note_audios(
                session, presentation_id=deck.presentation_id
            )
            remaining = await list_speaker_note_audios(
                session, presentation_id=deck.presentation_id
            )
            return listed, paths, deleted, remaining

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()):
        listed, paths, deleted, remaining = asyncio.run(scenario())

    assert [audio.slide_index for audio in listed] == [0, 1]
    assert deleted == 2
    assert remaining == []
    assert not any(os.path.exists(path) for path in paths)


def test_a_deck_can_hold_a_reading_per_language(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    _configure_tts(monkeypatch)
    deck = _Deck(tmp_path, language="Italian")

    async def fake_translate(*, notes, **_kwargs):
        return {index: f"[en] {note}" for index, note in notes.items()}

    async def scenario():
        await deck.seed()
        async with deck.session_maker() as session:
            presentation = await session.get(PresentationModel, deck.presentation_id)
            slides = [
                await session.get(SlideModel, slide_id) for slide_id in deck.slide_ids
            ]
            await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="it",
                sql_session=session,
            )
            await generate_speaker_note_audios(
                presentation=presentation,
                slides=slides,
                language="en",
                sql_session=session,
            )
            everything = await list_speaker_note_audios(
                session, presentation_id=deck.presentation_id
            )
            italian = await list_speaker_note_audios(
                session, presentation_id=deck.presentation_id, language="Italian"
            )
            return everything, italian

    with patch.object(tts_service, "synthesize_speech", return_value=_mp3()), \
         patch.object(
             tts_service, "translate_speaker_notes", side_effect=fake_translate
         ):
        everything, italian = asyncio.run(scenario())

    assert len(everything) == 4
    assert {audio.language for audio in everything} == {"it", "en"}
    assert [audio.slide_index for audio in italian] == [0, 1]


@pytest.mark.parametrize("frames", [1, 8, 40])
def test_mp3_duration_is_summed_frame_by_frame(frames):
    assert mp3_duration_seconds(_mp3(frames)) == pytest.approx(
        frames * 1152 / 44100, abs=0.001
    )


def test_mp3_duration_skips_an_id3_tag():
    tag_body = b"\x00" * 32
    tagged = b"ID3\x03\x00\x00" + bytes([0, 0, 0, 32]) + tag_body + _mp3(4)
    assert mp3_duration_seconds(tagged) == pytest.approx(4 * 1152 / 44100, abs=0.001)


@pytest.mark.parametrize("audio", [b"", b"not audio at all", b"\xff\xff\xff\xff"])
def test_mp3_duration_gives_up_rather_than_guessing(audio):
    assert mp3_duration_seconds(audio) is None
