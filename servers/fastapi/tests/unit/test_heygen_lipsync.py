import asyncio
import io
import json

import httpx
import pytest
from PIL import Image

from services.heygen_lipsync import (
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


def _asset(asset_id):
    return httpx.Response(
        200,
        json={"data": {"asset_id": asset_id, "url": "https://x", "mime_type": "m",
                       "size_bytes": 1}},
    )


def _created(video_id="v"):
    return httpx.Response(
        200, json={"data": {"video_id": video_id, "status": "waiting",
                            "output_format": "mp4"}}
    )


def _api(create=None, upload=None):
    """A HeyGen double: assets get sequential ids, videos answer with `create`."""
    uploads = []

    def handler(request):
        if request.url.path == "/v3/assets":
            uploads.append(request.read())
            if upload is not None:
                return upload(request, len(uploads))
            return _asset(f"asset-{len(uploads)}")
        return create(request) if create is not None else _created()

    return handler, uploads


def test_create_uploads_assets_then_creates_video():
    seen = []

    def handler(request):
        seen.append({
            "path": request.url.path,
            "key": request.headers.get("x-api-key"),
            "idempotency": request.headers.get("Idempotency-Key"),
            "type": request.headers.get("Content-Type"),
            "body": request.read(),
        })
        if request.url.path == "/v3/assets":
            return _asset(f"asset-{len(seen)}")
        return _created("vid1")

    assert asyncio.run(_create(_client(handler))) == "vid1"
    assert [call["path"] for call in seen] == ["/v3/assets", "/v3/assets", "/v3/videos"]
    assert all(call["key"] == "key-123" for call in seen)
    assert all(call["idempotency"] for call in seen)
    image, audio, video = seen
    assert image["type"].startswith("multipart/form-data")
    assert b'name="file"; filename="portrait.png"' in image["body"]
    assert b"Content-Type: image/png\r\n\r\nimg" in image["body"]
    assert b'name="file"; filename="narration.mp3"' in audio["body"]
    assert b"Content-Type: audio/mpeg\r\n\r\naud" in audio["body"]
    assert json.loads(video["body"]) == {
        "type": "image",
        "image": {"type": "asset_id", "asset_id": "asset-1"},
        "audio_asset_id": "asset-2",
        "resolution": RESOLUTION,
        "aspect_ratio": "auto",
    }


def test_portrait_uploaded_once_per_client():
    handler, uploads = _api()

    async def run():
        client = _client(handler)
        await asyncio.gather(*(_create(client, audio=b"a%d" % i) for i in range(3)))
        await _create(client, image=b"other")

    asyncio.run(run())
    portraits = [body for body in uploads if b"portrait." in body]
    assert len(portraits) == 2
    assert len(uploads) == 2 + 4


def test_webp_portrait_sent_as_png():
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buffer, format="WEBP")
    handler, uploads = _api()

    asyncio.run(_create(_client(handler), image=buffer.getvalue(),
                        image_mime="image/webp"))
    portrait = next(body for body in uploads if b"portrait." in body)
    assert b'filename="portrait.png"' in portrait
    assert b"Content-Type: image/png\r\n\r\n\x89PNG" in portrait


def test_retries_reuse_the_idempotency_key():
    keys = []

    def create(request):
        keys.append(request.headers.get("Idempotency-Key"))
        if len(keys) == 1:
            raise httpx.ReadTimeout("slow")
        if len(keys) == 2:
            return httpx.Response(
                409, json={"error": {"code": "request_in_progress", "message": "wait"}}
            )
        return _created()

    handler, _ = _api(create)
    client = _client(handler)
    assert asyncio.run(_create(client)) == "v"
    assert len(keys) == 3 and len(set(keys)) == 1
    asyncio.run(_create(client))
    assert keys[3] != keys[0]


