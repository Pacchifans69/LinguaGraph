"""IntegrityError classification unit tests (M0.3 human review finding C).

Only the PostgreSQL unique violation on ``uq_text_versions_document_label``
may be translated into the stable duplicate-label CONFLICT; any other
IntegrityError must propagate instead of being mislabeled.
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError

from app.api.routes.text_versions import (
    UNIQUE_LABEL_CONSTRAINT,
    is_duplicate_label_violation,
)


class _FakeDiag:
    def __init__(self, constraint_name: str | None) -> None:
        self.constraint_name = constraint_name


class _FakeOrig:
    def __init__(self, constraint_name: str | None) -> None:
        self.diag = _FakeDiag(constraint_name)


def _integrity_error(constraint_name: str | None) -> IntegrityError:
    return IntegrityError("statement", {}, _FakeOrig(constraint_name))


def test_label_unique_violation_is_classified_as_duplicate_label() -> None:
    exc = _integrity_error(UNIQUE_LABEL_CONSTRAINT)
    assert is_duplicate_label_violation(exc) is True


def test_other_constraint_violation_is_not_duplicate_label() -> None:
    for name in (
        "uq_some_other_table_something",
        "text_versions_document_id_fkey",
        "ck_spans_start_offset_non_negative",
    ):
        assert is_duplicate_label_violation(_integrity_error(name)) is False


def test_missing_diag_or_constraint_is_not_duplicate_label() -> None:
    # orig without a diag (e.g. non-PostgreSQL driver or synthetic error)
    exc = IntegrityError("statement", {}, object())
    assert is_duplicate_label_violation(exc) is False
    # orig without constraint_name
    assert is_duplicate_label_violation(_integrity_error(None)) is False
    # bare IntegrityError without orig
    assert is_duplicate_label_violation(IntegrityError("statement", {}, None)) is False
