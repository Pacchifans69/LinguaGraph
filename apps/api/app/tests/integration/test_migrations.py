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
from sqlalchemy import text

from app.db.session import create_bounded_engine

from app.db.disposable import (
    create_disposable_database,
    drop_disposable_database,
)

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

pytestmark = pytest.mark.integration

# Expected public schema at HEAD: the Alembic version table plus the eight domain tables (M0_PREIMPLEMENTATION_REPORT.md section 4).
HEAD_TABLES = [
    "alembic_version",
    "alignment_groups",
    "alignment_members",
    "parallel_documents",
    "projects",
    "segmentation_layers",
    "segments",
    "spans",
    "text_versions",
]


def _public_tables(url: str) -> list[str]:
    # HRA-F05 (R2): bounded connect timeout (shared helper) — migration
    # verification must never hang on an unreachable endpoint.
    engine = create_bounded_engine(url)
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
    """Run one Alembic action against ``url``, restoring the environment exactly.

    Alembic's ``env.py`` honors the ``DATABASE_URL`` environment variable, so
    the helper temporarily points it at the disposable database. On exit the
    ORIGINAL environment state is restored exactly (M0.7 W5 hardening):

    - if ``DATABASE_URL`` existed before the call, its exact previous value
      is reinstated — including an empty-string value — even when the Alembic
      run raises;
    - if ``DATABASE_URL`` did not exist before the call, it remains absent
      afterwards (the temporary disposable URL must never leak into the
      surrounding test process).

    The restoration runs in ``finally``, so it also covers failures inside
    the Alembic invocation.
    """
    had_database_url = "DATABASE_URL" in os.environ
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        cfg = Config(str(ALEMBIC_INI))
        if action == "upgrade":
            command.upgrade(cfg, revision)
        else:
            command.downgrade(cfg, revision)
    finally:
        if had_database_url:
            os.environ["DATABASE_URL"] = previous_database_url
        else:
            os.environ.pop("DATABASE_URL", None)


def test_migrate_from_zero_to_head(disposable_db_url: str) -> None:
    # The session fixture already migrated an empty database to HEAD; assert
    # the resulting schema and the recorded revision.
    assert _public_tables(disposable_db_url) == HEAD_TABLES

    # HRA-F05 (R2): bounded connect timeout (shared helper).
    engine = create_bounded_engine(disposable_db_url)
    try:
        with engine.connect() as conn:
            version_num = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            assert version_num == "0003"
    finally:
        engine.dispose()


def test_downgrade_to_base_then_upgrade_again() -> None:
    """Full upgrade/downgrade/upgrade cycle on a dedicated disposable DB."""
    admin_engine, target_url = create_disposable_database("linguagraph_cycle")
    url = target_url.render_as_string(hide_password=False)
    try:
        # empty database -> 0001 foundation -> 0002 domain schema -> 0003 segmentation
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


# ---------------------------------------------------------------------------
# M0.7 W5 hardening: the Alembic helper must restore the ORIGINAL environment
# exactly (a pre-existing DATABASE_URL is reinstated with its exact previous
# value; an absent DATABASE_URL stays absent). These regression tests
# monkeypatch the Alembic command functions, so they need no database server
# and never touch a real database — they verify the helper's environment
# contract only.
# ---------------------------------------------------------------------------


def test_run_alembic_restores_preexisting_database_url_exactly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A pre-existing DATABASE_URL is reinstated with its EXACT previous value
    (not merely 'some value'), on both success and failure paths."""
    previous_url = "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph"
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setenv("DATABASE_URL", previous_url)
    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore",
        "upgrade",
        "head",
    )
    # During the run the disposable URL was installed...
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore"
    ]
    # ...and afterwards the EXACT previous value is restored.
    assert os.environ["DATABASE_URL"] == previous_url

    # Failure path: an Alembic exception must not leak the disposable URL
    # either — the exact previous value is still restored.

    def failing_downgrade(cfg, revision):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")

    monkeypatch.setattr(command, "downgrade", failing_downgrade)
    with pytest.raises(RuntimeError, match="boom"):
        _run_alembic(
            "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore",
            "downgrade",
            "base",
        )
    assert os.environ["DATABASE_URL"] == previous_url


def test_run_alembic_restores_preexisting_empty_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """A pre-existing but EMPTY DATABASE_URL is restored as present-and-empty
    (presence is part of the original state, so the variable must not be
    popped)."""
    monkeypatch.setenv("DATABASE_URL", "")
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_empty",
        "upgrade",
        "head",
    )
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_empty"
    ]
    # Present before AND after, with the exact original (empty) value.
    assert "DATABASE_URL" in os.environ
    assert os.environ["DATABASE_URL"] == ""


def test_run_alembic_leaves_absent_database_url_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """When DATABASE_URL did not exist before the call, it remains absent
    afterwards (the temporary disposable URL never leaks into the process)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent",
        "upgrade",
        "head",
    )
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent"
    ]
    assert "DATABASE_URL" not in os.environ

    # Failure path as well: a raised Alembic error must not leave the
    # disposable URL installed.

    def failing_downgrade(cfg, revision):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")

    monkeypatch.setattr(command, "downgrade", failing_downgrade)
    with pytest.raises(RuntimeError, match="boom"):
        _run_alembic(
            "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent",
            "downgrade",
            "base",
        )
    assert "DATABASE_URL" not in os.environ
