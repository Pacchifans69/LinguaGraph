"""ORM models for the frozen M0 domain.

Importing this package registers every model on ``Base.metadata`` (used by
Alembic and by tests); it also re-exports the model classes for convenient
``from app.db.models import Project`` imports.
"""

from app.db.models.alignment import AlignmentGroup, AlignmentMember
from app.db.models.document import ParallelDocument
from app.db.models.project import Project
from app.db.models.span import Span
from app.db.models.text_version import TextVersion

__all__ = [
    "AlignmentGroup",
    "AlignmentMember",
    "ParallelDocument",
    "Project",
    "Span",
    "TextVersion",
]
