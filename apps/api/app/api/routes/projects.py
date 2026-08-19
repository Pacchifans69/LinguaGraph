"""Project HTTP endpoints (M0.3).

Routes only parse/serialize HTTP and delegate business/transaction behavior to
the Project service (ADR-008 modular monolith). Routes never call
``commit()``/``rollback()`` and never run ad-hoc ORM queries.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectResponse,
    ProjectUpdateRequest,
)
from app.services import project_service

router = APIRouter(tags=["projects"])


@router.post(
    "/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreateRequest,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = project_service.create_project(
        db, name=payload.name, description=payload.description
    )
    return ProjectResponse.model_validate(project)


@router.get("/projects", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectResponse]:
    projects = project_service.list_projects(db)
    return [ProjectResponse.model_validate(project) for project in projects]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = project_service.get_project(db, project_id)
    return ProjectResponse.model_validate(project)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdateRequest,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    fields = payload.model_dump(exclude_unset=True)
    project = project_service.update_project(
        db, project_id, **fields
    )
    return ProjectResponse.model_validate(project)


@router.delete(
    "/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    project_service.delete_project(db, project_id)