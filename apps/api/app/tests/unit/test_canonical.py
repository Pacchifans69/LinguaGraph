"""Canonical-text contract tests (M0_PREIMPLEMENTATION_REPORT.md, section 6).

The corrected code-point regression values asserted here are authoritative:
- "für größere Häuser" = 18 code points
- "Café 🙂 mañana für français" = 26 code points
- "A🙂B" = 3 code points
"""

import hashlib

import pytest

from app.api.errors import DomainError
from app.text.canonical import (
    DEFAULT_MAX_CODEPOINTS,
    canonicalize_text,
    canonicalize_utf8,
    sha256_hex,
)

# (input, expected canonical content, expected code-point length)
REGRESSION_VECTORS: list[tuple[str, str, int]] = [
    ("hello world", "hello world", 11),
    ("café français", "café français", 13),
    ("mañana", "mañana", 6),
    ("für größere Häuser", "für größere Häuser", 18),
    ("Cafe\u0301", "Café", 4),  # decomposed -> NFC
    ("A🙂B", "A🙂B", 3),  # astral plane: code points, not UTF-16 units
    ("Café 🙂 mañana für français", "Café 🙂 mañana für français", 26),
    ("line1\r\nline2\rline3", "line1\nline2\nline3", 17),
    ("\ufeffBOM text", "BOM text", 8),  # one leading BOM stripped
    ("", "", 0),  # empty text is allowed
    ("   ", "   ", 3),  # whitespace-only text is allowed and preserved
]


@pytest.mark.parametrize(("raw", "expected_content", "expected_length"), REGRESSION_VECTORS)
def test_canonicalization_regression_vectors(
    raw: str, expected_content: str, expected_length: int
) -> None:
    result = canonicalize_text(raw)
    assert result.content == expected_content
    assert len(result.content) == expected_length


def test_hash_is_sha256_of_utf8_canonical_content() -> None:
    result = canonicalize_text("Café 🙂")
    expected = hashlib.sha256("Café 🙂".encode("utf-8")).hexdigest()
    assert result.content_hash == expected
    assert len(result.content_hash) == 64
    assert result.content_hash == sha256_hex(result.content)


def test_hash_is_deterministic() -> None:
    assert canonicalize_text("mañana").content_hash == canonicalize_text("mañana").content_hash


def test_hash_is_computed_from_canonical_not_raw() -> None:
    # Decomposed input and composed input canonicalize to the same content,
    # therefore the same hash — even though the raw strings differ.
    decomposed = canonicalize_text("Cafe\u0301")
    composed = canonicalize_text("Café")
    assert decomposed.content == composed.content == "Café"
    assert decomposed.content_hash == composed.content_hash


def test_interior_bom_is_preserved() -> None:
    assert canonicalize_text("a\ufeffb").content == "a\ufeffb"


def test_only_one_leading_bom_is_stripped() -> None:
    # A second BOM is interior content and must survive.
    assert canonicalize_text("\ufeff\ufefftext").content == "\ufefftext"


def test_crlf_and_cr_are_normalized_to_lf() -> None:
    assert canonicalize_text("a\r\nb\rc\nd").content == "a\nb\nc\nd"


def test_no_trim_no_collapse_no_case_change() -> None:
    assert canonicalize_text("  Hello   World  ").content == "  Hello   World  "


def test_nfkc_is_not_applied() -> None:
    # U+FB01 LATIN SMALL LIGATURE FI is preserved under NFC but would be
    # decomposed by NFKC; the contract forbids NFKC.
    assert canonicalize_text("\ufb01le").content == "\ufb01le"


def test_nul_character_is_rejected() -> None:
    with pytest.raises(DomainError) as excinfo:
        canonicalize_text("a\x00b")
    assert excinfo.value.code == "INVALID_NULL_CHARACTER"


def test_unpaired_surrogate_is_rejected() -> None:
    with pytest.raises(DomainError) as excinfo:
        canonicalize_text("a\ud800b")
    assert excinfo.value.code == "INVALID_SURROGATE"


def test_surrogate_pair_in_string_is_rejected() -> None:
    # Python strings may carry UTF-16-style surrogate pairs; they are not
    # valid Unicode scalar values and must never reach canonical content.
    with pytest.raises(DomainError) as excinfo:
        canonicalize_text("\ud83d\ude42")
    assert excinfo.value.code == "INVALID_SURROGATE"


def test_invalid_utf8_bytes_are_rejected() -> None:
    with pytest.raises(DomainError) as excinfo:
        canonicalize_utf8(b"\xff\xfe broken")
    assert excinfo.value.code == "INVALID_UTF8"


def test_utf8_bytes_with_bom_are_canonicalized() -> None:
    result = canonicalize_utf8("\ufeffBOM text".encode("utf-8"))
    assert result.content == "BOM text"


def test_utf8_bytes_newlines_are_normalized() -> None:
    result = canonicalize_utf8(b"a\r\nb\rc")
    assert result.content == "a\nb\nc"


def test_max_length_is_enforced_after_nfc() -> None:
    # NFC can shrink input (Cafe\u0301 -> Café), so the limit must be applied
    # to the canonical content, not the raw string.
    raw = "Cafe\u0301" * 100  # 500 code points raw
    result = canonicalize_text(raw, max_codepoints=400)
    assert len(result.content) == 400


def test_max_length_exceeded_is_rejected() -> None:
    with pytest.raises(DomainError) as excinfo:
        canonicalize_text("a" * 10, max_codepoints=5)
    assert excinfo.value.code == "TEXT_TOO_LARGE"
    assert excinfo.value.details["max_codepoints"] == 5
    assert excinfo.value.details["actual_codepoints"] == 10


def test_default_max_matches_configured_limit() -> None:
    assert DEFAULT_MAX_CODEPOINTS == 1_000_000


def test_non_string_input_is_rejected() -> None:
    with pytest.raises(DomainError):
        canonicalize_text(123)  # type: ignore[arg-type]
