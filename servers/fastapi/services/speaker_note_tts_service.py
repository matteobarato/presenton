"""Narration audio for the speaker notes of a finished presentation.

One audio file per slide, in a language the caller chooses, produced through an
OpenAI-compatible speech endpoint. The text that gets synthesized is stored
alongside the file, because it is not always the slide's note: a deck written in
one language and narrated in another is translated first, since a speech
provider reads whatever characters it is handed and has no language setting of
its own.

Audio is addressed by slide and language, so a deck can carry an Italian and an
English reading at the same time, and re-running the generation only re-reads
the slides whose note, voice or model changed.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import json
import logging
import os
import struct
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

from openai import APIStatusError, AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.tts_languages import TTSLanguage, find_tts_language, resolve_tts_language
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.speaker_note_audio import SpeakerNoteAudioModel
from utils.asset_directory_utils import (
    absolute_fastapi_asset_url,
    get_audio_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.get_env import (
    get_app_data_directory_env,
    get_openai_compat_tts_api_key_env,
    get_openai_compat_tts_base_url_env,
    get_openai_compat_tts_instruction_env,
    get_openai_compat_tts_model_env,
    get_openai_compat_tts_transport_env,
    get_openai_compat_tts_voice_env,
    get_openrouter_api_key_env,
    get_openrouter_tts_api_key_env,
    get_openrouter_tts_base_url_env,
    get_openrouter_tts_format_env,
    get_openrouter_tts_model_env,
    get_openrouter_tts_voice_env,
)
from utils.llm_calls.translate_speaker_notes import translate_speaker_notes
from utils.vertex_tts import (
    VertexTTSConfig,
    VertexTTSConfigurationError,
    get_vertex_tts_config,
    pcm_to_wav,
    sample_rate_from_mime,
    synthesize_vertex_speech,
)

LOGGER = logging.getLogger(__name__)

SPEAKER_NOTE_TTS_CONCURRENCY = 4
SPEAKER_NOTE_TTS_FORMAT = "mp3"
# Raw 16-bit samples, which some speech models (Gemini, on OpenRouter) send
# instead of any container. Wrapped as WAV before they are stored.
SPEAKER_NOTE_TTS_PCM_FORMAT = "pcm"
SPEAKER_NOTE_TTS_SPEECH_FORMATS = (SPEAKER_NOTE_TTS_FORMAT, SPEAKER_NOTE_TTS_PCM_FORMAT)
# The OpenAI speech endpoint rejects input longer than this. Generated notes are
# far shorter, so this only guards hand-edited notes.
SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS = 4000
SPEAKER_NOTE_TTS_DEFAULT_VOICE = "alloy"

# How the text reaches the provider. Not every OpenAI-compatible gateway serves
# /v1/audio/speech: a proxy in front of OpenRouter, for instance, answers a
# speech request with `unsupported_operation`, while the same model reads text
# aloud through chat completions asked for an audio modality. "auto" tries the
# speech endpoint first and remembers, per model, when it has to use chat.
SPEAKER_NOTE_TTS_TRANSPORT_AUTO = "auto"
SPEAKER_NOTE_TTS_TRANSPORT_SPEECH = "speech"
SPEAKER_NOTE_TTS_TRANSPORT_CHAT = "chat"
SPEAKER_NOTE_TTS_TRANSPORTS = (
    SPEAKER_NOTE_TTS_TRANSPORT_AUTO,
    SPEAKER_NOTE_TTS_TRANSPORT_SPEECH,
    SPEAKER_NOTE_TTS_TRANSPORT_CHAT,
)

# Models reached through the chat transport are asked for audio only, which is
# what text-to-speech models such as Gemini's expect. A model that also insists
# on producing text (OpenAI's audio previews) is retried with both modalities.
_CHAT_MODALITY_ATTEMPTS = (["audio"], ["text", "audio"])

# What each (base URL, model) has already refused, so a deck of twenty slides
# pays for a refusal once instead of twenty times. A gateway that turns down
# both transports cannot read that model at all, and the next slide is failed
# without another round trip.
_UNSUPPORTED_TRANSPORTS: dict[tuple[str, str], set[str]] = {}
# The wording each refusal came with, kept so the failure a user reads names
# what the gateway actually said rather than which function raised.
_TRANSPORT_REFUSALS: dict[tuple[tuple[str, str], str], str] = {}

BOTH_TRANSPORTS_REFUSED_MESSAGE = (
    "The gateway at {base_url} will not read {model} aloud: it answers speech "
    "requests with \"{speech}\" and chat requests with \"{chat}\". The model and "
    "the provider it is routed to disagree about which endpoint to use, so this "
    "has to be settled in the gateway: route the model to a provider whose "
    "speech endpoint the gateway implements, or point OPENAI_COMPAT_TTS_BASE_URL "
    "straight at a provider that serves /v1/audio/speech."
)

MISSING_TTS_CONFIG_MESSAGE = (
    "OPENAI_COMPAT_TTS_BASE_URL, OPENAI_COMPAT_TTS_API_KEY and "
    "OPENAI_COMPAT_TTS_MODEL -- or the OPENROUTER_TTS_* variables, to use "
    "OpenRouter's speech endpoint, or the VERTEX_COMPAT_TTS_* variables, to "
    "reach a Gemini speech model on Vertex AI directly -- must be set to "
    "generate speaker note audio."
)
MISSING_OPENROUTER_TTS_KEY_MESSAGE = (
    "OPENROUTER_TTS_MODEL is set but there is no key to call it with: set "
    "OPENROUTER_TTS_API_KEY, or OPENROUTER_API_KEY."
)
OPENROUTER_TTS_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class SpeakerNoteTTSConfigurationError(RuntimeError):
    """Raised when the speech provider is not configured."""


class SpeakerNoteTTSTransportError(RuntimeError):
    """Raised when the provider serves neither of the two ways to read text.

    Worth its own type because nothing about the deck, the note or the request
    can fix it: the gateway has to be pointed at a provider that can speak.
    """


@dataclass
class SpeakerNoteTTSConfig:
    base_url: str
    api_key: str
    model: str
    voice: str
    transport: str = SPEAKER_NOTE_TTS_TRANSPORT_AUTO
    instruction: str = ""
    # What the speech endpoint is asked to return.
    response_format: str = SPEAKER_NOTE_TTS_FORMAT
    # Set when the notes are read on Vertex AI, which has no speech endpoint of
    # any kind and is called as a Gemini model instead.
    vertex: Optional[VertexTTSConfig] = None


@dataclass
class SpeakerNoteAudioGenerationResult:
    language: TTSLanguage
    audios: list[SpeakerNoteAudioModel] = field(default_factory=list)
    generated_slide_indexes: list[int] = field(default_factory=list)
    reused_slide_indexes: list[int] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "language": self.language.code,
            "language_name": self.language.name,
            "generated": len(self.generated_slide_indexes),
            "reused": len(self.reused_slide_indexes),
            "skipped": len(self.skipped),
            "total": len(self.audios),
        }


def get_speaker_note_tts_config(voice: Optional[str] = None) -> SpeakerNoteTTSConfig:
    # Vertex wins when it is configured: it is only ever set to go around a
    # gateway that cannot carry speech, so leaving it as the fallback would
    # defeat the point of setting it.
    try:
        vertex = get_vertex_tts_config(voice)
    except VertexTTSConfigurationError as error:
        raise SpeakerNoteTTSConfigurationError(str(error)) from error
    if vertex is not None:
        return SpeakerNoteTTSConfig(
            base_url=vertex.label,
            api_key=vertex.api_key or "",
            model=vertex.model,
            voice=vertex.voice,
            vertex=vertex,
        )

    openrouter = get_openrouter_tts_config(voice)
    if openrouter is not None:
        return openrouter

    base_url = (get_openai_compat_tts_base_url_env() or "").strip()
    api_key = (get_openai_compat_tts_api_key_env() or "").strip()
    model = (get_openai_compat_tts_model_env() or "").strip()
    if not base_url or not api_key or not model:
        raise SpeakerNoteTTSConfigurationError(MISSING_TTS_CONFIG_MESSAGE)
    resolved_voice = (
        (voice or "").strip()
        or (get_openai_compat_tts_voice_env() or "").strip()
        or SPEAKER_NOTE_TTS_DEFAULT_VOICE
    )
    transport = (get_openai_compat_tts_transport_env() or "").strip().lower()
    if transport not in SPEAKER_NOTE_TTS_TRANSPORTS:
        transport = SPEAKER_NOTE_TTS_TRANSPORT_AUTO
    return SpeakerNoteTTSConfig(
        base_url=base_url,
        api_key=api_key,
        model=model,
        voice=resolved_voice,
        transport=transport,
        instruction=(get_openai_compat_tts_instruction_env() or "").strip(),
    )


def get_openrouter_tts_config(
    voice: Optional[str] = None,
) -> Optional[SpeakerNoteTTSConfig]:
    """OpenRouter's own speech endpoint, or None when it is not configured.

    OpenRouter serves `/audio/speech` itself, so the notes go there directly and
    only there: its chat completions carry audio only when streamed, which the
    chat transport does not do, so falling back to it would just fail twice.
    The key falls back to the one the deck's text model already uses.
    """
    model = (get_openrouter_tts_model_env() or "").strip()
    if not model:
        return None
    api_key = (
        (get_openrouter_tts_api_key_env() or "").strip()
        or (get_openrouter_api_key_env() or "").strip()
    )
    if not api_key:
        raise SpeakerNoteTTSConfigurationError(MISSING_OPENROUTER_TTS_KEY_MESSAGE)
    return SpeakerNoteTTSConfig(
        base_url=(get_openrouter_tts_base_url_env() or "").strip()
        or OPENROUTER_TTS_DEFAULT_BASE_URL,
        api_key=api_key,
        model=model,
        voice=(
            (voice or "").strip()
            or (get_openrouter_tts_voice_env() or "").strip()
            or (get_openai_compat_tts_voice_env() or "").strip()
            or SPEAKER_NOTE_TTS_DEFAULT_VOICE
        ),
        transport=SPEAKER_NOTE_TTS_TRANSPORT_SPEECH,
        response_format=_openrouter_tts_format(model),
    )


def _openrouter_tts_format(model: str) -> str:
    """mp3 unless the model cannot send it.

    OpenRouter's Gemini speech models answer anything but `pcm` with
    `Gemini TTS only supports response_format="pcm"`.
    """
    configured = (get_openrouter_tts_format_env() or "").strip().lower()
    if configured in SPEAKER_NOTE_TTS_SPEECH_FORMATS:
        return configured
    if model.lower().startswith("google/"):
        return SPEAKER_NOTE_TTS_PCM_FORMAT
    return SPEAKER_NOTE_TTS_FORMAT


def _asks_for_pcm(error: APIStatusError) -> bool:
    """Whether the provider refused the format and said it only sends pcm."""
    if getattr(error, "status_code", None) != 400:
        return False
    payload = _status_error_payload(error)
    return "response_format" in payload and "pcm" in payload and "only" in payload


def _speech_audio(response: Any, response_format: str) -> bytes:
    """The bytes of a speech answer, as a file something can open."""
    audio = response.content
    if not audio:
        raise RuntimeError("Speech provider returned no audio for a speaker note")
    headers = getattr(getattr(response, "response", None), "headers", None) or {}
    try:
        content_type = str(headers.get("content-type") or "")
    except Exception:
        content_type = ""
    kind = content_type.split(";")[0].strip().lower()
    is_raw = kind in ("audio/pcm", "audio/l16", "audio/x-raw") or (
        response_format == SPEAKER_NOTE_TTS_PCM_FORMAT
        and kind in ("", "application/octet-stream")
    )
    if not is_raw or detect_audio_format(audio) == "wav":
        return audio
    return pcm_to_wav(audio, sample_rate=sample_rate_from_mime(content_type))


def note_digest(note: str) -> str:
    return hashlib.sha256(" ".join(str(note or "").split()).encode("utf-8")).hexdigest()


def clip_tts_input(text: str) -> str:
    """Keep synthesis input inside the provider's limit, on a sentence boundary."""
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS:
        return normalized
    clipped = normalized[:SPEAKER_NOTE_TTS_MAX_INPUT_CHARACTERS]
    boundary = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"))
    if boundary > 0:
        return clipped[: boundary + 1]
    return clipped.rsplit(" ", 1)[0] if " " in clipped else clipped


