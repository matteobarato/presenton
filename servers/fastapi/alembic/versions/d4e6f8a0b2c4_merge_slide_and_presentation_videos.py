"""merge slide videos and presentation videos

Both video features were written against the same parent (`a1c3e5f7b9d2`):
`b7d9f1a3c5e8` adds the per-slide avatar videos, `c88953aea876` adds the
rendered narrated MP4s. This revision joins the two heads so a database that
ran either one upgrades to a single head. It changes no schema; each branch's
own migration already created its tables, and neither is edited here.

Revision ID: d4e6f8a0b2c4
Revises: b7d9f1a3c5e8, c88953aea876
Create Date: 2026-10-27 00:00:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "d4e6f8a0b2c4"
down_revision: Union[str, Sequence[str], None] = (
    "b7d9f1a3c5e8",
    "c88953aea876",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
