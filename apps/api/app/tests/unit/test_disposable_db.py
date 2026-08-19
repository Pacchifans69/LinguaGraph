"""Disposable-database guard unit tests (M0.3 human review finding A).

``assert_disposable_db_url`` is the fail-closed mechanism proving that the
disposable flows (pytest integration fixtures and the Playwright E2E
backend) can never target the normal development database.
"""

from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url

from app.db.disposable import (
    DISPOSABLE_DB_PREFIX,
    E2E_DB_PREFIX,
    assert_disposable_db_url,
)


def test_dev_database_name_is_refused() -> None:
    # The default development database (see app/core/config.py) must never
    # be accepted by a disposable flow.
    url = make_url(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph"
    )
    with pytest.raises(RuntimeError, match="refusing disposable-database"):
        assert_disposable_db_url(url)


def test_arbitrary_database_name_is_refused() -> None:
    url = make_url("postgresql://user:pass@localhost:5432/customers")
    with pytest.raises(RuntimeError, match="refusing disposable-database"):
        assert_disposable_db_url(url)


def test_reserved_prefix_is_accepted_for_integration_tests() -> None:
    url = make_url("postgresql://user:pass@localhost:5432/linguagraph_m02_abc")
    assert_disposable_db_url(url, required_prefix=DISPOSABLE_DB_PREFIX)


def test_e2e_prefix_requires_the_strict_namespace() -> None:
    # Integration-test names (linguagraph_m02_*) must NOT pass the stricter
    # E2E check.
    url = make_url("postgresql://user:pass@localhost:5432/linguagraph_m02_abc")
    with pytest.raises(RuntimeError, match="refusing disposable-database"):
        assert_disposable_db_url(url, required_prefix=E2E_DB_PREFIX)

    e2e_url = make_url(
        "postgresql://user:pass@localhost:5432/linguagraph_e2e_abcdef123456"
    )
    assert_disposable_db_url(e2e_url, required_prefix=E2E_DB_PREFIX)


def test_e2e_namespace_must_match_exactly_not_merely_begin_with_it() -> None:
    # A name beginning merely with "linguagraph_e2e" (without the exact
    # `linguagraph_e2e_<12 lowercase hex>` shape) is REFUSED.
    for bad_name in (
        "linguagraph_e2eevil_abcdef123456",  # no underscore namespace boundary
        "linguagraph_e2e_abcdef12345",  # 11 hex chars
        "linguagraph_e2e_abcdef1234567",  # 13 hex chars
        "linguagraph_e2e_ABCDEF123456",  # uppercase hex
        "linguagraph_e2e_abcdef12345g",  # non-hex char
        "linguagraph_e2e_",  # empty suffix
    ):
        url = make_url(f"postgresql://user:pass@localhost:5432/{bad_name}")
        with pytest.raises(RuntimeError, match="refusing disposable-database"):
            assert_disposable_db_url(url, required_prefix=E2E_DB_PREFIX)


def test_url_string_input_is_accepted() -> None:
    assert_disposable_db_url(
        "postgresql://user:pass@localhost:5432/linguagraph_e2e_deadbeef1234",
        required_prefix=E2E_DB_PREFIX,
    )
