"""ParallelDocument request/response schemas (M0.3 HTTP boundary)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_TITLE_MAX = 300
_DESCRIPTION_MAX = 2000


class DocumentCreateRequest(BaseModel):
    """Body of ``POST /api/v1/projects/{project_id}/documents``."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=_TITLE_MAX)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX)


class DocumentUpdateRequest(BaseModel):
    """Body of ``PATCH /api/v1/documents/{document_id}``.

    All fields optional; only provided fields change. ``description`` may be
    explicitly set to ``null`` to clear it.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=_TITLE_MAX)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX)


class DocumentResponse(BaseModel):
    """Serialized ParallelDocument (scalar columns only)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None
    created_at: datetime
    updated_at: datetime