def test_asset_not_ready_is_retried():
    calls = []

    def create(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(
                409, json={"error": {"code": "resource_not_ready", "message": "x"}}
            )
        return _created()

    handler, _ = _api(create)
    assert asyncio.run(_create(_client(handler))) == "v"
    assert len(calls) == 2


def test_get_maps_each_state():
    payloads = {
        "a": {"id": "a", "status": "pending"},
        "b": {"id": "b", "status": "waiting"},
        "c": {"id": "c", "status": "processing"},
        "d": {"id": "d", "status": "completed", "video_url": "https://cdn/x.mp4"},
        "e": {
            "id": "e", "status": "failed",
            "failure_code": "no_face_detected", "failure_message": "No face found",
        },
    }

    def handler(request):
        assert request.headers.get("x-api-key") == "key-123"
        assert request.url.path.startswith("/v3/videos/")
        video_id = request.url.path.rsplit("/", 1)[1]
        return httpx.Response(200, json={"data": payloads[video_id]})

    async def run():
        client = _client(handler)
        return [await client.get(i) for i in "abcde"]

    assert asyncio.run(run()) == [
        LipsyncStatus("pending"),
        LipsyncStatus("pending"),
        LipsyncStatus("generating"),
        LipsyncStatus("completed", "https://cdn/x.mp4"),
        LipsyncStatus(
            "failed", failure_reason="no_face_detected", error_message="No face found"
        ),
    ]


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


def test_upload_failure_stops_before_create():
    paths = []

    def handler(request):
        paths.append(request.url.path)
        return httpx.Response(
            400, json={"error": {"code": "invalid_parameter", "message": "bad file"}}
        )

    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler)))
    assert "bad file" in str(exc.value)
    assert paths == ["/v3/assets"]


def test_409_conflict_not_retried():
    calls = []

    def create(request):
        calls.append(1)
        return httpx.Response(409, json={"error": {"code": "other", "message": "no"}})

    handler, _ = _api(create)
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler)))
    assert exc.value.status_code == 409
    assert len(calls) == 1


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


def test_create_transport_error_retried_then_raises():
    calls = []
    sleeps = []

    def create(request):
        calls.append(1)
        raise httpx.ReadTimeout("slow")

    handler, _ = _api(create)
    with pytest.raises(HeyGenRequestError) as exc:
        asyncio.run(_create(_client(handler, sleeps)))
    assert exc.value.status_code is None
    assert "may still" in str(exc.value)
    assert len(calls) == 4
    assert sleeps == [1, 2, 4]


def test_create_without_video_id_fails():
    handler, _ = _api(lambda r: httpx.Response(200, json={"data": {}}))
    with pytest.raises(HeyGenRequestError):
        asyncio.run(_create(_client(handler)))


def test_create_and_get_do_not_follow_redirects():
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(302, headers={"Location": "https://evil.example/x"})

    client = _client(handler)
    with pytest.raises(HeyGenRequestError):
        asyncio.run(_create(client))
    with pytest.raises(HeyGenRequestError):
        asyncio.run(client.get("x"))
    assert set(hosts) == {"api.heygen.com"}


def test_download_follows_redirects():
    def handler(request):
        if request.url.host == "cdn":
            return httpx.Response(302, headers={"Location": "https://cdn2/y"})
        return httpx.Response(200, content=b"ok")

    assert asyncio.run(_client(handler).download("https://cdn/x", max_bytes=10)) == b"ok"


def test_get_unknown_status_returns_none():
    client = _client(lambda r: httpx.Response(200, json={"data": {"status": "weird"}}))
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


def test_download_sends_no_api_key():
    seen = {}

    def handler(request):
        seen["key"] = request.headers.get("x-api-key")
        return httpx.Response(200, content=b"ok")

    assert asyncio.run(_client(handler).download("https://cdn/x", max_bytes=10)) == b"ok"
    assert seen["key"] is None


def test_from_env_requires_key(monkeypatch):
    monkeypatch.delenv("HEYGEN_API_KEY", raising=False)
    with pytest.raises(HeyGenConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("HEYGEN_API_KEY", "   ")
    with pytest.raises(HeyGenConfigurationError):
        lipsync_client_from_env()
    monkeypatch.setenv("HEYGEN_API_KEY", "k")
    assert isinstance(lipsync_client_from_env(), HeyGenLipsyncClient)


def test_concurrency_clamped(monkeypatch):
    for raw, expected in [(None, 2), ("5", 5), ("0", 1), ("99", 8), ("abc", 2), ("", 2)]:
        if raw is None:
            monkeypatch.delenv("HEYGEN_LIPSYNC_CONCURRENCY", raising=False)
        else:
            monkeypatch.setenv("HEYGEN_LIPSYNC_CONCURRENCY", raw)
        assert lipsync_concurrency() == expected
