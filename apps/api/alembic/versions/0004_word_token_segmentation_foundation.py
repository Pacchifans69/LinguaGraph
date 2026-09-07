"""Add the M3 word/token segmentation foundation.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("segmentation_layers", sa.Column("basis_layer_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_segmentation_layers_basis_layer_id_segmentation_layers",
        "segmentation_layers",
        "segmentation_layers",
        ["basis_layer_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_segmentation_layers_basis_layer_id",
        "segmentation_layers",
        ["basis_layer_id"],
    )
    op.add_column("segments", sa.Column("is_word_like", sa.Boolean(), nullable=True))
    op.drop_constraint("ck_segmentation_layers_granularity", "segmentation_layers", type_="check")
    op.create_check_constraint(
        "ck_segmentation_layers_granularity",
        "segmentation_layers",
        "granularity IN ('sentence', 'token')",
    )
    op.create_check_constraint(
        "ck_segmentation_layers_basis_by_granularity",
        "segmentation_layers",
        "(granularity = 'sentence' AND basis_layer_id IS NULL) OR "
        "(granularity = 'token' AND basis_layer_id IS NOT NULL)",
    )


def downgrade() -> None:
    # Token rows are the explicit M3 addition. Remove them before restoring
    # the M2 sentence-only constraint; sentence rows remain byte-for-byte.
    op.execute("DELETE FROM segmentation_layers WHERE granularity = 'token'")
    op.drop_constraint(
        "ck_segmentation_layers_basis_by_granularity",
        "segmentation_layers",
        type_="check",
    )
    op.drop_constraint("ck_segmentation_layers_granularity", "segmentation_layers", type_="check")
    op.create_check_constraint(
        "ck_segmentation_layers_granularity",
        "segmentation_layers",
        "granularity IN ('sentence')",
    )
    op.drop_column("segments", "is_word_like")
    op.drop_index("ix_segmentation_layers_basis_layer_id", table_name="segmentation_layers")
    op.drop_constraint(
        "fk_segmentation_layers_basis_layer_id_segmentation_layers",
        "segmentation_layers",
        type_="foreignkey",
    )
    op.drop_column("segmentation_layers", "basis_layer_id")
