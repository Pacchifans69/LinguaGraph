"""Sparse token-occurrence coarse POS annotation service (M5 / ADR-013).

One optional Human-selected coarse POS value per exact saved token
``Segment.id``.

Locking contract (frozen M5 contract section 10): POS mutation serializes on
the SAME TextVersion-root mutation lock used by token segmentation
replacement/deletion and by M4 lemma mutation. Every POS write therefore:

1. resolves the target token's owning TextVersion without a lock;
2. acquires that ``TextVersion`` row with ``SELECT ... FOR UPDATE``;
3. re-resolves and revalidates the exact token/layer while the lock is held;
4. only then creates/updates/deletes the annotation.

A concurrent token replacement either observes the POS dependent and fails
closed (``SEGMENTATION_HAS_DEPENDENTS``), or completes first so the stale
token id no longer resolves and the POS mutation fails closed
(``NOT_FOUND``). No second lock ordering is introduced.

Lemma and POS mutate independent rows under that shared root lock: a serialized
lemma write and POS write on the same token both survive.

Value semantics are exact and case-sensitive: the fifteen frozen tags only,
with no trimming, case conversion, case folding, alias mapping or
language-specific rewriting.

The service owns the transaction (``write_transaction``): the route never
commits, and every public call returns with a transaction-clean Session.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.models import (
    POS_TAG_VALUES,
    Segment,
    SegmentationLayer,
    TextVersion,
    TokenPosAnnotation,
)
from app.db.session import write_transaction
from app.services.segmentation_service import TOKEN_GRANULARITY

# Frozen M5 vocabulary (contract section 4). The tuple order is the canonical
# contract order; membership is exact and case-sensitive.
POS_TAGS: tuple[str, ...] = POS_TAG_VALUES
POS_TAG_SET = frozenset(POS_TAGS)


def _invalid_value(raw: object) -> DomainError:
    """Stable domain failure for a string outside the frozen vocabulary."""

    return DomainError(
        "INVALID_POS_VALUE",
        "pos_tag is not one of the fifteen frozen coarse POS values",
        {"reason": "not_in_frozen_pos_vocabulary", "input_type": type(raw).__name__},
    )


def _not_found(token_segment_id: uuid.UUID) -> DomainError:
    return DomainError(
        "NOT_FOUND",
        "token segment not found",
        {"token_segment_id": str(token_segment_id)},
    )


def _annotation_not_found(token_segment_id: uuid.UUID) -> DomainError:
    return DomainError(
        "NOT_FOUND",
        "pos annotation not found",
        {"token_segment_id": str(token_segment_id)},
    )


def _invalid_target(token_segment_id: uuid.UUID, *, reason: str) -> DomainError:
    return DomainError(
        "INVALID_POS_TARGET",
        "token segment is not an eligible word-like POS target",
        {"token_segment_id": str(token_segment_id), "reason": reason},
    )


def validate_pos_value(raw: str) -> str:
    """Validate one submitted coarse POS value against the frozen vocabulary.

    The value is used exactly as submitted: no trim, no upper/lowercasing, no
    case folding, no alias or language-specific mapping. ``"NOUN"`` is valid;
    ``"noun"``, ``" NOUN"``, ``"NOUN "``, ``"PUNCT"``, ``"SYM"`` and any other
    string are ``INVALID_POS_VALUE``.

    A non-string value cannot reach this function through the HTTP schema
    (``pos_tag: str`` already answers ``VALIDATION_ERROR``); the explicit type
    check keeps the domain contract correct for direct service callers.
    """

    if not isinstance(raw, str):
        raise _invalid_value(raw)
    if raw not in POS_TAG_SET:
        raise _invalid_value(raw)
    return raw


def _locate_text_version_id(
    db: Session, token_segment_id: uuid.UUID
) -> uuid.UUID | None:
    """Resolve the owning TextVersion of a token without taking the lock.

    This is the pre-lock ownership lookup: enough information to identify the
    mutation root, and nothing more. The exact token is re-resolved after the
    lock is held.
    """

    return db.scalar(
        select(SegmentationLayer.text_version_id)
        .join(Segment, Segment.segmentation_layer_id == SegmentationLayer.id)
        .where(Segment.id == token_segment_id)
    )


def _lock_text_version(db: Session, text_version_id: uuid.UUID) -> None:
    """Acquire the shared TextVersion-root mutation lock, fail closed if gone."""

    locked = db.scalar(
        select(TextVersion.id)
        .where(TextVersion.id == text_version_id)
        .with_for_update()
    )
    if locked is None:
        raise DomainError(
            "NOT_FOUND",
            "text version not found",
            {"text_version_id": str(text_version_id)},
        )


def _resolve_eligible_token(db: Session, token_segment_id: uuid.UUID) -> Segment:
    """Re-resolve and revalidate the exact token while the lock is held.

    A structurally existing but ineligible Segment (sentence segment,
    whitespace/punctuation token, ``is_word_like`` not TRUE) is
    ``INVALID_POS_TARGET``; a Segment that no longer exists — e.g. because a
    concurrent retokenization won the race — is ``NOT_FOUND``.
    """

    row = db.execute(
        select(Segment, SegmentationLayer)
        .join(
            SegmentationLayer,
            Segment.segmentation_layer_id == SegmentationLayer.id,
        )
        .where(Segment.id == token_segment_id)
    ).first()
    if row is None:
        raise _not_found(token_segment_id)

    segment, layer = row
    if layer.granularity != TOKEN_GRANULARITY:
        raise _invalid_target(token_segment_id, reason="not_a_token_segment")
    if segment.is_word_like is not True:
        raise _invalid_target(token_segment_id, reason="not_word_like")
    return segment


def put_token_pos(
    db: Session, token_segment_id: uuid.UUID, *, pos_tag: str
) -> TokenPosAnnotation:
    """Create, update, or logically no-op the POS of one token occurrence.

    Returns the authoritative persisted annotation. All three outcomes answer
    ``200``; a logical no-op emits no UPDATE, so ``updated_at`` does not
    advance.
    """

    with write_transaction(db):
        text_version_id = _locate_text_version_id(db, token_segment_id)
        if text_version_id is None:
            raise _not_found(token_segment_id)

        _lock_text_version(db, text_version_id)
        segment = _resolve_eligible_token(db, token_segment_id)

        value = validate_pos_value(pos_tag)

        existing = db.scalar(
            select(TokenPosAnnotation).where(
                TokenPosAnnotation.token_segment_id == segment.id
            )
        )
        if existing is None:
            annotation = TokenPosAnnotation(
                token_segment_id=segment.id,
                pos_tag=value,
            )
            db.add(annotation)
            db.flush()
            return annotation

        if existing.pos_tag != value:
            existing.pos_tag = value
            db.flush()
        return existing


def delete_token_pos(db: Session, token_segment_id: uuid.UUID) -> None:
    """Delete only the coarse POS annotation of one token occurrence.

    The sibling lemma annotation, token/sentence segmentation and Alignment
    state are never touched. A missing token or a missing annotation is
    ``NOT_FOUND``.
    """

    with write_transaction(db):
        text_version_id = _locate_text_version_id(db, token_segment_id)
        if text_version_id is None:
            raise _not_found(token_segment_id)

        _lock_text_version(db, text_version_id)
        segment = _resolve_eligible_token(db, token_segment_id)

        existing = db.scalar(
            select(TokenPosAnnotation).where(
                TokenPosAnnotation.token_segment_id == segment.id
            )
        )
        if existing is None:
            raise _annotation_not_found(token_segment_id)

        db.delete(existing)
