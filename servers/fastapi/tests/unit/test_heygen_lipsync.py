import asyncio
import base64
import io
import json

import httpx
import pytest
from PIL import Image

from services.heygen_lipsync import (
    MODEL,
    RESOLUTION,
    HeyGenConfigurationError,
    HeyGenLipsyncClient,
    HeyGenRequestError,
    LipsyncStatus,
    lipsync_client_from_env,
    lipsync_concurrency,
)


def _client(handler, sleeps=None):
    async def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    return HeyGenLipsyncClient(
        "key-123",
        transport=httpx.MockTransport(handler),
        sleep=sleep,
    )


def _create(client, image=b"img", image_mime="image/png", audio=b"aud"):
    return client.create(
        image=image, image_mime=image_mime, audio=audio, audio_mime="audio/mpeg"
    )


def _created(job_id="v"):
    return httpx.Response(
        202, json={"id": job_id, "status": "pending", "polling_url": "/api/v1/videos/x"}
    )


def _api(create=None):
    return (create if create is not None else (lambda request: _created())), []


def test_create_posts_inline_references():
    seen = []

    def handler(request):
        seen.append(request)
        return _created("vid1")

    assert asyncio.run(_create(_client(handler))) == "vid1"
    (request,) = seen
    assert request.url.path == "/api/v1/videos"
    assert request.headers["Authorization"] == "Bearer key-123"
    body = json.loads(request.read())
    image = base64.b64encode(b"img").decode()
    audio = base64.b64encode(b"aud").decode()
    assert body["model"] == MODEL == "heygen/heygen-avatar-6-turbo"
    assert body["resolution"] == RESOLUTION
    assert body["prompt"]
    assert body["input_references"] == [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}},
        {"type": "audio_url", "audio_url": {"url": f"data:audio/mpeg;base64,{audio}"}},
    ]


def test_webp_portrait_sent_as_png():
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buffer, format="WEBP")
    seen = []

    def handler(request):
        seen.append(json.loads(request.read()))
        return _created()

    asyncio.run(_create(_client(handler), image=buffer.getvalue(),
                        image_mime="image/webp"))
    url = seen[0]["input_references"][0]["image_url"]["url"]
    assert url.startswith("data:image/png;base64,")
    assert base64.b64decode(url.split(",", 1)[1]).startswith(b"\x89PNG")


def test_get_maps_each_state():
    payloads = {
        "a": {"id": "a", "status": "pending"},
        "b": {"id": "b", "status": "in_progress"},
        "c": {"id": "c", "status": "completed",
              "unsigned_urls": ["https://openrouter.ai/api/v1/videos/c/content?index=0"]},
        "d": {"id": "d", "status": "failed", "error": "No face found"},
        "e": {"id": "e", "status": "expired"},
        "f": {"id": "f", "status": "failed",
              "error": {"code": "no_face_detected", "message": "No face found"}},
    }

    def handler(request):
        assert request.headers.get("Authorization") == "Bearer key-123"
        assert request.url.path.startswith("/api/v1/videos/")
        return httpx.Response(200, json=payloads[request.url.path.rsplit("/", 1)[1]])

    async def run():
        client = _client(handler)
        return [await client.get(i) for i in "abcdef"]

    pending, generating, completed, failed, expired, structured = asyncio.run(run())
    assert pending.state == "pending"
    assert generating.state == "generating"
    assert completed.state == "completed"
    assert completed.output_url == "https://openrouter.ai/api/v1/videos/c/content?index=0"
    assert completed.failure_reason is None
    assert failed.state == "failed" and failed.error_message == "No face found"
    assert failed.failure_reason == "failed"
    assert expired.state == "failed" and expired.failure_reason == "expired"
    assert structured == LipsyncStatus(
        "failed",
        output_url="/videos/f/content?index=0",
        failure_reason="no_face_detected",
        error_message="No face found",
    )


@pytest.mark.parametrize("status", [401, 403, 402])
def test_auth_and_credit_errors_raise_configuration(status):
    body = {"error": {"code": "x", "message": "Not enough credits"}}
    client = _client(lambda r: httpx.Response(status, json=body))
    with pytest.raises(HeyGenConfigurationError) as exc:
        asyncio.run(_create(client))
    if status == 402:
        assert "Not enough credits" in str(exc.value)


