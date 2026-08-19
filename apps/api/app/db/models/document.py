"""ParallelDocument ORM model (M0_PREIMPLEMENTATION_REPORT.md, section 4)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class ParallelDocument(Base):
    """One semantic material/work unit inside a Project.

    A document contains multiple TextVersions (possibly several per language)
    and its own AlignmentGroups; spans and alignments never cross documents.
    """

    __tablename__ = "parallel_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE", name="fk_parallel_documents_project_id_projects"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    project: Mapped["Project"] = relationship(back_populates="documents")
    text_versions: Mapped[list["TextVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    alignment_groups: Mapped[list["AlignmentGroup"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<ParallelDocument id={self.id} title={self.title!r}>"
