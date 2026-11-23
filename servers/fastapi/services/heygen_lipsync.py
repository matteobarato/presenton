import asyncio
import base64
import hashlib
import io
import math
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal, Optional

import httpx
from PIL import Image

from utils.get_env import (
    get_heygen_lipsync_concurrency_env,
    get_openrouter_api_key_env,
    get_openrouter_base_url_env,
)

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "heygen/heygen-avatar-6-turbo"
DEFAULT_CONCURRENCY = 2
RESOLUTION = "1080p"
# The speech comes from the audio; the prompt only steers the motion.
PROMPT = (
    "The person speaks naturally to the camera, lip-syncing the provided audio, "
    "with subtle head movements and natural gestures."
)
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 120.0
MAX_RETRY_AFTER_SECONDS = 60.0

_STATES = {
    "pending": "pending",
    "in_progress": "generating",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "failed",
    "expired": "failed",
}


class HeyGenConfigurationError(RuntimeError):
    pass


class HeyGenRequestError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class LipsyncStatus:
    state: Literal["pending", "generating", "completed", "failed"]
    output_url: Optional[str] = None
    failure_reason: Optional[str] = None
    error_message: Optional[str] = None


def _error(response: httpx.Response) -> dict:
    try:
        body = response.json()
    except Exception:
        return {}
    error = body.get("error") if isinstance(body, dict) else None
    return error if isinstance(error, dict) else {}


def _error_message(response: httpx.Response) -> str:
    message = _error(response).get("message")
    if isinstance(message, str) and message:
        return f"OpenRouter request failed ({response.status_code}): {message}"
    return f"OpenRouter request failed ({response.status_code})"


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code in (401, 403):
        raise HeyGenConfigurationError(
            "OpenRouter rejected the API key; check OPENROUTER_API_KEY"
        )
    if response.status_code == 402:
        raise HeyGenConfigurationError(
            f"{_error_message(response)}. Check the OpenRouter account's credits."
        )
    if response.status_code >= 300:
        raise HeyGenRequestError(_error_message(response), response.status_code)


def _retryable(response: httpx.Response) -> bool:
    # Only a 429 is sure to have created nothing. OpenRouter's video API takes
    # no idempotency key, so replaying a create after a 5xx could start (and
    # bill) a second job.
    return response.status_code == 429


def _job_error(error) -> tuple[Optional[str], Optional[str]]:
    """(code, message) from a job's `error`, which may be a string or an object."""
    if isinstance(error, dict):
        code, message = error.get("code"), error.get("message")
        return (
            str(code) if code not in (None, "") else None,
            message if isinstance(message, str) and message else None,
        )
    if isinstance(error, str) and error:
        return None, error
    return None, None


def _reference(kind: str, content: bytes, mime: str) -> dict:
    encoded = base64.b64encode(content).decode("ascii")
    return {"type": kind, kind: {"url": f"data:{mime};base64,{encoded}"}}


def _upload_image(image: bytes, image_mime: str) -> tuple[bytes, str]:
    """The portrait as the model takes it: PNG and JPEG as they are, others as PNG."""
    if image_mime in ("image/png", "image/jpeg"):
        return image, image_mime
    with Image.open(io.BytesIO(image)) as picture:
        output = io.BytesIO()
        picture.save(output, format="PNG")
    return output.getvalue(), "image/png"