def _status_error_payload(error: APIStatusError) -> str:
    """Everything an error carries, as one lowercase string to look through.

    Gateways nest their reason differently -- `error.code`, `error.message`, a
    provider's own envelope -- so the whole body is searched rather than one
    field that only some of them fill in.
    """
    parts = [str(getattr(error, "message", "") or "")]
    body = getattr(error, "body", None)
    if body is not None:
        try:
            parts.append(json.dumps(body, default=str))
        except (TypeError, ValueError):
            parts.append(str(body))
    return " ".join(parts).lower()


def _speech_endpoint_unsupported(error: APIStatusError) -> bool:
    """Whether the provider is saying it has no speech endpoint at all.

    A refusal of the endpoint itself is worth retrying through chat completions;
    a bad voice, a missing key or a rate limit is not, and must keep failing.
    """
    status = getattr(error, "status_code", None)
    if status not in (400, 404, 405, 501):
        return False
    payload = _status_error_payload(error)
    if "unsupported_operation" in payload:
        return True
    if status in (404, 405) and ("audio/speech" in payload or "not found" in payload):
        return True
    return ("speech" in payload or "tts" in payload) and (
        "not supported" in payload
        or "unsupported" in payload
        or "not implemented" in payload
    )


def _chat_endpoint_unsupported(error: APIStatusError) -> bool:
    """Whether the provider refuses to run this model through chat at all.

    A gateway that knows the model is a text-to-speech one turns a chat request
    down on sight and points at its speech endpoint instead. When its speech
    endpoint has already refused the same model, there is nowhere left to go and
    the next slide should not repeat the pair of failing calls.
    """
    if getattr(error, "status_code", None) not in (400, 404, 405, 501):
        return False
    payload = _status_error_payload(error)
    if "unsupported_operation" in payload:
        return True
    if "text-to-speech model" in payload or "tts model" in payload:
        return True
    return "chat" in payload and (
        "cannot be used" in payload
        or "not supported" in payload
        or "unsupported" in payload
    )


