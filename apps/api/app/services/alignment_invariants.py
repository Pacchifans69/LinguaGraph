"""Alignment invariant predicates (pure functions).

These are the service/domain-enforced invariants from
M0_PREIMPLEMENTATION_REPORT.md section 4 (report's "Service/application
enforced" list). They are deliberately NOT database CHECK constraints:
cross-row/cross-table inspection is required (a group's members live in
other rows, and same-version overlap needs comparing member rows).

The complete atomic Alignment create/update/delete workflow that calls these
predicates is M0.5; M0.2 ships the predicates themselves and uses them for the
TextVersion destructive-reset revalidation (ADR-005).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Sequence

from app.api.errors import DomainError


@dataclass(frozen=True, slots=True)
class MemberRef:
    """A resolved alignment member, ready for invariant checks.

    Fields are resolved from persistence (span -> text version -> document)
    before the predicates run; the predicates themselves stay pure.
    """

    span_id: uuid.UUID
    text_version_id: uuid.UUID
    document_id: uuid.UUID
    start_offset: int
    end_offset: int


def validate_alignment_members(
    members: Sequence[MemberRef], group_document_id: uuid.UUID
) -> None:
    """Raise ``DomainError`` on the first violated M0 alignment invariant.

    Invariants checked:

    1. at least 2 members;
    2. members come from at least 2 distinct TextVersions;
    3. every member's TextVersion belongs to the same ParallelDocument as the
       group;
    4. no duplicate Span within the group;
    5. two spans from the same TextVersion within one group must not overlap
       (identical, adjacent and separated spans are handled accordingly:
       duplicates/overlap invalid, adjacent and separated allowed).
    """
    if len(members) < 2:
        raise DomainError(
            "INSUFFICIENT_ALIGNMENT_MEMBERS",
            "an alignment group requires at least 2 members",
            {"member_count": len(members)},
        )

    distinct_versions = {m.text_version_id for m in members}
    if len(distinct_versions) < 2:
        raise DomainError(
            "INSUFFICIENT_ALIGNMENT_MEMBERS",
            "an alignment group requires members from at least 2 distinct text versions",
            {"distinct_text_version_count": len(distinct_versions)},
        )

    if any(m.document_id != group_document_id for m in members):
        raise DomainError(
            "CROSS_DOCUMENT_ALIGNMENT",
            "all alignment members must belong to the same parallel document as the group",
            {"group_document_id": str(group_document_id)},
        )

    span_ids = [m.span_id for m in members]
    if len(set(span_ids)) != len(span_ids):
        raise DomainError(
            "DUPLICATE_ALIGNMENT_MEMBER",
            "a span cannot appear twice in the same alignment group",
            {},
        )

    by_version: dict[uuid.UUID, list[MemberRef]] = {}
    for member in members:
        by_version.setdefault(member.text_version_id, []).append(member)

    for version_id, version_members in by_version.items():
        intervals = sorted(
            (m.start_offset, m.end_offset) for m in version_members
        )
        for (prev_start, prev_end), (start, end) in zip(
            intervals, intervals[1:]
        ):
            # Overlap iff the next interval starts before the previous one
            # ends. Adjacent (start == prev_end) and separated (start >
            # prev_end) spans are allowed.
            if start < prev_end:
                raise DomainError(
                    "VALIDATION_ERROR",
                    "spans from the same text version must not overlap within one alignment group",
                    {
                        "text_version_id": str(version_id),
                        "overlapping": [
                            {"start_offset": prev_start, "end_offset": prev_end},
                            {"start_offset": start, "end_offset": end},
                        ],
                    },
                )


def alignment_group_is_valid(
    members: Sequence[MemberRef], group_document_id: uuid.UUID
) -> bool:
    """Predicate form of :func:`validate_alignment_members` (no exceptions).

    Used by the TextVersion destructive-reset revalidation (ADR-005): a group
    that fails any invariant after a forced deletion must be deleted.
    """
    try:
        validate_alignment_members(members, group_document_id)
        return True
    except DomainError:
        return False
