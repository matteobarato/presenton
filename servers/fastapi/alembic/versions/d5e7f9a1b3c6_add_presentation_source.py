"""add presentation source

Marks decks imported from PowerPoint: ``source`` says where the deck came from
(``"pptx"``) and ``source_name`` keeps the original file name. Both are null
for decks made any other way, which is every deck before this revision.

Revision ID: d5e7f9a1b3c6
Revises: c4d6e8f0a2b3
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e7f9a1b3c6"
down_revision: Union[str, None] = "c4d6e8f0a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "presentations"
COLUMN_NAMES = ("source", "source_name")


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if not _has_table(TABLE_NAME):
        return
    for column_name in COLUMN_NAMES:
        if not _has_column(TABLE_NAME, column_name):
            op.add_column(
                TABLE_NAME, sa.Column(column_name, sa.String(), nullable=True)
            )


def downgrade() -> None:
    if not _has_table(TABLE_NAME):
        return
    for column_name in COLUMN_NAMES:
        if _has_column(TABLE_NAME, column_name):
            with op.batch_alter_table(TABLE_NAME) as batch_op:
                batch_op.drop_column(column_name)
