"""Code-point offset utility tests (ADR-001).

All offsets are Unicode code-point offsets: zero-based, start inclusive, end
exclusive — never UTF-16 code units, bytes, or grapheme clusters.
"""

import pytest

from app.api.errors import DomainError
from app.text.offsets import (
    code_point_length,
    extract_context,
    extract_exact_text,
    slice_by_code_points,
    validate_exact_text_match,
    validate_span_bounds,
)

ASTral = "A🙂B"  # 3 code points, 4 UTF-16 code units
MIXED = "Café 🙂 mañana für français"  # 26 code points


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("hello world", 11),
        ("café français", 13),
        ("mañana", 6),
        ("für größere Häuser", 18),  # authoritative corrected value
        ("A🙂B", 3),  # authoritative corrected value
        ("Café 🙂 mañana für français", 26),  # authoritative corrected value
    ],
)
def test_code_point_length(text: str, expected: int) -> None:
    assert code_point_length(text) == expected
    # Python str slicing/counting must satisfy the code-point contract.
    assert len(text) == expected


def test_code_point_length_is_not_utf16_length() -> None:
    # JS String.length would report 4 for A🙂B; code points are 3.
    assert len(ASTral.encode("utf-16-le")) // 2 == 4
    assert code_point_length(ASTral) == 3


def test_slice_by_code_points_around_emoji() -> None:
    assert slice_by_code_points(ASTral, 0, 1) == "A"
    assert slice_by_code_points(ASTral, 1, 2) == "🙂"
    assert slice_by_code_points(ASTral, 2, 3) == "B"


def test_slice_by_code_points_mixed() -> None:
    # 🙂 sits at code-point offset 5 in the mixed string.
    assert slice_by_code_points(MIXED, 5, 6) == "🙂"
    assert slice_by_code_points(MIXED, 0, 26) == MIXED


def test_validate_span_bounds_accepts_valid_ranges() -> None:
    validate_span_bounds(ASTral, 0, 3)
    validate_span_bounds(ASTral, 1, 2)
    validate_span_bounds("hello", 0, 5)


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (-1, 2),  # negative start
        (2, 2),  # empty range
        (3, 2),  # inverted range
        (2, 4),  # end beyond content
        (0, 0),  # empty at zero
    ],
)
def test_validate_span_bounds_rejects_invalid_ranges(start: int, end: int) -> None:
    with pytest.raises(DomainError) as excinfo:
        validate_span_bounds("A🙂B", start, end)
    assert excinfo.value.code == "SPAN_OUT_OF_RANGE"


def test_extract_exact_text() -> None:
    assert extract_exact_text("I look forward to seeing you.", 2, 17) == "look forward to"
    assert extract_exact_text(ASTral, 1, 2) == "🙂"


def test_extract_context_window() -> None:
    prefix, suffix = extract_context("Hello world, this is a test.", 5, 10)
    assert prefix == "Hello"  # preceding 5 code points (start - 5)
    assert suffix == "d, this is a test."  # following code points (clamped)


def test_extract_context_exact_32_code_point_window() -> None:
    content = "x" * 100 + "SPAN" + "y" * 100
    prefix, suffix = extract_context(content, 100, 104)
    assert prefix == "x" * 32
    assert suffix == "y" * 32


def test_extract_context_clamps_at_content_edges() -> None:
    prefix, suffix = extract_context("ab", 0, 2)
    assert prefix == ""
    assert suffix == ""


def test_extract_context_counts_code_points_not_utf16() -> None:
    content = "🙂" * 40 + "SPAN"
    prefix, _ = extract_context(content, 40, 44)
    assert prefix == "🙂" * 32  # 32 code points, not 32 UTF-16 units


def test_validate_exact_text_match() -> None:
    validate_exact_text_match("I look forward to seeing you.", 2, 17, "look forward to")
    with pytest.raises(DomainError) as excinfo:
        validate_exact_text_match("I look forward to seeing you.", 2, 17, "wrong quote")
    assert excinfo.value.code == "VALIDATION_ERROR"


def test_extract_exact_text_rejects_out_of_range() -> None:
    with pytest.raises(DomainError) as excinfo:
        extract_exact_text("short", 0, 99)
    assert excinfo.value.code == "SPAN_OUT_OF_RANGE"
