"""TextVersion ORM model (M0_PREIMPLEMENTATION_REPORT.md, section 4)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CHAR, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class TextVersion(Base):
    """One actual text version of a ParallelDocument.

    ``content`` is the canonical source text (NFC, LF, no BOM) that all span
    offsets refer to; ``content_hash`` is SHA-256 of its UTF-8 encoding.
    ``language_tag`` is data (BCP-47); multiple versions of the same language
    in one document are allowed — there is deliberately NO
    ``UNIQUE(document_id, language_tag)``. ``UNIQUE(document_id, label)``
    prevents ambiguous user-facing labels; document-level ordering is
    ``(sort_order, created_at, id)``.
    """

    __tablename__ = "text_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "label", name="uq_text_versions_document_label"),
        Index("ix_text_versions_document_sort_order", "document_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parallel_documents.id", ondelete="CASCADE", name="fk_text_versions_document_id_parallel_documents"),
        nullable=False,
    )
    language_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    document: Mapped["ParallelDocument"] = relationship(back_populates="text_versions")
    spans: Mapped[list["Span"]] = relationship(
        back_populates="text_version",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<TextVersion id={self.id} label={self.label!r} lang={self.language_tag!r}>"