def _refused(fingerprint: tuple[str, str], transport: str) -> bool:
    return transport in _UNSUPPORTED_TRANSPORTS.get(fingerprint, set())


def _remember_refusal(
    fingerprint: tuple[str, str], transport: str, error: BaseException
) -> None:
    _UNSUPPORTED_TRANSPORTS.setdefault(fingerprint, set()).add(transport)
    _TRANSPORT_REFUSALS[(fingerprint, transport)] = _provider_message(error)


def _provider_message(error: BaseException) -> str:
    """The provider's own wording, for a message someone has to act on."""
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        nested = body.get("error")
        if isinstance(nested, dict) and nested.get("message"):
            return str(nested["message"])
        if isinstance(nested, str) and nested:
            return nested
        if body.get("message"):
            return str(body["message"])
    message = str(getattr(error, "message", "") or error)
    return message or error.__class__.__name__


def _both_transports_refused_error(
    fingerprint: tuple[str, str],
) -> SpeakerNoteTTSTransportError:
    base_url, model = fingerprint
    return SpeakerNoteTTSTransportError(
        BOTH_TRANSPORTS_REFUSED_MESSAGE.format(
            base_url=base_url,
            model=model,
            speech=_TRANSPORT_REFUSALS.get(
                (fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_SPEECH), "a refusal"
            ),
            chat=_TRANSPORT_REFUSALS.get(
                (fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_CHAT), "a refusal"
            ),
        )
    )


