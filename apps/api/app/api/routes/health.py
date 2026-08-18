"""Infrastructure endpoints."""

from fastapi import APIRouter

from app.schemas.common import HealthResponse

router = APIRouter(tags=["infrastructure"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness probe.

    Returns HTTP 200 with ``{"status": "ok"}`` (see API contract, section 9).
    """
    return HealthResponse(status="ok")
