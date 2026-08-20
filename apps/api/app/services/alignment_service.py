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

Known non-blocking limitation (recorded at M0.5 Gate 2 review): concurrent
PATCHes to the SAME AlignmentGroup are not given a dedicated concurrency-
control contract in M0.5; in a pathological interleaving they may surface
an unexpected integrity failure (``uq_alignment_members_group_span``) as an
unhandled IntegrityError. The single-user workbench cannot normally produce
this, and the reviewed M0.3 constraint-classification policy propagates
unexpected integrity errors. The concurrent Span get-or-create algorithm
(PostgreSQL ``ON CONFLICT``) is unaffected and remains accepted.
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


def _resolve_member_spans(
    db: Session, document_id: uuid.UUID, members: list[MemberInput]
) -> list[MemberRef]:
    """Validate and resolve a member set to persisted Spans.

    Steps (in a correctness-safe order):

    1. resolve every referenced TextVersion (missing -> NOT_FOUND);
    2. verify every TextVersion belongs to ``document_id``
       (-> CROSS_DOCUMENT_ALIGNMENT) — the full resolution/ownership pass
       runs BEFORE any Span insert;
    3. per member: validate the code-point ``[start, end)`` range against
       the canonical content (-> SPAN_OUT_OF_RANGE), derive
       ``exact_text``/``prefix``/``suffix`` server-side, then
       concurrency-safe get-or-create the Span.

    Note on ordering: range validation is performed per member immediately
    before THAT member's insert, and the AGGREGATE alignment invariants
    (cardinality, duplicate Span, same-version overlap) are validated by the
    caller AFTER this function returns. A failure in a later member or in
    the aggregate validation therefore leaves earlier provisional Span
    inserts in the transaction — this is safe because the ONE outer
    Alignment ``write_transaction`` rolls the whole operation back, so a
    failed request never leaves newly created orphan Spans behind.

    Returns resolved ``MemberRef``s ready for invariant validation.
    """
    version_ids = list({m.text_version_id for m in members})
    versions = {
        v.id: v
        for v in db.scalars(
            select(TextVersion).where(TextVersion.id.in_(version_ids))
        ).all()
    }
    for member in members:
        version = versions.get(member.text_version_id)
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

    refs: list[MemberRef] = []
    for member in members:
        version = versions[member.text_version_id]
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
        ).all()
    )


def create_alignment(
    db: Session,
    *,
    document_id: uuid.UUID,
    members: list[MemberInput],
    note: str | None = None,
) -> AlignmentView:
    """Create one AlignmentGroup atomically (frozen contract section 9).

    One ``write_transaction`` covers: document/version resolution,
    ownership and range validation, server-side quote derivation,
    concurrency-safe Span get-or-create, complete invariant validation,
    group + member creation. ANY failure rolls the whole operation back —
    no new group, no new members, no newly created orphan Span.
    """
    with write_transaction(db):
        # Service-boundary note validation BEFORE any database work (the
        # clean-Session check in write_transaction still wins on a
        # dirty/open-session entry).
        _validate_note(note)
        document = db.get(ParallelDocument, document_id)
        if document is None:
            raise DomainError(
                "NOT_FOUND", "document not found", {"document_id": str(document_id)}
            )

        refs = _resolve_member_spans(db, document_id, members)
        validate_alignment_members(refs, document_id)

        group = AlignmentGroup(document_id=document_id, note=note)
        db.add(group)
        db.flush()  # group.id is needed for the member rows

        for ref in refs:
            db.add(AlignmentMember(alignment_group_id=group.id, span_id=ref.span_id))
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
    """Update an AlignmentGroup atomically (frozen contract sections 13-17).

    Supported modes (any combination in one request):

    - note update — ``note`` may be ``None`` to CLEAR the note;
    - full member replacement — ``members`` is the COMPLETE new set: the
      service validates the new set, creates/reuses the required Spans,
      removes the old member rows, creates the replacement rows, then
      deletes only candidate old Spans that become true orphans (zero
      surviving AlignmentMembers anywhere).

    Field omission means "leave unchanged". A successful PATCH that changes
    the logical alignment state advances ``AlignmentGroup.updated_at``
    explicitly (member-only replacement would otherwise leave the group row
    untouched and ORM ``onupdate`` would not fire). A no-op PATCH (nothing
    supplied, or note/member set identical to current state) returns the
    current representation without advancing ``updated_at``.

    If ANY part of a replacement fails, the whole transaction rolls back and
    the old Alignment remains completely intact.
    """
    with write_transaction(db):
        # Service-boundary note validation when note is EXPLICITLY supplied
        # (omission stays "unchanged", null clears) — before any database
        # work, so the clean-Session check in write_transaction still wins on
        # a dirty/open-session entry.
        if note is not _UNSET:
            _validate_note(note)
        group = db.get(AlignmentGroup, alignment_id)
        if group is None:
            raise DomainError(
                "NOT_FOUND",
                "alignment group not found",
                {"alignment_id": str(alignment_id)},
            )

        changed = False

        if note is not _UNSET:
            if group.note != note:
                group.note = note
                changed = True

        if members is not _UNSET:
            new_refs = _resolve_member_spans(db, group.document_id, members)
            validate_alignment_members(new_refs, group.document_id)
            current_rows = _load_member_rows(db, group.id)
            current_span_ids = {member.span_id for member, _span in current_rows}
            new_span_ids = {ref.span_id for ref in new_refs}
            if new_span_ids != current_span_ids:
                # Full-set replacement: remove old member rows, add the
                # replacement rows (member IDs may change — no M0.5
                # stability guarantee, frozen contract section 17). Old rows
                # are deleted AND flushed BEFORE the new rows are inserted:
                # SQLAlchemy flushes inserts before deletes within one
                # flush, which would violate
                # ``uq_alignment_members_group_span`` when a span is kept.
                for member, _span in current_rows:
                    db.delete(member)
                db.flush()
                for ref in new_refs:
                    db.add(
                        AlignmentMember(alignment_group_id=group.id, span_id=ref.span_id)
                    )
                db.flush()
                _cleanup_orphan_spans(db, group.id, candidate_span_ids=(
                    current_span_ids - new_span_ids
                ))
                changed = True

        if changed:
            # Explicit timestamp advance: do not depend solely on ORM
            # onupdate, which would not fire for member-only replacement
            # (frozen contract section 16).
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
    the given group — memberships in any other group (including groups in
    other documents) always count as surviving. Pre-existing bare Spans are
    never candidates here: only spans whose membership in this group is
    being removed are offered as candidates.
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
    """Delete one AlignmentGroup atomically (frozen contract section 18).

    Deletes the group (its member rows cascade at the database layer) and
    then deletes only the Spans it referenced that have ZERO surviving
    AlignmentMembers anywhere. Spans shared with any surviving group,
    unrelated groups/memberships, and unrelated pre-existing bare Spans are
    preserved — the exact orphan semantics of the ADR-005 destructive reset.
    """
    with write_transaction(db):
        group = db.get(AlignmentGroup, alignment_id)
        if group is None:
            raise DomainError(
                "NOT_FOUND",
                "alignment group not found",
                {"alignment_id": str(alignment_id)},
            )

        member_rows = _load_member_rows(db, group.id)
        candidate_span_ids = {member.span_id for member, _span in member_rows}

        db.delete(group)
        db.flush()

        _cleanup_orphan_spans(db, group.id, candidate_span_ids=candidate_span_ids)
