"""Self-service API keys: any signed-in user manages keys that act as themselves.

Every route depends on ``get_current_user``, which reads only the browser session
cookie, so an API key can never be used to mint, reveal or revoke API keys. Keys
belonging to someone else answer 404, exactly like keys that do not exist.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.schemas import (
    ApiKeyCreated,
    ApiKeyPublic,
    ApiKeyToken,
    PersonalCreateApiKeyRequest,
)
from api.v1.auth.users import get_current_user
from models.sql.api_key import ApiKey
from models.sql.user import User
from services.api_keys import issue_api_key, reveal_api_key
from services.database import get_async_session
from utils.datetime_utils import get_current_utc_datetime


# Keeps a compromised session from flooding the table; admins are not capped.
MAX_ACTIVE_PERSONAL_KEYS = 10

PERSONAL_API_KEYS_ROUTER = APIRouter(prefix="/api-keys", tags=["Auth"])


async def _own_key(session: AsyncSession, user: User, api_key_id: str) -> ApiKey:
    api_key = await session.get(ApiKey, api_key_id)
    if api_key is None or api_key.user_id != user.id:
        raise HTTPException(status_code=404, detail="API key not found")
    return api_key


@PERSONAL_API_KEYS_ROUTER.get("", response_model=list[ApiKeyPublic])
async def list_my_api_keys(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    return list(
        (
            await session.scalars(
                select(ApiKey)
                .where(ApiKey.user_id == user.id)
                .order_by(ApiKey.created_at.desc())
            )
        ).all()
    )


@PERSONAL_API_KEYS_ROUTER.post(
    "", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED
)
async def create_my_api_key(
    body: PersonalCreateApiKeyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if not user.is_superuser:
        now = get_current_utc_datetime()
        active = int(
            await session.scalar(
                select(func.count())
                .select_from(ApiKey)
                .where(
                    ApiKey.user_id == user.id,
                    ApiKey.revoked_at.is_(None),
                    ApiKey.expires_at > now,
                )
            )
            or 0
        )
        if active >= MAX_ACTIVE_PERSONAL_KEYS:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"You can have at most {MAX_ACTIVE_PERSONAL_KEYS} active API keys. "
                    "Revoke one first."
                ),
            )
    api_key, token = await issue_api_key(
        session,
        user_id=user.id,
        created_by_id=user.id,
        label=body.label,
        expiry_days=body.expiry_days,
    )
    return ApiKeyCreated.model_validate(
        {**ApiKeyPublic.model_validate(api_key).model_dump(), "token": token}
    )


@PERSONAL_API_KEYS_ROUTER.get("/{api_key_id}/token", response_model=ApiKeyToken)
async def get_my_api_key_token(
    api_key_id: str,
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    api_key = await _own_key(session, user, api_key_id)
    if api_key.revoked_at is not None:
        raise HTTPException(status_code=410, detail="API key has been revoked")
    token = reveal_api_key(api_key)
    if token is None:
        raise HTTPException(status_code=409, detail="This API key cannot be revealed")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return ApiKeyToken(id=api_key.id, token=token)


@PERSONAL_API_KEYS_ROUTER.post("/{api_key_id}/revoke", response_model=ApiKeyPublic)
async def revoke_my_api_key(
    api_key_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    api_key = await _own_key(session, user, api_key_id)
    if api_key.revoked_at is None:
        api_key.revoked_at = get_current_utc_datetime()
        session.add(api_key)
        await session.commit()
        await session.refresh(api_key)
    return api_key
