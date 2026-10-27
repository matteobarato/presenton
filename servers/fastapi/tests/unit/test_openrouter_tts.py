import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import services.speaker_note_tts_service as tts_service
from services.speaker_note_tts_service import (
    OPENROUTER_TTS_DEFAULT_BASE_URL,
    SPEAKER_NOTE_TTS_TRANSPORT_SPEECH,
    SpeakerNoteTTSConfigurationError,
    get_speaker_note_tts_config,
    synthesize_speech,
)

_TTS_ENV = (
    "VERTEX_COMPAT_TTS_PROJECT",
    "VERTEX_COMPAT_TTS_LOCATION",
    "VERTEX_COMPAT_TTS_BASE_URL",
    "VERTEX_COMPAT_TTS_API_KEY",
    "VERTEX_COMPAT_TTS_MODEL",
    "VERTEX_COMPAT_TTS_VOICE",
    "OPENAI_COMPAT_TTS_BASE_URL",
    "OPENAI_COMPAT_TTS_API_KEY",
    "OPENAI_COMPAT_TTS_MODEL",
    "OPENAI_COMPAT_TTS_VOICE",
    "OPENAI_COMPAT_TTS_TRANSPORT",
    "OPENAI_COMPAT_TTS_INSTRUCTION",
    "OPENROUTER_TTS_BASE_URL",
    "OPENROUTER_TTS_API_KEY",
    "OPENROUTER_TTS_MODEL",
    "OPENROUTER_TTS_VOICE",
    "OPENROUTER_API_KEY",
)
MODEL = "openai/gpt-4o-mini-tts-2025-12-15"


