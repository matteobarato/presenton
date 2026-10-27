"""add slide videos and presentation narration

Revision ID: b7d9f1a3c5e8
Revises: a1c3e5f7b9d2
Create Date: 2026-10-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "b7d9f1a3c5e8"
down_revision: Union[str, None] = "a1c3e5f7b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "slide_videos"
PRESENTATIONS_TABLE = "presentations"
NARRATION_COLUMN = "narration"


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return index_name in {index["name"] for index in indexes}


def _has_column(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if not _has_table(TABLE_NAME):
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("owner_id", sa.Uuid(), nullable=True),
            sa.Column("presentation", sa.Uuid(), nullable=False),
            sa.Column("slide", sa.Uuid(), nullable=False),
            sa.Column(
                "source_note_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False
            ),
            sa.Column(
                "original_filename", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            ),
            sa.Column("path", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("format", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("mime_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.Column("duration_seconds", sa.Float(), nullable=True),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["presentation"], ["presentations.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["slide"], ["slides.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slide", name="uq_slide_video_slide"),
        )
    for column in ("owner_id", "presentation", "slide"):
        index_name = op.f(f"ix_{TABLE_NAME}_{column}")
        if not _has_index(TABLE_NAME, index_name):
            op.create_index(index_name, TABLE_NAME, [column], unique=False)

    if _has_table(PRESENTATIONS_TABLE) and not _has_column(
        PRESENTATIONS_TABLE, NARRATION_COLUMN
    ):
        op.add_column(
            PRESENTATIONS_TABLE,
            sa.Column(NARRATION_COLUMN, sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    if _has_table(PRESENTATIONS_TABLE) and _has_column(
        PRESENTATIONS_TABLE, NARRATION_COLUMN
    ):
        with op.batch_alter_table(PRESENTATIONS_TABLE) as batch_op:
            batch_op.drop_column(NARRATION_COLUMN)

    if _has_table(TABLE_NAME):
        for column in ("slide", "presentation", "owner_id"):
            index_name = op.f(f"ix_{TABLE_NAME}_{column}")
            if _has_index(TABLE_NAME, index_name):
                op.drop_index(index_name, table_name=TABLE_NAME)
        op.drop_table(TABLE_NAME)
