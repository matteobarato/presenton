import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.admin.router import API_V1_ADMIN_ROUTER
from api.v1.auth.config import SESSION_COOKIE_NAME
from api.v1.auth.router import API_V1_AUTH_ROUTER
from api.v1.auth.users import PASSWORD_HELPER
from models.sql.api_key import ApiKey
from models.sql.presenton_cloud_provider import PresentonCloudProvider
from models.sql.provider_settings import ProviderSettings
from models.sql.user import User
from services.database import get_async_session
from services.presenton_cloud import store_presenton_credentials
from utils.get_env import get_presenton_oauth_issuer


def _build_client(tmp_path) -> tuple[TestClient, object]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'auth.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def create_user_table():
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(ApiKey.__table__.create)
            await connection.run_sync(ProviderSettings.__table__.create)
            await connection.run_sync(PresentonCloudProvider.__table__.create)

    asyncio.run(create_user_table())

    async def override_session():
        async with session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(API_V1_AUTH_ROUTER)
    app.include_router(API_V1_ADMIN_ROUTER)
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), engine


def test_login_sets_http_only_jwt_cookie_for_username_only_account(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)

    client, engine = _build_client(tmp_path)
    setup = client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "ADMIN", "password": "secret123"},
    )

    assert setup.status_code == 200
    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is True
    assert payload["authenticated"] is True
    assert payload["username"] == "admin"
    assert "access_token" not in payload
    assert SESSION_COOKIE_NAME in response.cookies
    assert "HttpOnly" in response.headers["set-cookie"]

    asyncio.run(engine.dispose())


def test_admin_can_assign_normal_user_key_for_rest_api(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    user_response = client.post(
        "/api/v1/admin/users",
        json={"username": "api-user", "password": "secret456"},
    )
    token_response = client.post(
        "/api/v1/admin/api-keys",
        json={
            "user_id": user_response.json()["id"],
            "label": "Automation",
            "expiry_days": 90,
        },
    )
    token = token_response.json()["token"]
    client.cookies.clear()

    response = client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert user_response.status_code == 201
    assert token_response.status_code == 201
    assert token.startswith("sk-presenton-")
    assert not token.startswith("sk-presenton-mcp-")
    assert response.status_code == 200
    assert response.json()["method"] == "api_key"
    assert response.json()["role"] == "user"
    assert response.json()["username"] == "api-user"

    legacy_response = client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": "Bearer sk-presenton-legacy-plaintext"},
    )
    assert legacy_response.status_code == 401

    asyncio.run(engine.dispose())


def test_legacy_six_character_password_can_still_log_in(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    async def seed_legacy_admin():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            session.add(
                User(
                    username="legacy-admin",
                    hashed_password=PASSWORD_HELPER.hash("123456"),
                    is_active=True,
                    is_verified=True,
                    is_superuser=True,
                    admin_slot="primary",
                )
            )
            await session.commit()

    asyncio.run(seed_legacy_admin())
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "legacy-admin", "password": "123456"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    asyncio.run(engine.dispose())


def test_repeated_failed_logins_are_not_rate_limited(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "rate-admin", "password": "secret123"},
    )
    for _ in range(10):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "rate-admin", "password": "wrong-password"},
        )
        assert response.status_code == 401
    asyncio.run(engine.dispose())


def test_database_rejects_a_second_primary_administrator(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "first-admin", "password": "secret123"},
    )

    async def insert_second_admin():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            session.add(
                User(
                    username="second-admin",
                    hashed_password=PASSWORD_HELPER.hash("secret456"),
                    is_active=True,
                    is_verified=True,
                    is_superuser=True,
                    admin_slot="primary",
                )
            )
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return True
        return False

    assert asyncio.run(insert_second_admin()) is True
    asyncio.run(engine.dispose())


def test_admin_provider_settings_include_safe_global_presenton_status(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.setenv("CAN_CHANGE_KEYS", "true")
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )

    async def seed_provider():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            await store_presenton_credentials(
                session,
                issuer=get_presenton_oauth_issuer(),
                subject="cloud-admin",
                email="cloud-admin@example.com",
                access_token="user.jwt.signature",
                expires_in=3600,
            )

    asyncio.run(seed_provider())
    response = client.get("/api/v1/admin/provider-settings")

    assert response.status_code == 200
    assert response.json()["PRESENTON_CONNECTED"] is True
    assert response.json()["PRESENTON_EMAIL"] == "cloud-admin@example.com"
    assert "PRESENTON_SCOPES" not in response.json()
    assert "PRESENTON_ACCESS_TOKEN" not in response.json()
    assert "PRESENTON_REFRESH_TOKEN" not in response.json()
    asyncio.run(engine.dispose())


def _setup_admin_and_login(client) -> None:
    client.post("/api/v1/auth/setup", json={"username": "admin", "password": "secret123"})
    client.post("/api/v1/auth/login", json={"username": "admin", "password": "secret123"})