@pytest.fixture
def clean_env(monkeypatch):
    for name in _TTS_ENV:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_openrouter_is_used_when_its_model_is_set(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    config = get_speaker_note_tts_config()
    assert config.base_url == OPENROUTER_TTS_DEFAULT_BASE_URL
    assert config.api_key == "or-key"
    assert config.model == MODEL
    assert config.voice == "alloy"
    assert config.transport == SPEAKER_NOTE_TTS_TRANSPORT_SPEECH
    assert config.vertex is None


def test_the_text_model_key_is_reused(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_API_KEY", "llm-key")
    assert get_speaker_note_tts_config().api_key == "llm-key"


def test_a_model_without_any_key_is_a_configuration_problem(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    with pytest.raises(SpeakerNoteTTSConfigurationError, match="OPENROUTER_TTS_API_KEY"):
        get_speaker_note_tts_config()


def test_voice_and_base_url_can_be_set(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", "mistralai/voxtral-mini-tts-2603")
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    clean_env.setenv("OPENROUTER_TTS_VOICE", "en_paul_neutral")
    clean_env.setenv("OPENROUTER_TTS_BASE_URL", "https://eu.openrouter.example/api/v1")
    config = get_speaker_note_tts_config()
    assert config.voice == "en_paul_neutral"
    assert config.base_url == "https://eu.openrouter.example/api/v1"
    assert get_speaker_note_tts_config("nova").voice == "nova"


def test_openrouter_wins_over_the_openai_compatible_gateway(clean_env):
    clean_env.setenv("OPENAI_COMPAT_TTS_BASE_URL", "http://bifrost/v1")
    clean_env.setenv("OPENAI_COMPAT_TTS_API_KEY", "gw-key")
    clean_env.setenv("OPENAI_COMPAT_TTS_MODEL", "openrouter/x")
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    assert get_speaker_note_tts_config().base_url == OPENROUTER_TTS_DEFAULT_BASE_URL


def test_vertex_still_wins_over_openrouter(clean_env):
    clean_env.setenv("VERTEX_COMPAT_TTS_MODEL", "gemini-3.1-flash-tts-preview")
    clean_env.setenv("VERTEX_COMPAT_TTS_API_KEY", "express-key")
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    assert get_speaker_note_tts_config().vertex is not None


def test_notes_are_read_through_openrouter_speech_endpoint(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    config = get_speaker_note_tts_config()

    client = MagicMock()
    response = MagicMock()
    response.read = MagicMock(return_value=b"ID3audio")
    response.aread = AsyncMock(return_value=b"ID3audio")
    response.content = b"ID3audio"
    client.audio.speech.create = AsyncMock(return_value=response)
    client.chat.completions.create = AsyncMock()

    with patch.object(tts_service, "AsyncOpenAI", return_value=client) as openai_client:
        audio = asyncio.run(synthesize_speech("Hello there.", config=config))

    assert openai_client.call_args.kwargs == {
        "base_url": OPENROUTER_TTS_DEFAULT_BASE_URL,
        "api_key": "or-key",
    }
    kwargs = client.audio.speech.create.call_args.kwargs
    assert kwargs["model"] == MODEL
    assert kwargs["response_format"] == "mp3"
    assert audio
    client.chat.completions.create.assert_not_called()


GEMINI = "google/gemini-3.1-flash-tts-preview"
PCM = b"\x01\x00\x02\x00" * 100


def _speech_response(content: bytes, content_type: str):
    response = MagicMock()
    response.content = content
    response.response.headers = {"content-type": content_type}
    return response


def _gemini_config(clean_env, **env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", GEMINI)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    clean_env.setenv("OPENROUTER_TTS_VOICE", "Kore")
    for name, value in env.items():
        clean_env.setenv(name, value)
    return get_speaker_note_tts_config()


def test_gemini_models_are_asked_for_pcm(clean_env):
    assert _gemini_config(clean_env).response_format == "pcm"


def test_other_models_are_asked_for_mp3_and_the_format_can_be_forced(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    assert get_speaker_note_tts_config().response_format == "mp3"
    clean_env.setenv("OPENROUTER_TTS_FORMAT", "pcm")
    assert get_speaker_note_tts_config().response_format == "pcm"


def test_raw_pcm_is_stored_as_wav_at_the_rate_it_was_sent(clean_env):
    config = _gemini_config(clean_env)
    client = MagicMock()
    client.audio.speech.create = AsyncMock(
        return_value=_speech_response(PCM, "audio/pcm;rate=24000;channels=1")
    )
    with patch.object(tts_service, "AsyncOpenAI", return_value=client):
        audio = asyncio.run(synthesize_speech("Buongiorno.", config=config))

    assert client.audio.speech.create.call_args.kwargs["response_format"] == "pcm"
    assert client.audio.speech.create.call_args.kwargs["voice"] == "Kore"
    assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"
    assert int.from_bytes(audio[24:28], "little") == 24000
    assert audio.endswith(PCM)
    assert tts_service.detect_audio_format(audio) == "wav"
    assert tts_service.audio_duration_seconds(audio, "wav") == pytest.approx(len(PCM) / 48000, abs=1e-3)


def test_a_provider_that_only_sends_pcm_is_asked_again_for_it(clean_env):
    from openai import BadRequestError
    import httpx

    clean_env.setenv("OPENAI_COMPAT_TTS_BASE_URL", "http://gw/v1")
    clean_env.setenv("OPENAI_COMPAT_TTS_API_KEY", "gw-key")
    clean_env.setenv("OPENAI_COMPAT_TTS_MODEL", GEMINI)
    config = get_speaker_note_tts_config()
    assert config.response_format == "mp3"

    request = httpx.Request("POST", "http://gw/v1/audio/speech")
    refusal = BadRequestError(
        "bad",
        response=httpx.Response(400, request=request),
        body={"error": {"message": 'Gemini TTS only supports response_format="pcm". Got "mp3".', "code": 400}},
    )
    client = MagicMock()
    client.audio.speech.create = AsyncMock(
        side_effect=[refusal, _speech_response(PCM, "audio/pcm;rate=24000;channels=1")]
    )
    with patch.object(tts_service, "AsyncOpenAI", return_value=client):
        audio = asyncio.run(synthesize_speech("Buongiorno.", config=config))

    formats = [c.kwargs["response_format"] for c in client.audio.speech.create.call_args_list]
    assert formats == ["mp3", "pcm"]
    assert audio[:4] == b"RIFF"
    assert config.response_format == "pcm"


def test_mp3_answers_are_left_as_they_are(clean_env):
    clean_env.setenv("OPENROUTER_TTS_MODEL", MODEL)
    clean_env.setenv("OPENROUTER_TTS_API_KEY", "or-key")
    config = get_speaker_note_tts_config()
    client = MagicMock()
    client.audio.speech.create = AsyncMock(return_value=_speech_response(b"ID3mp3data", "audio/mpeg"))
    with patch.object(tts_service, "AsyncOpenAI", return_value=client):
        assert asyncio.run(synthesize_speech("Hi.", config=config)) == b"ID3mp3data"
