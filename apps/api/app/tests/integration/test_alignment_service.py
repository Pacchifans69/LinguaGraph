"""AlignmentService integration tests against REAL PostgreSQL (M0.5).

Proves the frozen M0.5 service contract end to end: atomic create with
server-derived quote metadata, concurrency-safe Span get-or-create,
complete invariant validation, PATCH note/full-replacement semantics with
explicit updated_at advance, DELETE orphan cleanup compatible with the
reviewed ADR-005 destructive-reset behavior, and the transaction-clean
session contract.

No mocks, no SQLite: every test runs against a disposable PostgreSQL 18
database migrated to Alembic HEAD.
"""

from __future__ import annotations

import threading
import time
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.errors import DomainError
from app.db.models import AlignmentGroup, AlignmentMember, Span
from app.db.session import SessionNotCleanError
from app.services import alignment_service
from app.services.alignment_service import MemberInput
from app.tests.integration.test_persistence import (
    add_member,
    count,
    make_document,
    make_group,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration

EN = "I look forward to seeing you tomorrow."
DE = "Ich freue mich darauf, dich morgen zu sehen."
FR = "J’ai hâte de te voir demain."


def member(version, start: int, end: int) -> MemberInput:
    return MemberInput(
        text_version_id=version.id, start_offset=start, end_offset=end
    )


def make_aligned_versions(db, document_id: uuid.UUID):
    """EN/DE/FR versions with canonical content (report section 9 examples)."""
    en = make_version(
        db, document_id, language_tag="en", label="EN", content=EN
    )
    de = make_version(
        db, document_id, language_tag="de", label="DE", content=DE
    )
    fr = make_version(
        db, document_id, language_tag="fr", label="FR", content=FR
    )
    return en, de, fr


# --- CREATE -------------------------------------------------------------------


def test_create_1_to_1(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
        note="phrase level",
    )

    assert view.document_id == document.id
    assert view.note == "phrase level"
    assert len(view.members) == 2
    by_version = {m.text_version_id: m for m in view.members}
    assert by_version[en.id].exact_text == "look forward to"
    assert by_version[de.id].exact_text == "freue mich darauf,"
    assert count(db_session, AlignmentGroup) == 1
    assert count(db_session, AlignmentMember) == 2
    assert count(db_session, Span) == 2


def test_create_1_to_n(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22), member(de, 32, 36)],
    )

    assert len(view.members) == 3
    de_spans = [m for m in view.members if m.text_version_id == de.id]
    assert len(de_spans) == 2
    assert {m.start_offset for m in de_spans} == {4, 32}
    assert count(db_session, Span) == 3


def test_create_n_to_m(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)

    # EN x2, DE x2, FR x1: N:M hyperedge with same-version multi-spans.
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[
            member(en, 2, 17),
            member(en, 18, 28),
            member(de, 4, 22),
            member(de, 32, 36),
            member(fr, 0, 13),
        ],
    )

    assert len(view.members) == 5
    assert len({m.text_version_id for m in view.members}) == 3
    assert count(db_session, AlignmentGroup) == 1
    assert count(db_session, AlignmentMember) == 5
    assert count(db_session, Span) == 5


def test_create_same_version_multi_span_valid_with_two_versions(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    # VALID (frozen contract section 10): EN [2,17) + EN [18,28) + DE [4,22).
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(en, 18, 28), member(de, 4, 22)],
    )
    assert len(view.members) == 3
    en_spans = [m for m in view.members if m.text_version_id == en.id]
    assert {m.start_offset for m in en_spans} == {2, 18}


def test_create_adjacent_same_version_spans_allowed(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    # Adjacent EN [2,17) + EN [17,28) + DE: allowed.
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(en, 17, 28), member(de, 4, 22)],
    )
    assert len(view.members) == 3


def test_create_rejects_insufficient_members(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, _de, _fr = make_aligned_versions(db_session, document.id)

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session, document_id=document.id, members=[member(en, 2, 17)]
        )
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"
    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, Span) == 0  # no orphan span from failed create


