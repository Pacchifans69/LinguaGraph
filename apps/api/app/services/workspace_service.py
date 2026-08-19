"""Workspace read model service (M0.3).

``GET /api/v1/documents/{document_id}/workspace`` returns a complete
document-level snapshot: document metadata, TextVersions, Spans,
AlignmentGroups and AlignmentMembers (report section 9; spec section 32). No
pagination in M0.

Transaction discipline (section 9 of the report and CURRENT_STATE.md):

- every query for the snapshot runs inside ONE ``read_transaction``;
- the complete response data is materialized onto a plain snapshot object
  BEFORE the read transaction closes;
- the service returns with ``db.in_transaction() == False`` so the Session is
  transaction-clean for the next service call;
- the snapshot NEVER relies on ORM lazy loading: no ``document.text_versions``,
  no ``version.spans``, no ``group.members`` traversal after the transaction
  has closed. All rows are loaded with explicit queries and the HTTP layer
  serializes scalar columns only.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    ParallelDocument,
    Span,
    TextVersion,
)
from app.db.session import read_transaction


@dataclass(frozen=True, slots=True)
class WorkspaceSnapshot:
    """Materialized workspace read model.

    Holds fully loaded ORM instances whose scalar columns are safe to
    serialize after the read transaction has closed
    (``expire_on_commit=False`` keeps them populated). No relationship is
    ever traversed on these objects by the HTTP layer.
    """

    document: ParallelDocument
    text_versions: list[TextVersion] = field(default_factory=list)
    spans: list[Span] = field(default_factory=list)
    alignment_groups: list[AlignmentGroup] = field(default_factory=list)
    alignment_members: list[AlignmentMember] = field(default_factory=list)


def get_workspace_snapshot(db: Session, document_id: uuid.UUID) -> WorkspaceSnapshot:
    """Fetch the complete workspace snapshot in one read transaction.

    Raises ``NOT_FOUND`` when the document does not exist. All queries execute
    and all result rows materialize inside the owned read transaction; the
    Session is left transaction-clean.
    """
    with read_transaction(db):
        document = db.get(ParallelDocument, document_id)
        if document is None:
            raise DomainError(
                "NOT_FOUND", "document not found", {"document_id": str(document_id)}
            )

        # Deterministic server ordering: (sort_order, created_at, id) — the
        # accepted semantics (report section 4). This is NOT the workspace
        # panel drag order, which is a per-document frontend preference.
        text_versions = list(
            db.scalars(
                select(TextVersion)
                .where(TextVersion.document_id == document_id)
                .order_by(
                    TextVersion.sort_order,
                    TextVersion.created_at,
                    TextVersion.id,
                )
            ).all()
        )

        # Explicit flat queries — no relationship traversal. Spans/members are
        # scoped through the document's own tables (a Span knows its
        # TextVersion; a member knows its group).
        spans = list(
            db.scalars(
                select(Span)
                .join(TextVersion, Span.text_version_id == TextVersion.id)
                .where(TextVersion.document_id == document_id)
                .order_by(Span.created_at, Span.id)
            ).all()
        )
        alignment_groups = list(
            db.scalars(
                select(AlignmentGroup)
                .where(AlignmentGroup.document_id == document_id)
                .order_by(AlignmentGroup.created_at, AlignmentGroup.id)
            ).all()
        )
        alignment_members = list(
            db.scalars(
                select(AlignmentMember)
                .join(
                    AlignmentGroup,
                    AlignmentMember.alignment_group_id == AlignmentGroup.id,
                )
                .where(AlignmentGroup.document_id == document_id)
                .order_by(AlignmentMember.created_at, AlignmentMember.id)
            ).all()
        )

        return WorkspaceSnapshot(
            document=document,
            text_versions=text_versions,
            spans=spans,
            alignment_groups=alignment_groups,
            alignment_members=alignment_members,
        )