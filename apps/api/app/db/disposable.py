"""Disposable PostgreSQL database lifecycle + dev-database guard.

Single shared implementation used by BOTH:

- the pytest integration fixtures
  (``apps/api/app/tests/integration/conftest.py``), and
- the Playwright E2E backend wrapper
  (``apps/api/app/e2e/server.py``).

Safety properties (mandatory, enforced by :func:`assert_disposable_db_url`):

- only uniquely-named disposable databases are ever created/migrated/dropped;
- the normal development database is never created, migrated, read, written
  or dropped by any disposable flow — every target database name must start
  with a reserved ``linguagraph_`` prefix and the guard FAILS CLOSED;
- the E2E flow additionally requires the ``linguagraph_e2e_`` prefix;
- PostgreSQL is mandatory; there is no SQLite fallback anywhere.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings

# Reserved namespace shared by pytest fixtures and the E2E wrapper.
DISPOSABLE_DB_PREFIX = "linguagraph_"
# Stricter namespace for the Playwright E2E backend.
E2E_DB_PREFIX = "linguagraph_e2e"

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def assert_disposable_db_url(
    url, *, required_prefix: str = DISPOSABLE_DB_PREFIX
) -> None:
    """Fail closed unless ``url`` targets a database in the reserved namespace.

    This is the mechanically meaningful guard proving a disposable flow can
    never target the normal development database: the database name must
    start with the reserved prefix (``linguagraph_`` for tests,
    ``linguagraph_e2e`` for the E2E wrapper). Any other name — including the
    development database name — raises immediately, before any SQL runs.
    """
    db_name = make_url(url).database
    if not db_name or not db_name.startswith(required_prefix):
        raise RuntimeError(
            "refusing disposable-database operation on "
            f"{db_name!r}: database name must start with "
            f"{required_prefix!r}; the development database must never be "
            "created/migrated/read/written/dropped by a disposable flow"
        )


def create_disposable_database(prefix: str = E2E_DB_PREFIX) -> tuple[object, object]:
    """Create a uniquely named disposable database; return (admin_engine, target_url).

    Callers MUST drop the database in a ``finally`` block via
    :func:`drop_disposable_database`. The database name is unique and always
    carries the reserved prefix, which the guard enforces before the CREATE
    statement runs.
    """
    server_url = get_settings().integration_server_url
    if server_url is None:
        raise RuntimeError(
            "no PostgreSQL server configured (set TEST_DATABASE_URL or "
            "DATABASE_URL); cannot create a disposable database"
        )
    url = make_url(server_url)
    admin_url = url.set(database="postgres")
    db_name = f"{prefix}_{uuid.uuid4().hex[:12]}"
    target_url = url.set(database=db_name)
    assert_disposable_db_url(target_url, required_prefix=DISPOSABLE_DB_PREFIX)

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    return admin_engine, target_url


def drop_disposable_database(admin_engine, target_url) -> None:
    """Drop the disposable database, force-closing any leftover connections.

    The guard runs before the DROP: a non-prefixed target (e.g. the
    development database) is refused instead of dropped.
    """
    db_name = make_url(target_url).database
    assert_disposable_db_url(target_url, required_prefix=DISPOSABLE_DB_PREFIX)
    admin_engine.dispose()
    cleanup = create_engine(
        make_url(target_url).set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with cleanup.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
    finally:
        cleanup.dispose()


@contextmanager
def env_database_url(url: str) -> None:
    """Temporarily point ``DATABASE_URL`` at ``url`` for the Alembic CLI.

    Alembic's ``env.py`` honors the ``DATABASE_URL`` environment variable;
    this context manager installs it for the duration of the migration and
    restores the previous value afterwards.
    """
    import os

    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def migrate_to_head(url: str) -> None:
    """Migrate a disposable database to Alembic HEAD (migration-from-zero).

    Refuses to run when the target is not a reserved disposable database.
    """
    assert_disposable_db_url(url, required_prefix=DISPOSABLE_DB_PREFIX)
    from alembic import command
    from alembic.config import Config

    with env_database_url(url):
        command.upgrade(Config(str(ALEMBIC_INI)), "head")
