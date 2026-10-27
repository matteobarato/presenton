"""Reading speaker notes with a Gemini speech model on Vertex AI.

Vertex serves no speech endpoint, through a gateway or otherwise, so the notes
are read by calling the model itself and the raw samples that come back are
turned into a file here. These tests pin the configuration, the request and the
wrapping.
"""

import asyncio
import io
import wave
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import services.speaker_note_tts_service as tts_service
import utils.vertex_tts as vertex_tts
from services.speaker_note_tts_service import (
    SpeakerNoteTTSConfigurationError,
    get_speaker_note_tts_config,
    synthesize_speech,
)
from utils.vertex_tts import (
    VertexTTSConfig,
    VertexTTSConfigurationError,
    get_vertex_tts_config,
    pcm_to_wav,
    sample_rate_from_mime,
    synthesize_vertex_speech,
    vertex_tts_model_name,
)

PCM = b"\x01\x02" * 1200  # 2400 bytes: a tenth of a second at 24 kHz, 16 bit mono

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
)


@pytest.fixture
def clean_env(monkeypatch):
    for name in _TTS_ENV:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def _configure_vertex(monkeypatch, **overrides):
    values = {
        "VERTEX_COMPAT_TTS_PROJECT": "my-project",
        "VERTEX_COMPAT_TTS_MODEL": "google/gemini-3.1-flash-tts-preview",
    }
    values.update(overrides)
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def _answer(data: bytes = PCM, mime_type: str = "audio/L16;rate=24000"):
    part = SimpleNamespace(
        inline_data=SimpleNamespace(data=data, mime_type=mime_type)
    )
    return SimpleNamespace(
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))]
    )


class _FakeVertexClient:
    """A Vertex client that records the one call the service makes."""

    def __init__(self, answer):
        self.calls: list[dict] = []

        async def generate_content(**kwargs):
            self.calls.append(kwargs)
            if isinstance(answer, BaseException):
                raise answer
            return answer

        self.aio = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content)
        )


def _synthesize(config, answer, text="Buongiorno a tutti."):
    client = _FakeVertexClient(answer)
    with patch.object(vertex_tts, "_client", return_value=client):
        audio = asyncio.run(synthesize_vertex_speech(text, config=config))
    return audio, client


def _config(**overrides) -> VertexTTSConfig:
    values = {
        "model": "gemini-3.1-flash-tts-preview",
        "voice": "Kore",
        "project": "my-project",
        "location": "global",
    }
    values.update(overrides)
    return VertexTTSConfig(**values)


def test_nothing_configured_leaves_the_openai_compatible_provider_alone(clean_env):
    assert get_vertex_tts_config() is None


def test_a_model_on_its_own_is_not_enough(clean_env):
    clean_env.setenv("VERTEX_COMPAT_TTS_MODEL", "gemini-3.1-flash-tts-preview")
    with pytest.raises(VertexTTSConfigurationError, match="incomplete"):
        get_vertex_tts_config()


def test_a_key_and_a_project_together_are_refused(clean_env):
    _configure_vertex(clean_env, VERTEX_COMPAT_TTS_API_KEY="express-key")
    with pytest.raises(VertexTTSConfigurationError, match="ambiguous"):
        get_vertex_tts_config()


@pytest.mark.parametrize(
    "configured",
    [
        "google/gemini-3.1-flash-tts-preview",
        "publishers/google/models/gemini-3.1-flash-tts-preview",
        "models/gemini-3.1-flash-tts-preview",
        "gemini-3.1-flash-tts-preview",
    ],
)
def test_a_gateway_style_model_name_is_reduced_to_what_vertex_takes(configured):
    assert vertex_tts_model_name(configured) == "gemini-3.1-flash-tts-preview"


def test_the_project_form_is_read_from_the_environment(clean_env):
    _configure_vertex(clean_env, VERTEX_COMPAT_TTS_LOCATION="europe-west4")
    config = get_vertex_tts_config()
    assert config.project == "my-project"
    assert config.location == "europe-west4"
    assert config.api_key is None
    assert config.model == "gemini-3.1-flash-tts-preview"
    assert config.label == "vertex://my-project/europe-west4"


def test_the_express_key_form_is_read_from_the_environment(clean_env):
    clean_env.setenv("VERTEX_COMPAT_TTS_MODEL", "google/gemini-3.1-flash-tts-preview")
    clean_env.setenv("VERTEX_COMPAT_TTS_API_KEY", "express-key")
    config = get_vertex_tts_config()
    assert config.api_key == "express-key"
    assert config.project is None


def test_the_voice_falls_back_from_the_request_to_gemini_own_default(clean_env):
    _configure_vertex(clean_env)
    assert get_vertex_tts_config().voice == "Kore"

    # The shared voice variable still applies when only it is set.
    clean_env.setenv("OPENAI_COMPAT_TTS_VOICE", "Puck")
    assert get_vertex_tts_config().voice == "Puck"

    clean_env.setenv("VERTEX_COMPAT_TTS_VOICE", "Charon")
    assert get_vertex_tts_config().voice == "Charon"
    assert get_vertex_tts_config("Aoede").voice == "Aoede"