def _decode_audio_payload(data: Any) -> Optional[bytes]:
    """Audio bytes out of whatever a chat response carried them in."""
    if isinstance(data, (bytes, bytearray)):
        return bytes(data) or None
    if not isinstance(data, str) or not data.strip():
        return None
    encoded = data.strip()
    if encoded.startswith("data:"):
        _, _, encoded = encoded.partition(",")
    try:
        audio = base64.b64decode(encoded, validate=False)
    except (binascii.Error, ValueError):
        return None
    return audio or None


def _audio_from_chat_message(message: Any) -> Optional[bytes]:
    """Find the reading inside a chat completion, whichever shape it took.

    OpenAI returns it under `message.audio.data`; gateways in front of other
    providers sometimes hand back a content part instead, and the part's key is
    `data` or `audio` depending on who wrote the translation layer.
    """
    if hasattr(message, "model_dump"):
        message = message.model_dump()
    if not isinstance(message, dict):
        return None

    audio = message.get("audio")
    if isinstance(audio, dict):
        decoded = _decode_audio_payload(audio.get("data"))
        if decoded:
            return decoded

    content = message.get("content")
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") not in (
                None, "audio", "output_audio", "input_audio",
            ):
                continue
            candidate = part.get("data")
            if candidate is None:
                nested = part.get("audio") or part.get("input_audio")
                candidate = nested.get("data") if isinstance(nested, dict) else None
            decoded = _decode_audio_payload(candidate)
            if decoded:
                return decoded
    return None


async def _synthesize_via_chat(
    text: str,
    *,
    config: SpeakerNoteTTSConfig,
    client: AsyncOpenAI,
) -> bytes:
    """Read text aloud through chat completions asked for an audio answer.

    The note is the whole user message: a text-to-speech model reads what it is
    handed, so an instruction wrapped around it would be read out too. Providers
    whose model wants to be told how to sound take that wording from
    OPENAI_COMPAT_TTS_INSTRUCTION, sent as a system message.
    """
    fingerprint = (config.base_url, config.model)
    messages: list[dict[str, Any]] = []
    if config.instruction:
        messages.append({"role": "system", "content": config.instruction})
    messages.append({"role": "user", "content": text})

    last_error: Optional[BaseException] = None
    for modalities in _CHAT_MODALITY_ATTEMPTS:
        try:
            response = await client.chat.completions.create(
                model=config.model,
                messages=messages,
                modalities=modalities,
                audio={
                    "voice": config.voice,
                    "format": SPEAKER_NOTE_TTS_FORMAT,
                },
            )
        except APIStatusError as error:
            # A gateway that refuses to run a speech model through chat has now
            # turned down both ways of reaching it, and saying so is more use
            # than a stack trace repeated once per slide.
            if _chat_endpoint_unsupported(error):
                _remember_refusal(
                    fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_CHAT, error
                )
                if _refused(fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_SPEECH):
                    raise _both_transports_refused_error(fingerprint) from error
                raise
            # A model that rejects the modality set it was offered is retried
            # with the other one; anything else is the caller's problem.
            if error.status_code != 400 or "modalit" not in _status_error_payload(
                error
            ):
                raise
            last_error = error
            continue

        choices = getattr(response, "choices", None) or []
        audio = _audio_from_chat_message(choices[0].message) if choices else None
        if audio:
            return audio
        last_error = RuntimeError(
            "Speech provider returned a chat answer without audio for a speaker note"
        )

    raise last_error or RuntimeError(
        "Speech provider returned no audio for a speaker note"
    )


