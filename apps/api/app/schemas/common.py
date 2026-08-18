"""Shared API schemas."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body of ``GET /api/v1/health``."""

    status: str
