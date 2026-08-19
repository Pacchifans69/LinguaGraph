"""TextVersion request/response schemas (M0.3 HTTP boundary).

``PATCH`` is metadata-only (``label``, ``sort_order``): content mutation is
governed by the ADR-005 immutability policy and is never exposed through the
general metadata PATCH.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_LABEL_MAX = 200
_LANGUAGE_TAG_MAX = 100


class TextVersionCreateRequest(BaseModel):
    """Body of ``POST /api/v1/documents/{document_id}/text-versions`` (paste)."""

    model_config = ConfigDict(extra="forbid")

    language_tag: str = Field(min_length=1, max_length=_LANGUAGE_TAG_MAX)
    label: str = Field(min_length=1, max_length=_LABEL_MAX)
    content: str
    sort_order: int = Field(default=0)


class TextVersionUpdateRequest(BaseModel):
    """Body of ``PATCH /api/v1/text-versions/{text_version_id}`` (metadata only).

    ``content`` is deliberately absent AND extra fields are forbidden:
    annotated text is immutable (ADR-005) and content changes only go through
    the explicit (M0.3-unexposed) service path for unannotated versions.
    """

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=_LABEL_MAX)
    sort_order: int | None = Field(default=None)


class TextVersionResponse(BaseModel):
    """Serialized TextVersion (scalar columns only; canonical content included)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    language_tag: str
    label: str
    content: str
    content_hash: str
    sort_order: int
    created_at: datetime
    updated_at: datetime