def test_user_can_change_own_password_and_stays_signed_in(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    client.post("/api/v1/admin/users", json={"username": "bob", "password": "bobpass123"})
    client.cookies.clear()
    client.post("/api/v1/auth/login", json={"username": "bob", "password": "bobpass123"})
    old_cookie = client.cookies.get(SESSION_COOKIE_NAME)

    response = client.post(
        "/api/v1/auth/password",
        json={"current_password": "bobpass123", "new_password": "newpass456"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "bob"
    assert client.get("/api/v1/auth/status").json()["authenticated"] is True
    # The previous session token is no longer valid.
    client.cookies.set(SESSION_COOKIE_NAME, old_cookie)
    assert client.get("/api/v1/auth/status").json()["authenticated"] is False
    client.cookies.clear()
    assert (
        client.post("/api/v1/auth/login", json={"username": "bob", "password": "bobpass123"}).status_code
        == 401
    )
    assert (
        client.post("/api/v1/auth/login", json={"username": "bob", "password": "newpass456"}).status_code
        == 200
    )
    asyncio.run(engine.dispose())


def test_change_password_rejects_wrong_current_password_without_401(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)

    wrong = client.post(
        "/api/v1/auth/password",
        json={"current_password": "nope-nope", "new_password": "newpass456"},
    )
    same = client.post(
        "/api/v1/auth/password",
        json={"current_password": "secret123", "new_password": "secret123"},
    )
    short = client.post(
        "/api/v1/auth/password",
        json={"current_password": "secret123", "new_password": "short"},
    )
    client.cookies.clear()
    anonymous = client.post(
        "/api/v1/auth/password",
        json={"current_password": "secret123", "new_password": "newpass456"},
    )

    assert wrong.status_code == 400
    assert same.status_code == 422
    assert short.status_code == 422
    assert anonymous.status_code == 401
    asyncio.run(engine.dispose())


def test_admin_password_change_updates_recovery_copy(monkeypatch, tmp_path):
    import json

    config_path = tmp_path / "userConfig.json"
    monkeypatch.setenv("USER_CONFIG_PATH", str(config_path))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    before = json.loads(config_path.read_text())["AUTH_PASSWORD_HASH"]

    response = client.post(
        "/api/v1/auth/password",
        json={"current_password": "secret123", "new_password": "newadmin456"},
    )

    after = json.loads(config_path.read_text())["AUTH_PASSWORD_HASH"]
    assert response.status_code == 200
    assert after != before
    assert PASSWORD_HELPER.verify_and_update("newadmin456", after)[0]
    asyncio.run(engine.dispose())


def _login_as_new_user(client, username: str, password: str) -> None:
    client.post("/api/v1/admin/users", json={"username": username, "password": password})
    client.cookies.clear()
    client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_user_manages_personal_api_keys_that_act_as_themselves(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    _login_as_new_user(client, "bob", "bobpass123")

    created = client.post("/api/v1/auth/api-keys", json={"label": "Laptop", "expiry_days": 30})
    assert created.status_code == 201
    key = created.json()
    me = client.get("/api/v1/auth/status").json()
    assert key["user_id"] == me["user_id"]
    assert key["created_by_id"] == me["user_id"]

    listed = client.get("/api/v1/auth/api-keys").json()
    assert [k["id"] for k in listed] == [key["id"]]
    revealed = client.get(f"/api/v1/auth/api-keys/{key['id']}/token")
    assert revealed.json()["token"] == key["token"]
    assert revealed.headers["cache-control"] == "no-store"

    client.cookies.clear()
    verify = client.get("/api/v1/auth/verify", headers={"Authorization": f"Bearer {key['token']}"})
    assert verify.json()["username"] == "bob"

    client.post("/api/v1/auth/login", json={"username": "bob", "password": "bobpass123"})
    revoked = client.post(f"/api/v1/auth/api-keys/{key['id']}/revoke")
    assert revoked.json()["revoked_at"] is not None
    client.cookies.clear()
    assert (
        client.get("/api/v1/auth/verify", headers={"Authorization": f"Bearer {key['token']}"}).status_code
        == 401
    )
    asyncio.run(engine.dispose())


def test_personal_api_keys_cannot_target_another_user(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    admin_id = client.get("/api/v1/auth/status").json()["user_id"]
    admin_key = client.post("/api/v1/auth/api-keys", json={"label": "Admin own"}).json()
    _login_as_new_user(client, "mallory", "malpass123")

    smuggled = client.post(
        "/api/v1/auth/api-keys", json={"label": "Sneaky", "user_id": admin_id}
    )
    assert smuggled.status_code == 422
    assert client.get("/api/v1/auth/api-keys").json() == []
    assert client.get(f"/api/v1/auth/api-keys/{admin_key['id']}/token").status_code == 404
    assert client.post(f"/api/v1/auth/api-keys/{admin_key['id']}/revoke").status_code == 404
    assert client.get("/api/v1/admin/api-keys").status_code == 403
    asyncio.run(engine.dispose())


def test_api_key_cannot_manage_api_keys(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    _login_as_new_user(client, "bob", "bobpass123")
    token = client.post("/api/v1/auth/api-keys", json={"label": "CI"}).json()["token"]
    client.cookies.clear()

    bearer = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/v1/auth/api-keys", json={"label": "More"}, headers=bearer).status_code == 401
    assert client.get("/api/v1/auth/api-keys", headers=bearer).status_code == 401
    asyncio.run(engine.dispose())


def test_personal_api_keys_are_capped_for_non_admins(monkeypatch, tmp_path):
    from api.v1.auth.personal_keys import MAX_ACTIVE_PERSONAL_KEYS

    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _setup_admin_and_login(client)
    _login_as_new_user(client, "bob", "bobpass123")
    ids = [
        client.post("/api/v1/auth/api-keys", json={"label": f"k{i}"}).json()["id"]
        for i in range(MAX_ACTIVE_PERSONAL_KEYS)
    ]

    over = client.post("/api/v1/auth/api-keys", json={"label": "one too many"})
    client.post(f"/api/v1/auth/api-keys/{ids[0]}/revoke")
    after_revoke = client.post("/api/v1/auth/api-keys", json={"label": "replacement"})

    assert over.status_code == 409
    assert after_revoke.status_code == 201
    asyncio.run(engine.dispose())
