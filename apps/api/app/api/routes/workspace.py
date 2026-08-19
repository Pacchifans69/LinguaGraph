"""Workspace read-model HTTP endpoint (M0.3).

``GET /api/v1/documents/{document_id}/workspace`` returns the complete
document snapshot (report section 9 / spec section 32). The endpoint is
read-only with respect to spans/alignments: their mutation belongs to M0.5.

Serialization touches scalar columns only — the route never traverses ORM
relationships, never calls ``commit()``/``rollback()``/``refresh()`` and never
runs ad-hoc queries; all data arrives pre-materialized from the workspace
service, whose read transaction has already closed when this function runs.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.workspace import WorkspaceResponse
from app.services import workspace_service

router = APIRouter(tags=["workspace"])


@router.get("/documents/{document_id}/workspace", response_model=WorkspaceResponse)
def get_workspace(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> WorkspaceResponse:
    """The flat document-level snapshot consumed and normalized by the
    frontend workspace route.
    """
    snapshot = workspace_service.get_workspace_snapshot(db, document_id)
    return WorkspaceResponse.model_validate(snapshot)