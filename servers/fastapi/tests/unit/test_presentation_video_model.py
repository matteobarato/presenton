import asyncio
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select

from models.presentation_video_response import PresentationVideoResponse
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_video import PresentationVideoModel
from models.sql.user import User


class _Deck:
    """A single presentation on its own SQLite database, foreign keys on."""

    def __init__(self, tmp_path):
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{tmp_path / 'videos.db'}"
        )
        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)
        self.presentation_id = uuid.uuid4()

    async def setup(self):
        async with self.engine.begin() as connection:
            await connection.execute(text("PRAGMA foreign_keys=ON"))
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(PresentationVideoModel.__table__.create)
        async with self.session_maker() as session:
            session.add(
                PresentationModel(
                    id=self.presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="content",
                    n_slides=1,
                    language="English",
                )
            )
            await session.commit()
        return self

    async def dispose(self):
        await self.engine.dispose()

    def new_video(self, **overrides) -> PresentationVideoModel:
        fields = dict(
            presentation=self.presentation_id,
            language="en",
            language_name="English",
            preset="1080p-30-soft",
            path="/data/videos/deck.mp4",
            url="/app_data/videos/users/owner/deck.mp4",
            subtitles_mode="soft",
            subtitle_path="/data/videos/deck.vtt",
            subtitle_url="/app_data/videos/users/owner/deck.vtt",
            resolution="1080p",
            width=1920,
            height=1080,
            fps=30,
            slide_count=5,
            duration_seconds=42.5,
            size_bytes=1024,
            source_hash="deadbeef",
        )
        fields.update(overrides)
        return PresentationVideoModel(**fields)


def test_presentation_video_row_round_trips(tmp_path):
    async def scenario():
        deck = await _Deck(tmp_path).setup()
        try:
            video = deck.new_video()
            async with deck.session_maker() as session:
                session.add(video)
                await session.commit()

            async with deck.session_maker() as session:
                result = await session.execute(
                    select(PresentationVideoModel).where(
                        PresentationVideoModel.presentation == deck.presentation_id
                    )
                )
                return result.scalar_one(), video
        finally:
            await deck.dispose()

    stored, video = asyncio.run(scenario())

    assert stored.id == video.id
    assert stored.language == "en"
    assert stored.preset == "1080p-30-soft"
    assert stored.url == "/app_data/videos/users/owner/deck.mp4"
    assert stored.subtitle_url == "/app_data/videos/users/owner/deck.vtt"
    assert stored.width == 1920
    assert stored.height == 1080
    assert stored.fps == 30
    assert stored.slide_count == 5
    assert stored.duration_seconds == 42.5
    assert stored.source_hash == "deadbeef"


def test_presentation_video_unique_constraint_on_presentation_language_preset(
    tmp_path,
):
    async def scenario():
        deck = await _Deck(tmp_path).setup()
        try:
            async with deck.session_maker() as session:
                session.add(deck.new_video())
                await session.commit()

            async with deck.session_maker() as session:
                session.add(deck.new_video())
                with pytest.raises(IntegrityError):
                    await session.commit()
        finally:
            await deck.dispose()

    asyncio.run(scenario())


def test_presentation_video_allows_same_deck_different_language_or_preset(tmp_path):
    async def scenario():
        deck = await _Deck(tmp_path).setup()
        try:
            async with deck.session_maker() as session:
                session.add(deck.new_video())
                session.add(deck.new_video(language="fr", language_name="French"))
                session.add(
                    deck.new_video(
                        preset="720p-24-none",
                        subtitles_mode="none",
                        subtitle_path=None,
                        subtitle_url=None,
                    )
                )
                await session.commit()

            async with deck.session_maker() as session:
                result = await session.execute(select(PresentationVideoModel))
                return result.scalars().all()
        finally:
            await deck.dispose()

    rows = asyncio.run(scenario())
    assert len(rows) == 3


def test_deleting_presentation_cascades_video_row_away(tmp_path):
    async def scenario():
        deck = await _Deck(tmp_path).setup()
        try:
            async with deck.session_maker() as session:
                session.add(deck.new_video())
                await session.commit()

            async with deck.session_maker() as session:
                presentation = await session.get(
                    PresentationModel, deck.presentation_id
                )
                await session.delete(presentation)
                await session.commit()

            async with deck.session_maker() as session:
                result = await session.execute(select(PresentationVideoModel))
                return result.scalars().all()
        finally:
            await deck.dispose()

    rows = asyncio.run(scenario())
    assert rows == []


def test_presentation_video_response_exposes_url_not_filesystem_path(tmp_path):
    # created_at/updated_at are populated by the database default on flush,
    # so the model must round-trip through a session before conversion.
    async def scenario():
        deck = await _Deck(tmp_path).setup()
        try:
            video = deck.new_video()
            async with deck.session_maker() as session:
                session.add(video)
                await session.commit()

            async with deck.session_maker() as session:
                result = await session.execute(select(PresentationVideoModel))
                return result.scalar_one()
        finally:
            await deck.dispose()

    video = asyncio.run(scenario())

    response = PresentationVideoResponse.from_model(video)
    dumped = response.model_dump()

    assert dumped["url"] == "/app_data/videos/users/owner/deck.mp4"
    assert dumped["subtitle_url"] == "/app_data/videos/users/owner/deck.vtt"
    assert "path" not in dumped
    assert "subtitle_path" not in dumped