async def synthesize_speech(
    text: str,
    *,
    config: SpeakerNoteTTSConfig,
) -> bytes:
    """Read one piece of text aloud through the configured provider."""
    input_text = clip_tts_input(text)
    if config.vertex is not None:
        return await synthesize_vertex_speech(input_text, config=config.vertex)

    client = AsyncOpenAI(base_url=config.base_url, api_key=config.api_key)
    fingerprint = (config.base_url, config.model)

    if config.transport == SPEAKER_NOTE_TTS_TRANSPORT_AUTO and _refused(
        fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_SPEECH
    ):
        if _refused(fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_CHAT):
            # Both doors are already known to be shut: fail the rest of the deck
            # on what the gateway said rather than on two more round trips each.
            raise _both_transports_refused_error(fingerprint)
        return await _synthesize_via_chat(input_text, config=config, client=client)

    if config.transport == SPEAKER_NOTE_TTS_TRANSPORT_CHAT:
        return await _synthesize_via_chat(input_text, config=config, client=client)

    response_format = config.response_format
    try:
        try:
            response = await client.audio.speech.create(
                model=config.model,
                voice=config.voice,
                input=input_text,
                response_format=response_format,
            )
        except APIStatusError as error:
            if response_format == SPEAKER_NOTE_TTS_PCM_FORMAT or not _asks_for_pcm(error):
                raise
            # Said once per model, then asked for what it can send.
            LOGGER.info(
                "[speaker-notes.tts] %s only sends pcm; asking for that instead",
                config.model,
            )
            config.response_format = response_format = SPEAKER_NOTE_TTS_PCM_FORMAT
            response = await client.audio.speech.create(
                model=config.model,
                voice=config.voice,
                input=input_text,
                response_format=response_format,
            )
    except APIStatusError as error:
        if config.transport != SPEAKER_NOTE_TTS_TRANSPORT_AUTO:
            raise
        if not _speech_endpoint_unsupported(error):
            raise
        LOGGER.info(
            "[speaker-notes.tts] %s has no speech endpoint, reading notes through "
            "chat completions instead",
            config.model,
        )
        _remember_refusal(fingerprint, SPEAKER_NOTE_TTS_TRANSPORT_SPEECH, error)
        return await _synthesize_via_chat(input_text, config=config, client=client)

    return _speech_audio(response, response_format)


_MPEG_BITRATES_V1_L3 = (
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
)
_MPEG_BITRATES_V2_L3 = (
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
)
_MPEG_SAMPLE_RATES = {
    3: (44100, 48000, 32000),  # MPEG 1
    2: (22050, 24000, 16000),  # MPEG 2
    0: (11025, 12000, 8000),   # MPEG 2.5
}


