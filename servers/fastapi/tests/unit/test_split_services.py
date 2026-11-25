import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from templates import custom_layout_from_db, get_layout_by_name
from utils.service_urls import get_bind_host, get_web_base_url


def test_defaults(monkeypatch):
    monkeypatch.delenv("PRESENTON_BIND_HOST", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_URL", raising=False)
    assert get_bind_host() == "127.0.0.1"
    assert get_web_base_url() == "http://localhost"


def test_overrides(monkeypatch):
    monkeypatch.setenv("PRESENTON_BIND_HOST", "0.0.0.0")
    monkeypatch.setenv("NEXT_PUBLIC_URL", "http://proxy:8080/")
    assert get_bind_host() == "0.0.0.0"
    assert get_web_base_url() == "http://proxy:8080"


def _capturing_session(method: str, captured: list):
    """Fake aiohttp session that records the requested URL."""
    resp = AsyncMock()
    resp.status = 200
    resp.json = AsyncMock(
        return_value={
            "name": "grp",
            "ordered": False,
            "slides": [{"id": "layout", "json_schema": {"title": "t"}}],
        }
    )

    def _request(url, **_kw):
        captured.append(url)
        inner = MagicMock()
        inner.__aenter__ = AsyncMock(return_value=resp)
        inner.__aexit__ = AsyncMock(return_value=None)
        return inner

    session = MagicMock()
    setattr(session, method, MagicMock(side_effect=_request))
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    return session


def test_builtin_template_uses_web_base_url(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_URL", "http://proxy:8080")
    urls: list = []
    with patch(
        "templates.get_layout_by_name.aiohttp.ClientSession",
        return_value=_capturing_session("get", urls),
    ):
        asyncio.run(get_layout_by_name.get_layout_by_name("deck"))
    assert urls == ["http://proxy:8080/api/template?group=deck"]


def test_custom_compile_url_uses_web_base_url(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_URL", "http://proxy:8080")
    urls: list = []
    with patch(
        "templates.custom_layout_from_db.aiohttp.ClientSession",
        return_value=_capturing_session("post", urls),
    ):
        asyncio.run(
            custom_layout_from_db._compile_custom_layouts_on_nextjs("custom-x", [])
        )
    assert urls == ["http://proxy:8080/api/template/custom"]


def test_server_entrypoints_resolve_bind_host():
    import mcp_server

    assert mcp_server.get_bind_host is get_bind_host
