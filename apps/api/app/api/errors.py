"""Domain error contract (see M0_PREIMPLEMENTATION_REPORT.md, section 9).

Every expected domain failure is raised as :class:`DomainError` and serialized
to the standard envelope ``{"code", "message", "details"}``. Database
exceptions are never leaked to clients.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

HTTP_STATUS_BY_CODE: dict[str, int] = {
    "VALIDATION_ERROR": 422,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
    "SPAN_OUT_OF_RANGE": 422,
    "CROSS_DOCUMENT_ALIGNMENT": 422,
    "INSUFFICIENT_ALIGNMENT_MEMBERS": 422,
    "TEXT_HAS_ANNOTATIONS": 409,
    "DUPLICATE_ALIGNMENT_MEMBER": 409,
    "INVALID_UTF8": 422,
    "INVALID_NULL_CHARACTER": 422,
    "INVALID_SURROGATE": 422,
    "INVALID_SELECTION_BOUNDARY": 422,
    "TEXT_TOO_LARGE": 413,
}


class DomainError(Exception):
    """An expected domain-level failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


def register_exception_handlers(app: FastAPI) -> None:
    """Register the standard error-envelope handler on the application."""

    @app.exception_handler(DomainError)
    async def _domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=HTTP_STATUS_BY_CODE.get(exc.code, 500),
            content={"code": exc.code, "message": exc.message, "details": exc.details},
        )