def test_raw_samples_come_back_as_a_file_something_can_open():
    audio, client = _synthesize(_config(), _answer())

    with wave.open(io.BytesIO(audio)) as opened:
        assert opened.getnchannels() == 1
        assert opened.getsampwidth() == 2
        assert opened.getframerate() == 24000
        assert opened.readframes(opened.getnframes()) == PCM

    call = client.calls[0]
    assert call["model"] == "gemini-3.1-flash-tts-preview"
    assert call["contents"] == "Buongiorno a tutti."
    assert call["config"].response_modalities == ["AUDIO"]
    voice_config = call["config"].speech_config.voice_config
    assert voice_config.prebuilt_voice_config.voice_name == "Kore"


def test_the_rate_the_model_states_is_the_rate_that_is_written():
    audio, _client = _synthesize(
        _config(), _answer(mime_type="audio/L16;rate=16000")
    )
    with wave.open(io.BytesIO(audio)) as opened:
        assert opened.getframerate() == 16000


@pytest.mark.parametrize(
    ("mime_type", "expected"),
    [
        ("audio/L16;rate=24000", 24000),
        ("audio/pcm; rate=8000", 8000),
        ("audio/L16", 24000),
        (None, 24000),
        ("audio/L16;rate=0", 24000),
    ],
)
def test_the_sample_rate_is_taken_from_the_mime_type(mime_type, expected):
    assert sample_rate_from_mime(mime_type) == expected


def test_audio_that_already_has_a_container_is_left_as_it_is():
    mp3 = b"\xff\xfb\x90\x00" + b"\x00" * 413
    audio, _client = _synthesize(_config(), _answer(mp3, mime_type="audio/mpeg"))
    assert audio == mp3


def test_an_answer_with_no_audio_is_an_error():
    empty = SimpleNamespace(
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[]))]
    )
    with pytest.raises(RuntimeError, match="no audio"):
        _synthesize(_config(), empty)


def test_a_wav_header_matches_the_samples_it_wraps():
    wrapped = pcm_to_wav(PCM, sample_rate=48000, channels=2)
    assert wrapped[:4] == b"RIFF"
    assert wrapped[8:12] == b"WAVE"
    with wave.open(io.BytesIO(wrapped)) as opened:
        assert opened.getnchannels() == 2
        assert opened.getframerate() == 48000
        assert opened.getnframes() == len(PCM) // 4


def test_the_service_reads_notes_on_vertex_when_vertex_is_configured(clean_env):
    _configure_vertex(clean_env)
    config = get_speaker_note_tts_config()

    assert config.vertex is not None
    assert config.model == "gemini-3.1-flash-tts-preview"
    assert config.voice == "Kore"
    assert config.base_url == "vertex://my-project/global"

    async def fake_vertex(text, *, config):
        return b"read on vertex"

    with patch.object(tts_service, "synthesize_vertex_speech", fake_vertex), \
         patch.object(tts_service, "AsyncOpenAI") as openai_client:
        assert asyncio.run(synthesize_speech("Ciao.", config=config)) == (
            b"read on vertex"
        )

    # Nothing OpenAI-shaped is built, so a gateway that cannot speak is not
    # consulted at all.
    openai_client.assert_not_called()


def test_vertex_wins_over_a_configured_gateway(clean_env):
    clean_env.setenv("OPENAI_COMPAT_TTS_BASE_URL", "http://gateway.example/v1")
    clean_env.setenv("OPENAI_COMPAT_TTS_API_KEY", "gateway-key")
    clean_env.setenv("OPENAI_COMPAT_TTS_MODEL", "google/gemini-3.1-flash-tts-preview")
    _configure_vertex(clean_env)

    assert get_speaker_note_tts_config().vertex is not None


def test_a_half_configured_vertex_is_reported_as_a_configuration_problem(clean_env):
    clean_env.setenv("VERTEX_COMPAT_TTS_MODEL", "gemini-3.1-flash-tts-preview")
    with pytest.raises(SpeakerNoteTTSConfigurationError, match="incomplete"):
        get_speaker_note_tts_config()


def test_the_client_is_built_for_the_form_that_was_configured():
    with patch("google.genai.Client") as client:
        vertex_tts._client(_config(location="europe-west4"))
        kwargs = client.call_args.kwargs
        assert kwargs["vertexai"] is True
        assert kwargs["project"] == "my-project"
        assert kwargs["location"] == "europe-west4"
        assert kwargs["http_options"].base_url is None
        assert "api_key" not in kwargs

    with patch("google.genai.Client") as client:
        vertex_tts._client(
            VertexTTSConfig(
                model="gemini-3.1-flash-tts-preview",
                voice="Kore",
                api_key="express-key",
                base_url="https://aiplatform.example",
            )
        )
        kwargs = client.call_args.kwargs
        assert kwargs["api_key"] == "express-key"
        assert kwargs["http_options"].base_url == "https://aiplatform.example"
        assert "project" not in kwargs


def test_a_project_without_a_location_uses_the_multi_region_endpoint():
    with patch("google.genai.Client") as client:
        vertex_tts._client(_config(location=None))
        assert client.call_args.kwargs["location"] == "global"


def test_a_rate_limited_request_is_retried_until_the_quota_window_passes():
    with patch("google.genai.Client") as client:
        vertex_tts._client(_config())
        retry = client.call_args.kwargs["http_options"].retry_options
        assert retry.attempts == 10
        assert retry.max_delay == 60.0
        assert 429 in retry.http_status_codes
        assert 400 not in retry.http_status_codes
