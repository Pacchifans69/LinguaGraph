"""Add the M5 sparse Human-reviewed coarse POS annotation table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-09

M5 is strictly additive: one sparse occurrence-level coarse POS annotation
table bound directly to ``segments.id``. No existing column, constraint, index
or row is touched, and revisions ``0001``–``0005`` remain byte-for-byte
unchanged.

The table is the SIBLING of ``token_lemma_annotations``, not an extension of
it: lemma and POS have independent lifecycles and neither references the
other. It stores no redundant linguistic context (text version, token layer,
coordinates, ``exact_text``, ``is_word_like``, language tag, sentence basis
id, lemma); those remain owned by the authoritative token hierarchy.

The database enforces exactly one annotation per token occurrence through
``UNIQUE(token_segment_id)``, the frozen fifteen-value vocabulary through the
named CHECK constraint (matching the SQLAlchemy ORM metadata exactly), and the
ownership invariant through ``ON DELETE CASCADE`` on the token FK, which is
what lets the existing ``force=true`` TextVersion destructive reset remove the
complete TextVersion → SegmentationLayer → Segment → TokenPosAnnotation
hierarchy atomically without any M5-specific service change.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create the sparse token-occurrence coarse POS annotation table."""

    op.create_table(
        "token_pos_annotations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_segment_id", sa.Uuid(), nullable=False),
        sa.Column("pos_tag", sa.String(length=5), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="token_pos_annotations_pkey"),
        sa.ForeignKeyConstraint(
            ["token_segment_id"],
            ["segments.id"],
            name="fk_token_pos_annotations_token_segment_id_segments",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "token_segment_id",
            name="uq_token_pos_annotations_token_segment_id",
        ),
        sa.CheckConstraint(
            "pos_tag IN ("
            "'ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', "
            "'DET', 'INTJ', 'NOUN', 'NUM', 'PART', "
            "'PRON', 'PROPN', 'SCONJ', 'VERB', 'X'"
            ")",
            name="ck_token_pos_annotations_pos_tag",
        ),
    )


def downgrade() -> None:
    """Remove only M5-owned POS schema/data.

    Sentence/token segmentation layers, their segments, the M4 lemma
    annotations, and every M0–M4 row are untouched: the only M5 addition is
    this table.
    """

    op.drop_table("token_pos_annotations")
