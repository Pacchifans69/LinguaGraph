"""Token-occurrence lemma annotation HTTP endpoints (M4 / ADR-012).

Two endpoints only — there is deliberately no standalone lemma GET: the
document workspace snapshot remains the persisted read authority.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.lemma_annotation import (
    LemmaAnnotationPutRequest,
    TokenLemmaAnnotationResponse,
)
from app.services.lemma_annotation_service import (
    delete_token_lemma,
    put_token_lemma,
)

router = APIRouter(tags=["lemma-annotations"])


@router.put(
    "/token-segments/{token_segment_id}/lemma",
    response_model=TokenLemmaAnnotationResponse,
)
def put_token_lemma_annotation(
    token_segment_id: uuid.UUID,
    payload: LemmaAnnotationPutRequest,
    db: Session = Depends(get_db),
) -> TokenLemmaAnnotationResponse:
    """Create, update, or logically no-op one token occurrence's lemma."""

    snapshot = put_token_lemma(db, token_segment_id, lemma=payload.lemma)
    return TokenLemmaAnnotationResponse.model_validate(snapshot)


@router.delete(
    "/token-segments/{token_segment_id}/lemma",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_token_lemma_annotation(
    token_segment_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    """Explicitly delete only one token occurrence's lemma annotation."""

    delete_token_lemma(db, token_segment_id)
