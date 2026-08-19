"""M0.2 domain schema: the frozen language-neutral domain model.

Creates the six domain tables on top of the no-op M0.1 foundation revision
0001: projects, parallel_documents, text_versions, spans, alignment_groups,
alignment_members — with the accepted foreign keys (all ON DELETE CASCADE),
unique constraints, CHECK constraints and indexes
(M0_PREIMPLEMENTATION_REPORT.md, sections 4-5; ADR-001/003/004/006).

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-19

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the M0.2 domain schema (empty database -> 0001 -> 0002)."""

    # --- projects ------------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="projects_pkey"),
    )

    # --- parallel_documents ---------------------------------------------------
    op.create_table(
        "parallel_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="parallel_documents_pkey"),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_parallel_documents_project_id_projects",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_parallel_documents_project_id",
        "parallel_documents",
        ["project_id"],
    )

    # --- text_versions ---------------------------------------------------------
    op.create_table(
        "text_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("language_tag", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.CHAR(length=64), nullable=False),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="text_versions_pkey"),
        sa.UniqueConstraint(
            "document_id", "label", name="uq_text_versions_document_label"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["parallel_documents.id"],
            name="fk_text_versions_document_id_parallel_documents",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_text_versions_document_sort_order",
        "text_versions",
        ["document_id", "sort_order"],
    )

    # --- spans ------------------------------------------------------------------
    op.create_table(
        "spans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("text_version_id", sa.Uuid(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("exact_text", sa.Text(), nullable=False),
        sa.Column("prefix", sa.Text(), nullable=False),
        sa.Column("suffix", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="spans_pkey"),
        sa.CheckConstraint(
            "start_offset >= 0", name="ck_spans_start_offset_non_negative"
        ),
        sa.CheckConstraint(
            "end_offset > start_offset",
            name="ck_spans_end_offset_after_start",
        ),
        sa.UniqueConstraint(
            "text_version_id",
            "start_offset",
            "end_offset",
            name="uq_spans_text_version_start_end",
        ),
        sa.ForeignKeyConstraint(
            ["text_version_id"],
            ["text_versions.id"],
            name="fk_spans_text_version_id_text_versions",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_spans_text_version_id", "spans", ["text_version_id"])

    # --- alignment_groups ----------------------------------------------------------
    op.create_table(
        "alignment_groups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.String(length=4000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="alignment_groups_pkey"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["parallel_documents.id"],
            name="fk_alignment_groups_document_id_parallel_documents",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_alignment_groups_document_id",
        "alignment_groups",
        ["document_id"],
    )

    # --- alignment_members ----------------------------------------------------------
    op.create_table(
        "alignment_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alignment_group_id", sa.Uuid(), nullable=False),
        sa.Column("span_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="alignment_members_pkey"),
        sa.UniqueConstraint(
            "alignment_group_id",
            "span_id",
            name="uq_alignment_members_group_span",
        ),
        sa.ForeignKeyConstraint(
            ["alignment_group_id"],
            ["alignment_groups.id"],
            name="fk_alignment_members_alignment_group_id_alignment_groups",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["span_id"],
            ["spans.id"],
            name="fk_alignment_members_span_id_spans",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_alignment_members_span_id", "alignment_members", ["span_id"]
    )


def downgrade() -> None:
    """Revert the M0.2 domain schema (drop tables in reverse dependency order)."""
    op.drop_index("ix_alignment_members_span_id", table_name="alignment_members")
    op.drop_table("alignment_members")
    op.drop_index("ix_alignment_groups_document_id", table_name="alignment_groups")
    op.drop_table("alignment_groups")
    op.drop_index("ix_spans_text_version_id", table_name="spans")
    op.drop_table("spans")
    op.drop_index(
        "ix_text_versions_document_sort_order", table_name="text_versions"
    )
    op.drop_table("text_versions")
    op.drop_index(
        "ix_parallel_documents_project_id", table_name="parallel_documents"
    )
    op.drop_table("parallel_documents")
    op.drop_table("projects")
