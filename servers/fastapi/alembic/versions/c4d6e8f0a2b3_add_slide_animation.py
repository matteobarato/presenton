"""add slide animation

Stores a slide's motion timeline as JSON. Null means the slide has no authored
animation, which is what every slide saved before this revision is.

Revision ID: c4d6e8f0a2b3
Revises: b3c5d7e9f1a4
Create Date: 2026-11-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d6e8f0a2b3"
down_revision: Union[str, None] = "b3c5d7e9f1a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "slides"
COLUMN_NAME = "animation"


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if _has_table(TABLE_NAME) and not _has_column(TABLE_NAME, COLUMN_NAME):
        op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.JSON(), nullable=True))


def downgrade() -> None:
    if _has_table(TABLE_NAME) and _has_column(TABLE_NAME, COLUMN_NAME):
        with op.batch_alter_table(TABLE_NAME) as batch_op:
            batch_op.drop_column(COLUMN_NAME)
