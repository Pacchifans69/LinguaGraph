"""Alignment invariant predicate tests (report section 4/17; ADR-006).

These are pure unit tests: the predicates receive resolved MemberRef values
and must never touch the database.
"""

import uuid

import pytest

from app.api.errors import DomainError
from app.services.alignment_invariants import (
    MemberRef,
    alignment_group_is_valid,
    validate_alignment_members,
)

DOC_A = uuid.uuid4()
DOC_B = uuid.uuid4()
V_EN = uuid.uuid4()
V_DE = uuid.uuid4()
V_FR = uuid.uuid4()


def ref(
    *,
    span_id: uuid.UUID | None = None,
    text_version_id: uuid.UUID = V_EN,
    document_id: uuid.UUID = DOC_A,
    start: int = 0,
    end: int = 5,
) -> MemberRef:
    return MemberRef(
        span_id=span_id or uuid.uuid4(),
        text_version_id=text_version_id,
        document_id=document_id,
        start_offset=start,
        end_offset=end,
    )


def test_valid_group_passes() -> None:
    members = [
        ref(text_version_id=V_EN, start=0, end=5),
        ref(text_version_id=V_DE, start=0, end=5),
    ]
    validate_alignment_members(members, DOC_A)  # must not raise
    assert alignment_group_is_valid(members, DOC_A) is True


def test_three_language_group_passes() -> None:
    members = [
        ref(text_version_id=V_EN),
        ref(text_version_id=V_DE),
        ref(text_version_id=V_FR),
    ]
    assert alignment_group_is_valid(members, DOC_A) is True


def test_same_version_multi_span_separated_passes() -> None:
    # Future discontinuous correspondence: [freue] ... [darauf]
    members = [
        ref(text_version_id=V_EN, start=0, end=5),
        ref(text_version_id=V_EN, start=10, end=16),
        ref(text_version_id=V_DE, start=0, end=7),
    ]
    assert alignment_group_is_valid(members, DOC_A) is True


def test_same_version_multi_span_adjacent_passes() -> None:
    members = [
        ref(text_version_id=V_EN, start=0, end=5),
        ref(text_version_id=V_EN, start=5, end=9),  # adjacent: allowed
        ref(text_version_id=V_DE, start=0, end=9),
    ]
    assert alignment_group_is_valid(members, DOC_A) is True


def test_single_member_is_rejected() -> None:
    members = [ref(text_version_id=V_EN)]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"
    assert alignment_group_is_valid(members, DOC_A) is False


def test_zero_members_is_rejected() -> None:
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members([], DOC_A)
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"


def test_members_from_single_text_version_are_rejected() -> None:
    # Two distinct spans of the SAME version are not an alignment.
    members = [
        ref(text_version_id=V_EN, start=0, end=5),
        ref(text_version_id=V_EN, start=10, end=15),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"


def test_cross_document_members_are_rejected() -> None:
    members = [
        ref(text_version_id=V_EN, document_id=DOC_A),
        ref(text_version_id=V_DE, document_id=DOC_B),  # other document
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "CROSS_DOCUMENT_ALIGNMENT"


def test_group_document_is_the_authority() -> None:
    # Group belongs to DOC_B; both members belong to DOC_A -> invalid.
    members = [
        ref(text_version_id=V_EN, document_id=DOC_A),
        ref(text_version_id=V_DE, document_id=DOC_A),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_B)
    assert excinfo.value.code == "CROSS_DOCUMENT_ALIGNMENT"


def test_duplicate_span_is_rejected() -> None:
    span_id = uuid.uuid4()
    members = [
        ref(span_id=span_id, text_version_id=V_EN),
        ref(span_id=span_id, text_version_id=V_DE),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "DUPLICATE_ALIGNMENT_MEMBER"


def test_same_version_overlapping_spans_are_rejected() -> None:
    members = [
        ref(text_version_id=V_EN, start=0, end=10),
        ref(text_version_id=V_EN, start=5, end=15),  # overlaps [0,10)
        ref(text_version_id=V_DE, start=0, end=15),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert "overlap" in excinfo.value.message


def test_same_version_identical_spans_are_rejected() -> None:
    members = [
        ref(text_version_id=V_EN, start=0, end=10),
        ref(text_version_id=V_EN, start=0, end=10),  # identical (distinct span ids)
        ref(text_version_id=V_DE, start=0, end=10),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "VALIDATION_ERROR"


def test_unsorted_member_order_is_normalized() -> None:
    # Overlap detection must not depend on input order.
    members = [
        ref(text_version_id=V_EN, start=5, end=15),
        ref(text_version_id=V_DE, start=0, end=5),
        ref(text_version_id=V_EN, start=0, end=10),
    ]
    with pytest.raises(DomainError) as excinfo:
        validate_alignment_members(members, DOC_A)
    assert excinfo.value.code == "VALIDATION_ERROR"


def test_overlap_across_groups_is_not_checked() -> None:
    # Different AlignmentGroups may overlap freely (report invariant 8): the
    # predicates only inspect ONE group's members at a time.
    group_one = [
        ref(text_version_id=V_EN, start=0, end=10),
        ref(text_version_id=V_DE, start=0, end=10),
    ]
    group_two = [
        ref(text_version_id=V_EN, start=3, end=7),  # overlaps group_one's span
        ref(text_version_id=V_FR, start=0, end=10),
    ]
    assert alignment_group_is_valid(group_one, DOC_A) is True
    assert alignment_group_is_valid(group_two, DOC_A) is True


def test_span_reuse_across_groups_is_not_checked() -> None:
    # A Span may belong to many AlignmentGroups (no UNIQUE(span_id)); the same
    # span id in DIFFERENT groups is fine.
    span_id = uuid.uuid4()
    group_one = [ref(span_id=span_id, text_version_id=V_EN), ref(text_version_id=V_DE)]
    group_two = [ref(span_id=span_id, text_version_id=V_EN), ref(text_version_id=V_FR)]
    assert alignment_group_is_valid(group_one, DOC_A) is True
    assert alignment_group_is_valid(group_two, DOC_A) is True