def test_create_rejects_single_distinct_text_version(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, _de, _fr = make_aligned_versions(db_session, document.id)

    # INVALID (frozen contract section 10): two EN spans, one version only.
    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(en, 18, 28)],
        )
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"
    assert count(db_session, Span) == 0


def test_create_rejects_same_version_overlap(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(en, 10, 20), member(de, 4, 22)],
        )
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert "overlap" in excinfo.value.message
    assert count(db_session, Span) == 0


def test_create_rejects_duplicate_member(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    # Identical coordinates resolve to the same Span -> duplicate member.
    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(en, 2, 17), member(de, 4, 22)],
        )
    assert excinfo.value.code == "DUPLICATE_ALIGNMENT_MEMBER"
    assert count(db_session, Span) == 0


def test_create_rejects_cross_document_member(db_session) -> None:
    project = make_project(db_session)
    doc_a = make_document(db_session, project.id, title="A")
    doc_b = make_document(db_session, project.id, title="B")
    en_a, de_a, _fr = make_aligned_versions(db_session, doc_a.id)
    en_b, _de_b, _fr_b = make_aligned_versions(db_session, doc_b.id)

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=doc_a.id,
            members=[member(en_a, 2, 17), member(en_b, 2, 17), member(de_a, 4, 22)],
        )
    assert excinfo.value.code == "CROSS_DOCUMENT_ALIGNMENT"
    assert count(db_session, Span) == 0


def test_create_missing_document_not_found(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=uuid.uuid4(),
            members=[
                MemberInput(text_version_id=uuid.UUID(int=1), start_offset=0, end_offset=1),
                MemberInput(text_version_id=uuid.UUID(int=2), start_offset=0, end_offset=1),
            ],
        )
    assert excinfo.value.code == "NOT_FOUND"
    assert count(db_session, AlignmentGroup) == 0


def test_create_missing_version_not_found(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, _de, _fr = make_aligned_versions(db_session, document.id)

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[
                member(en, 2, 17),
                MemberInput(
                    text_version_id=uuid.uuid4(), start_offset=0, end_offset=5
                ),
            ],
        )
    assert excinfo.value.code == "NOT_FOUND"
    assert "text version not found" in excinfo.value.message
    assert count(db_session, Span) == 0


def test_create_rejects_out_of_range(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)
    # Capture ids BEFORE any failing call: after a rollback the ORM instances
    # are expired, and attribute access on them would autobegin a new
    # transaction (violating the transaction-clean contract at the next
    # service entry).
    document_id, en_id, de_id = document.id, en.id, de.id

    for bad_start, bad_end in [(-1, 5), (5, 5), (0, 500), (44, 45)]:
        with pytest.raises(DomainError) as excinfo:
            alignment_service.create_alignment(
                db_session,
                document_id=document_id,
                members=[
                    MemberInput(text_version_id=en_id, start_offset=2, end_offset=17),
                    MemberInput(text_version_id=de_id, start_offset=bad_start, end_offset=bad_end),
                ],
            )
        assert excinfo.value.code == "SPAN_OUT_OF_RANGE"


def test_create_derives_exact_text_prefix_suffix(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, _de, _fr = make_aligned_versions(db_session, document.id)
    de = make_version(
        db_session, document.id, language_tag="de", label="DE2", content=DE
    )
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )
    en_member = next(m for m in view.members if m.text_version_id == en.id)
    assert en_member.exact_text == "look forward to"

    span = db_session.get(Span, en_member.span_id)
    assert span.exact_text == "look forward to"
    assert span.prefix == "I "  # preceding 32 code points of canonical content
    assert span.suffix == " seeing you tomorrow."
    assert span.start_offset == 2
    assert span.end_offset == 17


# --- SPAN REUSE / CONCURRENCY ---------------------------------------------------


