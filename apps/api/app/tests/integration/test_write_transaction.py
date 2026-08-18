"""write_transaction fail-safe contract (M0.2 review fix 3).

A persistence foundation must never silently lose caller-owned changes. These
tests prove that a write service:

A. still works after an ordinary autobegun READ transaction;
B. raises instead of silently discarding a caller-pending ``db.add(...)``;
C. raises instead of silently discarding a caller-modified dirty object;
D. raises instead of silently swallowing a caller-pending deletion.

In every fail-fast case the caller's pending state survives and remains
flushable, and the service writes nothing.
"""

import pytest
from sqlalchemy import select

from app.db.models import Project
from app.db.session import SessionHasPendingChangesError
from app.services import document_service, project_service
from app.tests.integration.test_persistence import (
    count,
    make_document,
    make_project,
)

pytestmark = pytest.mark.integration


def test_read_then_write_service_still_works(db_session) -> None:
    # (A) A read auto-begins a read-only transaction; the next write service
    # call must end it safely and proceed.
    project = make_project(db_session, name="Readable")
    fetched = project_service.get_project(db_session, project.id)  # read only
    assert fetched.id == project.id

    document = document_service.create_document(
        db_session, project_id=project.id, title="After read"
    )
    assert document.title == "After read"
    assert document.id is not None


def test_write_service_refuses_pending_add(db_session) -> None:
    # (B) A caller-staged db.add(...) must never be silently lost: the write
    # service raises immediately, writes nothing, and the pending object
    # remains staged for the caller to commit.
    make_project(db_session, name="Committed")
    pending = Project(name="Pending Add")
    db_session.add(pending)

    with pytest.raises(SessionHasPendingChangesError):
        project_service.create_project(db_session, name="From Service")

    # The service wrote nothing.
    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Committed"}
    # The caller-owned pending object is preserved and still flushable.
    assert pending in db_session.new
    db_session.commit()
    names = {p.name for p in db_session.scalars(select(Project)).all()}
    assert names == {"Committed", "Pending Add"}


def test_write_service_refuses_pending_dirty_object(db_session) -> None:
    # (C) A caller-made modification to a persistent object must never be
    # silently lost: the write service raises, the object stays dirty, and
    # the caller's commit persists the modification.
    project = make_project(db_session, name="Before")
    project.name = "After"  # caller-owned modification (dirty)

    with pytest.raises(SessionHasPendingChangesError):
        project_service.create_project(db_session, name="Other")

    assert project in db_session.dirty
    db_session.commit()
    assert db_session.get(Project, project.id).name == "After"


def test_write_service_refuses_pending_delete(db_session) -> None:
    # (D) A caller-pending deletion must never silently disappear: the write
    # service raises, the staged deletion survives, and the caller's commit
    # still performs it.
    project = make_project(db_session, name="Doomed")
    db_session.delete(project)

    with pytest.raises(SessionHasPendingChangesError):
        document_service.create_document(
            db_session, project_id=project.id, title="Blocked"
        )

    assert project in db_session.deleted
    db_session.commit()
    assert count(db_session, Project) == 0


def test_error_surfaces_before_any_service_write(db_session) -> None:
    # The fail-fast error is raised at entry, before the service performs any
    # work: a subsequent call on a cleaned session succeeds and the raised
    # call left nothing behind.
    project = make_project(db_session, name="Clean")
    db_session.add(Project(name="Staged"))
    with pytest.raises(SessionHasPendingChangesError):
        project_service.create_project(db_session, name="Would Be Created")

    # Clean up the staged object, then the same service call succeeds.
    db_session.rollback()
    created = project_service.create_project(db_session, name="Now Works")
    assert created.name == "Now Works"


def test_unaffected_reads_do_not_block_write_service(db_session) -> None:
    # Several read service calls in a row, then a write service: reads only
    # autobegin read-only transactions, which write_transaction ends safely.
    project = make_project(db_session, name="Multi Read")
    project_service.get_project(db_session, project.id)
    project_service.list_projects(db_session)
    document_service.list_documents(db_session, project.id)

    updated = project_service.update_project(db_session, project.id, name="Updated")
    assert updated.name == "Updated"
    assert count(db_session, Project) == 1