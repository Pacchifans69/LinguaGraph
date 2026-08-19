"""TextVersion request/response schemas (M0.3 HTTP boundary).

``PATCH`` is metadata-only (``label``, ``sort_order``): content mutation is
governed by the ADR-005 immutability policy and is never exposed through the
general metadata PATCH. An EXPLICIT ``null`` for ``label`` or ``sort_order``
is rejected at the boundary (HTTP 422 VALIDATION_ERROR): omitting a field
means "leave unchanged", while ``null`` would otherwise be written into a
NOT NULL column.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

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

    @model_validator(mode="after")
    def _reject_explicit_null(self) -> "TextVersionUpdateRequest":
        """Reject EXPLICIT ``null`` for metadata fields (omission is fine).

        ``model_fields_set`` distinguishes "not provided" (leave unchanged)
        from "provided as null". Explicit null must fail with
        VALIDATION_ERROR at the HTTP boundary instead of reaching the
        NOT NULL column.
        """
        if "label" in self.model_fields_set and self.label is None:
            raise ValueError("label must be a non-empty string, not null")
        if "sort_order" in self.model_fields_set and self.sort_order is None:
            raise ValueError("sort_order must be an integer, not null")
        return self


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