class HeyGenLipsyncClient:
    """Lip-syncs a still portrait to narration with HeyGen Avatar 6 Turbo.

    The model is called through OpenRouter's async video API
    (https://openrouter.ai/heygen/heygen-avatar-6-turbo): the portrait and the
    narration travel inline as base64 data URLs, so there is nothing to upload.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        *,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._api_key = api_key
        self._sleep = sleep
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            transport=transport,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        self._image_refs: dict[str, dict] = {}
        self._image_lock = asyncio.Lock()

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def aclose(self) -> None:
        await self._http.aclose()

    async def create(
        self,
        *,
        image: bytes,
        image_mime: str,
        audio: bytes,
        audio_mime: str,
    ) -> str:
        image_ref = await self._image_reference(image, image_mime)
        response = await self._post(
            "/videos",
            json={
                "model": MODEL,
                "prompt": PROMPT,
                "resolution": RESOLUTION,
                "input_references": [
                    image_ref,
                    _reference("audio_url", audio, audio_mime),
                ],
            },
            lost_response_note="A video may still have been created on OpenRouter.",
        )
        video_id = response.json().get("id")
        if not video_id:
            raise HeyGenRequestError(
                "OpenRouter response did not include a job id", response.status_code
            )
        return video_id

    async def _image_reference(self, image: bytes, image_mime: str) -> dict:
        digest = hashlib.sha256(image).hexdigest()
        # Slides run side by side; the lock keeps them to one conversion.
        async with self._image_lock:
            if digest not in self._image_refs:
                data, mime = await asyncio.to_thread(_upload_image, image, image_mime)
                self._image_refs[digest] = _reference("image_url", data, mime)
            return self._image_refs[digest]

    async def _post(
        self, path: str, *, lost_response_note: str = "", **kwargs
    ) -> httpx.Response:
        response: Optional[httpx.Response] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = await self._http.post(
                    path, headers=self._headers, **kwargs
                )
            except httpx.TransportError as exc:
                # A request that never connected is safe to send again; any
                # other failure may have reached OpenRouter and created a job.
                if not isinstance(exc, httpx.ConnectError) or attempt == MAX_RETRIES:
                    raise HeyGenRequestError(
                        f"OpenRouter request failed: {exc}. {lost_response_note}".rstrip()
                    ) from exc
                await self._sleep(float(2**attempt))
                continue
            if not _retryable(response) or attempt == MAX_RETRIES:
                break
            await self._sleep(self._retry_delay(response, attempt))
        assert response is not None
        _raise_for_status(response)
        return response

    @staticmethod
    def _retry_delay(response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                delay = float(retry_after)
                if math.isfinite(delay):
                    return min(max(0.0, delay), MAX_RETRY_AFTER_SECONDS)
            except ValueError:
                pass
        return float(2**attempt)

    async def get(self, video_id: str) -> Optional[LipsyncStatus]:
        """Return the job status, or None on a transient failure (poll again)."""
        try:
            response = await self._http.get(
                f"/videos/{video_id}", headers=self._headers
            )
        except httpx.TransportError:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            return None
        _raise_for_status(response)
        payload = response.json()
        status = payload.get("status")
        state = _STATES.get(status)
        if state is None:
            return None
        urls = payload.get("unsigned_urls") or []
        code, message = _job_error(payload.get("error"))
        return LipsyncStatus(
            state=state,
            output_url=urls[0] if urls else f"/videos/{video_id}/content?index=0",
            failure_reason=(code or status) if state == "failed" else None,
            error_message=message,
        )

    async def download(self, url: str, *, max_bytes: int) -> bytes:
        try:
            # The key goes only to OpenRouter; httpx also drops it if a redirect
            # leaves the host.
            target = self._http.build_request("GET", url).url
            headers = self._headers if target.host == self._http.base_url.host else {}
            async with self._http.stream(
                "GET", url, headers=headers, follow_redirects=True
            ) as response:
                _raise_for_status(response)
                declared = response.headers.get("Content-Length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise HeyGenRequestError(
                        "Generated video exceeds the size limit", response.status_code
                    )
                chunks = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise HeyGenRequestError(
                            "Generated video exceeds the size limit",
                            response.status_code,
                        )
                    chunks.append(chunk)
        except httpx.TransportError as exc:
            raise HeyGenRequestError(
                f"Downloading the generated video failed: {exc}"
            ) from exc
        return b"".join(chunks)


def lipsync_client_from_env() -> HeyGenLipsyncClient:
    api_key = (get_openrouter_api_key_env() or "").strip()
    if not api_key:
        raise HeyGenConfigurationError("OPENROUTER_API_KEY is not set")
    # Same convention as the LLM client: the base URL includes `/api/v1`.
    base_url = (get_openrouter_base_url_env() or "").strip() or DEFAULT_BASE_URL
    return HeyGenLipsyncClient(api_key, base_url)


def lipsync_concurrency() -> int:
    try:
        value = int((get_heygen_lipsync_concurrency_env() or "").strip())
    except ValueError:
        return DEFAULT_CONCURRENCY
    return max(1, min(8, value))
