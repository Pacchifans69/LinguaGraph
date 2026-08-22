"""Settings/configuration tests.

Default-value tests are isolated from the developer's real environment:
they clear the relevant environment variables and disable dotenv loading so
they verify the built-in defaults, not a local configuration. Separate tests
cover environment-variable and dotenv loading behavior.
"""

import os
from pathlib import Path

import pytest

from app.core.config import Settings

# Environment variables that map to Settings fields.
_SETTINGS_ENV_VARS = (
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "CORS_ORIGINS",
    "MAX_TEXT_VERSION_CODEPOINTS",
    "MAX_REQUEST_BODY_BYTES",
    "LOG_LEVEL",
)

# Repository-provided deterministic local PostgreSQL endpoint (HRA-F05 R1):
# explicit IPv4 loopback — on Windows, `localhost` may resolve to ::1 first,
# where no PostgreSQL listens, stalling connection establishment.
_IPV4_LOOPBACK_DEFAULT = "postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph"

# apps/api/.env.example (repo-provided defaults for the local Docker Compose
# PostgreSQL 18 service).
_API_ENV_EXAMPLE = Path(__file__).resolve().parents[3] / ".env.example"

# apps/api/alembic.ini (Alembic configuration — must stay ASCII-only, see
# test_alembic_ini_is_ascii_portable).
_API_ALEMBIC_INI = Path(__file__).resolve().parents[3] / "alembic.ini"


def isolated_settings(monkeypatch, **overrides) -> Settings:
    """Build Settings free of developer env vars and any .env file."""
    for var in _SETTINGS_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    return Settings(_env_file=None, **overrides)


# --- built-in defaults (isolated from developer configuration) ---


def test_default_database_url_targets_postgresql(monkeypatch) -> None:
    # The accepted baseline is PostgreSQL; the default URL must never be SQLite.
    settings = isolated_settings(monkeypatch)
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_default_database_url_uses_deterministic_ipv4_loopback(monkeypatch) -> None:
    # HRA-F05 (R1): the built-in local PostgreSQL default must use the
    # explicit IPv4 loopback 127.0.0.1 — `localhost` is address-family
    # ambiguous on Windows (resolves to ::1 first, where no PostgreSQL
    # listens) and stalls connection establishment.
    settings = isolated_settings(monkeypatch)
    assert settings.database_url == _IPV4_LOOPBACK_DEFAULT


def test_env_example_uses_deterministic_ipv4_endpoint() -> None:
    # HRA-F05 (R1): the repository-provided .env.example must point both the
    # development and the disposable-test-server endpoints at the explicit
    # IPv4 loopback, matching the built-in default.
    example = _API_ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "DATABASE_URL=postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph" in example
    assert "TEST_DATABASE_URL=postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph_test" in example
    # The frontend/CORS origin stays on localhost:5173 — HRA-F05 concerns
    # the PostgreSQL endpoint only.
    assert "CORS_ORIGINS=http://localhost:5173" in example


def test_custom_database_url_hosts_are_preserved_verbatim(monkeypatch) -> None:
    # HRA-F05 (R4): arbitrary caller-provided PostgreSQL hostnames/remote
    # endpoints are NEVER rewritten to 127.0.0.1 — the fix changes only the
    # built-in default.
    custom_db = "postgresql+psycopg://user:pass@db.internal.example.com:5433/warehouse"
    custom_test = "postgresql+psycopg://user:pass@pg-prod.example.com:5432/sandbox"
    monkeypatch.setenv("DATABASE_URL", custom_db)
    monkeypatch.setenv("TEST_DATABASE_URL", custom_test)
    settings = Settings(_env_file=None)
    assert settings.database_url == custom_db
    assert settings.test_database_url == custom_test
    assert settings.integration_server_url == custom_test


def test_cors_origins_parsed_from_comma_separated_value(monkeypatch) -> None:
    settings = isolated_settings(
        monkeypatch, cors_origins="http://localhost:5173, http://localhost:4173"
    )
    assert settings.cors_origin_list == ["http://localhost:5173", "http://localhost:4173"]


def test_cors_origins_defaults_to_vite_dev_server(monkeypatch) -> None:
    settings = isolated_settings(monkeypatch)
    assert settings.cors_origin_list == ["http://localhost:5173"]


def test_text_size_limits_defaults(monkeypatch) -> None:
    settings = isolated_settings(monkeypatch)
    assert settings.max_text_version_codepoints == 1_000_000
    assert settings.max_request_body_bytes == 4_000_000


# --- loading behavior (explicit, deterministic) ---


def test_environment_variable_overrides_default(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@db:5432/custom")
    settings = Settings(_env_file=None)
    assert settings.database_url == "postgresql+psycopg://user:pass@db:5432/custom"


def test_dotenv_file_is_loaded(tmp_path, monkeypatch) -> None:
    # Mirrors the documented clean-checkout flow: `cp .env.example .env`
    # followed by discovery of TEST_DATABASE_URL from that file.
    #
    # M0.7 correction (objectively defective historical test): the test
    # previously ran with the ambient environment untouched, but
    # pydantic-settings precedence is env-var-over-dotenv, so an ambient
    # TEST_DATABASE_URL (legitimately exported by CI and scripts/verify.ps1)
    # made the assertion impossible. The test now isolates the settings
    # environment (same as the default-value tests) so it verifies exactly
    # the dotenv-loading behavior under every outer environment.
    for var in _SETTINGS_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TEST_DATABASE_URL=postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph_test\n",
        encoding="utf-8",
    )
    settings = Settings(_env_file=str(env_file))
    assert (
        settings.test_database_url
        == "postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph_test"
    )


def test_integration_server_url_prefers_test_database_url(monkeypatch) -> None:
    settings = isolated_settings(
        monkeypatch,
        database_url="postgresql+psycopg://u:p@localhost:5432/linguagraph",
        test_database_url="postgresql+psycopg://u:p@localhost:5432/linguagraph_test",
    )
    assert settings.integration_server_url.endswith("/linguagraph_test")


def test_integration_server_url_falls_back_to_database_url(monkeypatch) -> None:
    settings = isolated_settings(
        monkeypatch,
        database_url="postgresql+psycopg://u:p@localhost:5432/linguagraph",
        test_database_url=None,
    )
    assert settings.integration_server_url.endswith("/linguagraph")


def test_alembic_ini_is_ascii_portable() -> None:
    # HRA-F05-A02: Alembic's ConfigParser reads INI files using the platform
    # locale encoding. On the supported Windows runtime the locale is
    # cp936/GBK, so ANY non-ASCII byte in apps/api/alembic.ini (e.g. UTF-8
    # em-dash punctuation) raises UnicodeDecodeError before migrations can
    # run. The repository INI must therefore remain ASCII-only — this test
    # fails on any byte that would need non-ASCII decoding.
    raw = _API_ALEMBIC_INI.read_bytes()
    try:
        raw.decode("ascii")
    except UnicodeDecodeError as exc:
        pytest.fail(
            "apps/api/alembic.ini must be ASCII-only: Alembic's ConfigParser "
            f"decodes INI files with the platform locale on Windows. {exc}"
        )