def test_create_reuses_existing_coordinate_span(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)

    view_one = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )
    span_id = next(
        m.span_id for m in view_one.members if m.text_version_id == en.id
    )

    view_two = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )
    reused = next(
        m.span_id for m in view_two.members if m.text_version_id == en.id
    )
    assert reused == span_id  # same coordinate -> same Span
    assert count(db_session, Span) == 3  # EN span NOT duplicated


def test_create_shares_span_across_groups(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)

    alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )
    alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )

    assert count(db_session, AlignmentGroup) == 2
    assert count(db_session, Span) == 3  # EN span shared by both groups
    shared = (
        db_session.scalars(
            select(Span).where(Span.start_offset == 2, Span.end_offset == 17)
        ).one()
    )
    memberships = list(
        db_session.scalars(
            select(AlignmentMember).where(AlignmentMember.span_id == shared.id)
        ).all()
    )
    assert len(memberships) == 2


def test_concurrent_same_coordinate_get_or_create(db_session, db_engine) -> None:
    """Two concurrent creates with identical coordinates -> ONE logical Span.

    Setup runs through the ``db_session`` fixture so its per-test TRUNCATE
    gives this test the same clean domain state as the rest of the
    integration suite (HR-F02). The two concurrent service calls then run in
    their own worker Sessions/transactions on the same engine; the
    PostgreSQL ``ON CONFLICT DO NOTHING RETURNING`` path lets the loser
    reuse the winner's Span without aborting its own outer transaction. The
    assertion holds for every interleaving.
    """
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content=EN)
    de = make_version(db_session, document.id, language_tag="de", label="DE", content=DE)
    document_id = document.id
    en_id = en.id
    de_id = de.id

    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)

    errors: list[Exception] = []
    barrier = threading.Barrier(2)

    def worker() -> None:
        try:
            barrier.wait()
            with factory() as session:
                alignment_service.create_alignment(
                    session,
                    document_id=document_id,
                    members=[
                        MemberInput(text_version_id=en_id, start_offset=2, end_offset=17),
                        MemberInput(text_version_id=de_id, start_offset=4, end_offset=22),
                    ],
                )
        except Exception as exc:  # pragma: no cover - failure path
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    with factory() as session:
        span_rows = session.scalars(
            select(Span).where(
                Span.text_version_id == en_id,
                Span.start_offset == 2,
                Span.end_offset == 17,
            )
        ).all()
        assert len(span_rows) == 1  # exactly one logical Span survives
        groups = session.scalars(
            select(AlignmentGroup).where(AlignmentGroup.document_id == document_id)
        ).all()
        assert len(groups) == 2
        members = session.scalars(
            select(AlignmentMember)
            .join(AlignmentGroup, AlignmentMember.alignment_group_id == AlignmentGroup.id)
            .where(AlignmentGroup.document_id == document_id)
        ).all()
        assert len(members) == 4


def test_get_or_create_keeps_original_span_metadata(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)

    alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )
    span = db_session.scalars(
        select(Span).where(Span.start_offset == 2, Span.end_offset == 17)
    ).one()
    original_created_at = span.created_at
    # Close the read-only transaction the SELECT autobegan so the Session is
    # transaction-clean for the next service call.
    db_session.commit()

    time.sleep(0.01)
    alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )
    span = db_session.scalars(
        select(Span).where(Span.start_offset == 2, Span.end_offset == 17)
    ).one()
    assert span.created_at == original_created_at  # reuse, not re-insert


# --- ATOMICITY -------------------------------------------------------------------


def test_create_failure_rolls_back_all_new_state(db_session, monkeypatch) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    def _explode(*_args, **_kwargs):
        raise RuntimeError("injected failure after member creation")

    monkeypatch.setattr(
        alignment_service, "_load_member_rows", _explode
    )

    with pytest.raises(RuntimeError):
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(de, 4, 22)],
        )

    # No group, no members, and NO newly created orphan Span survived.
    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Span) == 0
    assert db_session.in_transaction() is False


