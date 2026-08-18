"""Span ORM model (M0_PREIMPLEMENTATION_REPORT.md, section 4; ADR-001)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class Span(Base):
    """A half-open interval ``[start_offset, end_offset)`` over one TextVersion.

    Offsets are Unicode code-point offsets into the canonical ``content``:
    zero-based, start inclusive, end exclusive. ``exact_text``/``prefix``/
    ``suffix`` are anchoring metadata derived by the server from the canonical
    content (report section 14); they are never treated as a second authority
    for the text. ``UNIQUE(text_version_id, start_offset, end_offset)`` makes
    identical spans reusable across alignment groups instead of duplicated.
    """

    __tablename__ = "spans"
    __table_args__ = (
        CheckConstraint("start_offset >= 0", name="ck_spans_start_offset_non_negative"),
        CheckConstraint("end_offset > start_offset", name="ck_spans_end_offset_after_start"),
        UniqueConstraint(
            "text_version_id", "start_offset", "end_offset",
            name="uq_spans_text_version_start_end",
        ),
        Index("ix_spans_text_version_id", "text_version_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    text_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("text_versions.id", ondelete="CASCADE", name="fk_spans_text_version_id_text_versions"),
        nullable=False,
    )
    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    exact_text: Mapped[str] = mapped_column(Text, nullable=False)
    prefix: Mapped[str] = mapped_column(Text, nullable=False)
    suffix: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    text_version: Mapped["TextVersion"] = relationship(back_populates="spans")
    alignment_members: Mapped[list["AlignmentMember"]] = relationship(
        back_populates="span",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Span id={self.id} [{self.start_offset}:{self.end_offset}) {self.exact_text!r}>"
