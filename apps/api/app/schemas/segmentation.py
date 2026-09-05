"""Sentence-segmentation HTTP schemas (M2 / ADR-010)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SegmentCoordinates(BaseModel):
    """Client-supplied code-point coordinates; exact text is server-derived."""

    model_config = ConfigDict(extra="forbid")

    start: int
    end: int


class SentenceSegmentationPutRequest(BaseModel):
    """Full authoritative replacement of one sentence-segmentation layer."""

    model_config = ConfigDict(extra="forbid")

    content_hash: str = Field(min_length=64, max_length=64)
    requested_locale: str = Field(min_length=1, max_length=100)
    resolved_locale: str = Field(min_length=1, max_length=100)
    origin: Literal["manual", "intl_segmenter"]
    segments: list[SegmentCoordinates]


class SegmentationLayerResponse(BaseModel):
    """Flat persisted segmentation-layer data."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text_version_id: uuid.UUID
    granularity: str
    requested_locale: str
    resolved_locale: str
    origin: str
    content_hash: str
    created_at: datetime
    updated_at: datetime


class SegmentResponse(BaseModel):
    """Flat persisted segment with backend-derived exact text."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    segmentation_layer_id: uuid.UUID
    ordinal: int
    start_offset: int
    end_offset: int
    exact_text: str
    created_at: datetime


class SentenceSegmentationResponse(BaseModel):
    """Authoritative layer and its ordered complete partition."""

    model_config = ConfigDict(from_attributes=True)

    layer: SegmentationLayerResponse
    segments: list[SegmentResponse]
