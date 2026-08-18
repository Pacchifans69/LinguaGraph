"""write_transaction / read_transaction fail-safe contract (M0.2 review fix 3).

The final transaction-ownership contract (ADR-008: routes -> services ->
SQLAlchemy; services own their intended transaction boundaries):

- The Session is transaction-clean between service calls.
- ``write_transaction`` rejects ANY pre-existing transaction or caller-owned
  pending ORM mutation (``SessionNotCleanError``, fail-fast) instead of
  ending it: an open transaction cannot be proven read-only with public APIs
  (a caller may have FLUSHED INSERT/UPDATE/DELETE into it while
  ``db.new``/``db.dirty``/``db.deleted`` are empty), and a service must never
  silently roll back or silently commit caller-owned uncommitted writes.
- ``read_transaction`` applies the same fail-fast rule and closes the
  read-only transaction the read service itself autobegins (a no-op commit;
  ``expire_on_commit=False`` keeps returned instances populated), so the
  supported ``service read -> service write`` workflow works.
- Explicit caller transactions (``with db.begin():``) are never taken over:
  any service call inside them is rejected before doing any work.

These tests prove the contract against real PostgreSQL: flushed
INSERT/UPDATE/DELETE are neither silently rolled back nor silently committed
by a write service, caller explicit transactions stay caller-owned, and the
normal read -> write workflow still works.
"""

import uuid

import pytest
from sqlalchemy import select, text

from app.db.models import Project
from app.db.session import SessionNotCleanError
from app.services import document_service, project_service
from app.tests.integration.test_persistence import (
    count,
    make_document,
    make_project,
)

pytestmark = pytest.mark.integration


# --- 1. FLUSHED INSERT ---------------------------------------------------------


def test_flushed_insert_is_neither_committed_nor_rolled_back(db_session, db_engine) -> None:
    # A caller that adds AND flushes has emitted the INSERT into the open
    # transaction while db.new is empty. A write service must fail fast: it
    # must not roll the INSERT back, and must not commit it either.
    make_project(db_session, name="Committed")

    obj = Project(name="Flushed Insert")
    db_session.add(obj)
    db_session.flush()

    # Prove we are exactly in the reviewer's scenario: flushed, no pending
    # ORM collections, transaction still open.
    assert obj.id is not None
    assert len(db_session.new) == 0
    assert len(db_session.dirty) == 0
    assert len(db_session.deleted) == 0
    assert db_session.in_transaction() is True

    with pytest.raises(SessionNotCleanError):
        project_service.create_project(db_session, name="From Service")

    # (a) NOT silently committed: another connection cannot see the row yet,
    #     and the service wrote nothing itself.
    with db_engine.connect() as conn:
        visible = conn.execute(
            text("SELECT name FROM projects ORDER BY name")
        ).scalars().all()
    assert visible == ["Committed"]

    # (b) NOT silently rolled back: the caller's transaction is still open
    #     and the caller's commit persists the flushed INSERT.
    assert db_session.in_transaction() is True
    db_session.commit()
    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Committed", "Flushed Insert"}


# --- 2. FLUSHED UPDATE -----------------------------------------------------------


def test_flushed_update_is_neither_committed_nor_rolled_back(db_session, db_engine) -> None:
    project = make_project(db_session, name="Before")

    project.name = "After"
    db_session.flush()  # UPDATE emitted, still uncommitted; collections empty

    assert len(db_session.dirty) == 0
    assert db_session.in_transaction() is True

    with pytest.raises(SessionNotCleanError):
        document_service.create_document(
            db_session, project_id=project.id, title="Blocked"
        )

    # (a) NOT silently committed: a second connection still sees the old value.
    with db_engine.connect() as conn:
        visible = conn.execute(
            text("SELECT name FROM projects WHERE id = :pid"),
            {"pid": project.id},
        ).scalar_one()
    assert visible == "Before"

    # (b) NOT silently rolled back: the caller's commit lands the UPDATE.
    db_session.commit()
    assert db_session.get(Project, project.id).name == "After"


# --- 3. FLUSHED DELETE ------------------------------------------------------------


