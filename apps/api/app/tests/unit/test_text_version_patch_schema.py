"""TextVersion PATCH schema unit tests (M0.3 human review finding C).

An EXPLICIT ``null`` for ``label``/``sort_order`` must be rejected at the
Pydantic boundary with VALIDATION_ERROR (HTTP 422); omitting a field must
keep meaning "leave unchanged".
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.text_version import TextVersionUpdateRequest


def test_explicit_null_sort_order_is_rejected() -> None:
    with pytest.raises(ValidationError) as excinfo:
        TextVersionUpdateRequest.model_validate({"sort_order": None})
    messages = [str(error.get("msg", "")) for error in excinfo.value.errors()]
    assert any("sort_order" in message for message in messages)


def test_explicit_null_label_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TextVersionUpdateRequest.model_validate({"label": None})


def test_omitted_fields_mean_leave_unchanged() -> None:
    request = TextVersionUpdateRequest.model_validate({})
    assert request.model_dump(exclude_unset=True) == {}


def test_partial_update_with_real_values_is_accepted() -> None:
    request = TextVersionUpdateRequest.model_validate(
        {"label": "Renamed", "sort_order": 3}
    )
    assert request.model_dump(exclude_unset=True) == {
        "label": "Renamed",
        "sort_order": 3,
    }
    # An omitted field is never dumped as null.
    only_sort = TextVersionUpdateRequest.model_validate({"sort_order": 1})
    assert only_sort.model_dump(exclude_unset=True) == {"sort_order": 1}
