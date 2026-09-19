"""Complete atomic Alignment write service (M0.5).

Owns the full Alignment create/update/delete lifecycle on top of the M0.2
persistence foundations:

- one owned ``write_transaction`` per public operation (the frozen
  session-ownership contract in ``app/db/session.py`` is never weakened);
- concurrency-safe Span get-or-create via PostgreSQL
  ``INSERT ... ON CONFLICT (text_version_id, start_offset, end_offset)
  DO NOTHING RETURNING`` — when a concurrent transaction wins the race the
  existing Span is selected, and the OUTER alignment transaction is never
  aborted (frozen contract section 11; report section 4);
- server-derived ``exact_text``/``prefix``/``suffix`` from the canonical
  TextVersion content — a client-provided quote is never trusted (spec
  section 14);
- full alignment-invariant validation through
  ``app.services.alignment_invariants`` (frozen contract section 10);
- orphan-Span cleanup on PATCH member replacement and DELETE that is
  exactly compatible with the reviewed ADR-005 destructive-reset semantics:
  a candidate Span is deleted only when it will have ZERO surviving
  AlignmentMembers; Spans shared by other groups always survive.

Every operation leaves the Session transaction-clean on exit (success or
failure). The service never calls ``commit()``/``rollback()`` itself —
``write_transaction`` owns the transaction boundaries.

M7 closes that retained concurrency debt by serializing Alignment topology
mutation on the owning ParallelDocument, then locking participating
TextVersion rows in deterministic UUID order. Pre-lock reads are locator-only;
mutation-authoritative state is re-resolved after the canonical locks. The
accepted PostgreSQL Span get-or-create algorithm remains unchanged.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.base import utcnow
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    ParallelDocument,
    Span,
    TextVersion,
)
from app.db.session import write_transaction
from app.services.alignment_invariants import MemberRef, validate_alignment_members
from app.services.alignment_locking import lock_parallel_document, lock_text_versions
from app.text.offsets import (
    extract_context,
    extract_exact_text,
    validate_span_bounds,
)

_UNSET = object()

# The domain/persistence limit for AlignmentGroup.note (nullable
# VARCHAR(4000) — Alembic 0002 / app/db/models/alignment.py). Enforced at
# the service boundary; the HTTP/Pydantic boundary repeats it as defense in
# depth (schemas/alignment.py NOTE_MAX).
NOTE_MAX = 4000


def _validate_note(note: str | None) -> None:
    """Validate ``AlignmentGroup.note`` at the application service boundary.

    ``None`` is valid (no note); an empty string is valid; up to
    ``NOTE_MAX`` code points is valid; anything longer raises the stable
    ``VALIDATION_ERROR`` domain error instead of letting the value reach the
    PostgreSQL ``VARCHAR(4000)`` column and surface as a driver exception.
    """
    if note is not None and len(note) > NOTE_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "alignment note is too long",
            {
                "field": "note",
                "max_length": NOTE_MAX,
                "actual_length": len(note),
            },
        )


@dataclass(frozen=True, slots=True)
class MemberInput:
    """One alignment member as supplied at the HTTP boundary (coordinates
    only: ``text_version_id`` + code-point ``[start_offset, end_offset)``)."""

    text_version_id: uuid.UUID
    start_offset: int
    end_offset: int


@dataclass(frozen=True, slots=True)
class AlignmentMemberView:
    """Materialized member for serialization (scalar columns only)."""

    id: uuid.UUID
    span_id: uuid.UUID
    text_version_id: uuid.UUID
    start_offset: int
    end_offset: int
    exact_text: str


@dataclass(frozen=True, slots=True)
class AlignmentView:
    """Materialized alignment result: group + full member set.

    Built INSIDE the service transaction so the route can serialize it
    after the transaction closes without any ORM relationship traversal
    (M0.3 transaction-clean HTTP-boundary discipline).
    """

    id: uuid.UUID
    document_id: uuid.UUID
    note: str | None
    created_at: datetime
    updated_at: datetime
    members: list[AlignmentMemberView] = field(default_factory=list)


def _alignment_not_found(alignment_id: uuid.UUID) -> DomainError:
    return DomainError(
        "NOT_FOUND",
        "alignment group not found",
        {"alignment_id": str(alignment_id)},
    )


def _locate_alignment_document_id(
    db: Session, alignment_id: uuid.UUID
) -> uuid.UUID:
    """Locator-only pre-lock read used to find the M7 document root."""

    document_id = db.scalar(
        select(AlignmentGroup.document_id).where(AlignmentGroup.id == alignment_id)
    )
    if document_id is None:
        raise _alignment_not_found(alignment_id)
    return document_id


def _load_group_for_update(
    db: Session, alignment_id: uuid.UUID
) -> AlignmentGroup | None:
    return db.scalar(
        select(AlignmentGroup)
        .where(AlignmentGroup.id == alignment_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )


def _load_member_text_version_ids(
    db: Session, group_id: uuid.UUID
) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(Span.text_version_id)
            .join(AlignmentMember, AlignmentMember.span_id == Span.id)
            .where(AlignmentMember.alignment_group_id == group_id)
        ).all()
    )


def _validate_version_ownership_under_document_root(
    db: Session,
    document_id: uuid.UUID,
    version_ids: list[uuid.UUID],
) -> None:
    """Reject missing/foreign versions before taking any TextVersion lock."""

    ordered_ids = list(dict.fromkeys(version_ids))
    if not ordered_ids:
        return

    owners = {
        row[0]: row[1]
        for row in db.execute(
            select(TextVersion.id, TextVersion.document_id).where(
                TextVersion.id.in_(ordered_ids)
            )
        ).all()
    }
    for version_id in ordered_ids:
        owner_document_id = owners.get(version_id)
        if owner_document_id is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(version_id)},
            )
        if owner_document_id != document_id:
            raise DomainError(
                "CROSS_DOCUMENT_ALIGNMENT",
                "all alignment members must belong to the same parallel document as the group",
                {
                    "text_version_id": str(version_id),
                    "group_document_id": str(document_id),
                },
            )


def _lock_versions_for_document(
    db: Session,
    document_id: uuid.UUID,
    version_ids: list[uuid.UUID],
) -> dict[uuid.UUID, TextVersion]:
    _validate_version_ownership_under_document_root(db, document_id, version_ids)
    locked = lock_text_versions(db, version_ids)

    for version_id in dict.fromkeys(version_ids):
        version = locked.get(version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(version_id)},
            )
        if version.document_id != document_id:
            raise DomainError(
                "CROSS_DOCUMENT_ALIGNMENT",
                "all alignment members must belong to the same parallel document as the group",
                {
                    "text_version_id": str(version_id),
                    "group_document_id": str(document_id),
                },
            )
    return locked


def _resolve_member_spans(
    db: Session,
    document_id: uuid.UUID,
    members: list[MemberInput],
    *,
    locked_versions: dict[uuid.UUID, TextVersion],
) -> list[MemberRef]:
    """Resolve members from freshly locked authoritative TextVersions."""

    refs: list[MemberRef] = []
    for member in members:
        version = locked_versions.get(member.text_version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(member.text_version_id)},
            )
        if version.document_id != document_id:
            raise DomainError(
                "CROSS_DOCUMENT_ALIGNMENT",
                "all alignment members must belong to the same parallel document as the group",
                {
                    "text_version_id": str(member.text_version_id),
                    "group_document_id": str(document_id),
                },
            )

        validate_span_bounds(
            version.content, member.start_offset, member.end_offset
        )
        exact_text = extract_exact_text(
            version.content, member.start_offset, member.end_offset
        )
        prefix, suffix = extract_context(
            version.content, member.start_offset, member.end_offset
        )
        span = _get_or_create_span(
            db,
            text_version_id=member.text_version_id,
            start_offset=member.start_offset,
            end_offset=member.end_offset,
            exact_text=exact_text,
            prefix=prefix,
            suffix=suffix,
        )
        refs.append(
            MemberRef(
                span_id=span.id,
                text_version_id=member.text_version_id,
                document_id=document_id,
                start_offset=member.start_offset,
                end_offset=member.end_offset,
            )
        )
    return refs


def _get_or_create_span(
    db: Session,
    *,
    text_version_id: uuid.UUID,
    start_offset: int,
    end_offset: int,
    exact_text: str,
    prefix: str,
    suffix: str,
) -> Span:
    """Concurrency-safe Span get-or-create (frozen contract section 11).

    PostgreSQL-native strategy: ``INSERT ... ON CONFLICT DO NOTHING
    RETURNING``. If another transaction inserted the same coordinates first,
    no row is returned and the existing Span is selected instead. The outer
    Alignment ``write_transaction`` is never aborted or replaced; the unique
    constraint ``uq_spans_text_version_start_end`` is the conflict signal.

    ``exact_text``/``prefix``/``suffix`` are derived from the same canonical
    content, so a concurrent winner carries identical values — reusing it is
    always correct.
    """
    stmt = (
        pg_insert(Span)
        .values(
            text_version_id=text_version_id,
            start_offset=start_offset,
            end_offset=end_offset,
            exact_text=exact_text,
            prefix=prefix,
            suffix=suffix,
        )
        .on_conflict_do_nothing(
            index_elements=["text_version_id", "start_offset", "end_offset"]
        )
        .returning(Span.id)
    )
    row = db.execute(stmt).first()
    if row is None:
        # A concurrent transaction (or a pre-existing row) won the race:
        # select the existing Span instead of inserting a duplicate.
        span_id = db.scalar(
            select(Span.id).where(
                Span.text_version_id == text_version_id,
                Span.start_offset == start_offset,
                Span.end_offset == end_offset,
            )
        )
        if span_id is None:
            raise RuntimeError(
                "ON CONFLICT DO NOTHING returned no row and no existing span "
                "was found; the unique constraint state is inconsistent"
            )
    else:
        span_id = row[0]
    span = db.get(Span, span_id)
    if span is None:
        raise RuntimeError("newly resolved span could not be loaded")
    return span


def _build_view(
    group: AlignmentGroup,
    member_rows: list[tuple[AlignmentMember, Span]],
) -> AlignmentView:
    """Materialize the alignment view from the group and its (member, span)
    pairs — scalar columns only."""
    members = [
        AlignmentMemberView(
            id=member.id,
            span_id=member.span_id,
            text_version_id=span.text_version_id,
            start_offset=span.start_offset,
            end_offset=span.end_offset,
            exact_text=span.exact_text,
        )
        for member, span in member_rows
    ]
    return AlignmentView(
        id=group.id,
        document_id=group.document_id,
        note=group.note,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members=members,
    )


def _load_member_rows(
    db: Session, group_id: uuid.UUID
) -> list[tuple[AlignmentMember, Span]]:
    """Load a group's members joined with their Spans (explicit query, no
    ORM relationship traversal)."""
    return list(
        db.execute(
            select(AlignmentMember, Span)
            .join(Span, AlignmentMember.span_id == Span.id)
            .where(AlignmentMember.alignment_group_id == group_id)
            .execution_options(populate_existing=True)
        ).all()
    )


def create_alignment(
    db: Session,
    *,
    document_id: uuid.UUID,
    members: list[MemberInput],
    note: str | None = None,
) -> AlignmentView:
    """Create one AlignmentGroup under the M7 document-root lock."""

    with write_transaction(db):
        _validate_note(note)

        document = lock_parallel_document(db, document_id)
        if document is None:
            raise DomainError(
                "NOT_FOUND",
                "document not found",
                {"document_id": str(document_id)},
            )

        version_ids = [member.text_version_id for member in members]
        locked_versions = _lock_versions_for_document(
            db, document_id, version_ids
        )
        refs = _resolve_member_spans(
            db,
            document_id,
            members,
            locked_versions=locked_versions,
        )
        validate_alignment_members(refs, document_id)

        group = AlignmentGroup(document_id=document_id, note=note)
        db.add(group)
        db.flush()

        for ref in refs:
            db.add(
                AlignmentMember(
                    alignment_group_id=group.id,
                    span_id=ref.span_id,
                )
            )
        db.flush()

        member_rows = _load_member_rows(db, group.id)
        return _build_view(group, member_rows)


def update_alignment(
    db: Session,
    alignment_id: uuid.UUID,
    *,
    note: str | None | object = _UNSET,
    members: list[MemberInput] | object = _UNSET,
) -> AlignmentView:
    """PATCH one AlignmentGroup with serial-equivalent M7 semantics."""

    with write_transaction(db):
        if note is not _UNSET:
            _validate_note(note)

        document_id = _locate_alignment_document_id(db, alignment_id)
        document = lock_parallel_document(db, document_id)
        if document is None:
            raise _alignment_not_found(alignment_id)

        group = _load_group_for_update(db, alignment_id)
        if group is None or group.document_id != document_id:
            raise _alignment_not_found(alignment_id)

        current_version_ids = _load_member_text_version_ids(db, group.id)
        proposed_version_ids = (
            [member.text_version_id for member in members]
            if members is not _UNSET
            else []
        )
        locked_versions = _lock_versions_for_document(
            db,
            document_id,
            current_version_ids + proposed_version_ids,
        )

        group = _load_group_for_update(db, alignment_id)
        if group is None or group.document_id != document_id:
            raise _alignment_not_found(alignment_id)

        changed = False
        if note is not _UNSET and group.note != note:
            group.note = note
            changed = True

        if members is not _UNSET:
            new_refs = _resolve_member_spans(
                db,
                group.document_id,
                members,
                locked_versions=locked_versions,
            )
            validate_alignment_members(new_refs, group.document_id)

            current_rows = _load_member_rows(db, group.id)
            current_span_ids = {
                member.span_id for member, _span in current_rows
            }
            new_span_ids = {ref.span_id for ref in new_refs}

            if new_span_ids != current_span_ids:
                for member, _span in current_rows:
                    db.delete(member)
                db.flush()

                for ref in new_refs:
                    db.add(
                        AlignmentMember(
                            alignment_group_id=group.id,
                            span_id=ref.span_id,
                        )
                    )
                db.flush()

                _cleanup_orphan_spans(
                    db,
                    group.id,
                    candidate_span_ids=current_span_ids - new_span_ids,
                )
                changed = True

        if changed:
            group.updated_at = utcnow()

        member_rows = _load_member_rows(db, group.id)
        return _build_view(group, member_rows)


def _cleanup_orphan_spans(
    db: Session, group_id: uuid.UUID, *, candidate_span_ids: set[uuid.UUID]
) -> None:
    """Delete candidate Spans that have ZERO surviving AlignmentMembers.

    Orphan semantics identical to the reviewed ADR-005 destructive-reset
    implementation (``text_version_service.delete_text_version``): a
    candidate is deleted only when no AlignmentMember references it OUTSIDE
    the given group — memberships in any other surviving AlignmentGroup
    count as surviving. Pre-existing bare Spans are never candidates here:
    only spans whose membership in this group is being removed are offered
    as candidates.
    """
    for span_id in candidate_span_ids:
        survives = (
            db.scalars(
                select(AlignmentMember.id).where(
                    AlignmentMember.span_id == span_id,
                    AlignmentMember.alignment_group_id != group_id,
                )
                .limit(1)
            ).first()
            is not None
        )
        if not survives:
            span = db.get(Span, span_id)
            if span is not None:
                db.delete(span)


def delete_alignment(db: Session, alignment_id: uuid.UUID) -> None:
    """Delete one AlignmentGroup under the M7 canonical lock order."""

    with write_transaction(db):
        document_id = _locate_alignment_document_id(db, alignment_id)
        document = lock_parallel_document(db, document_id)
        if document is None:
            raise _alignment_not_found(alignment_id)

        group = _load_group_for_update(db, alignment_id)
        if group is None or group.document_id != document_id:
            raise _alignment_not_found(alignment_id)

        version_ids = _load_member_text_version_ids(db, group.id)
        _lock_versions_for_document(db, document_id, version_ids)

        group = _load_group_for_update(db, alignment_id)
        if group is None or group.document_id != document_id:
            raise _alignment_not_found(alignment_id)

        member_rows = _load_member_rows(db, group.id)
        candidate_span_ids = {
            member.span_id for member, _span in member_rows
        }

        db.delete(group)
        db.flush()

        _cleanup_orphan_spans(
            db,
            group.id,
            candidate_span_ids=candidate_span_ids,
        )