def test_flushed_delete_is_neither_committed_nor_rolled_back(db_session, db_engine) -> None:
    project = make_project(db_session, name="Doomed")

    db_session.delete(project)
    db_session.flush()  # DELETE emitted, still uncommitted; collections empty

    assert len(db_session.deleted) == 0
    assert db_session.in_transaction() is True

    with pytest.raises(SessionNotCleanError):
        document_service.create_document(
            db_session, project_id=project.id, title="Blocked"
        )

    # (a) NOT silently committed: a second connection still sees the row.
    with db_engine.connect() as conn:
        visible = conn.execute(
            text("SELECT count(*) FROM projects WHERE id = :pid"),
            {"pid": project.id},
        ).scalar_one()
    assert visible == 1

    # (b) NOT silently rolled back: the caller's commit lands the DELETE.
    db_session.commit()
    assert count(db_session, Project) == 0


# --- 4. EXPLICIT CALLER TRANSACTION --------------------------------------------------


def test_explicit_caller_transaction_is_not_taken_over(db_session) -> None:
    make_project(db_session, name="Base")
    assert not db_session.in_transaction()

    with db_session.begin():
        staged = Project(name="Caller Explicit")
        db_session.add(staged)
        db_session.flush()

        with pytest.raises(SessionNotCleanError):
            document_service.create_document(
                db_session, project_id=uuid.uuid4(), title="Blocked"
            )

        # The service raised BEFORE doing any work: the caller's explicit
        # transaction is still open and still owns the staged write.
        assert db_session.in_transaction() is True
        assert staged in db_session

    # The caller's own with-block (not any service) committed the transaction.
    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Base", "Caller Explicit"}
    assert count(db_session, Project) == 2


# --- 5. NORMAL READ -> WRITE ---------------------------------------------------------


def test_read_then_write_service_still_works(db_session) -> None:
    project = make_project(db_session, name="Readable")

    fetched = project_service.get_project(db_session, project.id)  # read service
    assert fetched.id == project.id
    # The read service closed its own read-only transaction: the Session is
    # transaction-clean, which is what makes the write service call legal.
    assert not db_session.in_transaction()

    document = document_service.create_document(
        db_session, project_id=project.id, title="After read"
    )
    assert document.title == "After read"
    assert document.id is not None
    assert not db_session.in_transaction()


def test_read_service_leaves_session_clean_even_on_not_found(db_session) -> None:
    # A read that raises NOT_FOUND must still close its read-only transaction.
    with pytest.raises(Exception) as excinfo:
        project_service.get_project(db_session, uuid.uuid4())
    assert excinfo.type.__name__ == "DomainError"
    assert not db_session.in_transaction()

    # The session is therefore reusable for a write service.
    project = project_service.create_project(db_session, name="After NotFound")
    assert project.name == "After NotFound"


# --- 6. EXISTING UNFLUSHED FAIL-SAFE CASES (kept green) -------------------------------


def test_write_service_refuses_pending_add(db_session) -> None:
    make_project(db_session, name="Committed")
    pending = Project(name="Pending Add")
    db_session.add(pending)

    with pytest.raises(SessionNotCleanError):
        project_service.create_project(db_session, name="From Service")

    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Committed"}
    assert pending in db_session.new  # caller-owned state preserved
    db_session.commit()
    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Committed", "Pending Add"}


def test_write_service_refuses_pending_dirty_object(db_session) -> None:
    project = make_project(db_session, name="Before")
    project.name = "After"  # caller-owned modification (dirty)

    with pytest.raises(SessionNotCleanError):
        project_service.create_project(db_session, name="Other")

    assert project in db_session.dirty
    db_session.commit()
    assert db_session.get(Project, project.id).name == "After"


def test_write_service_refuses_pending_delete(db_session) -> None:
    project = make_project(db_session, name="Doomed")
    db_session.delete(project)

    with pytest.raises(SessionNotCleanError):
        document_service.create_document(
            db_session, project_id=project.id, title="Blocked"
        )

    assert project in db_session.deleted
    db_session.commit()
    assert count(db_session, Project) == 0


def test_read_service_also_refuses_pending_state(db_session) -> None:
    # The same fail-fast rule protects read services: they must never end a
    # caller-owned transaction (which could contain uncommitted writes).
    make_project(db_session, name="Base")
    staged = Project(name="Staged")
    db_session.add(staged)

    with pytest.raises(SessionNotCleanError):
        project_service.list_projects(db_session)

    assert staged in db_session.new
    db_session.commit()
    assert count(db_session, Project) == 2


def test_error_surfaces_before_any_service_write(db_session) -> None:
    project = make_project(db_session, name="Clean")
    db_session.add(Project(name="Staged"))
    with pytest.raises(SessionNotCleanError):
        project_service.create_project(db_session, name="Would Be Created")

    db_session.rollback()
    created = project_service.create_project(db_session, name="Now Works")
    assert created.name == "Now Works"
