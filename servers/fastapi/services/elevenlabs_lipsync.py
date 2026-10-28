import asyncio
import base64
import math
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal, Optional

import httpx

from utils.get_env import (
    get_elevenlabs_api_base_url_env,
    get_elevenlabs_api_key_env,
    get_elevenlabs_lipsync_concurrency_env,
)

MODEL_ID = "creatify-aurora"
DEFAULT_BASE_URL = "https://api.elevenlabs.io"
DEFAULT_CONCURRENCY = 2
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 120.0
MAX_RETRY_AFTER_SECONDS = 60.0


class ElevenLabsConfigurationError(RuntimeError):
    pass


class ElevenLabsRequestError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class LipsyncStatus:
    state: Literal["pending", "generating", "completed", "failed"]
    content_url: Optional[str] = None
    content_mime_type: Optional[str] = None
    failure_reason: Optional[str] = None
    error_message: Optional[str] = None


def _error_message(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail")
    except Exception:
        detail = None
    if isinstance(detail, list) and detail and isinstance(detail[0], dict):
        detail = detail[0].get("msg")
    if isinstance(detail, dict):
        detail = detail.get("message")
    if isinstance(detail, str) and detail:
        return f"ElevenLabs request failed ({response.status_code}): {detail}"
    return f"ElevenLabs request failed ({response.status_code})"


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code in (401, 403):
        raise ElevenLabsConfigurationError(
            "ElevenLabs rejected the API key; check ELEVENLABS_API_KEY"
        )
    if response.status_code >= 300:
        raise ElevenLabsRequestError(_error_message(response), response.status_code)


class ElevenLabsLipsyncClient:
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
        # The API key is sent per request so the signed download URL never sees it.
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            transport=transport,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def create(
        self,
        *,
        image: bytes,
        image_mime: str,
        audio: bytes,
        audio_mime: str,
        resolution: str,
    ) -> str:
        body = {
            "model_id": MODEL_ID,
            "image": {
                "type": "inline_base64",
                "content_base64": base64.b64encode(image).decode("ascii"),
                "mime_type": image_mime,
            },
            "audio": {
                "type": "inline_base64",
                "content_base64": base64.b64encode(audio).decode("ascii"),
                "mime_type": audio_mime,
            },
            "resolution": resolution,
        }
        response: Optional[httpx.Response] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = await self._http.post(
                    "/v1/flows/video", json=body, headers={"xi-api-key": self._api_key}
                )
            except httpx.TransportError as exc:
                if not isinstance(
                    exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
                ):
                    raise ElevenLabsRequestError(
                        f"ElevenLabs request failed: {exc}. A generation may still "
                        "have been created on ElevenLabs."
                    ) from exc
                if attempt == MAX_RETRIES:
                    raise ElevenLabsRequestError(
                        f"ElevenLabs request failed: {exc}"
                    ) from exc
                await self._sleep(float(2**attempt))
                continue
            if response.status_code != 429 and response.status_code < 500:
                break
            if attempt == MAX_RETRIES:
                break
            await self._sleep(self._retry_delay(response, attempt))
        assert response is not None
        _raise_for_status(response)
        generation_id = response.json().get("id")
        if not generation_id:
            raise ElevenLabsRequestError(
                "ElevenLabs response did not include a generation id",
                response.status_code,
            )
        return generation_id

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

    async def get(self, generation_id: str) -> Optional[LipsyncStatus]:
        """Return the generation status, or None on a transient failure (poll again)."""
        try:
            response = await self._http.get(
                f"/v1/flows/video/{generation_id}",
                headers={"xi-api-key": self._api_key},
            )
        except httpx.TransportError:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            return None
        _raise_for_status(response)
        payload = response.json()
        state = payload.get("status")
        if state not in ("pending", "generating", "completed", "failed"):
            return None
        return LipsyncStatus(
            state=state,
            content_url=payload.get("content_url"),
            content_mime_type=payload.get("content_mime_type"),
            failure_reason=payload.get("failure_reason"),
            error_message=payload.get("error_message"),
        )

    async def download(self, url: str, *, max_bytes: int) -> bytes:
        try:
            async with self._http.stream("GET", url, follow_redirects=True) as response:
                _raise_for_status(response)
                declared = response.headers.get("Content-Length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise ElevenLabsRequestError(
                        "Generated video exceeds the size limit", response.status_code
                    )
                chunks = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise ElevenLabsRequestError(
                            "Generated video exceeds the size limit",
                            response.status_code,
                        )
                    chunks.append(chunk)
        except httpx.TransportError as exc:
            raise ElevenLabsRequestError(
                f"Downloading the generated video failed: {exc}"
            ) from exc
        return b"".join(chunks)


def lipsync_client_from_env() -> ElevenLabsLipsyncClient:
    api_key = (get_elevenlabs_api_key_env() or "").strip()
    if not api_key:
        raise ElevenLabsConfigurationError("ELEVENLABS_API_KEY is not set")
    base_url = (get_elevenlabs_api_base_url_env() or "").strip() or DEFAULT_BASE_URL
    return ElevenLabsLipsyncClient(api_key, base_url)


def lipsync_concurrency() -> int:
    try:
        value = int((get_elevenlabs_lipsync_concurrency_env() or "").strip())
    except ValueError:
        return DEFAULT_CONCURRENCY
    return max(1, min(8, value))