def mp3_duration_seconds(audio: bytes) -> Optional[float]:
    """Length of an MP3 stream, summed frame by frame.

    Best effort and dependency free: anything unexpected in the byte stream
    returns None rather than a wrong number, since the duration is a convenience
    for players and callers, never something the audio itself depends on.
    """
    offset = 0
    size = len(audio)

    # Skip an ID3v2 tag, whose size is stored as four 7-bit big-endian bytes.
    if size >= 10 and audio[:3] == b"ID3":
        tag_size = 0
        for byte in audio[6:10]:
            if byte & 0x80:
                return None
            tag_size = (tag_size << 7) | byte
        offset = 10 + tag_size

    duration = 0.0
    frames = 0
    while offset + 4 <= size:
        header = struct.unpack(">I", audio[offset : offset + 4])[0]
        if (header & 0xFFE00000) != 0xFFE00000:
            # Trailing metadata (ID3v1, padding) after at least one frame is fine.
            if frames:
                break
            return None
        version_bits = (header >> 19) & 0b11
        layer_bits = (header >> 17) & 0b11
        bitrate_index = (header >> 12) & 0b1111
        sample_rate_index = (header >> 10) & 0b11
        padding = (header >> 9) & 0b1
        if layer_bits != 0b01 or version_bits == 0b01 or sample_rate_index == 0b11:
            return None
        if bitrate_index in (0, 0b1111):
            return None
        bitrates = (
            _MPEG_BITRATES_V1_L3 if version_bits == 0b11 else _MPEG_BITRATES_V2_L3
        )
        bitrate = bitrates[bitrate_index] * 1000
        sample_rate = _MPEG_SAMPLE_RATES[version_bits][sample_rate_index]
        if not bitrate or not sample_rate:
            return None
        samples_per_frame = 1152 if version_bits == 0b11 else 576
        frame_length = int(
            (samples_per_frame // 8) * bitrate / sample_rate
        ) + padding
        if frame_length <= 4:
            return None
        duration += samples_per_frame / sample_rate
        frames += 1
        offset += frame_length

    return round(duration, 3) if frames else None


def wav_duration_seconds(audio: bytes) -> Optional[float]:
    """Length of a RIFF/WAVE stream, from its format and data chunks."""
    if len(audio) < 12 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        return None
    offset = 12
    byte_rate = 0
    while offset + 8 <= len(audio):
        chunk_id = audio[offset : offset + 4]
        chunk_size = struct.unpack("<I", audio[offset + 4 : offset + 8])[0]
        body = offset + 8
        if chunk_id == b"fmt " and chunk_size >= 16 and body + 16 <= len(audio):
            byte_rate = struct.unpack("<I", audio[body + 8 : body + 12])[0]
        elif chunk_id == b"data":
            if not byte_rate:
                return None
            # A stream written while it is still being produced can carry a
            # zero or oversized size, so what is really there wins.
            data_size = min(chunk_size, len(audio) - body) or (len(audio) - body)
            return round(data_size / byte_rate, 3)
        offset = body + chunk_size + (chunk_size & 1)
    return None


def detect_audio_format(audio: bytes) -> str:
    """Container the provider actually sent back.

    The format asked for is not always the format returned: a model reached
    through chat completions may answer with WAV whatever the request said, and
    the file has to be named after what is in it.
    """
    if audio[:4] == b"RIFF" and audio[8:12] == b"WAVE":
        return "wav"
    if audio[:4] == b"OggS":
        return "ogg"
    if audio[:4] == b"fLaC":
        return "flac"
    if audio[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    if len(audio) >= 12 and audio[4:8] == b"ftyp":
        return "m4a"
    if audio[:3] == b"ID3" or (
        len(audio) >= 2 and audio[0] == 0xFF and (audio[1] & 0xE0) == 0xE0
    ):
        return SPEAKER_NOTE_TTS_FORMAT
    return SPEAKER_NOTE_TTS_FORMAT


def audio_duration_seconds(audio: bytes, audio_format: str) -> Optional[float]:
    """Length of a reading, for the players and the video timeline."""
    if audio_format == "wav":
        return wav_duration_seconds(audio)
    if audio_format == SPEAKER_NOTE_TTS_FORMAT:
        return mp3_duration_seconds(audio)
    # Anything else is measured with ffprobe when the deck is turned into a
    # video; a missing duration here is only a missing hint.
    return None


SYNTHESIS_FAILURE_REASON = "The speech provider could not read this slide"
_SYNTHESIS_FAILURE_REASON_LIMIT = 400


def _synthesis_failure_reason(error: BaseException) -> str:
    """What to tell the caller about a slide that went unread.

    The provider's own words are carried through, because a configuration
    problem -- a model that is not a speech model, a key without access -- is
    only fixable by whoever reads this, and it is not in the log they have.
    """
    if isinstance(error, SpeakerNoteTTSTransportError):
        detail = str(error)
    elif isinstance(error, APIStatusError):
        detail = _provider_message(error)
    else:
        detail = str(error)
    detail = " ".join(detail.split())
    if not detail:
        return SYNTHESIS_FAILURE_REASON
    if len(detail) > _SYNTHESIS_FAILURE_REASON_LIMIT:
        detail = detail[:_SYNTHESIS_FAILURE_REASON_LIMIT].rstrip() + "..."
    if isinstance(error, SpeakerNoteTTSTransportError):
        return detail
    return f"{SYNTHESIS_FAILURE_REASON}: {detail}"


def _audio_url_for_path(path: str) -> str:
    """Browser-facing URL for a file written under APP_DATA_DIRECTORY/audio."""
    app_data = get_app_data_directory_env()
    if not app_data:
        return path
    try:
        relative = os.path.relpath(
            os.path.realpath(path), os.path.realpath(app_data)
        )
    except (OSError, ValueError):
        return path
    if relative.startswith(".."):
        return path
    return absolute_fastapi_asset_url("/app_data/" + relative.replace(os.sep, "/"))


def _remove_audio_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError as exc:
        LOGGER.warning("Could not remove speaker note audio %s: %s", path, exc)


def _slide_title(slide: SlideModel) -> str:
    content = slide.content or {}
    title = content.get("title") if isinstance(content, dict) else None
    return title.strip() if isinstance(title, str) and title.strip() else ""


def _is_fresh(
    audio: SpeakerNoteAudioModel,
    *,
    digest: str,
    config: SpeakerNoteTTSConfig,
) -> bool:
    return (
        audio.source_note_hash == digest
        and audio.model == config.model
        and (audio.voice or "") == config.voice
        and bool(audio.path)
        and os.path.isfile(audio.path)
    )


async def _load_existing_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language_code: Optional[str] = None,
) -> list[SpeakerNoteAudioModel]:
    statement = select(SpeakerNoteAudioModel).where(
        SpeakerNoteAudioModel.presentation == presentation_id
    )
    if language_code is not None:
        statement = statement.where(SpeakerNoteAudioModel.language == language_code)
    return list(
        await sql_session.scalars(
            statement.order_by(SpeakerNoteAudioModel.slide_index)
        )
    )


async def list_speaker_note_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> list[SpeakerNoteAudioModel]:
    """Every stored reading of a deck, in slide order."""
    language_code = resolve_tts_language(language).code if language else None
    return await _load_existing_audios(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )


async def delete_speaker_note_audios(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    language: Optional[str] = None,
) -> int:
    """Drop stored readings and the files behind them."""
    language_code = resolve_tts_language(language).code if language else None
    audios = await _load_existing_audios(
        sql_session, presentation_id=presentation_id, language_code=language_code
    )
    paths = [audio.path for audio in audios]
    for audio in audios:
        await sql_session.delete(audio)
    if audios:
        await sql_session.commit()
    remove_speaker_note_audio_files(presentation_id, paths)
    return len(audios)


async def speaker_note_audio_paths(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slide_ids: Optional[Sequence[uuid.UUID]] = None,
) -> list[str]:
    """Files holding a deck's narration, for a caller about to delete the deck
    or, with `slide_ids`, some of its slides.

    Collected before the rows go, because deleting a presentation or a slide
    drops them through the database's cascade and the files on disk would
    otherwise be left behind with nothing pointing at them.
    """
    audios = await _load_existing_audios(
        sql_session, presentation_id=presentation_id
    )
    wanted = None if slide_ids is None else set(slide_ids)
    return [
        audio.path
        for audio in audios
        if audio.path and (wanted is None or audio.slide in wanted)
    ]


def remove_speaker_note_audio_files(
    presentation_id: uuid.UUID, paths: Sequence[str]
) -> None:
    """Delete narration files, and the deck's audio folder once it is empty."""
    directories: set[str] = set()
    for path in paths:
        if not path:
            continue
        directories.add(os.path.dirname(path))
        _remove_audio_file(path)
    for directory in directories:
        if os.path.basename(directory) != str(presentation_id):
            continue
        try:
            os.rmdir(directory)
        except OSError:
            # Not empty, already gone, or not ours to remove: the files that
            # mattered are the audio itself, which is already deleted.
            continue


def _needs_translation(
    presentation: PresentationModel, language: TTSLanguage
) -> bool:
    """Whether a deck's notes have to be translated before they are read aloud.

    A deck records its language as free text, so when it cannot be resolved the
    notes are translated anyway: an unnecessary translation of text already in
    the target language is a no-op the prompt handles, while skipping a needed
    one produces audio in the wrong language.
    """
    source = find_tts_language(presentation.language)
    return source is None or source.code != language.code


async def generate_speaker_note_audios(
    *,
    presentation: PresentationModel,
    slides: Sequence[SlideModel],
    language: str,
    sql_session: AsyncSession,
    slide_indexes: Optional[Sequence[int]] = None,
    regenerate: bool = False,
    voice: Optional[str] = None,
    concurrency: int = SPEAKER_NOTE_TTS_CONCURRENCY,
    on_progress: Optional[Any] = None,
) -> SpeakerNoteAudioGenerationResult:
    """Narrate the speaker notes of a deck, one audio file per slide.

    Slides whose audio is already current are left alone, so this can be called
    again after editing a few notes without paying to re-read the whole deck.
    `regenerate` forces every requested slide to be read again.
    """
    target_language = resolve_tts_language(language)
    config = get_speaker_note_tts_config(voice)

    ordered_slides = list(slides)
    requested = (
        None if slide_indexes is None else {int(index) for index in slide_indexes}
    )
    existing = {
        audio.slide: audio
        for audio in await _load_existing_audios(
            sql_session,
            presentation_id=presentation.id,
            language_code=target_language.code,
        )
    }

    result = SpeakerNoteAudioGenerationResult(language=target_language)
    pending: list[int] = []

    for position, slide in enumerate(ordered_slides):
        if requested is not None and slide.index not in requested:
            continue
        note = (slide.speaker_note or "").strip()
        if not note:
            result.skipped.append(
                {
                    "slide_index": slide.index,
                    "reason": "This slide has no speaker note to read aloud",
                }
            )
            continue
        current = existing.get(slide.id)
        if (
            not regenerate
            and current is not None
            and _is_fresh(current, digest=note_digest(note), config=config)
        ):
            result.reused_slide_indexes.append(slide.index)
            continue
        pending.append(position)

    texts: dict[int, str] = {
        position: (ordered_slides[position].speaker_note or "").strip()
        for position in pending
    }
    translated_positions: set[int] = set()

    if pending and _needs_translation(presentation, target_language):
        translations = await translate_speaker_notes(
            notes=dict(texts),
            target_language=target_language.name,
            deck_title=presentation.title or "",
            slide_titles={
                position: _slide_title(ordered_slides[position])
                for position in pending
            },
        )
        for position in list(pending):
            translation = translations.get(position)
            if translation:
                texts[position] = translation
                translated_positions.add(position)
                continue
            # Reading an untranslated note with the requested language's voice
            # would produce audio in the wrong language, so the slide is left
            # without audio instead.
            pending.remove(position)
            result.skipped.append(
                {
                    "slide_index": ordered_slides[position].index,
                    "reason": (
                        "Could not translate this slide's speaker note into "
                        f"{target_language.name}"
                    ),
                }
            )

    semaphore = asyncio.Semaphore(max(1, concurrency))
    completed = 0

    async def synthesize(position: int) -> bytes:
        async with semaphore:
            return await synthesize_speech(texts[position], config=config)

    if pending:
        results = await asyncio.gather(
            *(synthesize(position) for position in pending),
            return_exceptions=True,
        )
        output_directory = os.path.join(get_audio_directory(), str(presentation.id))
        os.makedirs(output_directory, exist_ok=True)

        for position, audio_bytes in zip(pending, results):
            slide = ordered_slides[position]
            if isinstance(audio_bytes, BaseException):
                if isinstance(audio_bytes, asyncio.CancelledError):
                    raise audio_bytes
                if isinstance(audio_bytes, SpeakerNoteTTSTransportError):
                    # Nothing about this slide caused it and nothing about the
                    # next one will change it, so it is logged flat, once per
                    # slide, without a stack trace that says the same thing.
                    LOGGER.error(
                        "[speaker-notes.tts] synthesis failed slide=%s: %s",
                        slide.id,
                        audio_bytes,
                    )
                else:
                    LOGGER.exception(
                        "[speaker-notes.tts] synthesis failed slide=%s", slide.id,
                        exc_info=audio_bytes,
                    )
                result.skipped.append(
                    {
                        "slide_index": slide.index,
                        "reason": _synthesis_failure_reason(audio_bytes),
                    }
                )
                continue

            audio_format = detect_audio_format(audio_bytes)
            filename = f"{slide.id}-{target_language.code}-{uuid.uuid4().hex}.{audio_format}"
            path = os.path.join(output_directory, filename)
            with open(path, "wb") as audio_file:
                audio_file.write(audio_bytes)

            record = existing.get(slide.id)
            previous_path = record.path if record else None
            if record is None:
                record = SpeakerNoteAudioModel(
                    presentation=presentation.id,
                    slide=slide.id,
                    slide_index=slide.index,
                    language=target_language.code,
                    language_name=target_language.name,
                    model=config.model,
                    voice=config.voice,
                    text=texts[position],
                    translated=position in translated_positions,
                    source_note_hash=note_digest(slide.speaker_note or ""),
                    path=path,
                    url=_audio_url_for_path(path),
                    format=audio_format,
                    size_bytes=len(audio_bytes),
                    duration_seconds=audio_duration_seconds(
                        audio_bytes, audio_format
                    ),
                )
                existing[slide.id] = record
            else:
                record.slide_index = slide.index
                record.language_name = target_language.name
                record.model = config.model
                record.voice = config.voice
                record.text = texts[position]
                record.translated = position in translated_positions
                record.source_note_hash = note_digest(slide.speaker_note or "")
                record.path = path
                record.url = _audio_url_for_path(path)
                record.format = audio_format
                record.size_bytes = len(audio_bytes)
                record.duration_seconds = audio_duration_seconds(
                    audio_bytes, audio_format
                )
                record.updated_at = get_current_utc_datetime()
            sql_session.add(record)
            # The previous file is replaced rather than overwritten so a client
            # that cached the old URL never plays stale narration.
            if previous_path and previous_path != path:
                _remove_audio_file(previous_path)

            result.generated_slide_indexes.append(slide.index)
            completed += 1
            if on_progress is not None:
                await on_progress(completed, len(pending))

        await sql_session.commit()

    result.audios = await _load_existing_audios(
        sql_session,
        presentation_id=presentation.id,
        language_code=target_language.code,
    )
    result.generated_slide_indexes.sort()
    result.reused_slide_indexes.sort()
    result.skipped.sort(key=lambda entry: entry["slide_index"])
    return result
