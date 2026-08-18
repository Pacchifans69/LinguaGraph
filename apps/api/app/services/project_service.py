"""Project persistence service (M0.2 persistence foundations).

CRUD semantics per M0_PREIMPLEMENTATION_REPORT.md section 4/9. Length and
presence constraints are enforced here at the domain boundary; Pydantic
schemas at the HTTP boundary (M0.3) will repeat them as defense in depth.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import write_transaction

from app.api.errors import DomainError
from app.db.models import Project

_NAME_MAX = 200
_DESCRIPTION_MAX = 2000

_UNSET = object()


def _validate_name(name: str) -> None:
    if not isinstance(name, str) or not name.strip():
        raise DomainError(
            "VALIDATION_ERROR", "project name is required", {"field": "name"}
        )
    if len(name) > _NAME_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "project name is too long",
            {"field": "name", "max_length": _NAME_MAX},
        )


def _validate_description(description: str | None) -> None:
    if description is not None and len(description) > _DESCRIPTION_MAX:
        raise DomainError(
            "VALIDATION_ERROR",
            "project description is too long",
            {"field": "description", "max_length": _DESCRIPTION_MAX},
        )


def create_project(
    db: Session, *, name: str, description: str | None = None
) -> Project:
    """Create and commit a project."""
    _validate_name(name)
    _validate_description(description)
    with write_transaction(db):
        project = Project(name=name, description=description)
        db.add(project)
    db.refresh(project)
    return project


def get_project(db: Session, project_id: uuid.UUID) -> Project:
    """Fetch a project by id; raises ``NOT_FOUND``."""
    project = db.get(Project, project_id)
    if project is None:
        raise DomainError(
            "NOT_FOUND", "project not found", {"project_id": str(project_id)}
        )
    return project


def list_projects(db: Session) -> list[Project]:
    """All projects in stable creation order."""
    return list(
        db.scalars(select(Project).order_by(Project.created_at, Project.id)).all()
    )


def update_project(
    db: Session,
    project_id: uuid.UUID,
    *,
    name: str | object = _UNSET,
    description: str | None | object = _UNSET,
) -> Project:
    """Update project metadata; only provided fields change.

    ``updated_at`` is refreshed by the ORM ``onupdate`` hook. Content is
    never touched by this operation.
    """
    with write_transaction(db):
        project = db.get(Project, project_id)
        if project is None:
            raise DomainError(
                "NOT_FOUND", "project not found", {"project_id": str(project_id)}
            )
        if name is not _UNSET:
            _validate_name(name)  # type: ignore[arg-type]
            project.name = name  # type: ignore[assignment]
        if description is not _UNSET:
            _validate_description(description)  # type: ignore[arg-type]
            project.description = description  # type: ignore[assignment]
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: uuid.UUID) -> None:
    """Delete a project; all dependent rows cascade at the database level.

    Raw FK cascade behavior and the future application deletion policy are
    separate concerns (report section 4): no HTTP endpoint exists yet (M0.3).
    """
    with write_transaction(db):
        project = db.get(Project, project_id)
        if project is None:
            raise DomainError(
                "NOT_FOUND", "project not found", {"project_id": str(project_id)}
            )
        db.delete(project)
