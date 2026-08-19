"""Database package: engine, session factory, declarative base, ORM models."""

# Importing the models registers all tables on Base.metadata (Alembic and
# tests rely on this). Importing app.db anywhere therefore sees every model.
from app.db import models  # noqa: F401
