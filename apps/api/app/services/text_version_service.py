"""TextVersion persistence service (M0.2 persistence foundations).

Owns the canonical-text ingestion boundary (canonicalization + hash), BCP-47
validation, metadata updates (content is never mutable through this service),
and the accepted deletion policy including the ADR-005 destructive reset.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import read_transaction, write_transaction

from app.api.errors import DomainError
from app.core.config import get_settings
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    ParallelDocument,
    Span,
    TextVersion,
)
from app.services.alignment_invariants import MemberRef, alignment_group_is_valid
from app.text.bcp47 import validate_language_tag
from app.text.canonical import canonicalize_text

_LABEL_MAX = 200

_UNSET = object()


def _validate_label(label: str) -> None:
    if not isinstance(label, str) or not label.strip():
        raise DomainError(
            "VALIDATION_ERROR",
            "text version label is required",
            {"field": "label"},
        )
    if len(label) > _LABEL_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "text version label is too long",
            {"field": "label", "max_length": _LABEL_MAX},
        )


def _require_document(db: Session, document_id: uuid.UUID) -> None:
    if db.get(ParallelDocument, document_id) is None:
        raise DomainError(
            "NOT_FOUND", "document not found", {"document_id": str(document_id)}
        )


def create_text_version(
    db: Session,
    *,
    document_id: uuid.UUID,
    language_tag: str,
    label: str,
    content: str,
    sort_order: int = 0,
) -> TextVersion:
    """Create and commit a text version.

    ``content`` is canonicalized at this ingestion boundary; the stored
    content/hash are the canonical ones (report section 6). ``language_tag``
    must be syntactically valid BCP-47 (no allow-list).
    """
    _validate_label(label)
    validate_language_tag(language_tag)
    canonical = canonicalize_text(
        content, max_codepoints=get_settings().max_text_version_codepoints
    )
    with write_transaction(db):
        _require_document(db, document_id)
        version = TextVersion(
            document_id=document_id,
            language_tag=language_tag,
            label=label,
            content=canonical.content,
            content_hash=canonical.content_hash,
            sort_order=sort_order,
        )
        db.add(version)
    return version


def get_text_version(db: Session, text_version_id: uuid.UUID) -> TextVersion:
    """Fetch a text version by id; raises ``NOT_FOUND``.

    Executes within its own read transaction, which is closed before
    returning so the Session is transaction-clean for the next service call.
    """
    with read_transaction(db):
        version = db.get(TextVersion, text_version_id)
    if version is None:
        raise DomainError(
            "NOT_FOUND",
            "text version not found",
            {"text_version_id": str(text_version_id)},
        )
    return version


def update_text_version_metadata(
    db: Session,
    text_version_id: uuid.UUID,
    *,
    label: str | object = _UNSET,
    sort_order: int | object = _UNSET,
) -> TextVersion:
    """Update metadata only (``label``, ``sort_order``).

    There is deliberately no content field here: ``TextVersion.content`` is
    immutable once annotated and is never mutated through a general metadata
    PATCH (ADR-005). Use :func:`replace_content` for the explicit unannotated
    replacement path.
    """
    with write_transaction(db):
        version = db.get(TextVersion, text_version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(text_version_id)},
            )
        if label is not _UNSET:
            _validate_label(label)  # type: ignore[arg-type]
            version.label = label  # type: ignore[assignment]
        if sort_order is not _UNSET:
            version.sort_order = sort_order  # type: ignore[assignment]
    return version


def replace_content(
    db: Session, text_version_id: uuid.UUID, *, content: str
) -> TextVersion:
    """Replace the content of an unannotated text version (ADR-005).

    Blocked with ``TEXT_HAS_ANNOTATIONS`` as soon as the version owns any
    Span: replacing content under existing spans would silently corrupt
    offsets/quotes. Annotated versions can only be removed via
    :func:`delete_text_version` with ``force=True``.
    """
    canonical = canonicalize_text(
        content, max_codepoints=get_settings().max_text_version_codepoints
    )
    with write_transaction(db):
        version = db.get(TextVersion, text_version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(text_version_id)},
            )
        has_spans = (
            db.scalars(
                select(Span.id).where(Span.text_version_id == version.id).limit(1)
            ).first()
            is not None
        )
        if has_spans:
            raise DomainError(
                "TEXT_HAS_ANNOTATIONS",
                "annotated text versions are immutable; delete with force=true to reset",
                {"text_version_id": str(text_version_id)},
            )
        version.content = canonical.content
        version.content_hash = canonical.content_hash
    return version


def delete_text_version(
    db: Session, text_version_id: uuid.UUID, *, force: bool = False
) -> None:
    """Delete a text version following the accepted deletion semantics.

    - no spans: the version is deleted;
    - spans without alignment memberships: version and its spans are deleted
      (orphan cleanup);
    - spans with alignment memberships: blocked with ``TEXT_HAS_ANNOTATIONS``
      unless ``force=True`` — the ADR-005 destructive reset, which deletes the
      version's spans/memberships, revalidates every affected AlignmentGroup
      against ALL M0 alignment invariants, deletes groups that no longer
      satisfy them (plus spans that lost their last membership), all in one
      transaction.

    Raw FK cascade behavior and this application policy are separate layers
    (report section 4).
    """
    with write_transaction(db):
        version = db.get(TextVersion, text_version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(text_version_id)},
            )

        version_span_ids = set(
            db.scalars(
                select(Span.id).where(Span.text_version_id == version.id)
            ).all()
        )

        memberships = list(
            db.scalars(
                select(AlignmentMember)
                .join(Span, AlignmentMember.span_id == Span.id)
                .where(Span.text_version_id == version.id)
            ).all()
        )

        if memberships and not force:
            raise DomainError(
                "TEXT_HAS_ANNOTATIONS",
                "text version is part of alignments; pass force=true to destroy "
                "the version, its spans and any alignment groups that become invalid",
                {"text_version_id": str(text_version_id)},
            )

        affected_group_ids = {m.alignment_group_id for m in memberships}

        # Snapshot of every affected group's members with the resolved
        # span/version/document info needed for revalidation.
        member_rows = (
            db.execute(
                select(AlignmentMember, Span, TextVersion)
                .join(Span, AlignmentMember.span_id == Span.id)
                .join(TextVersion, Span.text_version_id == TextVersion.id)
                .where(AlignmentMember.alignment_group_id.in_(affected_group_ids))
            ).all()
            if affected_group_ids
            else []
        )

        # Revalidate each affected group against all M0 invariants.
        deleted_group_ids: set[uuid.UUID] = set()
        for group_id in affected_group_ids:
            group = db.get(AlignmentGroup, group_id)
            if group is None:
                continue
            remaining = [
                MemberRef(
                    span_id=member.span_id,
                    text_version_id=span.text_version_id,
                    document_id=text_version.document_id,
                    start_offset=span.start_offset,
                    end_offset=span.end_offset,
                )
                for member, span, text_version in member_rows
                if member.alignment_group_id == group_id
                and member.span_id not in version_span_ids
            ]
            if not alignment_group_is_valid(remaining, group.document_id):
                deleted_group_ids.add(group_id)

        # Orphan cleanup (Decision Register: "Span orphan cleanup on alignment
        # delete"). Candidate orphan spans are spans of OTHER TextVersions
        # whose memberships are removed because an AlignmentGroup is scheduled
        # for deletion. A candidate is deleted ONLY if it will have ZERO
        # AlignmentMembers across the ENTIRE database after the scheduled group
        # deletions: memberships in unaffected groups (groups not being
        # deleted, including groups outside the affected set) always count as
        # surviving memberships. Pre-existing bare spans are left untouched.
        if deleted_group_ids:
            candidate_span_ids = {
                member.span_id
                for member, _span, _version in member_rows
                if member.alignment_group_id in deleted_group_ids
                and member.span_id not in version_span_ids
            }
            for span_id in candidate_span_ids:
                survives = (
                    db.scalars(
                        select(AlignmentMember.id)
                        .where(
                            AlignmentMember.span_id == span_id,
                            AlignmentMember.alignment_group_id.not_in(
                                deleted_group_ids
                            ),
                        )
                        .limit(1)
                    ).first()
                    is not None
                )
                if not survives:
                    span = db.get(Span, span_id)
                    if span is not None:
                        db.delete(span)

        for group_id in deleted_group_ids:
            group = db.get(AlignmentGroup, group_id)
            if group is not None:
                db.delete(group)

        for span_id in version_span_ids:
            span = db.get(Span, span_id)
            if span is not None:
                db.delete(span)

        db.delete(version)
