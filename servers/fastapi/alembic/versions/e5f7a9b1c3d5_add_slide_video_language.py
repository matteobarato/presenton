"""add slide video language

An avatar video is lip-synced to one narration language. Recording it lets the
player pick the avatar only when its language is the one being narrated, and
lets the editor tell a stale avatar whose audio was regenerated from one whose
note changed. Null means "any language", which is what every video uploaded
before this revision keeps.

Revision ID: e5f7a9b1c3d5
Revises: d4e6f8a0b2c4
Create Date: 2026-10-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5f7a9b1c3d5"
down_revision: Union[str, None] = "d4e6f8a0b2c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "slide_videos"
COLUMN_NAME = "language"


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if _has_table(TABLE_NAME) and not _has_column(TABLE_NAME, COLUMN_NAME):
        op.add_column(
            TABLE_NAME, sa.Column(COLUMN_NAME, sa.String(), nullable=True)
        )


def downgrade() -> None:
    if _has_table(TABLE_NAME) and _has_column(TABLE_NAME, COLUMN_NAME):
        with op.batch_alter_table(TABLE_NAME) as batch_op:
            batch_op.drop_column(COLUMN_NAME)
