"""Coarse POS annotation HTTP schemas (M5 / ADR-013).

The request body carries ONE field. Target identity is resolved server-side
from ``token_segment_id`` only: the client may not supply ``text_version_id``,
token layer id, coordinates, ``exact_text``, ``is_word_like``, ``content_hash``,
``language_tag`` or ``lemma`` as competing authority (``extra="forbid"``
rejects any such field).

``pos_tag`` is deliberately typed as a plain ``str`` — NOT a ``Literal``/enum
of the fifteen frozen values. Membership in the frozen vocabulary is a DOMAIN
rule owned by ``app.services.pos_annotation_service`` so that:

- an unknown or malformed STRING fails with ``INVALID_POS_VALUE`` (422);
- a NON-STRING JSON value or an extra field stays an HTTP/Pydantic boundary
  failure reported as ``VALIDATION_ERROR`` (422).

Encoding the vocabulary here would collapse the second distinction into the
first and would silently reject valid domain input as a boundary error.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PosAnnotationPutRequest(BaseModel):
    """Submitted Human-selected coarse POS value for one saved token occurrence."""

    model_config = ConfigDict(extra="forbid")

    pos_tag: str


class TokenPosAnnotationResponse(BaseModel):
    """Flat persisted POS annotation (no redundant token context)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    token_segment_id: uuid.UUID
    pos_tag: str
    created_at: datetime
    updated_at: datetime
