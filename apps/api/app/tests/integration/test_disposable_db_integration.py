"""Disposable-database lifecycle against real PostgreSQL (M0.3 review A).

Proves the shared ``app.db.disposable`` implementation (used by both the
pytest fixtures and the Playwright E2E backend) creates and drops ONLY
uniquely-named, reserved-prefix databases on the configured server, and that
the migration helper refuses any non-disposable target.
"""

import uuid

import pytest
from sqlalchemy.engine import make_url

from app.db.disposable import (
    E2E_DB_PREFIX,
    assert_disposable_db_url,
    create_disposable_database,
    drop_disposable_database,
    migrate_to_head,
)

pytestmark = pytest.mark.integration


def test_create_and_drop_disposable_database() -> None:
    admin_engine, target_url = create_disposable_database(E2E_DB_PREFIX)
    db_name = target_url.database
    try:
        # Unique, reserved-prefix name on the configured server.
        assert db_name.startswith(f"{E2E_DB_PREFIX}_")
        assert_disposable_db_url(target_url, required_prefix=E2E_DB_PREFIX)

        # The database is empty: migrating from zero must succeed.
        migrate_to_head(target_url.render_as_string(hide_password=False))

        # The Alembic version table exists at HEAD.
        from sqlalchemy import create_engine, text

        engine = create_engine(target_url.render_as_string(hide_password=False))
        try:
            with engine.connect() as conn:
                assert (
                    conn.execute(
                        text("SELECT version_num FROM alembic_version")
                    ).scalar_one()
                    == "0002"
                )
        finally:
            engine.dispose()
    finally:
        drop_disposable_database(admin_engine, target_url)

    # After the drop the database no longer exists.
    from sqlalchemy import create_engine, text

    check = create_engine(
        make_url(target_url).set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with check.connect() as conn:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM pg_database WHERE datname = :name"
                ),
                {"name": db_name},
            ).scalar()
            assert exists is None
    finally:
        check.dispose()


def test_migrate_refuses_non_disposable_database() -> None:
    with pytest.raises(RuntimeError, match="refusing disposable-database"):
        migrate_to_head(
            "postgresql+psycopg://user:pass@localhost:5432/linguagraph"
        )


def test_names_are_unique_across_calls() -> None:
    first = uuid.uuid4()
    names = {f"{E2E_DB_PREFIX}_{first.hex[:12]}"}
    # The helper composes the name from a caller-provided prefix + uuid; two
    # calls never share a name.
    admin_a, url_a = create_disposable_database(E2E_DB_PREFIX)
    admin_b, url_b = create_disposable_database(E2E_DB_PREFIX)
    try:
        assert url_a.database != url_b.database
        assert url_a.database not in names
    finally:
        drop_disposable_database(admin_a, url_a)
        drop_disposable_database(admin_b, url_b)
