"""Sparse occurrence-level coarse POS annotation ORM model (M5 / ADR-013).

One optional Human-selected coarse part-of-speech value bound to one exact
saved token ``Segment.id``. The row exists only when a Human saved a POS value
for that concrete token occurrence: there is no Lexeme identity, no annotation
layer, and no generic attribute/value framework.

``TokenPosAnnotation`` is a SIBLING of ``TokenLemmaAnnotation``. Neither owns,
requires, derives, mutates or deletes the other, and there is deliberately no
foreign key or semantic dependency between them.

The table intentionally stores no redundant linguistic context
(``text_version_id``, token layer id, coordinates, ``exact_text``,
``is_word_like``, language tag, sentence basis id, lemma). Every one of those
values remains owned by the existing authoritative token hierarchy
(``Segment`` → ``SegmentationLayer`` → ``TextVersion``).

Cross-table eligibility (token granularity + ``is_word_like``) and membership
in the frozen fifteen-value vocabulary are enforced by
``app.services.pos_annotation_service``; the database enforces the vocabulary
through the named CHECK constraint, the one-annotation-per-token invariant
through ``UNIQUE(token_segment_id)`` and the ownership invariant through
``ON DELETE CASCADE`` on the token FK.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow

# Frozen M5 coarse-POS vocabulary, in the canonical contract order (M5
# contract section 4). These fifteen values are the complete accepted set;
# ``PUNCT``/``SYM`` are deliberately excluded because M5 targets the
# Human-reviewed ``is_word_like = TRUE`` subset only, and M5 makes no complete
# Universal Dependencies conformance claim.
POS_TAG_VALUES: tuple[str, ...] = (
    "ADJ",
    "ADP",
    "ADV",
    "AUX",
    "CCONJ",
    "DET",
    "INTJ",
    "NOUN",
    "NUM",
    "PART",
    "PRON",
    "PROPN",
    "SCONJ",
    "VERB",
    "X",
)

# The same literal expression is declared by Alembic revision 0006, so
# ``alembic check`` sees no schema/model drift for the named CHECK constraint.
POS_TAG_CHECK_SQL = "pos_tag IN (" + ", ".join(f"'{tag}'" for tag in POS_TAG_VALUES) + ")"


class TokenPosAnnotation(Base):
    """One Human-reviewed coarse POS value for one exact saved token occurrence."""

    __tablename__ = "token_pos_annotations"
    __table_args__ = (
        UniqueConstraint(
            "token_segment_id",
            name="uq_token_pos_annotations_token_segment_id",
        ),
        CheckConstraint(
            POS_TAG_CHECK_SQL,
            name="ck_token_pos_annotations_pos_tag",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    token_segment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "segments.id",
            ondelete="CASCADE",
            name="fk_token_pos_annotations_token_segment_id_segments",
        ),
        nullable=False,
    )
    pos_tag: Mapped[str] = mapped_column(String(5), nullable=False)
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
            f"<TokenPosAnnotation id={self.id} "
            f"token_segment_id={self.token_segment_id} pos_tag={self.pos_tag!r}>"
        )
