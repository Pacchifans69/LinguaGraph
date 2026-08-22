"""Bounded PostgreSQL connection tests (HRA-F05 R2).

Mechanically covers the shared :func:`app.db.session.create_bounded_engine`
helper: every PostgreSQL connection path required by M0.7 verification
(disposable-DB lifecycle, Alembic online commands) and the application
engine receives a FINITE, reasonable psycopg connect timeout, so an
unreachable endpoint (e.g. Windows `localhost` resolving to ::1 first)
fails fast instead of hanging before the first integration test body.
"""

import pytest

from pathlib import Path

import app.db.session as db_session
from app.db.session import DB_CONNECT_TIMEOUT_SECONDS, create_bounded_engine


def _spy_create_engine(monkeypatch):
    """Replace sqlalchemy.create_engine with a spy capturing call kwargs."""
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(db_session, "create_engine", fake_create_engine)
    return captured


def test_connect_timeout_constant_is_finite_and_reasonable() -> None:
    # The timeout must be finite and reasonable: positive, and small enough
    # that an unreachable endpoint fails quickly during verification.
    assert DB_CONNECT_TIMEOUT_SECONDS > 0
    assert DB_CONNECT_TIMEOUT_SECONDS <= 30


def test_create_bounded_engine_adds_connect_timeout(monkeypatch) -> None:
    captured = _spy_create_engine(monkeypatch)
    engine = create_bounded_engine("postgresql+psycopg://u:p@127.0.0.1:5432/db")

    assert captured["url"] == "postgresql+psycopg://u:p@127.0.0.1:5432/db"
    assert captured["kwargs"]["connect_args"] == {
        "connect_timeout": DB_CONNECT_TIMEOUT_SECONDS
    }
    # The helper returns whatever create_engine returns (engine passthrough).
    assert engine is not None


def test_create_bounded_engine_preserves_caller_kwargs(monkeypatch) -> None:
    captured = _spy_create_engine(monkeypatch)
    create_bounded_engine(
        "postgresql+psycopg://u:p@127.0.0.1:5432/db",
        pool_pre_ping=True,
        isolation_level="AUTOCOMMIT",
    )
    assert captured["kwargs"]["pool_pre_ping"] is True
    assert captured["kwargs"]["isolation_level"] == "AUTOCOMMIT"
    assert captured["kwargs"]["connect_args"] == {
        "connect_timeout": DB_CONNECT_TIMEOUT_SECONDS
    }


def test_create_bounded_engine_merges_caller_connect_args(monkeypatch) -> None:
    # An explicit caller-provided connect_timeout wins (setdefault); other
    # caller connect args are preserved alongside the bounded default.
    captured = _spy_create_engine(monkeypatch)
    create_bounded_engine(
        "postgresql+psycopg://u:p@127.0.0.1:5432/db",
        connect_args={"connect_timeout": 9, "sslmode": "require"},
    )
    assert captured["kwargs"]["connect_args"] == {
        "connect_timeout": 9,
        "sslmode": "require",
    }


def test_application_engine_is_bounded(tmp_path) -> None:
    """Prove the module-level application engine is built via the bounded
    helper (smallest coherent design: one shared timeout for the app engine,
    the disposable lifecycle and Alembic online commands).

    Runs a fresh interpreter in which ``sqlalchemy.create_engine`` is
    replaced by a spy BEFORE ``app.db.session`` is imported, then reloads
    the module and asserts the engine construction carries the bounded
    connect timeout. No database is needed; the subprocess keeps this test
    isolated from the already-imported module instance.
    """
    import subprocess
    import sys

    api_root = str(Path(__file__).resolve().parents[3])
    probe = tmp_path / "probe_engine.py"
    probe.write_text(
        "import sys\n"
        f"sys.path.insert(0, {api_root!r})\n"
        "import sqlalchemy\n"
        "real_create_engine = sqlalchemy.create_engine\n"
        "captured = {}\n"
        "def fake_create_engine(url, **kwargs):\n"
        "    captured['url'] = url\n"
        "    captured['kwargs'] = kwargs\n"
        "    # Delegate to the real implementation so module-level engine\n"
        "    # setup (e.g. event listeners) works normally; no connection is\n"
        "    # established at import time.\n"
        "    return real_create_engine(url, **kwargs)\n"
        "sqlalchemy.create_engine = fake_create_engine\n"
        "import app.db.session as session_module\n"
        "import importlib\n"
        "importlib.reload(session_module)\n"
        "print(captured['kwargs']['connect_args'])\n",
        encoding="utf-8",
    )
    result = subprocess.run(
        [sys.executable, str(probe)],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    lines = result.stdout.strip().splitlines()
    assert lines[0] == "{'connect_timeout': %d}" % DB_CONNECT_TIMEOUT_SECONDS