def test_400_surfaces_message():
    body = {"error": {"code": "invalid_parameter", "message": "No face detected"}}
    handler, _ = _api(lambda r: httpx.Response(400, json=body))
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler)))
    assert "No face detected" in str(exc.value)
    assert exc.value.status_code == 400






def test_429_retried_then_succeeds():
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        if len(calls) <= 2:
            return httpx.Response(429)
        return _created()

    handler, _ = _api(create)
    assert asyncio.run(_create(_client(handler, sleeps))) == "v"
    assert sleeps == [1, 2]


def test_429_honours_retry_after():
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "7"})
        return _created()

    handler, _ = _api(create)
    asyncio.run(_create(_client(handler, sleeps)))
    assert sleeps == [7]


def test_429_exhausted_raises_request_error():
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        return httpx.Response(429)

    handler, _ = _api(create)
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler, sleeps)))
    assert exc.value.status_code == 429
    assert len(calls) == 4
    assert sleeps == [1, 2, 4]


def test_create_connect_error_retried_then_raises():
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        raise httpx.ConnectError("refused")

    handler, _ = _api(create)
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler, sleeps)))
    assert exc.value.status_code is None
    assert "may still" in str(exc.value)
    assert len(calls) == 4
    assert sleeps == [1, 2, 4]


def test_create_without_video_id_fails():
    handler, _ = _api(lambda r: httpx.Response(200, json={}))
    with pytest.raises(HeyGenRequestError):
        asyncio.run(_create(_client(handler)))




def test_download_follows_redirects():
    def handler(request):
        if request.url.host == "cdn":
            return httpx.Response(302, headers={"Location": "https://cdn2/y"})
        return httpx.Response(200, content=b"ok")

    assert asyncio.run(_client(handler).download("https://cdn/x", max_bytes=10)) == b"ok"


def test_get_unknown_status_returns_none():
    client = _client(lambda r: httpx.Response(200, json={"status": "weird"}))
    assert asyncio.run(client.get("x")) is None


@pytest.mark.parametrize("value,expected", [("inf", 1), ("nan", 1), ("100000", 60)])
def test_retry_after_sanitised(value, expected):
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": value})
        return _created()

    handler, _ = _api(create)
    asyncio.run(_create(_client(handler, sleeps)))
    assert sleeps == [expected]


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
    with pytest.raises(HeyGenRequestError):
        asyncio.run(client.download("https://cdn/x.mp4", max_bytes=99))




def test_from_env_requires_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(HeyGenConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("OPENROUTER_API_KEY", "   ")
    with pytest.raises(HeyGenConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    assert isinstance(lipsync_client_from_env(), HeyGenLipsyncClient)


def test_concurrency_clamped(monkeypatch):
    for raw, expected in [(None, 2), ("5", 5), ("0", 1), ("99", 8), ("abc", 2), ("", 2)]:
        if raw is None:
            monkeypatch.delenv("HEYGEN_LIPSYNC_CONCURRENCY", raising=False)
        else:
            monkeypatch.setenv("HEYGEN_LIPSYNC_CONCURRENCY", raw)
        assert lipsync_concurrency() == expected



def test_download_sends_key_only_to_openrouter():
    seen = {}

    def handler(request):
        seen[request.url.host] = request.headers.get("Authorization")
        return httpx.Response(200, content=b"ok")

    client = _client(handler)
    asyncio.run(client.download("https://openrouter.ai/api/v1/videos/v/content", max_bytes=10))
    asyncio.run(client.download("https://cdn/x.mp4", max_bytes=10))
    assert seen == {"openrouter.ai": "Bearer key-123", "cdn": None}


@pytest.mark.parametrize(
    "outcome",
    [lambda: httpx.Response(502), lambda: httpx.Response(500),
     httpx.ReadTimeout("slow")],
)
def test_create_not_retried_once_the_request_may_have_landed(outcome):
    calls = []

    def create(request):
        calls.append(1)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome()

    handler, _ = _api(create)
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler, [])))
    assert len(calls) == 1
    if isinstance(outcome, Exception):
        assert "may still" in str(exc.value)


def test_from_env_uses_openrouter_base_url(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://proxy.example/or/api/v1/")
    client = lipsync_client_from_env()
    assert str(client._http.base_url) == "https://proxy.example/or/api/v1/"
    monkeypatch.delenv("OPENROUTER_BASE_URL")
    assert str(lipsync_client_from_env()._http.base_url) == "https://openrouter.ai/api/v1/"
