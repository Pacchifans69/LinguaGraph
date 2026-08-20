"""Alignment schema boundary tests (M0.5).

The frozen M0.5 request boundary accepts ONLY ``text_version_id``/``start``/
``end`` per member (no quote/direction/contentHash/exact_text/prefix/suffix),
and the PATCH note semantics are deliberately different from the TextVersion
metadata PATCH: ``AlignmentGroup.note`` is nullable, so ``note: null`` is
VALID and clears the note, while ``members: null`` is rejected (the full
replacement set has no null semantics).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.alignment import (
    NOTE_MAX,
    AlignmentCreateRequest,
    AlignmentUpdateRequest,
)


def _member(text_version_id: str = "11111111-1111-1111-1111-111111111111") -> dict:
    return {"text_version_id": text_version_id, "start": 2, "end": 17}


# --- POST create --------------------------------------------------------------


def test_create_request_accepts_coordinates_only() -> None:
    request = AlignmentCreateRequest.model_validate(
        {
            "note": "Phrase-level correspondence",
            "members": [
                _member("11111111-1111-1111-1111-111111111111"),
                _member("22222222-2222-2222-2222-222222222222"),
            ],
        }
    )
    assert request.note == "Phrase-level correspondence"
    assert len(request.members) == 2
    assert request.members[0].text_version_id
    assert request.members[0].start == 2
    assert request.members[0].end == 17


def test_create_request_omits_quote_direction_content_hash() -> None:
    # The frozen boundary must not carry quote/direction/contentHash: the
    # schema forbids extra fields, so sending them is a 422 VALIDATION_ERROR.
    with pytest.raises(ValidationError):
        AlignmentCreateRequest.model_validate(
            {
                "members": [
                    {
                        "text_version_id": "11111111-1111-1111-1111-111111111111",
                        "start": 2,
                        "end": 17,
                        "quote": "look forward to",
                    },
                    _member("22222222-2222-2222-2222-222222222222"),
                ]
            }
        )
    with pytest.raises(ValidationError):
        AlignmentCreateRequest.model_validate(
            {
                "members": [
                    {
                        "text_version_id": "11111111-1111-1111-1111-111111111111",
                        "start": 2,
                        "end": 17,
                        "contentHash": "abc",
                    },
                    _member("22222222-2222-2222-2222-222222222222"),
                ]
            }
        )


def test_create_request_note_optional_and_limited() -> None:
    request = AlignmentCreateRequest.model_validate(
        {"members": [_member(), _member("22222222-2222-2222-2222-222222222222")]}
    )
    assert request.note is None

    with pytest.raises(ValidationError):
        AlignmentCreateRequest.model_validate(
            {
                "note": "x" * (NOTE_MAX + 1),
                "members": [_member(), _member("22222222-2222-2222-2222-222222222222")],
            }
        )


def test_create_request_requires_members_and_forbids_extras() -> None:
    with pytest.raises(ValidationError):
        AlignmentCreateRequest.model_validate({"note": "no members"})
    with pytest.raises(ValidationError):
        AlignmentCreateRequest.model_validate(
            {"members": [_member()], "unexpected": True}
        )


# --- PATCH update --------------------------------------------------------------


def test_patch_request_empty_body_is_valid() -> None:
    request = AlignmentUpdateRequest.model_validate({})
    assert request.model_fields_set == set()


def test_patch_explicit_null_note_is_valid_and_clears() -> None:
    # FROZEN: note is nullable; explicit null CLEARS the note — this is NOT
    # the TextVersion PATCH explicit-null rejection (those fields are NOT
    # NULL; AlignmentGroup.note is nullable).
    request = AlignmentUpdateRequest.model_validate({"note": None})
    assert "note" in request.model_fields_set
    assert request.note is None


def test_patch_explicit_null_members_is_rejected() -> None:
    # The full replacement set has no null semantics.
    with pytest.raises(ValidationError):
        AlignmentUpdateRequest.model_validate({"members": None})


def test_patch_note_and_members_combined() -> None:
    request = AlignmentUpdateRequest.model_validate(
        {
            "note": "Updated note",
            "members": [_member(), _member("22222222-2222-2222-2222-222222222222")],
        }
    )
    assert request.note == "Updated note"
    assert len(request.members) == 2


def test_patch_note_max_length_4000() -> None:
    with pytest.raises(ValidationError):
        AlignmentUpdateRequest.model_validate({"note": "x" * (NOTE_MAX + 1)})


def test_patch_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        AlignmentUpdateRequest.model_validate({"note": "x", "direction": "forward"})
