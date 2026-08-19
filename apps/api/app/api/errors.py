"""Domain error contract (see M0_PREIMPLEMENTATION_REPORT.md, section 9).

Every expected domain failure is raised as :class:`DomainError` and serialized
to the standard envelope ``{"code", "message", "details"}``. Database
exceptions are never leaked to clients. HTTP/Pydantic validation failures are
converted to the same envelope (``VALIDATION_ERROR``) so the frontend consumes
one stable contract (spec section 33).
"""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

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

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """HTTP/Pydantic validation failures use the same envelope as domain
        errors (``VALIDATION_ERROR``, HTTP 422). Only field locations/types
        are forwarded — never raw exception text or database internals.
        """
        details = {
            "errors": [
                {
                    "location": [str(part) for part in error.get("loc", [])],
                    "type": error.get("type", "value_error"),
                    "message": str(error.get("msg", "invalid value")),
                    "input_type": type(error.get("input", "")).__name__,
                }
                for error in exc.errors()
            ]
        }
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION_ERROR",
                "message": "request validation failed",
                "details": details,
            },
        )

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(
        _request: Request, exc: HTTPException
    ) -> JSONResponse:
        """Starlette-level HTTP exceptions (e.g. unmatched routes / methods)
        are normalized to the same envelope with a stable code.
        """
        code = {
            400: "VALIDATION_ERROR",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT",
        }.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": code,
                "message": str(exc.detail),
                "details": {"status_code": exc.status_code},
            },
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def _unexpected_error_handler(
        _request: Request, exc: Exception
    ) -> JSONResponse:
        """Unexpected failures return the envelope with a generic message.

        The internal error is logged (server-side visibility) but never
        echoed to the client, so no SQLAlchemy/PostgreSQL exception strings
        leak through the HTTP boundary.
        """
        logger.exception(
            "unhandled error while processing request: %s", exc
        )
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL_ERROR",
                "message": "an unexpected internal error occurred",
                "details": {},
            },
        )
