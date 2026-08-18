"""SQLAlchemy engine, session factory, and transaction helper (PostgreSQL)."""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class SessionHasPendingChangesError(RuntimeError):
    """Raised when a write service is called on a Session that already holds
    caller-owned pending ORM mutations.

    This is an internal programming error: production persistence mutations
    go through services, which own transaction boundaries (ADR-008). A caller
    must never stage raw ORM changes on the session and then delegate the
    commit to a service, because the service's transaction would either
    silently discard those changes or commit state the caller did not intend
    the service to own.
    """


def _has_pending_changes(db: Session) -> bool:
    """True when the Session carries caller-owned unflushed ORM mutations."""
    return bool(db.new) or bool(db.dirty) or bool(db.deleted)


@contextmanager
def write_transaction(db: Session) -> Iterator[None]:
    """Run one atomic unit of work on ``db``.

    Services own transaction boundaries (ADR-008): each write service call is
    a single transaction. A plain read auto-begins a transaction on the session
    (and ``Session.begin()`` refuses to start another), so the ordinary
    autobegun read-only transaction is ended first.

    Fail-safe contract:

    - if the Session carries caller-owned pending ORM mutations (``db.new``,
      ``db.dirty`` or ``db.deleted``), a
      :class:`SessionHasPendingChangesError` is raised IMMEDIATELY and no
      service work happens: caller-owned state is never silently rolled back
      and never silently committed by the service;
    - if the open transaction is only the autobegun read transaction, it is
      ended safely before the service-owned transaction begins;
    - on success the transaction commits; on ANY exception it rolls back fully
      and the exception propagates, so a failed service call leaves no partial
      state.

    Production persistence mutations go through services rather than raw
    caller-issued DML; callers must not stage pending changes between service
    calls.
    """
    # Fail-safe FIRST: caller-owned pending mutations are never silently
    # committed or discarded by a service transaction, whether or not a
    # transaction happens to be open on the session.
    if _has_pending_changes(db):
        raise SessionHasPendingChangesError(
            "write_transaction requires a clean Session: the session has "
            "caller-owned pending mutations (db.new/db.dirty/db.deleted) that "
            "a service transaction must not silently commit or discard. "
            "Persistence mutations go through services; do not stage raw ORM "
            "changes and then delegate the commit to a service."
        )
    if db.in_transaction():
        db.rollback()  # ends only the autobegun read-only transaction
    with db.begin():
        yield


__all__ = [
    "Session",
    "SessionLocal",
    "SessionHasPendingChangesError",
    "engine",
    "write_transaction",
]
