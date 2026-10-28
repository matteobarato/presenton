import asyncio
import base64
import json

import httpx
import pytest

from services.elevenlabs_lipsync import (
    MODEL_ID,
    ElevenLabsConfigurationError,
    ElevenLabsLipsyncClient,
    ElevenLabsRequestError,
    LipsyncStatus,
    lipsync_client_from_env,
    lipsync_concurrency,
)


def _client(handler, sleeps=None):
    async def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    return ElevenLabsLipsyncClient(
        "key-123",
        transport=httpx.MockTransport(handler),
        sleep=sleep,
    )


def _create(client):
    return client.create(
        image=b"img", image_mime="image/png", audio=b"aud", audio_mime="audio/mpeg",
        resolution="720p",
    )


def test_create_body():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("xi-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "gen1", "status": "pending"})

    assert asyncio.run(_create(_client(handler))) == "gen1"
    assert seen["url"] == "https://api.elevenlabs.io/v1/flows/video"
    assert seen["key"] == "key-123"
    assert seen["body"] == {
        "model_id": MODEL_ID,
        "image": {
            "type": "inline_base64",
            "content_base64": base64.b64encode(b"img").decode(),
            "mime_type": "image/png",
        },
        "audio": {
            "type": "inline_base64",
            "content_base64": base64.b64encode(b"aud").decode(),
            "mime_type": "audio/mpeg",
        },
        "resolution": "720p",
    }


def test_get_maps_each_state():
    payloads = {
        "a": {"id": "a", "status": "pending"},
        "b": {"id": "b", "status": "generating"},
        "c": {
            "id": "c", "status": "completed",
            "content_url": "https://cdn/x.mp4", "content_mime_type": "video/mp4",
        },
        "d": {
            "id": "d", "status": "failed",
            "failure_reason": "moderated", "error_message": "nope",
        },
    }

    def handler(request):
        return httpx.Response(200, json=payloads[request.url.path.rsplit("/", 1)[1]])

    async def run():
        client = _client(handler)
        return [await client.get(i) for i in "abcd"]

    assert asyncio.run(run()) == [
        LipsyncStatus("pending"),
        LipsyncStatus("generating"),
        LipsyncStatus("completed", "https://cdn/x.mp4", "video/mp4"),
        LipsyncStatus("failed", failure_reason="moderated", error_message="nope"),
    ]


def test_401_raises_configuration():
    client = _client(lambda r: httpx.Response(401, json={}))
    with pytest.raises(ElevenLabsConfigurationError):
        asyncio.run(_create(client))


def test_422_surfaces_detail():
    body = {"detail": [{"msg": "bad image", "loc": ["body"]}, {"msg": "other"}]}
    client = _client(lambda r: httpx.Response(422, json=body))
    with pytest.raises(ElevenLabsRequestError) as exc:
        asyncio.run(_create(client))
    assert "bad image" in str(exc.value)
    assert exc.value.status_code == 422


def test_429_retried_then_succeeds():
    calls = []
    sleeps = []

    def handler(request):
        calls.append(1)
        if len(calls) <= 2:
            return httpx.Response(429)
        return httpx.Response(200, json={"id": "g", "status": "pending"})

    assert asyncio.run(_create(_client(handler, sleeps))) == "g"
    assert sleeps == [1, 2]


def test_429_honours_retry_after():
    calls = []
    sleeps = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "7"})
        return httpx.Response(200, json={"id": "g", "status": "pending"})

    asyncio.run(_create(_client(handler, sleeps)))
    assert sleeps == [7]


def test_429_exhausted_raises_request_error():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(429)

    sleeps = []
    with pytest.raises(ElevenLabsRequestError) as exc:
        asyncio.run(_create(_client(handler, sleeps)))
    assert exc.value.status_code == 429
    assert len(calls) == 4
    assert sleeps == [1, 2, 4]


def test_get_5xx_returns_none():
    client = _client(lambda r: httpx.Response(503))
    assert asyncio.run(client.get("x")) is None


def test_get_network_error_returns_none():
    def handler(request):
        raise httpx.ConnectError("down")

    assert asyncio.run(_client(handler).get("x")) is None


def test_download_size_cap():
    client = _client(lambda r: httpx.Response(200, content=b"x" * 100))
    assert asyncio.run(client.download("https://cdn/x.mp4", max_bytes=100)) == b"x" * 100
    with pytest.raises(ElevenLabsRequestError):
        asyncio.run(client.download("https://cdn/x.mp4", max_bytes=99))


def test_download_sends_no_api_key():
    seen = {}

    def handler(request):
        seen["key"] = request.headers.get("xi-api-key")
        return httpx.Response(200, content=b"ok")

    assert asyncio.run(_client(handler).download("https://cdn/x", max_bytes=10)) == b"ok"
    assert seen["key"] is None


def test_from_env_requires_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    with pytest.raises(ElevenLabsConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("ELEVENLABS_API_KEY", "   ")
    with pytest.raises(ElevenLabsConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    assert isinstance(lipsync_client_from_env(), ElevenLabsLipsyncClient)


def test_concurrency_clamped(monkeypatch):
    for raw, expected in [(None, 2), ("5", 5), ("0", 1), ("99", 8), ("abc", 2), ("", 2)]:
        if raw is None:
            monkeypatch.delenv("ELEVENLABS_LIPSYNC_CONCURRENCY", raising=False)
        else:
            monkeypatch.setenv("ELEVENLABS_LIPSYNC_CONCURRENCY", raw)
        assert lipsync_concurrency() == expected