def test_patch_failure_preserves_old_alignment(db_session, monkeypatch) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
        note="original",
    )
    old_member_ids = {m.id for m in view.members}
    old_span_ids = {m.span_id for m in view.members}

    def _explode(*_args, **_kwargs):
        raise RuntimeError("injected failure during replacement")

    monkeypatch.setattr(alignment_service, "_cleanup_orphan_spans", _explode)

    with pytest.raises(RuntimeError):
        alignment_service.update_alignment(
            db_session,
            view.id,
            members=[member(en, 2, 17), member(fr, 0, 13)],
        )

    # The old Alignment is completely intact (same group, members, spans).
    group = db_session.get(AlignmentGroup, view.id)
    assert group is not None
    assert group.note == "original"
    rows = list(
        db_session.scalars(
            select(AlignmentMember).where(AlignmentMember.alignment_group_id == view.id)
        ).all()
    )
    assert {r.id for r in rows} == old_member_ids
    assert {r.span_id for r in rows} == old_span_ids
    assert count(db_session, Span) == 2
    assert db_session.in_transaction() is False


def test_delete_failure_rolls_back_atomically(db_session, monkeypatch) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )

    def _explode(*_args, **_kwargs):
        raise RuntimeError("injected failure during orphan cleanup")

    monkeypatch.setattr(alignment_service, "_cleanup_orphan_spans", _explode)

    with pytest.raises(RuntimeError):
        alignment_service.delete_alignment(db_session, view.id)

    # Group + members + spans all still exist after the rollback.
    assert db_session.get(AlignmentGroup, view.id) is not None
    assert count(db_session, AlignmentMember) == 2
    assert count(db_session, Span) == 2
    assert db_session.in_transaction() is False


# --- PATCH -----------------------------------------------------------------------


def _patch_setup(db_session):
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, fr = make_aligned_versions(db_session, document.id)
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
        note="original",
    )
    return document, en, de, fr, view


