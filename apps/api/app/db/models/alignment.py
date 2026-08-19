"""AlignmentGroup / AlignmentMember ORM models (ADR-003, ADR-006).

AlignmentGroup is a symmetric N:M hyperedge: it connects any number of Spans
(within one ParallelDocument) and means only "these textual occurrences
correspond in this document". It has no source/target fields and no
language-specific columns — future linguistic relations are a separate layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class AlignmentGroup(Base):
    """A symmetric correspondence hyperedge over Spans of one document."""

    __tablename__ = "alignment_groups"
    __table_args__ = (Index("ix_alignment_groups_document_id", "document_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parallel_documents.id", ondelete="CASCADE", name="fk_alignment_groups_document_id_parallel_documents"),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    document: Mapped["ParallelDocument"] = relationship(back_populates="alignment_groups")
    members: Mapped[list["AlignmentMember"]] = relationship(
        back_populates="alignment_group",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<AlignmentGroup id={self.id} document_id={self.document_id}>"


class AlignmentMember(Base):
    """One Span's participation in one AlignmentGroup.

    ``UNIQUE(alignment_group_id, span_id)`` forbids duplicate members in a
    group. There is deliberately NO ``UNIQUE(span_id)``: a Span may
    participate in many AlignmentGroups.
    """

    __tablename__ = "alignment_members"
    __table_args__ = (
        UniqueConstraint(
            "alignment_group_id", "span_id", name="uq_alignment_members_group_span"
        ),
        # Reverse lookup by span; alignment_group_id lookups use the index
        # behind the unique constraint above.
        Index("ix_alignment_members_span_id", "span_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    alignment_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("alignment_groups.id", ondelete="CASCADE", name="fk_alignment_members_alignment_group_id_alignment_groups"),
        nullable=False,
    )
    span_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("spans.id", ondelete="CASCADE", name="fk_alignment_members_span_id_spans"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    alignment_group: Mapped["AlignmentGroup"] = relationship(back_populates="members")
    span: Mapped["Span"] = relationship(back_populates="alignment_members")

    def __repr__(self) -> str:
        return f"<AlignmentMember id={self.id} group={self.alignment_group_id} span={self.span_id}>"
