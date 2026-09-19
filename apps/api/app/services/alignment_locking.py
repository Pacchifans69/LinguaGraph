"""M7 row-lock helpers for Alignment/TextVersion concurrency.

These helpers implement only the frozen M7 lock primitives. They do not own
transactions, choose domain outcomes, or form a generic repository lock
manager. Callers must already be inside a service-owned write_transaction.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ParallelDocument, TextVersion


def lock_parallel_document(
    db: Session, document_id: uuid.UUID
) -> ParallelDocument | None:
    """Freshly load and lock one ParallelDocument row."""

    return db.scalar(
        select(ParallelDocument)
        .where(ParallelDocument.id == document_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )


def lock_text_versions(
    db: Session, text_version_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, TextVersion]:
    """Lock TextVersion rows in deterministic UUID order and refresh them."""

    ids = sorted(set(text_version_ids), key=lambda value: value.hex)
    if not ids:
        return {}

    rows = list(
        db.scalars(
            select(TextVersion)
            .where(TextVersion.id.in_(ids))
            .order_by(TextVersion.id)
            .execution_options(populate_existing=True)
            .with_for_update()
        ).all()
    )
    return {row.id: row for row in rows}


__all__ = ["lock_parallel_document", "lock_text_versions"]
