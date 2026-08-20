"""Alignment request/response schemas (M0.5 HTTP boundary).

The persistence member boundary contains ONLY ``text_version_id`` /
``start`` / ``end`` (frozen M0.5 contract section 6): quote, direction,
contentHash and exact_text/prefix/suffix are never accepted as authoritative
member input — the backend derives the quote metadata from the canonical
TextVersion content.

PATCH note semantics (frozen contract section 14): ``AlignmentGroup.note``
is a NULLABLE column, so an EXPLICIT ``note: null`` is VALID and means
"clear the note" — deliberately different from the TextVersion metadata
PATCH, whose fields are NOT NULL and therefore reject explicit null.
Omitting a field still means "leave unchanged". ``members`` is a
full-replacement-set concept (never null): an explicit ``members: null`` is
rejected.

``start``/``end`` are code-point offsets into canonical content; full range
validation (``0 <= start < end <= len(content)``) is performed by the
service and surfaces as the stable ``SPAN_OUT_OF_RANGE`` domain code, so the
boundary schemas only enforce shape.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Repository schema reality: nullable VARCHAR(4000) (Alembic 0002 /
# app/db/models/alignment.py). Do not migrate to TEXT to match historical
# prose (frozen contract section 14).
NOTE_MAX = 4000


class AlignmentMemberInput(BaseModel):
    """One member of an alignment request (coordinates only, ADR-001)."""

    model_config = ConfigDict(extra="forbid")

    text_version_id: uuid.UUID
    start: int
    end: int


class AlignmentCreateRequest(BaseModel):
    """Body of ``POST /api/v1/documents/{document_id}/alignments``."""

    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=NOTE_MAX)
    members: list[AlignmentMemberInput]


class AlignmentUpdateRequest(BaseModel):
    """Body of ``PATCH /api/v1/alignments/{alignment_id}``.

    Field omission means "leave unchanged". ``note: null`` is VALID and
    clears the note (nullable column). ``members`` is a full replacement
    set; an explicit ``members: null`` is rejected (a group always needs
    members, and the frozen contract defines no null semantics for it).
    """

    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=NOTE_MAX)
    members: list[AlignmentMemberInput] | None = None

    @model_validator(mode="after")
    def _reject_null_members(self) -> "AlignmentUpdateRequest":
        """Reject EXPLICIT ``null`` for ``members`` (omission is fine).

        ``note: null`` must remain valid (clears the note); only ``members``
        has no null semantics.
        """
        if "members" in self.model_fields_set and self.members is None:
            raise ValueError("members must be a list, not null")
        return self


class AlignmentMemberResponse(BaseModel):
    """Serialized alignment member: the member row plus its server-derived
    span coordinates/quote metadata (frozen contract section 12)."""

    id: uuid.UUID
    span_id: uuid.UUID
    text_version_id: uuid.UUID
    start: int
    end: int
    exact_text: str


class AlignmentResponse(BaseModel):
    """Serialized AlignmentGroup with its full member set.

    Built by the route from the service's materialized AlignmentView —
    scalar columns only, no ORM relationship traversal after the service
    transaction has closed (M0.3 transaction-clean HTTP-boundary discipline).
    """

    id: uuid.UUID
    document_id: uuid.UUID
    note: str | None
    created_at: datetime
    updated_at: datetime
    members: list[AlignmentMemberResponse]
