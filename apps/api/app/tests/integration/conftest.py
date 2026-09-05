"""Integration-test fixtures: a disposable PostgreSQL database per session.

Safety guarantees:

- only uniquely named disposable databases are ever created/migrated/dropped
  (lifecycle shared with the Playwright E2E wrapper via
  ``app.db.disposable`` — one implementation, no duplicated unsafe logic);
- the normal development database is never migrated, downgraded or dropped:
  :func:`app.db.disposable.assert_disposable_db_url` fails closed on any
  non-prefixed database name;
- PostgreSQL is mandatory: when no server is configured, integration tests
  are skipped with an explicit reason (a reported environment limitation,
  not a pass);
- there is no SQLite fallback anywhere in the test stack.
"""

import os
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.db.disposable import (
    create_disposable_database,
    drop_disposable_database,
    migrate_to_head,
)

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

# Domain tables in FK-safe truncation order (CASCADE makes order irrelevant,
# but listing them documents the graph).
DOMAIN_TABLES = (
    "segments",
    "segmentation_layers",
    "alignment_members",
    "alignment_groups",
    "spans",
    "text_versions",
    "parallel_documents",
    "projects",
)


@pytest.fixture(scope="session")
def disposable_db_url() -> str:
    """A session-scoped disposable database migrated to Alembic HEAD.

    Yields the SQLAlchemy URL; the database is dropped at session end. This
    fixture itself is the migration-from-zero proof: the database starts
    empty and is migrated to HEAD.
    """
    try:
        admin_engine, target_url = create_disposable_database("linguagraph_m2")
    except RuntimeError as exc:
        pytest.skip(str(exc))
    url = target_url.render_as_string(hide_password=False)
    try:
        migrate_to_head(url)
        yield url
    finally:
        drop_disposable_database(admin_engine, target_url)


@pytest.fixture(scope="session")
def db_engine(disposable_db_url: str):
    """SQLAlchemy engine bound to the disposable database."""
    from app.db.session import apply_utc_timezone, create_bounded_engine

    # HRA-F05 (R2): bounded connect timeout via the shared helper — an
    # unreachable configured server fails fast instead of hanging the
    # integration session before the first test body.
    engine = create_bounded_engine(disposable_db_url, pool_pre_ping=True)
    apply_utc_timezone(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine) -> Session:
    """A fresh ORM session with an empty domain schema (TRUNCATE between tests)."""
    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        session.execute(
            text(f"TRUNCATE {', '.join(DOMAIN_TABLES)} CASCADE")
        )
        session.commit()
        yield session


def _build_api_client(
    db_engine,
    *,
    raise_server_exceptions: bool = True,
    **settings_overrides,
):
    """TestClient bound to the disposable database with optional Settings overrides.

    The production ``get_db`` dependency is overridden so every request gets
    a fresh, transaction-clean ORM session bound to the disposable engine —
    exactly the production Session lifecycle (request-scoped session, closed
    after the response; services own transaction boundaries). TRUNCATE is
    issued directly on the engine (not through the app session), so API-only
    tests never see rows left by earlier tests.

    ``raise_server_exceptions=False`` makes TestClient return the response
    body of unhandled server exceptions (Starlette always re-raises them
    after sending the 500, and TestClient surfaces them by default).
    """
    from fastapi.testclient import TestClient

    from app.api.deps import get_db
    from app.main import create_app

    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)

    with db_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(DOMAIN_TABLES)} CASCADE"))

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app = create_app(settings=Settings(**settings_overrides))
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


@pytest.fixture()
def api_client(db_engine):
    """TestClient with default settings against the disposable database."""
    return _build_api_client(db_engine)


@pytest.fixture()
def api_client_factory(db_engine):
    """Factory for TestClients with per-test overrides.

    ``**settings_overrides`` maps to ``Settings`` (e.g. a small
    ``max_request_body_bytes`` for body-limit tests);
    ``raise_server_exceptions=False`` returns the 500 response body instead
    of re-raising unhandled server exceptions.
    """

    def _factory(*, raise_server_exceptions: bool = True, **settings_overrides):
        return _build_api_client(
            db_engine,
            raise_server_exceptions=raise_server_exceptions,
            **settings_overrides,
        )

    return _factory
