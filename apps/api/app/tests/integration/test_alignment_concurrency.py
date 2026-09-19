"""M7 Alignment mutation concurrency against real PostgreSQL 18.

C-R01..C-R09 are implementation acceptance races. C-A01/C-A02 are mandatory
audit races for the intentionally unchanged ParallelDocument/Project deletion
paths. Tests use separate Sessions and controlled row-lock holders; bounded
sleep is used only after a deterministic blocker exists.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.errors import DomainError
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    ParallelDocument,
    Project,
    Span,
    TextVersion,
)
from app.services import (
    alignment_service,
    document_service,
    project_service,
    text_version_service,
)
from app.services.alignment_invariants import (
    MemberRef,
    alignment_group_is_valid,
)
from app.services.alignment_service import MemberInput
from app.tests.integration.test_persistence import (
    make_document,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration

BLOCK_WAIT_SECONDS = 0.35
JOIN_TIMEOUT_SECONDS = 12.0


def _new_session(db_engine) -> Session:
    factory = sessionmaker(
        bind=db_engine,
        autoflush=False,
        expire_on_commit=False,
    )
    return factory()


def _member(
    text_version_id: uuid.UUID,
    start: int = 0,
    end: int = 2,
) -> MemberInput:
    return MemberInput(
        text_version_id=text_version_id,
        start_offset=start,
        end_offset=end,
    )


def _setup_versions(db_session, *, four: bool = False):
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(
        db_session,
        document.id,
        language_tag="en",
        label="EN",
        content="AAAAA",
    )
    de = make_version(
        db_session,
        document.id,
        language_tag="de",
        label="DE",
        content="BBBBB",
    )
    fr = make_version(
        db_session,
        document.id,
        language_tag="fr",
        label="FR",
        content="CCCCC",
    )
    it = None
    if four:
        it = make_version(
            db_session,
            document.id,
            language_tag="it",
            label="IT",
            content="DDDDD",
        )
    return project, document, en, de, fr, it


def _capture(
    outcomes: dict[str, object],
    key: str,
    operation: Callable[[], None],
) -> None:
    try:
        operation()
        outcomes[key] = "ok"
    except DomainError as error:
        outcomes[key] = error.code
    except Exception as error:  # pragma: no cover - reported by assertions
        outcomes[key] = error


def _run_pair_behind_document_gate(
    db_engine,
    document_id: uuid.UUID,
    left: Callable[[], None],
    right: Callable[[], None],
) -> dict[str, object]:
    """Make both real service calls wait on the canonical document root."""

    controller = _new_session(db_engine)
    controller.begin()
    controller.execute(
        text(
            "SELECT id FROM parallel_documents "
            "WHERE id = :id FOR UPDATE"
        ),
        {"id": document_id},
    )

    barrier = threading.Barrier(2)
    outcomes: dict[str, object] = {}

    def runner(key: str, operation: Callable[[], None]) -> None:
        try:
            barrier.wait(timeout=5)
        except threading.BrokenBarrierError as error:  # pragma: no cover
            outcomes[key] = error
            return
        _capture(outcomes, key, operation)

    threads = [
        threading.Thread(target=runner, args=("left", left)),
        threading.Thread(target=runner, args=("right", right)),
    ]
    try:
        for thread in threads:
            thread.start()

        time.sleep(BLOCK_WAIT_SECONDS)
        assert all(thread.is_alive() for thread in threads), (
            "both M7 operations should wait behind the document root"
        )

        controller.commit()

        for thread in threads:
            thread.join(timeout=JOIN_TIMEOUT_SECONDS)
            assert not thread.is_alive(), "concurrency worker did not finish"
    finally:
        if controller.in_transaction():
            controller.rollback()
        controller.close()

    assert set(outcomes) == {"left", "right"}
    return outcomes


def _group_version_ids(
    session: Session,
    group_id: uuid.UUID,
) -> set[uuid.UUID]:
    return set(
        session.scalars(
            select(Span.text_version_id)
            .join(AlignmentMember, AlignmentMember.span_id == Span.id)
            .where(AlignmentMember.alignment_group_id == group_id)
        ).all()
    )


def _all_groups_valid(session: Session) -> bool:
    groups = list(session.scalars(select(AlignmentGroup)).all())
    for group in groups:
        rows = session.execute(
            select(AlignmentMember, Span, TextVersion)
            .join(Span, AlignmentMember.span_id == Span.id)
            .join(TextVersion, Span.text_version_id == TextVersion.id)
            .where(AlignmentMember.alignment_group_id == group.id)
        ).all()
        refs = [
            MemberRef(
                span_id=member.span_id,
                text_version_id=span.text_version_id,
                document_id=version.document_id,
                start_offset=span.start_offset,
                end_offset=span.end_offset,
            )
            for member, span, version in rows
        ]
        if not alignment_group_is_valid(refs, group.document_id):
            return False
    return True


def test_c_r01_patch_patch_same_group_is_serial_equivalent(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id, de_id, fr_id = en.id, de.id, fr.id

    def left() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                note="left",
                members=[_member(en_id), _member(fr_id)],
            )

    def right() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                note="right",
                members=[_member(de_id), _member(fr_id)],
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        left,
        right,
    )
    assert outcomes == {"left": "ok", "right": "ok"}

    with _new_session(db_engine) as session:
        final_group = session.get(AlignmentGroup, group_id)
        assert final_group is not None
        final_versions = _group_version_ids(session, group_id)
        assert (
            (final_group.note == "left" and final_versions == {en_id, fr_id})
            or
            (final_group.note == "right" and final_versions == {de_id, fr_id})
        )
        assert _all_groups_valid(session)


def test_c_r01_partial_patch_omission_preserves_other_serialized_field(
    db_engine,
    db_session,
) -> None:
    """Disjoint concurrent PATCHes must compose under serial-equivalent semantics.

    One request changes only note; the other changes only members. Whichever
    request acquires the document root first, the later request must re-resolve
    authoritative state and must not overwrite the field it omitted.
    """

    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
        note="original",
    )
    document_id = document.id
    group_id = group.id
    de_id, fr_id = de.id, fr.id

    def note_only() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                note="note-only",
            )

    def members_only() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                members=[_member(de_id), _member(fr_id)],
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        note_only,
        members_only,
    )
    assert outcomes == {"left": "ok", "right": "ok"}

    with _new_session(db_engine) as session:
        final_group = session.get(AlignmentGroup, group_id)
        assert final_group is not None
        assert final_group.note == "note-only"
        assert _group_version_ids(session, group_id) == {de_id, fr_id}
        assert _all_groups_valid(session)


def test_c_r02_patch_delete_same_group_has_stable_serial_outcome(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id, fr_id = en.id, fr.id

    def patch() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                members=[_member(en_id), _member(fr_id)],
            )

    def delete() -> None:
        with _new_session(db_engine) as session:
            alignment_service.delete_alignment(session, group_id)

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        patch,
        delete,
    )
    assert outcomes["right"] == "ok"
    assert outcomes["left"] in {"ok", "NOT_FOUND"}
    assert isinstance(outcomes["left"], str)

    with _new_session(db_engine) as session:
        assert session.get(AlignmentGroup, group_id) is None
        assert _all_groups_valid(session)


def test_c_r03_delete_delete_same_group_is_ok_plus_not_found(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, _fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id

    def delete() -> None:
        with _new_session(db_engine) as session:
            alignment_service.delete_alignment(session, group_id)

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        delete,
        delete,
    )
    values = list(outcomes.values())
    assert values.count("ok") == 1
    assert values.count("NOT_FOUND") == 1
    assert all(isinstance(value, str) for value in values)


def test_c_r04_create_vs_force_delete_text_version(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, _fr, _it = _setup_versions(db_session)
    document_id = document.id
    en_id, de_id = en.id, de.id

    def create() -> None:
        with _new_session(db_engine) as session:
            alignment_service.create_alignment(
                session,
                document_id=document_id,
                members=[_member(en_id), _member(de_id)],
            )

    def destroy() -> None:
        with _new_session(db_engine) as session:
            text_version_service.delete_text_version(
                session,
                en_id,
                force=True,
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        create,
        destroy,
    )
    assert outcomes["right"] == "ok"
    assert outcomes["left"] in {"ok", "NOT_FOUND"}
    assert isinstance(outcomes["left"], str)

    with _new_session(db_engine) as session:
        assert session.get(TextVersion, en_id) is None
        assert _all_groups_valid(session)


def test_c_r05_patch_vs_force_delete_text_version(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id, de_id, fr_id = en.id, de.id, fr.id

    def patch() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                members=[_member(de_id), _member(fr_id)],
            )

    def destroy() -> None:
        with _new_session(db_engine) as session:
            text_version_service.delete_text_version(
                session,
                en_id,
                force=True,
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        patch,
        destroy,
    )
    assert outcomes["right"] == "ok"
    assert outcomes["left"] in {"ok", "NOT_FOUND"}
    assert isinstance(outcomes["left"], str)

    with _new_session(db_engine) as session:
        assert session.get(TextVersion, en_id) is None
        surviving = session.get(AlignmentGroup, group_id)
        if surviving is not None:
            assert _group_version_ids(session, group_id) == {de_id, fr_id}
        assert _all_groups_valid(session)


def test_c_r06_delete_alignment_vs_force_delete_text_version(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, _fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id = en.id

    def delete_alignment() -> None:
        with _new_session(db_engine) as session:
            alignment_service.delete_alignment(session, group_id)

    def destroy_version() -> None:
        with _new_session(db_engine) as session:
            text_version_service.delete_text_version(
                session,
                en_id,
                force=True,
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        delete_alignment,
        destroy_version,
    )
    assert outcomes["right"] == "ok"
    assert outcomes["left"] in {"ok", "NOT_FOUND"}
    assert isinstance(outcomes["left"], str)

    with _new_session(db_engine) as session:
        assert session.get(TextVersion, en_id) is None
        assert session.get(AlignmentGroup, group_id) is None
        assert list(session.scalars(select(AlignmentMember)).all()) == []
        assert _all_groups_valid(session)


def test_c_r07_create_vs_replace_content_uses_one_canonical_text(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, _fr, _it = _setup_versions(db_session)
    document_id = document.id
    en_id, de_id = en.id, de.id
    created_group: dict[str, uuid.UUID] = {}

    def create() -> None:
        with _new_session(db_engine) as session:
            view = alignment_service.create_alignment(
                session,
                document_id=document_id,
                members=[_member(en_id), _member(de_id)],
            )
            created_group["id"] = view.id

    def replace() -> None:
        with _new_session(db_engine) as session:
            text_version_service.replace_content(
                session,
                en_id,
                content="ZZZZZ",
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        create,
        replace,
    )
    assert outcomes["left"] == "ok"
    assert outcomes["right"] in {"ok", "TEXT_HAS_ANNOTATIONS"}

    with _new_session(db_engine) as session:
        group_id = created_group["id"]
        en_span = session.scalar(
            select(Span)
            .join(AlignmentMember, AlignmentMember.span_id == Span.id)
            .where(
                AlignmentMember.alignment_group_id == group_id,
                Span.text_version_id == en_id,
            )
        )
        assert en_span is not None

        version = session.get(TextVersion, en_id)
        assert version is not None
        if outcomes["right"] == "ok":
            assert version.content == "ZZZZZ"
            assert en_span.exact_text == "ZZ"
        else:
            assert version.content == "AAAAA"
            assert en_span.exact_text == "AA"


def test_c_r08_shared_span_survives_competing_topology_mutation(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    first = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    second = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(fr.id)],
    )
    shared_id = next(
        member.span_id
        for member in first.members
        if member.text_version_id == en.id
    )
    document_id = document.id
    first_id, second_id = first.id, second.id

    def delete_first() -> None:
        with _new_session(db_engine) as session:
            alignment_service.delete_alignment(session, first_id)

    def patch_second() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                second_id,
                note="kept",
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        delete_first,
        patch_second,
    )
    assert outcomes == {"left": "ok", "right": "ok"}

    with _new_session(db_engine) as session:
        assert session.get(Span, shared_id) is not None
        assert session.get(AlignmentGroup, second_id) is not None
        assert _all_groups_valid(session)


def test_c_r09_true_orphans_are_removed_under_competing_mutation(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, it = _setup_versions(
        db_session,
        four=True,
    )
    assert it is not None

    first = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    second = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(fr.id), _member(it.id)],
    )
    old_span_ids = {member.span_id for member in first.members}
    document_id = document.id
    first_id, second_id = first.id, second.id
    fr_id, it_id = fr.id, it.id

    def replace_first() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                first_id,
                members=[_member(fr_id), _member(it_id)],
            )

    def patch_second() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                second_id,
                note="still here",
            )

    outcomes = _run_pair_behind_document_gate(
        db_engine,
        document_id,
        replace_first,
        patch_second,
    )
    assert outcomes == {"left": "ok", "right": "ok"}

    with _new_session(db_engine) as session:
        for span_id in old_span_ids:
            assert session.get(Span, span_id) is None
        assert _all_groups_valid(session)


def _audit_parent_delete_waits_for_alignment(
    db_engine,
    monkeypatch,
    *,
    document_id: uuid.UUID,
    blocked_text_version_id: uuid.UUID,
    patch_group_id: uuid.UUID,
    replacement: list[MemberInput],
    delete_parent: Callable[[Session], None],
) -> None:
    """Prove parent deletion waits while Alignment owns the document root."""

    controller = _new_session(db_engine)
    controller.begin()
    controller.execute(
        text(
            "SELECT id FROM text_versions "
            "WHERE id = :id FOR UPDATE"
        ),
        {"id": blocked_text_version_id},
    )

    original_lock = alignment_service.lock_parallel_document
    document_locked = threading.Event()

    def observed_document_lock(
        db: Session,
        requested_document_id: uuid.UUID,
    ):
        locked = original_lock(db, requested_document_id)
        if locked is not None and requested_document_id == document_id:
            document_locked.set()
        return locked

    monkeypatch.setattr(
        alignment_service,
        "lock_parallel_document",
        observed_document_lock,
    )

    outcomes: dict[str, object] = {}

    def patch() -> None:
        with _new_session(db_engine) as session:
            _capture(
                outcomes,
                "alignment",
                lambda: alignment_service.update_alignment(
                    session,
                    patch_group_id,
                    members=replacement,
                ),
            )

    def parent_delete() -> None:
        with _new_session(db_engine) as session:
            _capture(
                outcomes,
                "delete",
                lambda: delete_parent(session),
            )

    patch_thread = threading.Thread(target=patch)
    delete_thread = threading.Thread(target=parent_delete)
    try:
        patch_thread.start()
        assert document_locked.wait(timeout=5), (
            "alignment did not acquire the ParallelDocument root"
        )
        time.sleep(BLOCK_WAIT_SECONDS)
        assert patch_thread.is_alive(), (
            "alignment should be blocked on the controlled TextVersion lock"
        )

        delete_thread.start()
        time.sleep(BLOCK_WAIT_SECONDS)
        assert delete_thread.is_alive(), (
            "parent deletion should wait behind the document root"
        )

        controller.commit()

        patch_thread.join(timeout=JOIN_TIMEOUT_SECONDS)
        delete_thread.join(timeout=JOIN_TIMEOUT_SECONDS)
        assert not patch_thread.is_alive()
        assert not delete_thread.is_alive()
    finally:
        if controller.in_transaction():
            controller.rollback()
        controller.close()

    assert outcomes == {"alignment": "ok", "delete": "ok"}


def test_c_a01_alignment_mutation_vs_delete_parallel_document_audit(
    db_engine,
    db_session,
    monkeypatch,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id, fr_id = en.id, fr.id

    _audit_parent_delete_waits_for_alignment(
        db_engine,
        monkeypatch,
        document_id=document_id,
        blocked_text_version_id=en_id,
        patch_group_id=group_id,
        replacement=[_member(en_id), _member(fr_id)],
        delete_parent=lambda session: document_service.delete_document(
            session,
            document_id,
        ),
    )

    with _new_session(db_engine) as session:
        assert session.get(ParallelDocument, document_id) is None
        assert list(session.scalars(select(AlignmentGroup)).all()) == []
        assert list(session.scalars(select(AlignmentMember)).all()) == []


def test_c_a02_alignment_mutation_vs_delete_project_audit(
    db_engine,
    db_session,
    monkeypatch,
) -> None:
    project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    project_id = project.id
    document_id = document.id
    group_id = group.id
    en_id, fr_id = en.id, fr.id

    _audit_parent_delete_waits_for_alignment(
        db_engine,
        monkeypatch,
        document_id=document_id,
        blocked_text_version_id=en_id,
        patch_group_id=group_id,
        replacement=[_member(en_id), _member(fr_id)],
        delete_parent=lambda session: project_service.delete_project(
            session,
            project_id,
        ),
    )

    with _new_session(db_engine) as session:
        assert session.get(Project, project_id) is None
        assert session.get(ParallelDocument, document_id) is None
        assert list(session.scalars(select(AlignmentGroup)).all()) == []
        assert list(session.scalars(select(AlignmentMember)).all()) == []


def _audit_parent_delete_first_fails_alignment_closed(
    db_engine,
    *,
    delete_sql: str,
    delete_id: uuid.UUID,
    alignment_operation: Callable[[], None],
) -> None:
    """Hold an uncommitted parent cascade, then prove Alignment fails closed."""

    controller = _new_session(db_engine)
    controller.begin()
    controller.execute(text(delete_sql), {"id": delete_id})

    outcome: dict[str, object] = {}
    worker = threading.Thread(
        target=lambda: _capture(outcome, "alignment", alignment_operation)
    )
    try:
        worker.start()
        time.sleep(BLOCK_WAIT_SECONDS)
        assert worker.is_alive(), (
            "Alignment should wait on the parent deletion's row/cascade locks"
        )

        controller.commit()
        worker.join(timeout=JOIN_TIMEOUT_SECONDS)
        assert not worker.is_alive(), "Alignment worker did not finish"
    finally:
        if controller.in_transaction():
            controller.rollback()
        controller.close()

    assert outcome == {"alignment": "NOT_FOUND"}


def test_c_a01_delete_parallel_document_first_yields_not_found(
    db_engine,
    db_session,
) -> None:
    _project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    document_id = document.id
    group_id = group.id
    en_id, fr_id = en.id, fr.id

    def patch() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                members=[_member(en_id), _member(fr_id)],
            )

    _audit_parent_delete_first_fails_alignment_closed(
        db_engine,
        delete_sql="DELETE FROM parallel_documents WHERE id = :id",
        delete_id=document_id,
        alignment_operation=patch,
    )

    with _new_session(db_engine) as session:
        assert session.get(ParallelDocument, document_id) is None
        assert session.get(AlignmentGroup, group_id) is None


def test_c_a02_delete_project_first_yields_not_found(
    db_engine,
    db_session,
) -> None:
    project, document, en, de, fr, _it = _setup_versions(db_session)
    group = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[_member(en.id), _member(de.id)],
    )
    project_id = project.id
    document_id = document.id
    group_id = group.id
    en_id, fr_id = en.id, fr.id

    def patch() -> None:
        with _new_session(db_engine) as session:
            alignment_service.update_alignment(
                session,
                group_id,
                members=[_member(en_id), _member(fr_id)],
            )

    _audit_parent_delete_first_fails_alignment_closed(
        db_engine,
        delete_sql="DELETE FROM projects WHERE id = :id",
        delete_id=project_id,
        alignment_operation=patch,
    )

    with _new_session(db_engine) as session:
        assert session.get(Project, project_id) is None
        assert session.get(ParallelDocument, document_id) is None
        assert session.get(AlignmentGroup, group_id) is None


def test_cross_document_input_is_rejected_before_text_version_lock(
    db_session,
    monkeypatch,
) -> None:
    project = make_project(db_session)
    doc_a = make_document(db_session, project.id, title="A")
    doc_b = make_document(db_session, project.id, title="B")
    en_a = make_version(
        db_session,
        doc_a.id,
        language_tag="en",
        label="EN A",
        content="AAAAA",
    )
    de_a = make_version(
        db_session,
        doc_a.id,
        language_tag="de",
        label="DE A",
        content="BBBBB",
    )
    en_b = make_version(
        db_session,
        doc_b.id,
        language_tag="en",
        label="EN B",
        content="CCCCC",
    )

    calls: list[list[uuid.UUID]] = []
    original_lock = alignment_service.lock_text_versions

    def observed_lock(db: Session, ids):
        captured = list(ids)
        calls.append(captured)
        return original_lock(db, captured)

    monkeypatch.setattr(
        alignment_service,
        "lock_text_versions",
        observed_lock,
    )

    with pytest.raises(DomainError) as excinfo:
        alignment_service.create_alignment(
            db_session,
            document_id=doc_a.id,
            members=[
                _member(en_a.id),
                _member(de_a.id),
                _member(en_b.id),
            ],
        )

    assert excinfo.value.code == "CROSS_DOCUMENT_ALIGNMENT"
    assert calls == []
