"""TextVersion HTTP endpoints (M0.3).

Creation supports both ingestion paths of the accepted contract (spec
section 42 / report section 9):

- ``application/json`` paste of plain text (``content``);
- ``multipart/form-data`` UTF-8 ``.txt`` upload with ``file``,
  ``language_tag`` and ``label`` form fields.

The backend remains the canonicalization authority: byte uploads are decoded
with strict UTF-8 and canonicalized (``canonicalize_utf8``: reject malformed
UTF-8, strip one leading BOM, CRLF/CR -> LF, reject NUL/surrogates, NFC,
enforce the configured size, hash canonical content) before the service
persists. Both paths return the canonical server content; the frontend
displays/refetches that rather than assuming its input was canonical.

``PATCH`` is metadata-only (``label``, ``sort_order``); ``content`` is never
accepted here (ADR-005). ``DELETE`` follows the accepted deletion semantics;
``?force=true`` is the explicit destructive reset for annotated versions.

All routes keep HTTP parsing/serialization here and delegate business and
transaction behavior to the TextVersion service.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Request, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.errors import DomainError
from app.core.config import get_settings
from app.schemas.text_version import (
    TextVersionCreateRequest,
    TextVersionResponse,
    TextVersionUpdateRequest,
)
from app.services import text_version_service
from app.text.canonical import canonicalize_utf8

router = APIRouter(tags=["text-versions"])


def _label_conflict(document_id: uuid.UUID) -> DomainError:
    """Stable CONFLICT error for the ``UNIQUE(document_id, label)`` invariant.

    The service exposes the DB unique violation by design (the persistence
    layer stays the enforcement point); this route maps it to the standard
    envelope with a clean message — no SQLAlchemy/PostgreSQL exception string
    ever reaches the client.
    """
    return DomainError(
        "CONFLICT",
        "a text version with this label already exists in this document",
        {"document_id": str(document_id)},
    )


def _patch_label_conflict(text_version_id: uuid.UUID) -> DomainError:
    """CONFLICT envelope for a metadata PATCH that collides with an existing
    label (the target version's document is not re-read after the service
    rolls back, so only the version id is reported)."""
    return DomainError(
        "CONFLICT",
        "a text version with this label already exists in this document",
        {"text_version_id": str(text_version_id)},
    )


def _create_version(
    db: Session, document_id: uuid.UUID, payload: TextVersionCreateRequest
):
    try:
        return text_version_service.create_text_version(
            db,
            document_id=document_id,
            language_tag=payload.language_tag,
            label=payload.label,
            content=payload.content,
            sort_order=payload.sort_order,
        )
    except IntegrityError:
        raise _label_conflict(document_id) from None


def _payload_validation_error(exc: ValidationError) -> DomainError:
    """Convert a Pydantic body-validation failure into the standard envelope.

    Only field locations/types/inferred messages are forwarded — never raw
    exception text or database internals.
    """
    return DomainError(
        "VALIDATION_ERROR",
        "request body is invalid",
        {
            "errors": [
                {
                    "location": [str(part) for part in err.get("loc", [])],
                    "type": err.get("type", "value_error"),
                    "message": str(err.get("msg", "invalid value")),
                }
                for err in exc.errors()
            ]
        },
    )


@router.post(
    "/documents/{document_id}/text-versions",
    response_model=TextVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_text_version(
    document_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
) -> TextVersionResponse:
    """Create/import a TextVersion via JSON paste or UTF-8 ``.txt`` upload.

    Content-Type ``multipart/form-data`` selects the file-import path; any
    other content type is treated as the JSON paste path. The endpoint is
    async only so the multipart body can be awaited; the (local, single-user
    workbench) service call runs synchronously on the request thread.
    """
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        file = form.get("file")
        if file is None:
            raise DomainError(
                "VALIDATION_ERROR",
                "a .txt file field named 'file' is required for upload",
                {"field": "file"},
            )
        data = await file.read()
        # Strict UTF-8 canonicalization is the ingestion authority: malformed
        # UTF-8 raises INVALID_UTF8 (DomainError, never a DB exception).
        canonical = canonicalize_utf8(
            data, max_codepoints=get_settings().max_text_version_codepoints
        )
        try:
            payload = TextVersionCreateRequest.model_validate(
                {
                    "language_tag": form.get("language_tag"),
                    "label": form.get("label"),
                    "content": canonical.content,
                    "sort_order": 0,
                }
            )
        except ValidationError as exc:
            raise _payload_validation_error(exc) from exc
        version = _create_version(db, document_id, payload)
        return TextVersionResponse.model_validate(version)

    # JSON paste path.
    try:
        body = await request.json()
    except json.JSONDecodeError as exc:
        raise DomainError(
            "VALIDATION_ERROR",
            "request body must be valid JSON",
            {"field": "body"},
        ) from exc
    try:
        payload = TextVersionCreateRequest.model_validate(body)
    except ValidationError as exc:
        raise _payload_validation_error(exc) from exc
    version = _create_version(db, document_id, payload)
    return TextVersionResponse.model_validate(version)


@router.get("/text-versions/{text_version_id}", response_model=TextVersionResponse)
def get_text_version(
    text_version_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> TextVersionResponse:
    version = text_version_service.get_text_version(db, text_version_id)
    return TextVersionResponse.model_validate(version)


@router.patch("/text-versions/{text_version_id}", response_model=TextVersionResponse)
def update_text_version(
    text_version_id: uuid.UUID,
    payload: TextVersionUpdateRequest,
    db: Session = Depends(get_db),
) -> TextVersionResponse:
    """Metadata-only update (``label``, ``sort_order``); never content."""
    fields = payload.model_dump(exclude_unset=True)
    try:
        version = text_version_service.update_text_version_metadata(
            db, text_version_id, **fields
        )
    except IntegrityError:
        raise _patch_label_conflict(text_version_id) from None
    return TextVersionResponse.model_validate(version)


@router.delete(
    "/text-versions/{text_version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_text_version(
    text_version_id: uuid.UUID,
    force: bool = False,
    db: Session = Depends(get_db),
) -> None:
    """Delete a TextVersion; ``force=true`` is the explicit destructive reset
    (ADR-005) for versions that participate in alignments.
    """
    text_version_service.delete_text_version(db, text_version_id, force=force)