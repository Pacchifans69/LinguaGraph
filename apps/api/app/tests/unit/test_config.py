"""Settings/configuration tests.

Default-value tests are isolated from the developer's real environment:
they clear the relevant environment variables and disable dotenv loading so
they verify the built-in defaults, not a local configuration. Separate tests
cover environment-variable and dotenv loading behavior.
"""

import os

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
        "TEST_DATABASE_URL=postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_test\n",
        encoding="utf-8",
    )
    settings = Settings(_env_file=str(env_file))
    assert (
        settings.test_database_url
        == "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_test"
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
