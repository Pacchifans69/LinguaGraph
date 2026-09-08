"""Add the M4 sparse Human-reviewed lemma annotation table.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-08

M4 is strictly additive: one sparse occurrence-level annotation table bound
directly to ``segments.id``. No existing column, constraint, index or row is
touched, and revisions ``0001``–``0004`` remain byte-for-byte unchanged.

The annotation stores no redundant linguistic context (text version, token
layer, coordinates, ``exact_text``, ``is_word_like``, language tag, sentence
basis id); those remain owned by the authoritative token hierarchy. The
database enforces exactly one annotation per token occurrence through
``UNIQUE(token_segment_id)`` and the ownership invariant through
``ON DELETE CASCADE`` on the token FK, which is what lets the existing
``force=true`` TextVersion destructive reset remove the complete
TextVersion → SegmentationLayer → Segment → TokenLemmaAnnotation hierarchy
atomically without any M4-specific service change.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the sparse token-occurrence lemma annotation table."""

    op.create_table(
        "token_lemma_annotations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_segment_id", sa.Uuid(), nullable=False),
        sa.Column("lemma", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="token_lemma_annotations_pkey"),
        sa.ForeignKeyConstraint(
            ["token_segment_id"],
            ["segments.id"],
            name="fk_token_lemma_annotations_token_segment_id_segments",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "token_segment_id",
            name="uq_token_lemma_annotations_token_segment_id",
        ),
    )


def downgrade() -> None:
    """Remove only M4-owned lemma schema/data.

    Sentence/token segmentation layers, their segments, and every M0–M3 row
    are untouched: the only M4 addition is this table.
    """

    op.drop_table("token_lemma_annotations")
