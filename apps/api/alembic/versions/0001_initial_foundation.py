"""initial foundation

Foundation migration proving the migration-from-zero chain works.

This revision intentionally changes nothing: M0.1 ships the repository
foundation only. The domain schema (Project, ParallelDocument, TextVersion,
Span, AlignmentGroup, AlignmentMember) arrives in M0.2 on top of this revision.

Revision ID: 0001
Revises:
Create Date: 2026-08-18 20:05:55.358637

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration (no-op foundation revision)."""
    pass


def downgrade() -> None:
    """Revert this migration (no-op foundation revision)."""
    pass
