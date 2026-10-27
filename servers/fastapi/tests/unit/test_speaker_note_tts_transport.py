"""How a speaker note reaches a provider that does not serve /v1/audio/speech.

A gateway such as Bifrost answers a speech request with `unsupported_operation`
when the model behind it lives on a provider with no speech endpoint, while the
same model reads text aloud through chat completions asked for audio. These
tests pin the fallback, what it refuses to retry, and what it remembers.
"""

import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from openai import APIStatusError

import services.speaker_note_tts_service as tts_service
from services.speaker_note_tts_service import (
    SpeakerNoteTTSConfig,
    SpeakerNoteTTSTransportError,
    audio_duration_seconds,
    detect_audio_format,
    synthesize_speech,
    wav_duration_seconds,
)

AUDIO = b"\xff\xfb\x90\x00" + b"\x00" * 413


def _config(**overrides) -> SpeakerNoteTTSConfig:
    values = {
        "base_url": "https://gateway.example/v1",
        "api_key": "test-key",
        "model": "google/gemini-3.1-flash-tts-preview",
        "voice": "Kore",
    }
    values.update(overrides)
    return SpeakerNoteTTSConfig(**values)


def _status_error(status: int, body: dict) -> APIStatusError:
    request = httpx.Request("POST", "https://gateway.example/v1/audio/speech")
    response = httpx.Response(status, request=request, json=body)
    return APIStatusError("request failed", response=response, body=body)


def _unsupported_operation_error() -> APIStatusError:
    return _status_error(
        400,
        {
            "is_bifrost_error": False,
            "error": {
                "code": "unsupported_operation",
                "message": "speech is not supported by openrouter provider",
            },
        },
    )


def _chat_answer(audio: bytes = AUDIO) -> SimpleNamespace:
    message = SimpleNamespace(
        model_dump=lambda: {
            "role": "assistant",
            "content": None,
            "audio": {"data": base64.b64encode(audio).decode("ascii")},
        }
    )
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class _FakeClient:
    """An OpenAI client whose two transports are scripted per test."""

    def __init__(self, *, speech, chat):
        self.speech_calls: list[dict] = []
        self.chat_calls: list[dict] = []

        async def speech_create(**kwargs):
            self.speech_calls.append(kwargs)
            return speech(**kwargs) if callable(speech) else speech

        async def chat_create(**kwargs):
            self.chat_calls.append(kwargs)
            return chat(**kwargs) if callable(chat) else chat

        self.audio = SimpleNamespace(speech=SimpleNamespace(create=speech_create))
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=chat_create)
        )


def _raise(error):
    def raiser(**_kwargs):
        raise error

    return raiser


@pytest.fixture(autouse=True)
def _forget_remembered_transports():
    tts_service._UNSUPPORTED_TRANSPORTS.clear()
    tts_service._TRANSPORT_REFUSALS.clear()
    yield
    tts_service._UNSUPPORTED_TRANSPORTS.clear()
    tts_service._TRANSPORT_REFUSALS.clear()


def _run(config, client, text="Buongiorno a tutti."):
    with patch.object(tts_service, "AsyncOpenAI", return_value=client):
        return asyncio.run(synthesize_speech(text, config=config))


def test_a_provider_without_a_speech_endpoint_is_read_through_chat():
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()), chat=_chat_answer()
    )

    assert _run(_config(), client) == AUDIO

    assert len(client.speech_calls) == 1
    assert len(client.chat_calls) == 1
    call = client.chat_calls[0]
    assert call["modalities"] == ["audio"]
    assert call["audio"] == {"voice": "Kore", "format": "mp3"}
    assert call["messages"] == [
        {"role": "user", "content": "Buongiorno a tutti."}
    ]


def test_the_fallback_is_remembered_so_a_deck_pays_for_it_once():
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()), chat=_chat_answer()
    )
    config = _config()

    assert _run(config, client) == AUDIO
    assert _run(config, client) == AUDIO

    assert len(client.speech_calls) == 1
    assert len(client.chat_calls) == 2


def test_an_instruction_is_sent_as_a_system_message_only_when_configured():
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()), chat=_chat_answer()
    )

    _run(_config(instruction="Read this warmly."), client)

    assert client.chat_calls[0]["messages"][0] == {
        "role": "system",
        "content": "Read this warmly.",
    }


