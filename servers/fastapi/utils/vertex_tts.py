"""Reading text aloud with a Gemini speech model on Vertex AI.

Vertex has no `/v1/audio/speech`: a speech model there is called like any other
Gemini model, with `generateContent` asked for an audio response and told which
prebuilt voice to use. What comes back is raw signed 16-bit PCM rather than a
container, so it is wrapped in a WAV header here -- everything downstream, from
the stored file to ffmpeg building the deck's video, expects a file it can open.

Configured on its own environment variables, separate from the OpenAI-compatible
provider, because the two are reached in entirely different ways and a gateway
in front of Vertex is exactly what this exists to go around.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from typing import Any, Optional

from utils.get_env import (
    get_openai_compat_tts_voice_env,
    get_vertex_compat_tts_api_key_env,
    get_vertex_compat_tts_base_url_env,
    get_vertex_compat_tts_location_env,
    get_vertex_compat_tts_model_env,
    get_vertex_compat_tts_project_env,
    get_vertex_compat_tts_voice_env,
)

# Gemini's speech models ship their own voice list; "alloy", the OpenAI default,
# is not on it, so the Vertex path has a default of its own.
VERTEX_TTS_DEFAULT_VOICE = "Kore"
# Vertex serves the preview speech models from the multi-region endpoint.
VERTEX_TTS_DEFAULT_LOCATION = "global"
# Gemini returns 16-bit mono PCM, and says its rate in the part's MIME type.
VERTEX_TTS_DEFAULT_SAMPLE_RATE = 24000
# The SDK makes a single attempt unless told otherwise, and a deck narrated a few
# slides at a time runs into the per-minute quota of the speech models. Backing
# off up to a minute between attempts lets a slide wait out the quota window
# instead of being skipped on the first 429.
VERTEX_TTS_RETRY_ATTEMPTS = 10
VERTEX_TTS_RETRY_INITIAL_DELAY = 2.0
VERTEX_TTS_RETRY_MAX_DELAY = 60.0
VERTEX_TTS_RETRY_STATUS_CODES = (408, 429, 500, 502, 503, 504)

AMBIGUOUS_VERTEX_TTS_CONFIG_MESSAGE = (
    "Vertex speech configuration is ambiguous. Set either "
    "VERTEX_COMPAT_TTS_API_KEY or VERTEX_COMPAT_TTS_PROJECT "
    "(optionally with VERTEX_COMPAT_TTS_LOCATION), not both."
)
INCOMPLETE_VERTEX_TTS_CONFIG_MESSAGE = (
    "Vertex speech configuration is incomplete. VERTEX_COMPAT_TTS_MODEL needs "
    "either VERTEX_COMPAT_TTS_API_KEY or VERTEX_COMPAT_TTS_PROJECT."
)

_SAMPLE_RATE_IN_MIME = re.compile(r"rate=(\d+)", re.IGNORECASE)


class VertexTTSConfigurationError(RuntimeError):
    """Raised when the Vertex speech model is configured half way."""


@dataclass(frozen=True)
class VertexTTSConfig:
    model: str
    voice: str
    api_key: Optional[str] = None
    project: Optional[str] = None
    location: Optional[str] = None
    base_url: Optional[str] = None

    @property
    def label(self) -> str:
        """Where the audio comes from, for logs and for stored rows."""
        if self.api_key:
            return self.base_url or "vertex"
        return f"vertex://{self.project}/{self.location or VERTEX_TTS_DEFAULT_LOCATION}"


def vertex_tts_model_name(model: str) -> str:
    """The bare model id Vertex expects.

    Gateways name the same model `google/gemini-3.1-flash-tts-preview`, since
    they have to say which publisher it belongs to. Vertex already knows, and
    rejects the prefix.
    """
    name = (model or "").strip()
    for prefix in ("google/", "publishers/google/models/", "models/"):
        if name.startswith(prefix):
            name = name[len(prefix) :]
    return name


def get_vertex_tts_config(voice: Optional[str] = None) -> Optional[VertexTTSConfig]:
    """The Vertex speech model to use, or None when none is configured.

    Returning None rather than raising is what lets this sit in front of the
    OpenAI-compatible provider: a deployment that has not set the Vertex
    variables carries on exactly as before.
    """
    model = (get_vertex_compat_tts_model_env() or "").strip()
    if not model:
        return None

    api_key = (get_vertex_compat_tts_api_key_env() or "").strip()
    project = (get_vertex_compat_tts_project_env() or "").strip()
    location = (get_vertex_compat_tts_location_env() or "").strip()
    base_url = (get_vertex_compat_tts_base_url_env() or "").strip()

    if api_key and (project or location):
        raise VertexTTSConfigurationError(AMBIGUOUS_VERTEX_TTS_CONFIG_MESSAGE)
    if not api_key and not project:
        raise VertexTTSConfigurationError(INCOMPLETE_VERTEX_TTS_CONFIG_MESSAGE)

    resolved_voice = (
        (voice or "").strip()
        or (get_vertex_compat_tts_voice_env() or "").strip()
        or (get_openai_compat_tts_voice_env() or "").strip()
        or VERTEX_TTS_DEFAULT_VOICE
    )
    return VertexTTSConfig(
        model=vertex_tts_model_name(model),
        voice=resolved_voice,
        api_key=api_key or None,
        project=project or None,
        location=location or None,
        base_url=base_url or None,
    )


def pcm_to_wav(
    pcm: bytes,
    *,
    sample_rate: int = VERTEX_TTS_DEFAULT_SAMPLE_RATE,
    channels: int = 1,
    sample_width: int = 2,
) -> bytes:
    """A RIFF/WAVE header around raw samples, so the bytes become a file."""
    byte_rate = sample_rate * channels * sample_width
    block_align = channels * sample_width
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(pcm))
        + b"WAVEfmt "
        + struct.pack(
            "<IHHIIHH",
            16,
            1,  # PCM, uncompressed
            channels,
            sample_rate,
            byte_rate,
            block_align,
            sample_width * 8,
        )
        + b"data"
        + struct.pack("<I", len(pcm))
        + pcm
    )


def sample_rate_from_mime(mime_type: Optional[str]) -> int:
    """The rate Gemini states in `audio/L16;rate=24000`, or its usual one."""
    match = _SAMPLE_RATE_IN_MIME.search(mime_type or "")
    if not match:
        return VERTEX_TTS_DEFAULT_SAMPLE_RATE
    rate = int(match.group(1))
    return rate if rate > 0 else VERTEX_TTS_DEFAULT_SAMPLE_RATE


def _is_raw_pcm(mime_type: Optional[str]) -> bool:
    kind = (mime_type or "").split(";")[0].strip().lower()
    return kind in ("audio/l16", "audio/pcm", "audio/x-raw", "")


def _audio_part(response: Any) -> tuple[Optional[bytes], Optional[str]]:
    """The first audio part of a `generateContent` answer, bytes and MIME type."""
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            inline = getattr(part, "inline_data", None) or getattr(
                part, "inlineData", None
            )
            data = getattr(inline, "data", None) if inline is not None else None
            if data:
                return bytes(data), getattr(inline, "mime_type", None)
    return None, None


def _client(config: VertexTTSConfig):
    """A Vertex client for this configuration.

    Imported here rather than at module scope so a deployment that never
    narrates anything does not pay for the SDK at startup.
    """
    from google import genai
    from google.genai import types

    http_options = types.HttpOptions(
        base_url=config.base_url,
        retry_options=types.HttpRetryOptions(
            attempts=VERTEX_TTS_RETRY_ATTEMPTS,
            initial_delay=VERTEX_TTS_RETRY_INITIAL_DELAY,
            max_delay=VERTEX_TTS_RETRY_MAX_DELAY,
            http_status_codes=list(VERTEX_TTS_RETRY_STATUS_CODES),
        ),
    )
    if config.api_key:
        return genai.Client(
            vertexai=True, api_key=config.api_key, http_options=http_options
        )
    return genai.Client(
        vertexai=True,
        project=config.project,
        location=config.location or VERTEX_TTS_DEFAULT_LOCATION,
        http_options=http_options,
    )


async def synthesize_vertex_speech(text: str, *, config: VertexTTSConfig) -> bytes:
    """Read one piece of text aloud with a Gemini speech model on Vertex.

    The note is the whole prompt: a speech model reads what it is given, so
    anything wrapped around it would be read out too.
    """
    from google.genai import types

    client = _client(config)
    response = await client.aio.models.generate_content(
        model=config.model,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=config.voice
                    )
                )
            ),
        ),
    )

    audio, mime_type = _audio_part(response)
    if not audio:
        raise RuntimeError(
            f"Vertex returned no audio for a speaker note from {config.model}"
        )
    if not _is_raw_pcm(mime_type):
        # Already a container: mp3, wav, ogg. Nothing to wrap.
        return audio
    return pcm_to_wav(audio, sample_rate=sample_rate_from_mime(mime_type))
