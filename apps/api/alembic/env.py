"""Alembic migration environment.

Runs migrations against the configured database. The ``DATABASE_URL``
environment variable overrides ``alembic.ini`` when set, keeping the app
settings (``app.core.config.Settings``) and migrations in agreement.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool

# Make `app` importable when running from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Environment override (single source of truth with the application).
if os.environ.get("DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with a live connection."""
    # HRA-F05 (R2): the online engine goes through the shared bounded-connect
    # helper (same finite psycopg connect timeout as the application engine
    # and the disposable-DB lifecycle), so `alembic upgrade/current/check`
    # can never wait indefinitely on an unreachable PostgreSQL endpoint.
    # The URL source is unchanged: alembic.ini's `sqlalchemy.url`, overridden
    # by the DATABASE_URL environment variable in env.py above.
    from app.db.session import create_bounded_engine

    connectable = create_bounded_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
