"""Application configuration via pydantic-settings (environment-driven)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings.

    Every field can be overridden by an environment variable of the same name
    (case-insensitive), e.g. ``DATABASE_URL``, ``CORS_ORIGINS``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        # HRA-F05 (R1): the repository-provided local PostgreSQL default uses
        # the explicit IPv4 loopback. On Windows, `localhost` may resolve to
        # ::1 FIRST, where no PostgreSQL listens, which can stall connection
        # establishment until the address-family fallback (or a connect
        # timeout). 127.0.0.1 is deterministic for the local Docker Compose
        # PostgreSQL 18 service. Caller-provided DATABASE_URL values are
        # never rewritten — this is only the built-in default.
        "postgresql+psycopg://linguagraph:linguagraph@127.0.0.1:5432/linguagraph"
    )
    test_database_url: str | None = None
    cors_origins: str = "http://localhost:5173"
    max_text_version_codepoints: int = 1_000_000
    max_request_body_bytes: int = 4_000_000
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parsed CORS origins (comma-separated in the env var)."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def integration_server_url(self) -> str | None:
        """Server used by integration/migration tests to create disposable databases.

        ``TEST_DATABASE_URL`` wins when set; otherwise falls back to
        ``DATABASE_URL``. The server is only ever used to create uniquely
        named disposable databases — never the normal development database.
        """
        return self.test_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance; reset the cache in tests via ``get_settings.cache_clear``."""
    return Settings()
