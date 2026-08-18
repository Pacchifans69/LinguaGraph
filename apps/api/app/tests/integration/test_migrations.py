"""Migration-from-zero proof against a disposable PostgreSQL database.

The test derives the server location from ``TEST_DATABASE_URL`` (falling back
to ``DATABASE_URL``), creates a uniquely named disposable database, runs
``alembic upgrade head`` against it, verifies the resulting schema, and drops
the database afterwards.

It NEVER touches the normal development database. If no server is configured,
the test is skipped with an explicit reason (this is a reported environment
limitation, not a silent pass).
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

pytestmark = pytest.mark.integration


def test_migrate_from_zero_to_head(monkeypatch: pytest.MonkeyPatch) -> None:
    server_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if server_url is None:
        pytest.skip(
            "TEST_DATABASE_URL/DATABASE_URL not set — cannot run PostgreSQL integration tests"
        )

    url = make_url(server_url)
    admin_url = url.set(database="postgres")
    db_name = f"linguagraph_migration_{uuid.uuid4().hex[:12]}"
    target_url = url.set(database=db_name)

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))

    try:
        # Alembic's env.py reads DATABASE_URL: point it at the disposable DB.
        monkeypatch.setenv("DATABASE_URL", target_url.render_as_string(hide_password=False))

        cfg = Config(str(ALEMBIC_INI))
        command.upgrade(cfg, "head")

        script = ScriptDirectory.from_config(cfg)
        head_revision = script.get_current_head()
        assert head_revision is not None, "expected at least one migration revision"

        check_engine = create_engine(target_url)
        try:
            with check_engine.connect() as conn:
                version_num = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
                assert version_num == head_revision

                table_names = (
                    conn.execute(
                        text(
                            "SELECT tablename FROM pg_tables"
                            " WHERE schemaname = 'public' ORDER BY tablename"
                        )
                    )
                    .scalars()
                    .all()
                )
                # M0.1 foundation chain: only the Alembic version table exists
                # (domain tables arrive in M0.2).
                assert table_names == ["alembic_version"]
        finally:
            check_engine.dispose()
    finally:
        with admin_engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
        admin_engine.dispose()
