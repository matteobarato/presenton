import base64
from unittest.mock import AsyncMock, Mock, patch

import pytest
from openai import APIStatusError

import services.image_generation_service as image_service
from services.image_generation_service import (
    ImageGenerationService,
    image_from_chat_message,
)

PNG = b"\x89PNG\r\n\x1a\nfake"
DATA_URL = "data:image/png;base64," + base64.b64encode(PNG).decode()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def forget_refusals():
    image_service._IMAGES_ENDPOINT_REFUSED.clear()
    yield
    image_service._IMAGES_ENDPOINT_REFUSED.clear()


def _status_error(status: int, body: dict) -> APIStatusError:
    response = Mock(status_code=status, headers={})
    response.request = Mock()
    return APIStatusError("error", response=response, body=body)


BIFROST_REFUSAL = {
    "is_bifrost_error": False,
    "error": {
        "code": "unsupported_operation",
        "message": "image_generation is not supported by openrouter provider",
    },
}


def _chat_answer(message) -> Mock:
    return Mock(choices=[Mock(message=message)])


def _env(transport=None):
    return [
        patch.object(image_service, "get_openai_compat_image_base_url_env", return_value="https://gw.example/v1"),
        patch.object(image_service, "get_openai_compat_image_api_key_env", return_value="key"),
        patch.object(image_service, "get_openai_compat_image_model_env", return_value="google/gemini-3.1-flash-image"),
        patch.object(image_service, "get_openai_compat_image_transport_env", return_value=transport),
    ]


async def _generate(tmp_path, client, transport=None):
    patches = _env(transport) + [patch.object(image_service, "AsyncOpenAI", return_value=client)]
    for p in patches:
        p.start()
    try:
        service = ImageGenerationService(str(tmp_path))
        return await service.generate_image_openai_compatible("an apple", str(tmp_path))
    finally:
        for p in patches:
            p.stop()


def test_openrouter_images_field_is_read():
    message = {"content": None, "images": [{"type": "image_url", "image_url": {"url": DATA_URL}}]}
    assert image_from_chat_message(message) == DATA_URL


def test_image_content_parts_and_inline_text_are_read():
    parts = {"content": [{"type": "text", "text": "here"}, {"type": "image_url", "image_url": {"url": DATA_URL}}]}
    assert image_from_chat_message(parts) == DATA_URL
    assert image_from_chat_message({"content": f"Here: {DATA_URL}"}) == DATA_URL
    assert image_from_chat_message({"content": "![x](https://cdn.example/a.png)"}) == "https://cdn.example/a.png"
    assert image_from_chat_message({"content": "no picture"}) is None


def test_sdk_message_extra_field_is_read():
    from openai.types.chat import ChatCompletionMessage

    message = ChatCompletionMessage.model_validate(
        {"role": "assistant", "content": "", "images": [{"type": "image_url", "image_url": {"url": DATA_URL}}]}
    )
    assert image_from_chat_message(message) == DATA_URL


@pytest.mark.anyio
async def test_a_refused_images_endpoint_falls_back_to_chat_and_is_remembered(tmp_path):
    client = Mock()
    client.images.generate = AsyncMock(side_effect=_status_error(400, BIFROST_REFUSAL))
    client.chat.completions.create = AsyncMock(
        return_value=_chat_answer({"images": [{"image_url": {"url": DATA_URL}}]})
    )

    path = await _generate(tmp_path, client)
    assert open(path, "rb").read() == PNG
    kwargs = client.chat.completions.create.call_args.kwargs
    assert kwargs["extra_body"] == {"modalities": ["image", "text"]}
    assert kwargs["model"] == "google/gemini-3.1-flash-image"

    await _generate(tmp_path, client)
    assert client.images.generate.await_count == 1
    assert client.chat.completions.create.await_count == 2


@pytest.mark.anyio
async def test_other_errors_are_not_retried_through_chat(tmp_path):
    client = Mock()
    client.images.generate = AsyncMock(
        side_effect=_status_error(429, {"error": {"code": "rate_limited", "message": "slow down"}})
    )
    client.chat.completions.create = AsyncMock()
    with pytest.raises(APIStatusError):
        await _generate(tmp_path, client)
    client.chat.completions.create.assert_not_called()


@pytest.mark.anyio
async def test_images_transport_does_not_fall_back(tmp_path):
    client = Mock()
    client.images.generate = AsyncMock(side_effect=_status_error(400, BIFROST_REFUSAL))
    client.chat.completions.create = AsyncMock()
    with pytest.raises(APIStatusError):
        await _generate(tmp_path, client, transport="images")
    client.chat.completions.create.assert_not_called()


@pytest.mark.anyio
async def test_chat_transport_skips_the_images_endpoint(tmp_path):
    client = Mock()
    client.images.generate = AsyncMock()
    client.chat.completions.create = AsyncMock(
        return_value=_chat_answer({"content": [{"type": "image_url", "image_url": {"url": DATA_URL}}]})
    )
    path = await _generate(tmp_path, client, transport="chat")
    assert open(path, "rb").read() == PNG
    client.images.generate.assert_not_called()


@pytest.mark.anyio
async def test_chat_without_an_image_is_an_error(tmp_path):
    client = Mock()
    client.chat.completions.create = AsyncMock(return_value=_chat_answer({"content": "I cannot draw"}))
    with pytest.raises(Exception, match="no image from chat"):
        await _generate(tmp_path, client, transport="chat")
