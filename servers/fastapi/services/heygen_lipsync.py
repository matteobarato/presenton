import asyncio
import hashlib
import io
import math
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal, Optional

import httpx
from PIL import Image

from utils.get_env import (
    get_heygen_api_base_url_env,
    get_heygen_api_key_env,
    get_heygen_lipsync_concurrency_env,
)

DEFAULT_BASE_URL = "https://api.heygen.com"
DEFAULT_CONCURRENCY = 2
# The avatar fills a small placeholder; 720p is plenty and costs the least.
RESOLUTION = "720p"
MAX_RETRIES = 3
REQUEST_TIMEOUT_SECONDS = 120.0
MAX_RETRY_AFTER_SECONDS = 60.0

_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
}
_STATES = {
    "waiting": "pending",
    "pending": "pending",
    "processing": "generating",
    "completed": "completed",
    "failed": "failed",
}
# 409 codes that clear by themselves: the keyed original is still running, or
# a freshly uploaded asset is still being prepared.
_RETRYABLE_CONFLICTS = {"request_in_progress", "resource_not_ready"}


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
        return f"HeyGen request failed ({response.status_code}): {message}"
    return f"HeyGen request failed ({response.status_code})"


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code in (401, 403):
        raise HeyGenConfigurationError(
            "HeyGen rejected the API key; check HEYGEN_API_KEY"
        )
    if response.status_code == 402:
        raise HeyGenConfigurationError(
            f"{_error_message(response)}. Check the HeyGen account's credits."
        )
    if response.status_code >= 300:
        raise HeyGenRequestError(_error_message(response), response.status_code)


def _retryable(response: httpx.Response) -> bool:
    if response.status_code == 429 or response.status_code >= 500:
        return True
    return (
        response.status_code == 409
        and _error(response).get("code") in _RETRYABLE_CONFLICTS
    )


def _upload_image(image: bytes, image_mime: str) -> tuple[bytes, str]:
    """The portrait as HeyGen takes it: PNG and JPEG as they are, others as PNG."""
    if image_mime in ("image/png", "image/jpeg"):
        return image, image_mime
    with Image.open(io.BytesIO(image)) as picture:
        output = io.BytesIO()
        picture.save(output, format="PNG")
    return output.getvalue(), "image/png"


class HeyGenLipsyncClient:
    """Lip-syncs a still portrait to narration with HeyGen's audio-to-video.

    Both files are uploaded as assets first; the portrait once per client,
    since every slide of a run shares it.
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
        # The API key is sent per request so the signed download URL never sees it.
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            transport=transport,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        self._image_assets: dict[str, str] = {}
        self._image_lock = asyncio.Lock()

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
        image_asset_id = await self._image_asset(image, image_mime)
        audio_asset_id = await self._upload(audio, audio_mime, "narration")
        response = await self._post(
            "/v3/videos",
            json={
                "type": "image",
                "image": {"type": "asset_id", "asset_id": image_asset_id},
                "audio_asset_id": audio_asset_id,
                "resolution": RESOLUTION,
                # The clip keeps the portrait's proportions; the player crops it
                # to the placeholder.
                "aspect_ratio": "auto",
            },
            lost_response_note="A video may still have been created on HeyGen.",
        )
        video_id = (response.json().get("data") or {}).get("video_id")
        if not video_id:
            raise HeyGenRequestError(
                "HeyGen response did not include a video id", response.status_code
            )
        return video_id

    async def _image_asset(self, image: bytes, image_mime: str) -> str:
        digest = hashlib.sha256(image).hexdigest()
        # Slides run side by side; the lock keeps them to one upload.
        async with self._image_lock:
            if digest not in self._image_assets:
                data, mime = await asyncio.to_thread(_upload_image, image, image_mime)
                self._image_assets[digest] = await self._upload(data, mime, "portrait")
            return self._image_assets[digest]

    async def _upload(self, content: bytes, mime: str, stem: str) -> str:
        filename = f"{stem}.{_EXTENSIONS.get(mime, 'bin')}"
        response = await self._post(
            "/v3/assets", files={"file": (filename, content, mime)}
        )
        asset_id = (response.json().get("data") or {}).get("asset_id")
        if not asset_id:
            raise HeyGenRequestError(
                "HeyGen response did not include an asset id", response.status_code
            )
        return asset_id

    async def _post(
        self, path: str, *, lost_response_note: str = "", **kwargs
    ) -> httpx.Response:
        # One key for every attempt: a retry after a lost response replays the
        # request already made instead of paying for a second one.
        headers = {"x-api-key": self._api_key, "Idempotency-Key": uuid.uuid4().hex}
        response: Optional[httpx.Response] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = await self._http.post(path, headers=headers, **kwargs)
            except httpx.TransportError as exc:
                if attempt == MAX_RETRIES:
                    raise HeyGenRequestError(
                        f"HeyGen request failed: {exc}. {lost_response_note}".rstrip()
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
        """Return the video status, or None on a transient failure (poll again)."""
        try:
            response = await self._http.get(
                f"/v3/videos/{video_id}",
                headers={"x-api-key": self._api_key},
            )
        except httpx.TransportError:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            return None
        _raise_for_status(response)
        payload = response.json().get("data") or {}
        state = _STATES.get(payload.get("status"))
        if state is None:
            return None
        return LipsyncStatus(
            state=state,
            output_url=payload.get("video_url"),
            failure_reason=payload.get("failure_code"),
            error_message=payload.get("failure_message"),
        )

    async def download(self, url: str, *, max_bytes: int) -> bytes:
        try:
            async with self._http.stream("GET", url, follow_redirects=True) as response:
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
    api_key = (get_heygen_api_key_env() or "").strip()
    if not api_key:
        raise HeyGenConfigurationError("HEYGEN_API_KEY is not set")
    base_url = (get_heygen_api_base_url_env() or "").strip() or DEFAULT_BASE_URL
    return HeyGenLipsyncClient(api_key, base_url)


def lipsync_concurrency() -> int:
    try:
        value = int((get_heygen_lipsync_concurrency_env() or "").strip())
    except ValueError:
        return DEFAULT_CONCURRENCY
    return max(1, min(8, value))
