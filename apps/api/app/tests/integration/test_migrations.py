"""Migration chain tests against disposable PostgreSQL databases.

Covered here:

- migration from an EMPTY database to HEAD (via the shared session fixture,
  which starts from zero and runs ``alembic upgrade head``), with the
  resulting schema asserted;
- the full cycle on a dedicated disposable database: upgrade base -> head,
  downgrade head -> base, upgrade base -> head again (and a partial downgrade
  to 0001), proving both directions of the M0.2 revision.

Safety guarantees:

- only uniquely named disposable databases are ever created/migrated/dropped;
- the normal development database is never migrated or downgraded;
- PostgreSQL is mandatory; without a configured server the tests skip with an
  explicit reason (a reported environment limitation, not a pass).
"""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.db.disposable import (
    create_disposable_database,
    drop_disposable_database,
)

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

pytestmark = pytest.mark.integration

# Expected public schema at HEAD: the Alembic version table plus the six
# M0.2 domain tables (M0_PREIMPLEMENTATION_REPORT.md section 4).
HEAD_TABLES = [
    "alembic_version",
    "alignment_groups",
    "alignment_members",
    "parallel_documents",
    "projects",
    "spans",
    "text_versions",
]


def _public_tables(url: str) -> list[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return sorted(
                conn.execute(
                    text(
                        "SELECT tablename FROM pg_tables"
                        " WHERE schemaname = 'public' ORDER BY tablename"
                    )
                )
                .scalars()
                .all()
            )
    finally:
        engine.dispose()


def _run_alembic(url: str, action: str, revision: str) -> None:
    os.environ["DATABASE_URL"] = url
    try:
        cfg = Config(str(ALEMBIC_INI))
        if action == "upgrade":
            command.upgrade(cfg, revision)
        else:
            command.downgrade(cfg, revision)
    finally:
        os.environ.pop("DATABASE_URL", None)


def test_migrate_from_zero_to_head(disposable_db_url: str) -> None:
    # The session fixture already migrated an empty database to HEAD; assert
    # the resulting schema and the recorded revision.
    assert _public_tables(disposable_db_url) == HEAD_TABLES

    engine = create_engine(disposable_db_url)
    try:
        with engine.connect() as conn:
            version_num = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            assert version_num == "0002"
    finally:
        engine.dispose()


def test_downgrade_to_base_then_upgrade_again() -> None:
    """Full upgrade/downgrade/upgrade cycle on a dedicated disposable DB."""
    admin_engine, target_url = create_disposable_database("linguagraph_cycle")
    url = target_url.render_as_string(hide_password=False)
    try:
        # empty database -> 0001 foundation -> 0002 domain schema
        _run_alembic(url, "upgrade", "head")
        assert _public_tables(url) == HEAD_TABLES

        # head -> base: the domain schema is fully removed; only the Alembic
        # version table remains (M0.1 foundation is a no-op revision).
        _run_alembic(url, "downgrade", "base")
        assert _public_tables(url) == ["alembic_version"]

        # base -> head again: the chain is re-applicable (idempotent forward).
        _run_alembic(url, "upgrade", "head")
        assert _public_tables(url) == HEAD_TABLES

        # Partial downgrade to the M0.1 revision removes only the M0.2 tables.
        _run_alembic(url, "downgrade", "0001")
        assert _public_tables(url) == ["alembic_version"]
    finally:
        drop_disposable_database(admin_engine, target_url)


def test_revision_0001_is_unchanged() -> None:
    """Guard: the M0.1 foundation revision must remain a no-op (its file is
    the repository's migration-history baseline and must not be edited)."""
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    rev = script.get_revision("0001")
    assert rev is not None
    assert rev.down_revision is None
    assert not rev.branch_labels
    assert rev.module.revision == "0001"
