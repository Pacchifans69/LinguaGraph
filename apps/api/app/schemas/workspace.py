"""Span / AlignmentGroup / AlignmentMember and Workspace schemas (M0.3).

The workspace read model (``GET /api/v1/documents/{document_id}/workspace``)
returns flat collections for ``document``, ``text_versions``, ``spans``,
``alignment_groups`` and ``alignment_members`` — no pagination in M0 (report
section 9). Every model serializes scalar columns only; the route never
traverses ORM relationships after a service returns.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.document import DocumentResponse
from app.schemas.segmentation import SegmentResponse, SegmentationLayerResponse
from app.schemas.text_version import TextVersionResponse


class SpanResponse(BaseModel):
    """Serialized Span (server-derived quote metadata included)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text_version_id: uuid.UUID
    start_offset: int
    end_offset: int
    exact_text: str
    prefix: str
    suffix: str
    created_at: datetime


class AlignmentGroupResponse(BaseModel):
    """Serialized AlignmentGroup (no members nested; flat members collection)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    note: str | None
    created_at: datetime
    updated_at: datetime


class AlignmentMemberResponse(BaseModel):
    """Serialized AlignmentMember (flat; span/group resolved by id)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    alignment_group_id: uuid.UUID
    span_id: uuid.UUID
    created_at: datetime


class WorkspaceResponse(BaseModel):
    """The complete document-level snapshot (report section 9).

    Alignment data is read-only in M0.3: span/alignment mutation belongs to
    M0.5. The frontend normalizes these flat collections into lookup maps.
    """

    model_config = ConfigDict(from_attributes=True)

    document: DocumentResponse
    text_versions: list[TextVersionResponse]
    spans: list[SpanResponse]
    alignment_groups: list[AlignmentGroupResponse]
    alignment_members: list[AlignmentMemberResponse]
    segmentation_layers: list[SegmentationLayerResponse]
    segments: list[SegmentResponse]