def test_a_model_that_insists_on_text_is_retried_with_both_modalities():
    modality_error = _status_error(
        400, {"error": {"message": "modalities must include text"}}
    )

    def chat(**kwargs):
        if kwargs["modalities"] == ["audio"]:
            raise modality_error
        return _chat_answer()

    client = _FakeClient(speech=_raise(_unsupported_operation_error()), chat=chat)

    assert _run(_config(), client) == AUDIO
    assert [call["modalities"] for call in client.chat_calls] == [
        ["audio"],
        ["text", "audio"],
    ]


def test_audio_carried_in_a_content_part_is_still_found():
    message = SimpleNamespace(
        model_dump=lambda: {
            "content": [
                {"type": "text", "text": "here you go"},
                {
                    "type": "output_audio",
                    "audio": {"data": base64.b64encode(AUDIO).decode("ascii")},
                },
            ]
        }
    )
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()),
        chat=SimpleNamespace(choices=[SimpleNamespace(message=message)]),
    )

    assert _run(_config(), client) == AUDIO


def test_a_data_url_payload_is_decoded():
    message = SimpleNamespace(
        model_dump=lambda: {
            "audio": {
                "data": "data:audio/mp3;base64,"
                + base64.b64encode(AUDIO).decode("ascii")
            }
        }
    )
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()),
        chat=SimpleNamespace(choices=[SimpleNamespace(message=message)]),
    )

    assert _run(_config(), client) == AUDIO


@pytest.mark.parametrize(
    "error",
    [
        _status_error(401, {"error": {"message": "invalid api key"}}),
        _status_error(429, {"error": {"message": "rate limit exceeded"}}),
        _status_error(400, {"error": {"message": "unknown voice 'Kore'"}}),
    ],
)
def test_a_failure_that_is_not_about_the_endpoint_keeps_failing(error):
    client = _FakeClient(speech=_raise(error), chat=_chat_answer())

    with pytest.raises(APIStatusError):
        _run(_config(), client)

    assert client.chat_calls == []


def test_a_missing_speech_route_falls_back_as_well():
    client = _FakeClient(
        speech=_raise(_status_error(404, {"error": {"message": "not found"}})),
        chat=_chat_answer(),
    )

    assert _run(_config(), client) == AUDIO


def test_the_speech_transport_never_falls_back():
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()), chat=_chat_answer()
    )

    with pytest.raises(APIStatusError):
        _run(_config(transport="speech"), client)

    assert client.chat_calls == []


def test_the_chat_transport_skips_the_speech_endpoint_entirely():
    client = _FakeClient(speech=_raise(AssertionError("never")), chat=_chat_answer())

    assert _run(_config(transport="chat"), client) == AUDIO

    assert client.speech_calls == []
    assert len(client.chat_calls) == 1


def test_a_chat_answer_without_audio_is_an_error():
    empty = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(model_dump=lambda: {}))]
    )
    client = _FakeClient(speech=_raise(_unsupported_operation_error()), chat=empty)

    with pytest.raises(RuntimeError, match="without audio"):
        _run(_config(), client)


def test_the_transport_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("OPENAI_COMPAT_TTS_BASE_URL", "https://gateway.example/v1")
    monkeypatch.setenv("OPENAI_COMPAT_TTS_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_COMPAT_TTS_MODEL", "some/tts-model")
    monkeypatch.delenv("OPENAI_COMPAT_TTS_INSTRUCTION", raising=False)

    monkeypatch.delenv("OPENAI_COMPAT_TTS_TRANSPORT", raising=False)
    assert tts_service.get_speaker_note_tts_config().transport == "auto"

    monkeypatch.setenv("OPENAI_COMPAT_TTS_TRANSPORT", "Chat")
    assert tts_service.get_speaker_note_tts_config().transport == "chat"

    # An unreadable value is treated as unset rather than failing a deck.
    monkeypatch.setenv("OPENAI_COMPAT_TTS_TRANSPORT", "carrier pigeon")
    assert tts_service.get_speaker_note_tts_config().transport == "auto"


def _wav(seconds: float, sample_rate: int = 24000) -> bytes:
    byte_rate = sample_rate * 2
    data = b"\x00" * int(byte_rate * seconds)
    return (
        b"RIFF"
        + (36 + len(data)).to_bytes(4, "little")
        + b"WAVEfmt "
        + (16).to_bytes(4, "little")
        + (1).to_bytes(2, "little")
        + (1).to_bytes(2, "little")
        + sample_rate.to_bytes(4, "little")
        + byte_rate.to_bytes(4, "little")
        + (2).to_bytes(2, "little")
        + (16).to_bytes(2, "little")
        + b"data"
        + len(data).to_bytes(4, "little")
        + data
    )


