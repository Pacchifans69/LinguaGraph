"""ParallelDocument persistence service (M0.2 persistence foundations)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import write_transaction

from app.api.errors import DomainError
from app.db.models import ParallelDocument, Project

_TITLE_MAX = 300
_DESCRIPTION_MAX = 2000

_UNSET = object()


def _validate_title(title: str) -> None:
    if not isinstance(title, str) or not title.strip():
        raise DomainError(
            "VALIDATION_ERROR", "document title is required", {"field": "title"}
        )
    if len(title) > _TITLE_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "document title is too long",
            {"field": "title", "max_length": _TITLE_MAX},
        )


def _validate_description(description: str | None) -> None:
    if description is not None and len(description) > _DESCRIPTION_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "document description is too long",
            {"field": "description", "max_length": _DESCRIPTION_MAX},
        )


def _require_project(db: Session, project_id: uuid.UUID) -> None:
    if db.get(Project, project_id) is None:
        raise DomainError(
            "NOT_FOUND", "project not found", {"project_id": str(project_id)}
        )


def create_document(
    db: Session,
    *,
    project_id: uuid.UUID,
    title: str,
    description: str | None = None,
) -> ParallelDocument:
    """Create and commit a document inside an existing project."""
    _validate_title(title)
    _validate_description(description)
    with write_transaction(db):
        _require_project(db, project_id)
        document = ParallelDocument(
            project_id=project_id, title=title, description=description
        )
        db.add(document)
    db.refresh(document)
    return document


def get_document(db: Session, document_id: uuid.UUID) -> ParallelDocument:
    """Fetch a document by id; raises ``NOT_FOUND``."""
    document = db.get(ParallelDocument, document_id)
    if document is None:
        raise DomainError(
            "NOT_FOUND", "document not found", {"document_id": str(document_id)}
        )
    return document


def list_documents(db: Session, project_id: uuid.UUID) -> list[ParallelDocument]:
    """All documents of one project in stable creation order."""
    return list(
        db.scalars(
            select(ParallelDocument)
            .where(ParallelDocument.project_id == project_id)
            .order_by(ParallelDocument.created_at, ParallelDocument.id)
        ).all()
    )


def update_document(
    db: Session,
    document_id: uuid.UUID,
    *,
    title: str | object = _UNSET,
    description: str | None | object = _UNSET,
) -> ParallelDocument:
    """Update document metadata; only provided fields change."""
    with write_transaction(db):
        document = db.get(ParallelDocument, document_id)
        if document is None:
            raise DomainError(
                "NOT_FOUND", "document not found", {"document_id": str(document_id)}
            )
        if title is not _UNSET:
            _validate_title(title)  # type: ignore[arg-type]
            document.title = title  # type: ignore[assignment]
        if description is not _UNSET:
            _validate_description(description)  # type: ignore[arg-type]
            document.description = description  # type: ignore[assignment]
    db.refresh(document)
    return document


def delete_document(db: Session, document_id: uuid.UUID) -> None:
    """Delete a document; versions/spans/groups/members cascade at the DB level."""
    with write_transaction(db):
        document = db.get(ParallelDocument, document_id)
        if document is None:
            raise DomainError(
                "NOT_FOUND", "document not found", {"document_id": str(document_id)}
            )
        db.delete(document)
