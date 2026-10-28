import asyncio
import io
import os
import uuid

import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.user import User  # noqa: F401
from services.slide_avatar_portrait import (
    InvalidPortraitError,
    delete_portrait,
    generation_available,
    portrait_path,
    portrait_response,
    read_portrait,
    save_portrait,
)


def _image(fmt="PNG", size=(40, 30)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "red").save(buffer, fmt)
    return buffer.getvalue()


def _run_with_deck(tmp_path, monkeypatch, scenario):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app_data"))
    monkeypatch.delenv("NEXT_PUBLIC_FAST_API", raising=False)

    async def run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'p.db'}")
        try:
            async with engine.begin() as connection:
                await connection.run_sync(PresentationModel.__table__.create)
            presentation = PresentationModel(
                id=uuid.uuid4(),
                version=PresentationVersion.V2_STANDARD,
                content="Deck",
                n_slides=1,
                language="Italian",
                title="Deck",
                narration={"bubble": {"x": 1, "y": 2, "width": 3, "height": 4}},
            )
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                session.add(presentation)
                await session.commit()
                return await scenario(session, presentation)
        finally:
            await engine.dispose()

    return asyncio.run(run())


def test_save_stores_file_and_keeps_the_bubble(tmp_path, monkeypatch):
    async def scenario(session, presentation):
        response = await save_portrait(session, presentation, _image())
        assert (response.width, response.height) == (40, 30)
        assert response.mime_type == "image/png"
        assert os.path.exists(portrait_path(presentation))
        assert presentation.narration["bubble"]["width"] == 3
        assert portrait_response(presentation) == response
        data, mime = read_portrait(presentation)
        assert mime == "image/png" and data == _image()

    _run_with_deck(tmp_path, monkeypatch, scenario)


def test_resave_removes_the_previous_file(tmp_path, monkeypatch):
    async def scenario(session, presentation):
        await save_portrait(session, presentation, _image())
        first = portrait_path(presentation)
        await save_portrait(session, presentation, _image("JPEG"))
        assert not os.path.exists(first)
        assert portrait_path(presentation) != first
        assert os.path.exists(portrait_path(presentation))

    _run_with_deck(tmp_path, monkeypatch, scenario)


def test_rejects_oversized_and_unsupported_images(tmp_path, monkeypatch):
    async def scenario(session, presentation):
        with pytest.raises(InvalidPortraitError):
            await save_portrait(session, presentation, b"\x00" * (11 * 1024 * 1024))
        with pytest.raises(InvalidPortraitError):
            await save_portrait(session, presentation, _image("GIF"))
        with pytest.raises(InvalidPortraitError):
            await save_portrait(session, presentation, b"not an image")
        assert portrait_response(presentation) is None

    _run_with_deck(tmp_path, monkeypatch, scenario)


def test_delete_removes_file_and_key(tmp_path, monkeypatch):
    async def scenario(session, presentation):
        assert await delete_portrait(session, presentation) is False
        await save_portrait(session, presentation, _image())
        path = portrait_path(presentation)
        assert await delete_portrait(session, presentation) is True
        assert not os.path.exists(path)
        assert "portrait" not in presentation.narration
        assert "bubble" in presentation.narration
        assert portrait_path(presentation) is None

    _run_with_deck(tmp_path, monkeypatch, scenario)


def test_generation_available_follows_the_api_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    assert generation_available() is False
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    assert generation_available() is True


def test_mpo_image_is_accepted_as_jpeg(monkeypatch):
    from services import slide_avatar_portrait as module

    jpeg = _image("JPEG")
    real_open = Image.open

    def fake_open(fp, *args, **kwargs):
        image = real_open(fp, *args, **kwargs)
        image.format = "MPO"
        return image

    monkeypatch.setattr(module.Image, "open", fake_open)
    assert module._decode(jpeg) == ("jpg", "image/jpeg", 40, 30)


@pytest.mark.parametrize("error", [ValueError("bad"), SyntaxError("bad")])
def test_malformed_image_errors_map_to_invalid_portrait(monkeypatch, error):
    from services import slide_avatar_portrait as module

    def fake_open(fp, *args, **kwargs):
        raise error

    monkeypatch.setattr(module.Image, "open", fake_open)
    with pytest.raises(InvalidPortraitError):
        module._decode(b"not empty")
