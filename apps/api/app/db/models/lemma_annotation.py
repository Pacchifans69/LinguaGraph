"""Sparse occurrence-level lemma annotation ORM model (M4 / ADR-012).

One optional Human-authored lemma string bound to one exact saved token
``Segment.id``. There is no Lexeme identity, no annotation layer, and no
generic attribute/value framework: the row exists only when a Human saved a
lemma for that concrete token occurrence.

The table intentionally stores no redundant linguistic context
(``text_version_id``, token layer id, coordinates, ``exact_text``,
``is_word_like``, language tag, sentence basis id). Every one of those values
remains owned by the existing authoritative token hierarchy
(``Segment`` → ``SegmentationLayer`` → ``TextVersion``).

Cross-table eligibility (token granularity + ``is_word_like``) is enforced by
``app.services.lemma_annotation_service``; the database enforces the
one-annotation-per-token invariant through ``UNIQUE(token_segment_id)`` and
the ownership invariant through ``ON DELETE CASCADE`` on the token FK.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class TokenLemmaAnnotation(Base):
    """One Human-reviewed lemma for one exact saved token occurrence."""

    __tablename__ = "token_lemma_annotations"
    __table_args__ = (
        UniqueConstraint(
            "token_segment_id",
            name="uq_token_lemma_annotations_token_segment_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    token_segment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "segments.id",
            ondelete="CASCADE",
            name="fk_token_lemma_annotations_token_segment_id_segments",
        ),
        nullable=False,
    )
    lemma: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )

    def __repr__(self) -> str:
        return (
            f"<TokenLemmaAnnotation id={self.id} "
            f"token_segment_id={self.token_segment_id}>"
        )
