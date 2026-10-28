"""The deck's presenter portrait: one picture every generated avatar starts from.

The file lives in the deck's video folder and its description in
``presentation.narration["portrait"]``, beside the voice bubble. Each save
writes a new file name so clients never see a stale cached picture, as with
videos.
"""

from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from PIL import Image, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.presentation import PresentationModel
from models.slide_video_response import PortraitResponse
from utils.asset_directory_utils import app_data_file_url, get_videos_directory
from utils.get_env import get_heygen_api_key_env
from utils.video_files import remove_file

MAX_PORTRAIT_BYTES = 10 * 1024 * 1024
_FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    # Multi-picture JPEGs (many phone cameras) are reported as MPO by Pillow.
    "MPO": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}


class InvalidPortraitError(ValueError):
    pass


def generation_available() -> bool:
    return bool((get_heygen_api_key_env() or "").strip())


def _directory(presentation: PresentationModel) -> str:
    return os.path.join(get_videos_directory(), str(presentation.id))


def _entry(presentation: PresentationModel) -> Optional[dict]:
    entry = (presentation.narration or {}).get("portrait")
    return entry if isinstance(entry, dict) and entry.get("file") else None


def portrait_path(presentation: PresentationModel) -> Optional[str]:
    entry = _entry(presentation)
    if entry is None:
        return None
    # Only the file name is stored, so a copied deck resolves it inside its own
    # folder (and finds nothing) rather than reaching into the original's.
    return os.path.join(_directory(presentation), os.path.basename(entry["file"]))


def portrait_response(presentation: PresentationModel) -> Optional[PortraitResponse]:
    entry = _entry(presentation)
    path = portrait_path(presentation)
    if entry is None or path is None or not os.path.exists(path):
        return None
    return PortraitResponse(
        url=app_data_file_url(path),
        mime_type=entry["mime_type"],
        width=entry["width"],
        height=entry["height"],
        size_bytes=entry["size_bytes"],
        updated_at=datetime.fromisoformat(entry["updated_at"]),
    )


def read_portrait(presentation: PresentationModel) -> Optional[tuple[bytes, str]]:
    entry = _entry(presentation)
    path = portrait_path(presentation)
    if entry is None or path is None:
        return None
    try:
        with open(path, "rb") as f:
            return f.read(), entry["mime_type"]
    except FileNotFoundError:
        return None


def _decode(data: bytes) -> tuple[str, str, int, int]:
    if not data:
        raise InvalidPortraitError("Portrait file is empty")
    if len(data) > MAX_PORTRAIT_BYTES:
        raise InvalidPortraitError("Portrait is larger than the 10 MB limit")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            image_format, (width, height) = image.format, image.size
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
    ):
        raise InvalidPortraitError("Portrait is not a valid JPEG, PNG or WebP image")
    if image_format not in _FORMATS:
        raise InvalidPortraitError("Portrait must be a JPEG, PNG or WebP image")
    extension, mime_type = _FORMATS[image_format]
    return extension, mime_type, width, height


async def save_portrait(
    sql_session: AsyncSession, presentation: PresentationModel, data: bytes
) -> PortraitResponse:
    extension, mime_type, width, height = _decode(data)
    previous = portrait_path(presentation)

    directory = _directory(presentation)
    os.makedirs(directory, exist_ok=True)
    file_name = f"portrait-{uuid.uuid4().hex[:8]}.{extension}"
    path = os.path.join(directory, file_name)
    try:
        with open(path, "wb") as output:
            output.write(data)
        # A new dict, so the JSON column notices the change.
        presentation.narration = {
            **(presentation.narration or {}),
            "portrait": {
                "file": file_name,
                "mime_type": mime_type,
                "width": width,
                "height": height,
                "size_bytes": len(data),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        sql_session.add(presentation)
        await sql_session.commit()
    except BaseException:
        remove_file(path)
        raise
    remove_file(previous)
    response = portrait_response(presentation)
    assert response is not None
    return response


async def delete_portrait(
    sql_session: AsyncSession, presentation: PresentationModel
) -> bool:
    path = portrait_path(presentation)
    if _entry(presentation) is None:
        return False
    presentation.narration = {
        key: value
        for key, value in (presentation.narration or {}).items()
        if key != "portrait"
    }
    sql_session.add(presentation)
    await sql_session.commit()
    remove_file(path)
    return True
