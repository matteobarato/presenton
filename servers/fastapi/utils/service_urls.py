import os


def get_bind_host() -> str:
    """Address FastAPI and MCP listen on; loopback unless nginx is elsewhere."""
    return (os.getenv("PRESENTON_BIND_HOST") or "").strip() or "127.0.0.1"


def get_web_base_url() -> str:
    """Base URL for server-side calls to the web routes."""
    value = (os.getenv("NEXT_PUBLIC_URL") or "").strip().rstrip("/")
    return value or "http://localhost"
