"""ParallelDocument HTTP endpoints (M0.3).

Routes only parse/serialize HTTP and delegate business/transaction behavior to
the Document service (ADR-008). ``GET /documents/{document_id}/workspace``
lives in :mod:`app.api.routes.workspace`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.document import (
    DocumentCreateRequest,
    DocumentResponse,
    DocumentUpdateRequest,
)
from app.services import document_service

router = APIRouter(tags=["documents"])


@router.post(
    "/projects/{project_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_document(
    project_id: uuid.UUID,
    payload: DocumentCreateRequest,
    db: Session = Depends(get_db),
) -> DocumentResponse:
    document = document_service.create_document(
        db, project_id=project_id, title=payload.title, description=payload.description
    )
    return DocumentResponse.model_validate(document)


@router.get(
    "/projects/{project_id}/documents", response_model=list[DocumentResponse]
)
def list_documents(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[DocumentResponse]:
    documents = document_service.list_documents(db, project_id)
    return [DocumentResponse.model_validate(document) for document in documents]


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> DocumentResponse:
    document = document_service.get_document(db, document_id)
    return DocumentResponse.model_validate(document)


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: uuid.UUID,
    payload: DocumentUpdateRequest,
    db: Session = Depends(get_db),
) -> DocumentResponse:
    fields = payload.model_dump(exclude_unset=True)
    document = document_service.update_document(db, document_id, **fields)
    return DocumentResponse.model_validate(document)


@router.delete(
    "/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    document_service.delete_document(db, document_id)