def test_patch_note_update(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    result = alignment_service.update_alignment(
        db_session, view.id, note="updated note"
    )
    assert result.note == "updated note"
    assert len(result.members) == 2
    assert db_session.get(AlignmentGroup, view.id).note == "updated note"


def test_patch_note_null_clears_note(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    result = alignment_service.update_alignment(db_session, view.id, note=None)
    assert result.note is None
    assert db_session.get(AlignmentGroup, view.id).note is None


def test_patch_members_full_replacement(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    old_member_ids = {m.id for m in view.members}

    result = alignment_service.update_alignment(
        db_session,
        view.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )

    assert {m.text_version_id for m in result.members} == {en.id, fr.id}
    new_member_ids = {m.id for m in result.members}
    assert new_member_ids != old_member_ids  # full replacement, no ID guarantee
    # The replaced DE span became an orphan and was cleaned.
    assert count(db_session, Span) == 2
    assert count(db_session, AlignmentMember) == 2
    assert db_session.get(AlignmentGroup, view.id).note == "original"


def test_patch_note_and_members_combined(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    result = alignment_service.update_alignment(
        db_session,
        view.id,
        note="combined",
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )
    assert result.note == "combined"
    assert {m.text_version_id for m in result.members} == {en.id, fr.id}


def test_patch_invalid_replacement_rejected_old_intact(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    old_member_ids = {m.id for m in view.members}

    # Single-member replacement violates the minimum-cardinality invariant.
    with pytest.raises(DomainError) as excinfo:
        alignment_service.update_alignment(
            db_session, view.id, members=[member(en, 2, 17)]
        )
    assert excinfo.value.code == "INSUFFICIENT_ALIGNMENT_MEMBERS"

    # Cross-document replacement is rejected too.
    project = make_project(db_session, name="Other")
    other_doc = make_document(db_session, project.id)
    other_en, other_de, _other_fr = make_aligned_versions(db_session, other_doc.id)
    with pytest.raises(DomainError) as excinfo:
        alignment_service.update_alignment(
            db_session,
            view.id,
            members=[member(other_en, 2, 17), member(other_de, 4, 22)],
        )
    assert excinfo.value.code == "CROSS_DOCUMENT_ALIGNMENT"

    # The old alignment remains completely intact.
    rows = list(
        db_session.scalars(
            select(AlignmentMember).where(AlignmentMember.alignment_group_id == view.id)
        ).all()
    )
    assert {r.id for r in rows} == old_member_ids
    assert count(db_session, Span) == 2
    assert db_session.get(AlignmentGroup, view.id).note == "original"


def test_patch_orphan_cleanup_and_shared_span_preserved(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    de_span_id = next(
        m.span_id for m in view.members if m.text_version_id == de.id
    )

    # Another group also references the DE span: it must survive replacement.
    alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(de, 4, 22), member(fr, 0, 13)],
    )

    result = alignment_service.update_alignment(
        db_session,
        view.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )

    assert {m.span_id for m in result.members} != {de_span_id}
    assert db_session.get(Span, de_span_id) is not None  # shared -> preserved
    assert count(db_session, Span) == 3  # en, de (shared), fr


def test_patch_identical_member_set_is_noop(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    before = view.updated_at
    time.sleep(0.01)

    result = alignment_service.update_alignment(
        db_session,
        view.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )

    assert result.updated_at == before  # logical state unchanged -> no advance
    assert len(result.members) == 2


def test_patch_noop_empty_update_does_not_advance_updated_at(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    before = view.updated_at
    time.sleep(0.01)

    result = alignment_service.update_alignment(db_session, view.id)

    assert result.updated_at == before
    assert result.note == "original"
    assert len(result.members) == 2


def test_patch_member_replacement_advances_updated_at(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    before = view.updated_at
    time.sleep(0.01)

    result = alignment_service.update_alignment(
        db_session,
        view.id,
        members=[member(en, 2, 17), member(fr, 0, 13)],
    )

    assert result.updated_at > before
    assert db_session.get(AlignmentGroup, view.id).updated_at > before


def test_patch_note_update_advances_updated_at(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    before = view.updated_at
    time.sleep(0.01)

    result = alignment_service.update_alignment(db_session, view.id, note="new")

    assert result.updated_at > before


def test_patch_missing_group_not_found(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        alignment_service.update_alignment(db_session, uuid.uuid4(), note="x")
    assert excinfo.value.code == "NOT_FOUND"


# --- DELETE / ORPHAN CLEANUP -----------------------------------------------------


def test_delete_removes_group_members_and_orphan_spans(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)

    alignment_service.delete_alignment(db_session, view.id)

    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Span) == 0  # both spans became orphans


def test_delete_preserves_shared_span(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    de_span_id = next(
        m.span_id for m in view.members if m.text_version_id == de.id
    )
    # A second group shares the DE span.
    other = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(de, 4, 22), member(fr, 0, 13)],
    )

    alignment_service.delete_alignment(db_session, view.id)

    assert count(db_session, AlignmentGroup) == 1
    assert db_session.get(AlignmentGroup, other.id) is not None
    assert db_session.get(Span, de_span_id) is not None  # shared -> preserved
    assert count(db_session, Span) == 2  # de (shared) + fr survive; en cleaned
    assert count(db_session, AlignmentMember) == 2  # only other group's members


def test_delete_preserves_unrelated_bare_spans(db_session) -> None:
    document, en, de, _fr, view = _patch_setup(db_session)
    # A bare span that never joined a group is NOT an orphan of this
    # operation (ADR-005-compatible semantics).
    from app.services import span_service

    bare = span_service.create_span(
        db_session, text_version_id=en.id, start_offset=0, end_offset=1
    )

    alignment_service.delete_alignment(db_session, view.id)

    assert count(db_session, AlignmentGroup) == 0
    assert db_session.get(Span, bare.id) is not None
    assert count(db_session, Span) == 1  # only the unrelated bare span


def test_delete_preserves_unrelated_groups(db_session) -> None:
    document, en, de, fr, view = _patch_setup(db_session)
    unrelated = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(fr, 0, 13), member(en, 18, 28)],
    )

    alignment_service.delete_alignment(db_session, view.id)

    assert count(db_session, AlignmentGroup) == 1
    assert db_session.get(AlignmentGroup, unrelated.id) is not None
    assert count(db_session, AlignmentMember) == 2
    assert count(db_session, Span) == 2  # fr + en[18,28] survive; en[2,17], de cleaned


def test_delete_missing_group_not_found(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        alignment_service.delete_alignment(db_session, uuid.uuid4())
    assert excinfo.value.code == "NOT_FOUND"


# --- NOTE LENGTH AT THE SERVICE BOUNDARY (G2-F02) ------------------------------


def test_create_note_exactly_4000_chars_succeeds(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    note = "x" * 4000
    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
        note=note,
    )
    assert view.note == note
    assert len(view.note) == 4000
    assert count(db_session, AlignmentGroup) == 1


def test_create_note_over_4000_validation_error_no_persisted_state(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(de, 4, 22)],
            note="x" * 4001,
        )
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.details == {
        "field": "note",
        "max_length": 4000,
        "actual_length": 4001,
    }
    # No persisted state at all: no group, no members, no orphan spans.
    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Span) == 0
    assert db_session.in_transaction() is False


def test_patch_note_over_4000_validation_error_old_intact(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    old_member_ids = {m.id for m in view.members}

    with pytest.raises(DomainError) as excinfo:
        alignment_service.update_alignment(
            db_session, view.id, note="x" * 4001
        )
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.details["max_length"] == 4000

    # The old Alignment remains completely intact (note and members).
    group = db_session.get(AlignmentGroup, view.id)
    assert group.note == "original"
    rows = list(
        db_session.scalars(
            select(AlignmentMember).where(AlignmentMember.alignment_group_id == view.id)
        ).all()
    )
    assert {r.id for r in rows} == old_member_ids
    assert count(db_session, Span) == 2
    assert db_session.in_transaction() is False


def test_patch_note_exactly_4000_chars_succeeds(db_session) -> None:
    _document, en, de, _fr, view = _patch_setup(db_session)
    note = "y" * 4000
    result = alignment_service.update_alignment(db_session, view.id, note=note)
    assert result.note == note
    assert db_session.get(AlignmentGroup, view.id).note == note


# --- TRANSACTION-CLEAN SESSION CONTRACT ------------------------------------------


def test_service_rejects_dirty_session_at_entry(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    # A caller-owned pending ORM mutation makes the Session not clean.
    pending = AlignmentGroup(document_id=document.id)
    db_session.add(pending)

    with pytest.raises(SessionNotCleanError):
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(de, 4, 22)],
        )


def test_service_rejects_open_transaction_at_entry(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    with db_session.begin():
        with pytest.raises(SessionNotCleanError):
            alignment_service.create_alignment(
                db_session,
                document_id=document.id,
                members=[member(en, 2, 17), member(de, 4, 22)],
            )


def test_service_leaves_session_clean_after_success(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[member(en, 2, 17), member(de, 4, 22)],
    )
    assert db_session.in_transaction() is False
    assert len(db_session.new) == 0
    assert len(db_session.dirty) == 0
    assert len(db_session.deleted) == 0

    alignment_service.update_alignment(db_session, view.id, note="x")
    assert db_session.in_transaction() is False

    alignment_service.delete_alignment(db_session, view.id)
    assert db_session.in_transaction() is False


def test_service_leaves_session_clean_after_expected_failure(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en, de, _fr = make_aligned_versions(db_session, document.id)

    with pytest.raises(DomainError):
        alignment_service.create_alignment(
            db_session,
            document_id=document.id,
            members=[member(en, 2, 17), member(de, 4, 22), member(de, 4, 22)],
        )
    assert db_session.in_transaction() is False

    with pytest.raises(DomainError):
        alignment_service.update_alignment(db_session, uuid.uuid4(), note="x")
    assert db_session.in_transaction() is False

    with pytest.raises(DomainError):
        alignment_service.delete_alignment(db_session, uuid.uuid4())
    assert db_session.in_transaction() is False
