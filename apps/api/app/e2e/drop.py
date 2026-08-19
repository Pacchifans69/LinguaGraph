"""Drop a Playwright E2E disposable database (CLI).

Used by the Playwright ``globalTeardown`` (``apps/web/e2e/global-teardown.ts``):
Playwright kills webServer processes with SIGKILL, so the E2E backend
process cannot guarantee its own cleanup; the Node teardown — which always
runs — shells back into Python to drop the database recorded by
``app.e2e.server``.

Safety: the database name must carry the reserved ``linguagraph_e2e_``
prefix or the drop is REFUSED (fail-closed guard, same shared lifecycle in
``app.db.disposable``). The development database can never match.
"""

from __future__ import annotations

import argparse

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.db.disposable import (
    E2E_DB_PREFIX,
    assert_disposable_db_url,
    drop_disposable_database,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="SQLAlchemy URL of the E2E disposable database")
    args = parser.parse_args()

    target_url = make_url(args.url)
    # Fail closed: refuse anything outside the E2E disposable namespace.
    assert_disposable_db_url(target_url, required_prefix=E2E_DB_PREFIX)

    admin_engine = create_engine(
        target_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    drop_disposable_database(admin_engine, target_url)
    print(f"[e2e-drop] dropped disposable database {target_url.database}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
