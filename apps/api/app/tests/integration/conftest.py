"""Integration-test fixtures: a disposable PostgreSQL database per session.

Safety guarantees (mirroring test_migrations.py):

- only uniquely named disposable databases are ever created/migrated/dropped;
- the normal development database is never migrated or downgraded;
- PostgreSQL is mandatory: when no server is configured, integration tests
  are skipped with an explicit reason (a reported environment limitation,
  not a pass);
- there is no SQLite fallback anywhere in the test stack.
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

# Domain tables in FK-safe truncation order (CASCADE makes order irrelevant,
# but listing them documents the graph).
DOMAIN_TABLES = (
    "alignment_members",
    "alignment_groups",
    "spans",
    "text_versions",
    "parallel_documents",
    "projects",
)


def create_disposable_database(prefix: str) -> tuple[object, object]:
    """Create a uniquely named disposable database; return (admin_engine, target_url).

    Callers MUST drop the database in a ``finally`` block via
    :func:`drop_disposable_database`. Skips (via pytest.skip) when no
    PostgreSQL server is configured.
    """
    server_url = Settings().integration_server_url
    if server_url is None:
        pytest.skip(
            "TEST_DATABASE_URL/DATABASE_URL not set (and no apps/api/.env) — "
            "cannot run PostgreSQL integration tests"
        )
    url = make_url(server_url)
    admin_url = url.set(database="postgres")
    db_name = f"{prefix}_{uuid.uuid4().hex[:12]}"
    target_url = url.set(database=db_name)

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    return admin_engine, target_url


def drop_disposable_database(admin_engine, target_url) -> None:
    """Drop the disposable database, force-closing any leftover connections."""
    db_name = target_url.database
    admin_engine.dispose()
    cleanup = create_engine(
        target_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with cleanup.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
    finally:
        cleanup.dispose()


@pytest.fixture(scope="session")
def disposable_db_url() -> str:
    """A session-scoped disposable database migrated to Alembic HEAD.

    Yields the SQLAlchemy URL; the database is dropped at session end. This
    fixture itself is the migration-from-zero proof: the database starts
    empty and is migrated to HEAD.
    """
    admin_engine, target_url = create_disposable_database("linguagraph_m02")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = target_url.render_as_string(hide_password=False)
    try:
        cfg = Config(str(ALEMBIC_INI))
        command.upgrade(cfg, "head")
        yield target_url.render_as_string(hide_password=False)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        drop_disposable_database(admin_engine, target_url)


@pytest.fixture(scope="session")
def db_engine(disposable_db_url: str):
    """SQLAlchemy engine bound to the disposable database."""
    engine = create_engine(disposable_db_url, pool_pre_ping=True)
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
