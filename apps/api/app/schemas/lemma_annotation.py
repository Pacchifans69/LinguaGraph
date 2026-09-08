"""Lemma annotation HTTP schemas (M4 / ADR-012).

The request body carries ONE field. Target identity is resolved server-side
from ``token_segment_id`` only: the client may not supply
``text_version_id``, token layer id, coordinates, ``exact_text``,
``is_word_like``, ``content_hash`` or a language tag as competing authority
(``extra="forbid"`` rejects any such field).

Value validation deliberately stays in the domain service: it owns the stable
``INVALID_LEMMA_VALUE`` error and the NFC/whitespace/length contract, so a
non-string JSON payload is the only failure reported as ``VALIDATION_ERROR``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LemmaAnnotationPutRequest(BaseModel):
    """Submitted Human-authored lemma for one exact saved token occurrence."""

    model_config = ConfigDict(extra="forbid")

    lemma: str


class TokenLemmaAnnotationResponse(BaseModel):
    """Flat persisted lemma annotation (no redundant token context)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    token_segment_id: uuid.UUID
    lemma: str
    created_at: datetime
    updated_at: datetime
