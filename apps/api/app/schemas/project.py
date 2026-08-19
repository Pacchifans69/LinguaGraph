"""Project request/response schemas (M0.3 HTTP boundary).

ORM models are never used as API models (report section 11 / spec section 38);
these Pydantic schemas define the wire contract. Length/presence limits repeat
the service-level domain rules as defense in depth.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_NAME_MAX = 200
_DESCRIPTION_MAX = 2000


class ProjectCreateRequest(BaseModel):
    """Body of ``POST /api/v1/projects``."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=_NAME_MAX)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX)


class ProjectUpdateRequest(BaseModel):
    """Body of ``PATCH /api/v1/projects/{project_id}``.

    All fields optional; only provided fields change. ``description`` may be
    explicitly set to ``null`` to clear it.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=_NAME_MAX)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX)


class ProjectResponse(BaseModel):
    """Serialized Project (scalar columns only; no ORM relationships)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime