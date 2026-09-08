"""Persistent sentence-segmentation service (M2 / ADR-010).

The service owns stale-content detection, locale provenance, code-point range
validation, complete-partition validation, exact-text derivation, and atomic
full replacement/deletion.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.models import Segment, SegmentationLayer, TextVersion, TokenLemmaAnnotation
from app.db.session import write_transaction
from app.text.bcp47 import validate_language_tag

SENTENCE_GRANULARITY = "sentence"
TOKEN_GRANULARITY = "token"
ALLOWED_ORIGINS = frozenset({"manual", "intl_segmenter"})


@dataclass(frozen=True, slots=True)
class SentenceSegmentationSnapshot:
    """Materialized return value safe after the service transaction closes."""

    layer: SegmentationLayer
    segments: list[Segment]


@dataclass(frozen=True, slots=True)
class SegmentRange:
    """One submitted Unicode code-point interval."""

    start: int
    end: int


@dataclass(frozen=True, slots=True)
class TokenSegmentRange(SegmentRange):
    """One submitted token interval and its Human-reviewed classification."""

    is_word_like: bool | None


def _dependent_error(text_version_id: uuid.UUID, layer_id: uuid.UUID) -> DomainError:
    return DomainError(
        "SEGMENTATION_HAS_DEPENDENTS",
        "delete the dependent token layer before changing sentence segmentation",
        {"text_version_id": str(text_version_id), "sentence_layer_id": str(layer_id)},
    )


def _token_dependent(db: Session, sentence_layer_id: uuid.UUID) -> SegmentationLayer | None:
    return db.scalar(
        select(SegmentationLayer).where(
            SegmentationLayer.basis_layer_id == sentence_layer_id,
            SegmentationLayer.granularity == TOKEN_GRANULARITY,
        )
    )


def _token_layer_has_lemma_dependents(
    db: Session, token_layer_id: uuid.UUID
) -> bool:
    """True when any token of this layer owns a saved M4 lemma annotation.

    Checked while the TextVersion-root mutation lock is held, so a concurrent
    lemma write cannot slip between the check and the layer mutation.
    """

    return (
        db.scalars(
            select(TokenLemmaAnnotation.id)
            .join(Segment, TokenLemmaAnnotation.token_segment_id == Segment.id)
            .where(Segment.segmentation_layer_id == token_layer_id)
            .limit(1)
        ).first()
        is not None
    )


def _lemma_dependent_error(
    text_version_id: uuid.UUID, token_layer_id: uuid.UUID
) -> DomainError:
    """Fail-closed token mutation while M4 lemma dependents exist.

    M4 never re-anchors, copies, splits or recovers lemma annotations across
    retokenization; the Human must delete the dependent lemmas explicitly.
    """

    return DomainError(
        "SEGMENTATION_HAS_DEPENDENTS",
        "delete the dependent lemma annotations before changing token segmentation",
        {
            "text_version_id": str(text_version_id),
            "token_layer_id": str(token_layer_id),
            "dependency_type": "lemma_annotations",
        },
    )


def _not_found(text_version_id: uuid.UUID) -> DomainError:
    return DomainError(
        "NOT_FOUND",
        "text version not found",
        {"text_version_id": str(text_version_id)},
    )


def _validate_locale(
    locale: str,
    *,
    field: str,
    text_version_id: uuid.UUID,
) -> str:
    try:
        return validate_language_tag(locale)
    except DomainError as exc:
        raise DomainError(
            "INVALID_SEGMENTATION_LOCALE",
            "segmentation locale is not a syntactically valid BCP-47 tag",
            {
                "text_version_id": str(text_version_id),
                "field": field,
                "locale": locale,
                "reason": exc.details.get("reason"),
            },
        ) from None


def _partition_error(
    text_version_id: uuid.UUID,
    *,
    index: int | None,
    reason: str,
) -> DomainError:
    details: dict[str, str | int] = {
        "text_version_id": str(text_version_id),
        "reason": reason,
    }
    if index is not None:
        details["segment_index"] = index
    return DomainError(
        "INVALID_SEGMENTATION_PARTITION",
        "segments must form one ordered complete canonical-text partition",
        details,
    )


def _validated_exact_slices(
    text_version: TextVersion,
    ranges: list[SegmentRange],
) -> list[tuple[int, int, str]]:
    """Validate one exact complete code-point partition and derive its text."""

    content = text_version.content
    content_length = len(content)

    if content_length == 0:
        if ranges:
            raise _partition_error(
                text_version.id,
                index=0,
                reason="empty content must have no segments",
            )
        return []

    if not ranges:
        raise _partition_error(
            text_version.id,
            index=None,
            reason="non-empty content requires at least one segment",
        )

    exact_slices: list[tuple[int, int, str]] = []
    expected_start = 0
    seen: set[tuple[int, int]] = set()

    for index, item in enumerate(ranges):
        start = item.start
        end = item.end
        if start < 0 or end <= start or end > content_length:
            raise DomainError(
                "SEGMENT_OUT_OF_RANGE",
                "segment range is outside canonical TextVersion content",
                {
                    "text_version_id": str(text_version.id),
                    "segment_index": index,
                    "start": start,
                    "end": end,
                    "content_length": content_length,
                },
            )
        if (start, end) in seen:
            raise _partition_error(
                text_version.id,
                index=index,
                reason="duplicate segment interval",
            )
        if start != expected_start:
            reason = "overlapping segments" if start < expected_start else "gap"
            raise _partition_error(
                text_version.id,
                index=index,
                reason=reason,
            )

        seen.add((start, end))
        exact_slices.append((start, end, content[start:end]))
        expected_start = end

    if expected_start != content_length:
        raise _partition_error(
            text_version.id,
            index=len(ranges) - 1,
            reason="final segment does not reach canonical content end",
        )

    return exact_slices


def replace_sentence_segmentation(
    db: Session,
    text_version_id: uuid.UUID,
    *,
    content_hash: str,
    requested_locale: str,
    resolved_locale: str,
    origin: str,
    ranges: list[SegmentRange],
    granularity: str = SENTENCE_GRANULARITY,
) -> SentenceSegmentationSnapshot:
    """Atomically replace the complete authoritative sentence layer."""

    with write_transaction(db):
        text_version = db.scalar(
            select(TextVersion)
            .where(TextVersion.id == text_version_id)
            .with_for_update()
        )
        if text_version is None:
            raise _not_found(text_version_id)

        if content_hash != text_version.content_hash:
            raise DomainError(
                "STALE_SEGMENTATION_CONTENT",
                "TextVersion content changed before segmentation could be saved",
                {
                    "text_version_id": str(text_version_id),
                    "submitted_content_hash": content_hash,
                    "current_content_hash": text_version.content_hash,
                },
            )
        if granularity != SENTENCE_GRANULARITY:
            raise DomainError(
                "UNSUPPORTED_SEGMENTATION_GRANULARITY",
                "only sentence segmentation is supported in M2",
                {"granularity": granularity},
            )
        if origin not in ALLOWED_ORIGINS:
            raise DomainError(
                "INVALID_SEGMENTATION_ORIGIN",
                "unsupported segmentation origin",
                {"origin": origin},
            )

        requested_locale = _validate_locale(
            requested_locale,
            field="requested_locale",
            text_version_id=text_version_id,
        )
        resolved_locale = _validate_locale(
            resolved_locale,
            field="resolved_locale",
            text_version_id=text_version_id,
        )
        if requested_locale.lower() != text_version.language_tag.lower():
            raise DomainError(
                "INVALID_SEGMENTATION_LOCALE",
                "requested locale must match the TextVersion language tag",
                {
                    "text_version_id": str(text_version_id),
                    "requested_locale": requested_locale,
                    "language_tag": text_version.language_tag,
                },
            )

        exact_slices = _validated_exact_slices(text_version, ranges)

        existing = db.scalar(
            select(SegmentationLayer).where(
                SegmentationLayer.text_version_id == text_version_id,
                SegmentationLayer.granularity == SENTENCE_GRANULARITY,
            )
        )
        if existing is not None:
            if _token_dependent(db, existing.id) is not None:
                raise _dependent_error(text_version_id, existing.id)
            db.delete(existing)
            db.flush()

        layer = SegmentationLayer(
            text_version_id=text_version_id,
            granularity=SENTENCE_GRANULARITY,
            requested_locale=requested_locale,
            resolved_locale=resolved_locale,
            origin=origin,
            content_hash=text_version.content_hash,
        )
        db.add(layer)
        db.flush()

        segments = [
            Segment(
                segmentation_layer_id=layer.id,
                ordinal=ordinal,
                start_offset=start,
                end_offset=end,
                exact_text=exact_text,
            )
            for ordinal, (start, end, exact_text) in enumerate(exact_slices)
        ]
        db.add_all(segments)
        db.flush()

        return SentenceSegmentationSnapshot(layer=layer, segments=segments)


def delete_sentence_segmentation(
    db: Session,
    text_version_id: uuid.UUID,
) -> None:
    """Delete only the persisted sentence layer and its segments."""

    with write_transaction(db):
        text_version = db.scalar(
            select(TextVersion.id)
            .where(TextVersion.id == text_version_id)
            .with_for_update()
        )
        if text_version is None:
            raise _not_found(text_version_id)

        layer = db.scalar(
            select(SegmentationLayer).where(
                SegmentationLayer.text_version_id == text_version_id,
                SegmentationLayer.granularity == SENTENCE_GRANULARITY,
            )
        )
        if layer is None:
            raise DomainError(
                "NOT_FOUND",
                "sentence segmentation layer not found",
                {
                    "text_version_id": str(text_version_id),
                    "granularity": SENTENCE_GRANULARITY,
                },
            )
        if _token_dependent(db, layer.id) is not None:
            raise _dependent_error(text_version_id, layer.id)
        db.delete(layer)


def replace_token_segmentation(
    db: Session,
    text_version_id: uuid.UUID,
    *,
    content_hash: str,
    basis_sentence_layer_id: uuid.UUID,
    requested_locale: str,
    resolved_locale: str,
    origin: str,
    ranges: list[TokenSegmentRange],
) -> SentenceSegmentationSnapshot:
    """Atomically replace the token partition bound to an exact sentence layer."""

    with write_transaction(db):
        text_version = db.scalar(
            select(TextVersion)
            .where(TextVersion.id == text_version_id)
            .with_for_update()
        )
        if text_version is None:
            raise _not_found(text_version_id)
        if content_hash != text_version.content_hash:
            raise DomainError(
                "STALE_SEGMENTATION_CONTENT",
                "TextVersion content changed before token segmentation could be saved",
                {"text_version_id": str(text_version_id)},
            )
        if origin not in ALLOWED_ORIGINS:
            raise DomainError(
                "INVALID_SEGMENTATION_ORIGIN",
                "unsupported segmentation origin",
                {"origin": origin},
            )
        requested_locale = _validate_locale(
            requested_locale, field="requested_locale", text_version_id=text_version_id
        )
        resolved_locale = _validate_locale(
            resolved_locale, field="resolved_locale", text_version_id=text_version_id
        )
        if requested_locale.lower() != text_version.language_tag.lower():
            raise DomainError(
                "INVALID_SEGMENTATION_LOCALE",
                "requested locale must match the TextVersion language tag",
                {"text_version_id": str(text_version_id)},
            )

        basis = db.scalar(
            select(SegmentationLayer)
            .where(SegmentationLayer.id == basis_sentence_layer_id)
            .with_for_update()
        )
        if (
            basis is None
            or basis.text_version_id != text_version_id
            or basis.granularity != SENTENCE_GRANULARITY
            or basis.content_hash != text_version.content_hash
        ):
            raise DomainError(
                "STALE_SEGMENTATION_BASIS",
                "token segmentation basis is not the current sentence layer",
                {
                    "text_version_id": str(text_version_id),
                    "basis_sentence_layer_id": str(basis_sentence_layer_id),
                },
            )

        exact_slices = _validated_exact_slices(text_version, ranges)
        sentence_segments = list(
            db.scalars(
                select(Segment)
                .where(Segment.segmentation_layer_id == basis.id)
                .order_by(Segment.ordinal)
            ).all()
        )
        sentence_boundaries = {0, len(text_version.content)}
        for sentence in sentence_segments:
            sentence_boundaries.add(sentence.start_offset)
            sentence_boundaries.add(sentence.end_offset)
        token_boundaries = {0, len(text_version.content)}
        for item in ranges:
            if type(item.is_word_like) is not bool:
                raise DomainError(
                    "INVALID_TOKEN_CLASSIFICATION",
                    "every token requires a Boolean word-like classification",
                    {"text_version_id": str(text_version_id)},
                )
            token_boundaries.add(item.start)
            token_boundaries.add(item.end)
            if sentence_segments and not any(
                item.start >= sentence.start_offset and item.end <= sentence.end_offset
                for sentence in sentence_segments
            ):
                raise DomainError(
                    "TOKEN_CROSSES_SENTENCE_BOUNDARY",
                    "token ranges must remain inside one saved sentence",
                    {"text_version_id": str(text_version_id), "start": item.start, "end": item.end},
                )
        if not sentence_boundaries.issubset(token_boundaries):
            raise DomainError(
                "TOKEN_CROSSES_SENTENCE_BOUNDARY",
                "every sentence boundary must also be a token boundary",
                {"text_version_id": str(text_version_id)},
            )

        existing = db.scalar(
            select(SegmentationLayer).where(
                SegmentationLayer.text_version_id == text_version_id,
                SegmentationLayer.granularity == TOKEN_GRANULARITY,
            )
        )
        if existing is not None:
            if _token_layer_has_lemma_dependents(db, existing.id):
                raise _lemma_dependent_error(text_version_id, existing.id)
            db.delete(existing)
            db.flush()
        layer = SegmentationLayer(
            text_version_id=text_version_id,
            granularity=TOKEN_GRANULARITY,
            basis_layer_id=basis.id,
            requested_locale=requested_locale,
            resolved_locale=resolved_locale,
            origin=origin,
            content_hash=text_version.content_hash,
        )
        db.add(layer)
        db.flush()
        segments = [
            Segment(
                segmentation_layer_id=layer.id,
                ordinal=ordinal,
                start_offset=start,
                end_offset=end,
                exact_text=exact_text,
                is_word_like=ranges[ordinal].is_word_like,
            )
            for ordinal, (start, end, exact_text) in enumerate(exact_slices)
        ]
        db.add_all(segments)
        db.flush()
        return SentenceSegmentationSnapshot(layer=layer, segments=segments)


def delete_token_segmentation(db: Session, text_version_id: uuid.UUID) -> None:
    """Delete only the token layer, preserving sentence and Alignment state.

    Uses the same TextVersion-root mutation lock as replacement and lemma
    mutation before inspecting M4 lemma dependents and mutating the layer.
    """

    with write_transaction(db):
        if (
            db.scalar(
                select(TextVersion.id)
                .where(TextVersion.id == text_version_id)
                .with_for_update()
            )
            is None
        ):
            raise _not_found(text_version_id)
        layer = db.scalar(
            select(SegmentationLayer).where(
                SegmentationLayer.text_version_id == text_version_id,
                SegmentationLayer.granularity == TOKEN_GRANULARITY,
            )
        )
        if layer is None:
            raise DomainError(
                "NOT_FOUND",
                "token segmentation layer not found",
                {"text_version_id": str(text_version_id), "granularity": TOKEN_GRANULARITY},
            )
        if _token_layer_has_lemma_dependents(db, layer.id):
            raise _lemma_dependent_error(text_version_id, layer.id)
        db.delete(layer)
