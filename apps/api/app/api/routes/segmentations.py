"""Sentence-segmentation HTTP endpoints (M2 / ADR-010)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.segmentation import (
    SentenceSegmentationPutRequest,
    SentenceSegmentationResponse,
    TokenSegmentationPutRequest,
    TokenSegmentationResponse,
)
from app.services.segmentation_service import (
    SegmentRange,
    TokenSegmentRange,
    delete_token_segmentation,
    delete_sentence_segmentation,
    replace_sentence_segmentation,
    replace_token_segmentation,
)

router = APIRouter(tags=["segmentations"])


@router.put(
    "/text-versions/{text_version_id}/segmentations/sentence",
    response_model=SentenceSegmentationResponse,
)
def put_sentence_segmentation(
    text_version_id: uuid.UUID,
    payload: SentenceSegmentationPutRequest,
    db: Session = Depends(get_db),
) -> SentenceSegmentationResponse:
    """Atomically replace one authoritative sentence-segmentation layer."""

    snapshot = replace_sentence_segmentation(
        db,
        text_version_id,
        content_hash=payload.content_hash,
        requested_locale=payload.requested_locale,
        resolved_locale=payload.resolved_locale,
        origin=payload.origin,
        ranges=[
            SegmentRange(start=item.start, end=item.end)
            for item in payload.segments
        ],
    )
    return SentenceSegmentationResponse.model_validate(snapshot)


@router.delete(
    "/text-versions/{text_version_id}/segmentations/sentence",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_segmentation(
    text_version_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    """Explicitly delete the sentence layer without touching Alignment data."""

    delete_sentence_segmentation(db, text_version_id)


@router.put(
    "/text-versions/{text_version_id}/segmentations/token",
    response_model=TokenSegmentationResponse,
)
def put_token_segmentation(
    text_version_id: uuid.UUID,
    payload: TokenSegmentationPutRequest,
    db: Session = Depends(get_db),
) -> TokenSegmentationResponse:
    snapshot = replace_token_segmentation(
        db,
        text_version_id,
        content_hash=payload.content_hash,
        basis_sentence_layer_id=payload.basis_sentence_layer_id,
        requested_locale=payload.requested_locale,
        resolved_locale=payload.resolved_locale,
        origin=payload.origin,
        ranges=[
            TokenSegmentRange(
                start=item.start, end=item.end, is_word_like=item.is_word_like
            )
            for item in payload.segments
        ],
    )
    return TokenSegmentationResponse.model_validate(snapshot)


@router.delete(
    "/text-versions/{text_version_id}/segmentations/token",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_token_layer(
    text_version_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    delete_token_segmentation(db, text_version_id)
