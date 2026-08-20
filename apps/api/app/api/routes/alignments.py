"""Alignment mutation HTTP endpoints (M0.5).

Implements exactly the frozen M0.5 dedicated alignment mutation surface:

- ``POST /api/v1/documents/{document_id}/alignments`` — atomic create;
- ``PATCH /api/v1/alignments/{alignment_id}`` — note update and/or full
  member replacement;
- ``DELETE /api/v1/alignments/{alignment_id}`` — delete + orphan cleanup.

M0.5 persisted reads use the existing document workspace snapshot
(``GET /api/v1/documents/{document_id}/workspace``); the dedicated
alignment GET endpoints are outside this checkpoint's acceptance surface.

Routes only parse requests and map responses (ADR-008): all business rules
and transaction behavior live in ``app.services.alignment_service``.
Serialization consumes the service's materialized ``AlignmentView`` (scalar
columns only) — no ORM relationship traversal and no lazy loading after the
service transaction has closed.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.alignment import (
    AlignmentCreateRequest,
    AlignmentMemberResponse,
    AlignmentResponse,
    AlignmentUpdateRequest,
)
from app.services import alignment_service
from app.services.alignment_service import AlignmentView, MemberInput

router = APIRouter(tags=["alignments"])


def _to_member_inputs(members) -> list[MemberInput]:
    """Map the Pydantic member boundary (``text_version_id``/``start``/``end``)
    to the service input dataclass — coordinates only (frozen contract
    section 6/7: quote, direction, contentHash are never accepted)."""
    return [
        MemberInput(
            text_version_id=member.text_version_id,
            start_offset=member.start,
            end_offset=member.end,
        )
        for member in members
    ]


def _to_response(view: AlignmentView) -> AlignmentResponse:
    """Serialize the materialized service view (no ORM access here)."""
    return AlignmentResponse(
        id=view.id,
        document_id=view.document_id,
        note=view.note,
        created_at=view.created_at,
        updated_at=view.updated_at,
        members=[
            AlignmentMemberResponse(
                id=member.id,
                span_id=member.span_id,
                text_version_id=member.text_version_id,
                start=member.start_offset,
                end=member.end_offset,
                exact_text=member.exact_text,
            )
            for member in view.members
        ],
    )


@router.post(
    "/documents/{document_id}/alignments",
    response_model=AlignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_alignment(
    document_id: uuid.UUID,
    body: AlignmentCreateRequest,
    db: Session = Depends(get_db),
) -> AlignmentResponse:
    """Create one AlignmentGroup atomically (frozen contract section 9)."""
    view = alignment_service.create_alignment(
        db,
        document_id=document_id,
        members=_to_member_inputs(body.members),
        note=body.note,
    )
    return _to_response(view)


@router.patch(
    "/alignments/{alignment_id}",
    response_model=AlignmentResponse,
    status_code=status.HTTP_200_OK,
)
def update_alignment(
    alignment_id: uuid.UUID,
    body: AlignmentUpdateRequest,
    db: Session = Depends(get_db),
) -> AlignmentResponse:
    """Update the note and/or replace the full member set (frozen contract
    sections 13-17). Field omission means "leave unchanged"; ``note: null``
    clears the note. Only present fields are forwarded to the service — its
    ``_UNSET`` default then means "leave unchanged"."""
    service_kwargs: dict = {}
    if "note" in body.model_fields_set:
        service_kwargs["note"] = body.note
    if "members" in body.model_fields_set and body.members is not None:
        service_kwargs["members"] = _to_member_inputs(body.members)
    view = alignment_service.update_alignment(
        db, alignment_id=alignment_id, **service_kwargs
    )
    return _to_response(view)


@router.delete(
    "/alignments/{alignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_alignment(
    alignment_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    """Delete one AlignmentGroup + orphan cleanup (frozen contract
    section 18). Returns 204 No Content."""
    alignment_service.delete_alignment(db, alignment_id)
