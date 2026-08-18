"""SQLAlchemy declarative base shared by all ORM models (M0.2+)."""

from datetime import datetime, timezone

from sqlalchemy.orm import DeclarativeBase


def utcnow() -> datetime:
    """Application timestamp policy: timezone-aware UTC.

    All ``created_at``/``updated_at`` columns are populated from this
    function; PostgreSQL stores them as ``timestamptz``.
    """
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Single declarative base for the LinguaGraph domain models."""
