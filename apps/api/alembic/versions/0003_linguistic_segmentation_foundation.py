"""Add the M2 persistent linguistic sentence-segmentation layer.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-05
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create independent segmentation layer and segment tables."""

    op.create_table(
        "segmentation_layers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("text_version_id", sa.Uuid(), nullable=False),
        sa.Column("granularity", sa.String(length=32), nullable=False),
        sa.Column("requested_locale", sa.String(length=100), nullable=False),
        sa.Column("resolved_locale", sa.String(length=100), nullable=False),
        sa.Column("origin", sa.String(length=32), nullable=False),
        sa.Column("content_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="segmentation_layers_pkey"),
        sa.ForeignKeyConstraint(
            ["text_version_id"],
            ["text_versions.id"],
            name="fk_segmentation_layers_text_version_id_text_versions",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "text_version_id",
            "granularity",
            name="uq_segmentation_layers_text_version_granularity",
        ),
        sa.CheckConstraint(
            "granularity IN ('sentence')",
            name="ck_segmentation_layers_granularity",
        ),
        sa.CheckConstraint(
            "origin IN ('manual', 'intl_segmenter')",
            name="ck_segmentation_layers_origin",
        ),
    )
    op.create_index(
        "ix_segmentation_layers_text_version_id",
        "segmentation_layers",
        ["text_version_id"],
    )

    op.create_table(
        "segments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("segmentation_layer_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("exact_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="segments_pkey"),
        sa.ForeignKeyConstraint(
            ["segmentation_layer_id"],
            ["segmentation_layers.id"],
            name="fk_segments_segmentation_layer_id_segmentation_layers",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "ordinal >= 0",
            name="ck_segments_ordinal_non_negative",
        ),
        sa.CheckConstraint(
            "start_offset >= 0",
            name="ck_segments_start_offset_non_negative",
        ),
        sa.CheckConstraint(
            "end_offset > start_offset",
            name="ck_segments_end_offset_after_start",
        ),
        sa.UniqueConstraint(
            "segmentation_layer_id",
            "ordinal",
            name="uq_segments_layer_ordinal",
        ),
        sa.UniqueConstraint(
            "segmentation_layer_id",
            "start_offset",
            "end_offset",
            name="uq_segments_layer_start_end",
        ),
    )
    op.create_index(
        "ix_segments_segmentation_layer_id",
        "segments",
        ["segmentation_layer_id"],
    )


def downgrade() -> None:
    """Drop only the M2 segmentation tables."""

    op.drop_index(
        "ix_segments_segmentation_layer_id",
        table_name="segments",
    )
    op.drop_table("segments")
    op.drop_index(
        "ix_segmentation_layers_text_version_id",
        table_name="segmentation_layers",
    )
    op.drop_table("segmentation_layers")
