"""Sparse token-occurrence lemma annotation service (M4 / ADR-012).

One optional Human-authored lemma per exact saved token ``Segment.id``.

Locking contract (frozen M4 contract section 5): lemma mutation serializes on
the SAME TextVersion-root mutation lock used by token segmentation
replacement/deletion. Every lemma write therefore:

1. resolves the target token's owning TextVersion without a lock;
2. acquires that ``TextVersion`` row with ``SELECT ... FOR UPDATE``;
3. re-resolves and revalidates the exact token/layer while the lock is held;
4. only then creates/updates/deletes the annotation.

A concurrent token replacement either observes the lemma dependent and fails
closed (``SEGMENTATION_HAS_DEPENDENTS``), or completes first so the stale
token id no longer resolves and the lemma mutation fails closed
(``NOT_FOUND``). No second lock ordering is introduced.

The service owns the transaction (``write_transaction``): the route never
commits, and every public call returns with a transaction-clean Session.
"""

from __future__ import annotations

import unicodedata
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.models import Segment, SegmentationLayer, TextVersion, TokenLemmaAnnotation
from app.db.session import write_transaction
from app.services.segmentation_service import TOKEN_GRANULARITY

# Frozen M4 value contract: 1..200 Unicode code points inclusive, measured on
# the NFC-normalized value.
LEMMA_MAX_CODE_POINTS = 200


def _invalid_value(reason: str) -> DomainError:
    return DomainError(
        "INVALID_LEMMA_VALUE",
        "lemma value is invalid",
        {"reason": reason},
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
        "lemma annotation not found",
        {"token_segment_id": str(token_segment_id)},
    )


def _invalid_target(token_segment_id: uuid.UUID, *, reason: str) -> DomainError:
    return DomainError(
        "INVALID_LEMMA_TARGET",
        "token segment is not an eligible word-like lemma target",
        {"token_segment_id": str(token_segment_id), "reason": reason},
    )


def _has_surrogate(value: str) -> bool:
    return any(0xD800 <= ord(character) <= 0xDFFF for character in value)


def normalize_lemma_value(raw: str) -> str:
    """Validate and NFC-normalize one submitted lemma value.

    Frozen order (contract section 8): reject NUL, reject surrogate code
    points, normalize to NFC, then validate the normalized value. The value is
    never trimmed, lowercased, case-folded, NFKC-normalized, stemmed, or
    otherwise rewritten: internal whitespace and case are preserved exactly.
    """

    if not isinstance(raw, str):
        raise _invalid_value("lemma must be a string")
    if "\x00" in raw:
        raise _invalid_value("lemma must not contain NUL")
    if _has_surrogate(raw):
        raise _invalid_value("lemma must not contain surrogate code points")

    normalized = unicodedata.normalize("NFC", raw)

    if not normalized:
        raise _invalid_value("lemma must not be empty")
    if len(normalized) > LEMMA_MAX_CODE_POINTS:
        raise _invalid_value(
            f"lemma must be at most {LEMMA_MAX_CODE_POINTS} Unicode code points"
        )
    if normalized[0].isspace() or normalized[-1].isspace():
        raise _invalid_value(
            "lemma must not have leading or trailing Unicode whitespace"
        )
    return normalized


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
    ``INVALID_LEMMA_TARGET``; a Segment that no longer exists — e.g. because a
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


def put_token_lemma(
    db: Session, token_segment_id: uuid.UUID, *, lemma: str
) -> TokenLemmaAnnotation:
    """Create, update, or logically no-op the lemma of one token occurrence.

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

        normalized = normalize_lemma_value(lemma)

        existing = db.scalar(
            select(TokenLemmaAnnotation).where(
                TokenLemmaAnnotation.token_segment_id == segment.id
            )
        )
        if existing is None:
            annotation = TokenLemmaAnnotation(
                token_segment_id=segment.id,
                lemma=normalized,
            )
            db.add(annotation)
            db.flush()
            return annotation

        if existing.lemma != normalized:
            existing.lemma = normalized
            db.flush()
        return existing


def delete_token_lemma(db: Session, token_segment_id: uuid.UUID) -> None:
    """Delete only the lemma annotation of one token occurrence.

    Token segmentation, sentence segmentation and Alignment state are never
    touched. A missing token or a missing annotation is ``NOT_FOUND``.
    """

    with write_transaction(db):
        text_version_id = _locate_text_version_id(db, token_segment_id)
        if text_version_id is None:
            raise _not_found(token_segment_id)

        _lock_text_version(db, text_version_id)
        segment = _resolve_eligible_token(db, token_segment_id)

        existing = db.scalar(
            select(TokenLemmaAnnotation).where(
                TokenLemmaAnnotation.token_segment_id == segment.id
            )
        )
        if existing is None:
            raise _annotation_not_found(token_segment_id)

        db.delete(existing)
