"""Token-occurrence coarse POS annotation HTTP endpoints (M5 / ADR-013).

Two endpoints only — there is deliberately no standalone POS GET: the
document workspace snapshot remains the persisted read authority.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.pos_annotation import (
    PosAnnotationPutRequest,
    TokenPosAnnotationResponse,
)
from app.services.pos_annotation_service import (
    delete_token_pos,
    put_token_pos,
)

router = APIRouter(tags=["pos-annotations"])


@router.put(
    "/token-segments/{token_segment_id}/pos",
    response_model=TokenPosAnnotationResponse,
)
def put_token_pos_annotation(
    token_segment_id: uuid.UUID,
    payload: PosAnnotationPutRequest,
    db: Session = Depends(get_db),
) -> TokenPosAnnotationResponse:
    """Create, update, or logically no-op one token occurrence's coarse POS."""

    snapshot = put_token_pos(db, token_segment_id, pos_tag=payload.pos_tag)
    return TokenPosAnnotationResponse.model_validate(snapshot)


@router.delete(
    "/token-segments/{token_segment_id}/pos",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_token_pos_annotation(
    token_segment_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    """Explicitly delete only one token occurrence's coarse POS annotation."""

    delete_token_pos(db, token_segment_id)
