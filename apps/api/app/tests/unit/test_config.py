"""Settings/configuration tests."""

from app.core.config import Settings


def test_default_database_url_targets_postgresql() -> None:
    # The accepted baseline is PostgreSQL; the default URL must never be SQLite.
    settings = Settings()
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_cors_origins_parsed_from_comma_separated_value() -> None:
    settings = Settings(cors_origins="http://localhost:5173, http://localhost:4173")
    assert settings.cors_origin_list == ["http://localhost:5173", "http://localhost:4173"]


def test_cors_origins_defaults_to_vite_dev_server() -> None:
    settings = Settings()
    assert settings.cors_origin_list == ["http://localhost:5173"]


def test_text_size_limits_defaults() -> None:
    settings = Settings()
    assert settings.max_text_version_codepoints == 1_000_000
    assert settings.max_request_body_bytes == 4_000_000