@pytest.mark.parametrize(
    ("audio", "expected"),
    [
        (_wav(0.1), "wav"),
        (b"OggS" + b"\x00" * 32, "ogg"),
        (b"fLaC" + b"\x00" * 32, "flac"),
        (b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 16, "m4a"),
        (b"ID3\x03\x00\x00" + b"\x00" * 16, "mp3"),
        (AUDIO, "mp3"),
        (b"", "mp3"),
    ],
)
def test_the_container_is_read_from_the_bytes(audio, expected):
    assert detect_audio_format(audio) == expected


def test_a_wav_reading_is_measured_from_its_header():
    assert wav_duration_seconds(_wav(1.5)) == pytest.approx(1.5, abs=0.001)
    assert audio_duration_seconds(_wav(0.25), "wav") == pytest.approx(
        0.25, abs=0.001
    )


def test_an_unreadable_wav_gives_no_duration():
    assert wav_duration_seconds(b"RIFF....WAVE") is None
    assert wav_duration_seconds(b"not a wave file") is None
    # A container nothing here can measure is left to ffprobe.
    assert audio_duration_seconds(b"OggS" + b"\x00" * 32, "ogg") is None


def _tts_model_rejected_by_chat_error() -> APIStatusError:
    return _status_error(
        400,
        {
            "is_bifrost_error": False,
            "status_code": 400,
            "error": {
                "code": "400",
                "message": (
                    "google/gemini-3.1-flash-tts-preview is a text-to-speech "
                    "model and cannot be used with the chat/completions "
                    "endpoint. Use the /api/v1/audio/speech endpoint instead."
                ),
            },
        },
    )


def test_a_gateway_that_refuses_both_ways_says_so_instead_of_a_stack_trace():
    """Bifrost in front of OpenRouter turns down speech and chat for one model.

    Neither endpoint can read it, so the failure has to name both refusals:
    only whoever configured the gateway can settle it.
    """
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()),
        chat=_raise(_tts_model_rejected_by_chat_error()),
    )

    with pytest.raises(SpeakerNoteTTSTransportError) as raised:
        _run(_config(), client)

    message = str(raised.value)
    assert "speech is not supported by openrouter provider" in message
    assert "is a text-to-speech model" in message
    assert "google/gemini-3.1-flash-tts-preview" in message
    assert "https://gateway.example/v1" in message


def test_the_rest_of_a_deck_fails_without_asking_a_shut_gateway_again():
    client = _FakeClient(
        speech=_raise(_unsupported_operation_error()),
        chat=_raise(_tts_model_rejected_by_chat_error()),
    )
    config = _config()

    for _ in range(3):
        with pytest.raises(SpeakerNoteTTSTransportError):
            _run(config, client)

    # One speech call and one chat call in total, not one pair per slide.
    assert len(client.speech_calls) == 1
    assert len(client.chat_calls) == 1


def test_a_chat_only_refusal_is_raised_as_it_came():
    """With the chat transport pinned, there is no second door to report on."""
    client = _FakeClient(
        speech=_raise(AssertionError("never")),
        chat=_raise(_tts_model_rejected_by_chat_error()),
    )

    with pytest.raises(APIStatusError) as raised:
        _run(_config(transport="chat"), client)

    assert not isinstance(raised.value, SpeakerNoteTTSTransportError)


def test_a_failed_slide_carries_the_provider_wording():
    reason = tts_service._synthesis_failure_reason(
        _status_error(400, {"error": {"message": "unknown voice 'Kore'"}})
    )
    assert reason.startswith(tts_service.SYNTHESIS_FAILURE_REASON)
    assert "unknown voice 'Kore'" in reason


def test_a_transport_failure_is_reported_on_its_own_terms():
    tts_service._remember_refusal(
        ("https://gateway.example/v1", "some/tts-model"),
        "speech",
        _unsupported_operation_error(),
    )
    tts_service._remember_refusal(
        ("https://gateway.example/v1", "some/tts-model"),
        "chat",
        _tts_model_rejected_by_chat_error(),
    )
    reason = tts_service._synthesis_failure_reason(
        tts_service._both_transports_refused_error(
            ("https://gateway.example/v1", "some/tts-model")
        )
    )
    assert reason.startswith("The gateway at https://gateway.example/v1")
    assert len(reason) <= tts_service._SYNTHESIS_FAILURE_REASON_LIMIT + 3
