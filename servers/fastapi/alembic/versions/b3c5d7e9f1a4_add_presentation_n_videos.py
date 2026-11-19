"""add presentation n_videos

How many slides of a template deck should hold a presenter (avatar) video
slot. Null means the template decides (the behaviour before this revision), 0
means no presenter slots, and a positive number is the target count of them.

Revision ID: b3c5d7e9f1a4
Revises: a2b4c6d8e0f1
Create Date: 2026-11-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3c5d7e9f1a4"
down_revision: Union[str, None] = "a2b4c6d8e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "presentations"
COLUMN_NAME = "n_videos"


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if _has_table(TABLE_NAME) and not _has_column(TABLE_NAME, COLUMN_NAME):
        op.add_column(
            TABLE_NAME, sa.Column(COLUMN_NAME, sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    if _has_table(TABLE_NAME) and _has_column(TABLE_NAME, COLUMN_NAME):
        with op.batch_alter_table(TABLE_NAME) as batch_op:
            batch_op.drop_column(COLUMN_NAME)
