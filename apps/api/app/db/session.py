"""SQLAlchemy engine, session factory, and transaction helper (PostgreSQL)."""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def write_transaction(db: Session) -> Iterator[None]:
    """Run one atomic unit of work on ``db``.

    Services own transaction boundaries (ADR-008): each write service call is
    a single transaction. Because a plain read auto-begins a transaction on
    the session (and ``Session.begin()`` refuses to start another), any
    transaction already open — normally just an autobegun read transaction —
    is discarded first. Callers must never hold pending changes between
    service calls.

    On success the transaction commits; on ANY exception it rolls back fully
    and the exception propagates, so a failed service call leaves no partial
    state.
    """
    if db.in_transaction():
        db.rollback()
    with db.begin():
        yield


__all__ = ["Session", "SessionLocal", "engine", "write_transaction"]
