"""Playwright E2E backend: uvicorn on an isolated disposable PostgreSQL DB.

This is the ONLY backend the Playwright golden path may talk to. It:

1. creates a uniquely-named disposable PostgreSQL database
   (``linguagraph_e2e_<uuid>``) through the shared lifecycle in
   ``app.db.disposable`` — the SAME implementation the pytest integration
   fixtures use (no duplicated unsafe DB logic);
2. fails closed with :func:`app.db.disposable.assert_disposable_db_url`
   (``linguagraph_e2e`` prefix) before any SQL runs — the E2E configuration
   cannot target the normal development database;
3. migrates the disposable database to Alembic HEAD;
4. starts uvicorn with ``DATABASE_URL`` pointing ONLY at that disposable
   database;
5. on termination, stops uvicorn and DROPS the disposable database.

Run via ``uv run python -m app.e2e.server --host 127.0.0.1 --port 8000``
(configured in ``apps/web/playwright.config.ts`` with
``reuseExistingServer: false`` so an already-running backend whose
``DATABASE_URL`` cannot be proven to be the E2E database is never reused).
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from app.db.disposable import (
    E2E_DB_PREFIX,
    assert_disposable_db_url,
    create_disposable_database,
    drop_disposable_database,
    migrate_to_head,
)

API_ROOT = Path(__file__).resolve().parents[2]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    admin_engine, target_url = create_disposable_database(E2E_DB_PREFIX)
    # Mechanically meaningful guard: refuse to run against anything that is
    # not a uniquely-named E2E disposable database.
    assert_disposable_db_url(target_url, required_prefix=E2E_DB_PREFIX)

    url = target_url.render_as_string(hide_password=False)
    db_name = target_url.database
    print(
        f"[e2e-api] isolated disposable database: {db_name} "
        "(never the development database)",
        flush=True,
    )

    stopped = False

    def _handle_stop(_signum, _frame) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)

    # Record the disposable database URL for the Playwright globalTeardown.
    # Playwright kills webServer processes with SIGKILL (no Python cleanup
    # can run), so the surviving Node teardown drops the database via
    # `app.e2e.drop`. The file is removed after a successful in-process
    # drop, making the teardown a no-op.
    state_file = API_ROOT / ".e2e-db-url"
    state_file.write_text(url, encoding="utf-8")

    try:
        migrate_to_head(url)
        os.environ["DATABASE_URL"] = url
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                args.host,
                "--port",
                str(args.port),
            ]
        )
        print(
            f"[e2e-api] uvicorn {args.host}:{args.port} -> disposable DB "
            f"{db_name} (pid {process.pid})",
            flush=True,
        )
        while process.poll() is None:
            if stopped:
                break
            time.sleep(0.2)
    finally:
        if "process" in locals() and process.poll() is None:  # type: ignore[possibly-undefined]
            process.terminate()  # type: ignore[possibly-undefined]
            try:
                process.wait(timeout=10)  # type: ignore[possibly-undefined]
            except subprocess.TimeoutExpired:
                process.kill()  # type: ignore[possibly-undefined]
        drop_disposable_database(admin_engine, target_url)
        print(f"[e2e-api] dropped disposable database {db_name}", flush=True)
        state_file.unlink(missing_ok=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
