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
from app.db.models import Segment, SegmentationLayer, TextVersion
from app.db.session import write_transaction
from app.text.bcp47 import validate_language_tag

SENTENCE_GRANULARITY = "sentence"
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
        db.delete(layer)
