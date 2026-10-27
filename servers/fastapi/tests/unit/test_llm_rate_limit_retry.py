import asyncio
from unittest.mock import Mock, patch

import httpx
import openai
import pytest
from llmai.shared.errors import LLMError, LLMRateLimitError

import utils.llm_utils as llm_utils
from utils.llm_utils import is_rate_limit_error, stream_generate_events

BIFROST_429_BODY = {
    "is_bifrost_error": False,
    "error": {
        "code": "429",
        "message": "openai/gpt-6-luna is temporarily rate-limited upstream. Please retry shortly",
    },
}


def _openai_error(status: int, body: dict, headers: dict | None = None):
    request = httpx.Request("POST", "http://gw/v1/chat/completions")
    response = httpx.Response(status, request=request, headers=headers or {})
    cls = openai.BadRequestError if status == 400 else openai.APIStatusError
    return cls("error", response=response, body=body)


def _bifrost_rate_limit() -> LLMError:
    cause = _openai_error(400, BIFROST_429_BODY)
    error = LLMError(400, BIFROST_429_BODY["error"]["message"], cause=cause)
    error.__cause__ = cause
    return error


class FlakyClient:
    def __init__(self, failures, events=("a", "b")):
        self.failures = list(failures)
        self.events = events
        self.calls = 0

    def generate(self, **kwargs):
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return iter(self.events)


async def _collect(client):
    return [event async for event in stream_generate_events(client, model="m")]


@pytest.fixture(autouse=True)
def no_waiting():
    async def instant(seconds, checker):
        instant.delays.append(seconds)

    instant.delays = []
    with patch.object(llm_utils, "_sleep_unless_disconnected", instant):
        yield instant


def test_bifrost_relayed_429_is_a_rate_limit():
    assert is_rate_limit_error(_bifrost_rate_limit())
    assert is_rate_limit_error(LLMRateLimitError(429, "slow down"))
    assert is_rate_limit_error(_openai_error(429, {"error": {"message": "x"}}))
    assert is_rate_limit_error(
        _openai_error(400, {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}})
    )


def test_ordinary_bad_requests_are_not_rate_limits():
    assert not is_rate_limit_error(
        _openai_error(400, {"error": {"code": "invalid_request", "message": "bad schema"}})
    )
    assert not is_rate_limit_error(LLMError(401, "invalid api key"))


def test_a_rate_limited_request_is_retried_until_it_succeeds(no_waiting):
    client = FlakyClient([_bifrost_rate_limit(), _bifrost_rate_limit()])
    assert asyncio.run(_collect(client)) == ["a", "b"]
    assert client.calls == 3
    assert len(no_waiting.delays) == 2
    assert no_waiting.delays[1] > no_waiting.delays[0]


def test_retries_stop_after_ten_calls_by_default(monkeypatch):
    monkeypatch.delenv("LLM_RATE_LIMIT_MAX_ATTEMPTS", raising=False)
    client = FlakyClient([_bifrost_rate_limit()] * 20)
    with pytest.raises(LLMError, match="rate-limited"):
        asyncio.run(_collect(client))
    assert client.calls == 10


@pytest.mark.parametrize("value, calls", [("3", 3), ("1", 1), ("0", 1), ("junk", 10)])
def test_the_number_of_calls_comes_from_the_environment(monkeypatch, value, calls):
    monkeypatch.setenv("LLM_RATE_LIMIT_MAX_ATTEMPTS", value)
    client = FlakyClient([_bifrost_rate_limit()] * 20)
    with pytest.raises(LLMError):
        asyncio.run(_collect(client))
    assert client.calls == calls


def test_other_errors_fail_at_once():
    client = FlakyClient([LLMError(400, "bad schema")])
    with pytest.raises(LLMError, match="bad schema"):
        asyncio.run(_collect(client))
    assert client.calls == 1


def test_a_stream_that_already_produced_output_is_not_restarted():
    class HalfStream:
        calls = 0

        def generate(self, **kwargs):
            self.calls += 1

            def events():
                yield "partial"
                raise _bifrost_rate_limit()

            return events()

    client = HalfStream()
    seen = []

    async def run():
        async for event in stream_generate_events(client, model="m"):
            seen.append(event)

    with pytest.raises(LLMError):
        asyncio.run(run())
    assert seen == ["partial"]
    assert client.calls == 1


def test_retry_after_header_is_honoured():
    error = _openai_error(429, {"error": {"message": "slow"}}, headers={"retry-after": "7"})
    assert llm_utils.rate_limit_retry_delay(0, error) == 7.0
