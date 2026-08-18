"""Span persistence foundation (M0.2).

Derives ``exact_text``/``prefix``/``suffix`` from the canonical content — a
client-supplied quote is never treated as authority (report section 14) — and
enforces the offset-range invariant before persisting.

The concurrency-safe Span get-or-create used during alignment mutation is
explicitly M0.5 scope; this service provides the plain validated create it
builds on.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.session import write_transaction

from app.api.errors import DomainError
from app.db.models import Span, TextVersion
from app.text.offsets import (
    DEFAULT_CONTEXT_WINDOW,
    extract_context,
    extract_exact_text,
)


def create_span(
    db: Session,
    *,
    text_version_id: uuid.UUID,
    start_offset: int,
    end_offset: int,
    context_window: int = DEFAULT_CONTEXT_WINDOW,
) -> Span:
    """Create and commit a span with server-derived quote metadata.

    Raises ``NOT_FOUND`` when the text version does not exist and
    ``SPAN_OUT_OF_RANGE`` when ``0 <= start < end <= len(content)`` does not
    hold. A duplicate ``(text_version_id, start_offset, end_offset)`` violates
    the database unique constraint (``IntegrityError``); reuse/get-or-create
    is M0.5.
    """
    with write_transaction(db):
        version = db.get(TextVersion, text_version_id)
        if version is None:
            raise DomainError(
                "NOT_FOUND",
                "text version not found",
                {"text_version_id": str(text_version_id)},
            )
        exact_text = extract_exact_text(version.content, start_offset, end_offset)
        prefix, suffix = extract_context(
            version.content, start_offset, end_offset, window=context_window
        )
        span = Span(
            text_version_id=text_version_id,
            start_offset=start_offset,
            end_offset=end_offset,
            exact_text=exact_text,
            prefix=prefix,
            suffix=suffix,
        )
        db.add(span)
    db.refresh(span)
    return span
