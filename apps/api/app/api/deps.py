"""FastAPI dependencies."""

from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Request-scoped SQLAlchemy session; always closed after the response.

    Services receive the session and own their transaction boundaries; routes
    never commit directly.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
