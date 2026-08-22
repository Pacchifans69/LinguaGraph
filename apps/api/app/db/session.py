"""SQLAlchemy engine, session factory, and transaction helpers (PostgreSQL).

Transaction-ownership contract (ADR-008: routes -> services -> SQLAlchemy;
services own their intended transaction boundaries):

- The Session is transaction-clean between service calls: every public
  service method requires a Session with NO open transaction and NO
  caller-owned ORM mutations at entry, and leaves it transaction-clean at
  exit.
- ``write_transaction`` is the only way a write service creates its
  transaction. It REFUSES any pre-existing transaction instead of ending it,
  because an open transaction — explicit or autobegun — cannot be proven
  read-only with public APIs: the caller may have flushed INSERT/UPDATE/DELETE
  statements into it (``db.new``/``db.dirty``/``db.deleted`` are empty after a
  flush), and a service must never silently roll back or silently commit
  caller-owned uncommitted writes.
- ``read_transaction`` closes the read-only transaction a read service
  autobegins (a no-op commit; ``expire_on_commit=False`` keeps returned
  instances populated). It refuses pre-existing transactions for the same
  reason: a read service must never close a caller-owned transaction.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

# HRA-F05 (R2): finite, reasonable psycopg TCP connect timeout for ALL
# PostgreSQL connection establishment. On Windows, `localhost` may resolve
# to ::1 first where no PostgreSQL listens; without a connect timeout the
# client can wait indefinitely (or for the OS address-family fallback)
# before connecting — pytest then hangs before the first integration test
# body. 5 seconds bounds the failure while remaining generous for normal
# local startup. Every connection path required by M0.7 verification
# (disposable DB lifecycle, Alembic online commands) and the application
# engine shares this behavior via create_bounded_engine().
DB_CONNECT_TIMEOUT_SECONDS = 5


def create_bounded_engine(url, **kwargs):  # type: ignore[no-untyped-def]
    """``create_engine`` with a finite psycopg connect timeout (HRA-F05 R2).

    Adds ``connect_timeout=DB_CONNECT_TIMEOUT_SECONDS`` to the psycopg
    connect arguments unless the caller already provided one (explicit
    caller values win via ``setdefault``). All other ``create_engine``
    keyword arguments pass through unchanged, so callers keep their
    existing pool/URL semantics — only connection establishment is bounded.
    """
    connect_args = dict(kwargs.pop("connect_args", None) or {})
    connect_args.setdefault("connect_timeout", DB_CONNECT_TIMEOUT_SECONDS)
    return create_engine(url, connect_args=connect_args, **kwargs)


def apply_utc_timezone(engine) -> None:  # type: ignore[no-untyped-def]
    """Register a connect listener that pins PostgreSQL sessions to UTC.

    ``timestamptz`` columns store an absolute instant; PostgreSQL returns it
    in the session timezone. The application timestamps are UTC
    (``utcnow()`` in ``app.db.base``), so reading them in any other zone
    makes serialized timestamps inconsistent across requests
    (``+00:00`` vs ``+08:00`` for the same instant). Setting ``timezone=UTC``
    keeps every read on the UTC path. Applied to the app engine and to every
    disposable integration-test engine.
    """

    @event.listens_for(engine, "connect")
    def _set_session_timezone(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("SET TIME ZONE 'UTC'")
        finally:
            cursor.close()


engine = create_bounded_engine(get_settings().database_url, pool_pre_ping=True)
apply_utc_timezone(engine)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class SessionNotCleanError(RuntimeError):
    """Raised when a service is called on a Session that is not
    transaction-clean.

    A Session is not clean when it has an open transaction (explicit
    ``db.begin()``, or any autobegun transaction — which may contain flushed
    or unflushed caller-owned writes) or carries caller-owned pending ORM
    mutations (``db.new``/``db.dirty``/``db.deleted``).

    This is an internal programming error: persistence mutations go through
    services, which own transaction boundaries (ADR-008). A caller must never
    open a transaction or stage raw ORM changes and then delegate the commit
    (or rollback) to a service, because the service could not preserve
    caller-owned state without silently committing or discarding it.
    """


def _session_is_not_clean(db: Session) -> bool:
    """True when the Session carries any caller-owned transactional state.

    ``db.in_transaction()`` covers explicit caller transactions, autobegun
    transactions containing FLUSHED writes (after a flush, ``db.new`` /
    ``db.dirty`` / ``db.deleted`` are all empty while the transaction stays
    open), and unflushed additions/deletions (which autobegin). The collection
    checks additionally cover any state where ORM mutations could exist
    without a transaction — nothing is assumed from one signal alone.
    """
    return db.in_transaction() or bool(db.new) or bool(db.dirty) or bool(db.deleted)


def _require_clean_session(db: Session, service_kind: str) -> None:
    if _session_is_not_clean(db):
        raise SessionNotCleanError(
            f"a {service_kind} service requires a transaction-clean Session: "
            "the session has an open transaction (explicit or autobegun, "
            "possibly containing flushed writes) or caller-owned pending ORM "
            "mutations (db.new/db.dirty/db.deleted), and a service must never "
            "silently commit or discard caller-owned state. Persistence "
            "mutations go through services; do not stage raw ORM changes or "
            "open caller transactions and then delegate ownership to a "
            "service."
        )


@contextmanager
def write_transaction(db: Session) -> Iterator[None]:
    """Run one atomic write unit of work on ``db``.

    Contract:

    - entry requires a transaction-clean Session; otherwise
      :class:`SessionNotCleanError` is raised IMMEDIATELY and NO service work
      happens — caller-owned uncommitted writes are never silently rolled back
      and never silently committed by the service;
    - the service-owned transaction is created with ``db.begin()`` and
      committed on success;
    - on ANY exception the service-owned transaction rolls back fully and the
      exception propagates, so a failed service call leaves no partial state;
    - on exit the Session is transaction-clean again.

    Production persistence mutations go through write services; callers must
    not open transactions or stage pending changes between service calls.
    """
    _require_clean_session(db, "write")
    with db.begin():
        yield


@contextmanager
def read_transaction(db: Session) -> Iterator[None]:
    """Run the read-only unit of work of a read service on ``db``.

    Contract:

    - entry requires a transaction-clean Session (same fail-fast rule as
      :func:`write_transaction`): a read service must never end a
      caller-owned transaction;
    - the reads autobegin a read-only transaction; on exit that transaction is
      closed with a no-op ``commit()`` (``rollback()`` would expire returned
      instances; ``expire_on_commit=False`` keeps them populated), so the
      Session is transaction-clean again — which is what makes the supported
      ``read service -> write service`` workflow work;
    - if the body raises, the autobegun read-only transaction is still closed
      before the exception propagates.

    Read services never write; callers must not hold an open transaction when
    calling any service.
    """
    _require_clean_session(db, "read")
    try:
        yield
    finally:
        if db.in_transaction():
            # No-op commit: only reads ran inside, and expire_on_commit=False
            # keeps returned instances populated.
            db.commit()


__all__ = [
    "Session",
    "SessionLocal",
    "SessionNotCleanError",
    "engine",
    "read_transaction",
    "write_transaction",
]