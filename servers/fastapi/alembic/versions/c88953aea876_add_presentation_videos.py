"""add presentation videos

Revision ID: c88953aea876
Revises: a1c3e5f7b9d2
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "c88953aea876"
down_revision: Union[str, None] = "a1c3e5f7b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "presentation_videos"


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return index_name in {index["name"] for index in indexes}


def upgrade() -> None:
    if not _has_table(TABLE_NAME):
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("owner_id", sa.Uuid(), nullable=True),
            sa.Column("presentation", sa.Uuid(), nullable=False),
            sa.Column("language", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column(
                "language_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False
            ),
            sa.Column("preset", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("path", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column(
                "subtitles_mode", sqlmodel.sql.sqltypes.AutoString(), nullable=False
            ),
            sa.Column(
                "subtitle_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            ),
            sa.Column(
                "subtitle_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            ),
            sa.Column("resolution", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("fps", sa.Integer(), nullable=False),
            sa.Column("slide_count", sa.Integer(), nullable=False),
            sa.Column("duration_seconds", sa.Float(), nullable=True),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.Column(
                "source_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["presentation"], ["presentations.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "presentation",
                "language",
                "preset",
                name="uq_presentation_video_presentation_language_preset",
            ),
        )
    for column in ("owner_id", "presentation"):
        index_name = op.f(f"ix_{TABLE_NAME}_{column}")
        if not _has_index(TABLE_NAME, index_name):
            op.create_index(index_name, TABLE_NAME, [column], unique=False)


def downgrade() -> None:
    if _has_table(TABLE_NAME):
        for column in ("presentation", "owner_id"):
            index_name = op.f(f"ix_{TABLE_NAME}_{column}")
            if _has_index(TABLE_NAME, index_name):
                op.drop_index(index_name, table_name=TABLE_NAME)
        op.drop_table(TABLE_NAME)
