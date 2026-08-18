"""SQLAlchemy declarative base shared by all ORM models (M0.2+)."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Single declarative base for the LinguaGraph domain models."""
