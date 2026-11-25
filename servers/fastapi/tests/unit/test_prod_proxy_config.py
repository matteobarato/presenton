import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
PROXY_CONFIG = ROOT / "docker" / "prod" / "proxy.nginx.conf"
COMPOSE = ROOT / "docker-compose.prod.yml"


def _servers() -> tuple[str, str]:
    """The public (:80) and container-only (:8080) server blocks."""
    config = PROXY_CONFIG.read_text(encoding="utf-8")
    blocks = re.split(r"^  server \{", config, flags=re.M)[1:]
    assert len(blocks) == 2
    return blocks[0], blocks[1]


def test_public_renderer_routes_are_exact():
    public_server, _ = _servers()
    for route in [
        "/api/runtime-config",
        "/api/templates",
        "/api/has-required-key",
        "/api/can-change-keys",
        "/api/update-svg",
    ]:
        assert f"location = {route} " in public_server


def test_listeners_and_defaults():
    public_server, internal_server = _servers()
    assert "listen 80;" in public_server
    assert "proxy_pass http://frontend_up" in public_server
    assert "listen 8080;" in internal_server
    assert "proxy_pass http://renderer_up" in internal_server
    assert "frontend_up" not in internal_server


def test_only_one_published_port():
    compose = COMPOSE.read_text(encoding="utf-8")
    assert re.findall(r'^\s*-\s*"[^"]*:\d+"[ \t]*$', compose, re.M) == [
        '      - "${PRESENTON_HTTP_HOST_PORT:-5001}:80"'
    ]
    assert "1455" not in compose
