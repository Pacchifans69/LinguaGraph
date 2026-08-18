"""Canonical text contract (M0_PREIMPLEMENTATION_REPORT.md, section 6).

Pipeline (identical for string and byte input)::

    input
      -> strict UTF-8 decode where bytes are accepted
      -> remove ONE leading U+FEFF BOM
      -> CRLF -> LF
      -> remaining CR -> LF
      -> reject U+0000
      -> reject invalid/unpaired surrogate input
      -> NFC normalize
      -> enforce maximum code-point length
      -> canonical content
      -> SHA-256 of UTF-8 canonical content

Deliberately NOT done: trim, whitespace collapse, lowercasing, case-folding,
NFKC, interior BOM removal, punctuation normalization. Empty and
whitespace-only text are allowed.
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass

from app.api.errors import DomainError

# Default maximum canonical content length in code points. Services pass the
# configured limit (Settings.max_text_version_codepoints); this constant keeps
# the pure functions usable standalone and matches the Settings default.
DEFAULT_MAX_CODEPOINTS = 1_000_000


@dataclass(frozen=True)
class CanonicalText:
    """Result of canonicalization: the canonical content plus its SHA-256.

    ``content`` is the exact string all span offsets refer to; ``content_hash``
    is ``sha256_hex(utf8(content))``. The hash is always computed from the
    canonical content, never from the raw input.
    """

    content: str
    content_hash: str


def sha256_hex(content: str) -> str:
    """SHA-256 (hex) of the UTF-8 encoding of ``content``."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def canonicalize_text(text: str, max_codepoints: int = DEFAULT_MAX_CODEPOINTS) -> CanonicalText:
    """Canonicalize an in-memory string according to the frozen contract.

    Raises :class:`app.api.errors.DomainError` with the standard machine
    codes ``INVALID_NULL_CHARACTER``, ``INVALID_SURROGATE`` or
    ``TEXT_TOO_LARGE`` when the input violates the contract.
    """
    if not isinstance(text, str):
        raise DomainError(
            "VALIDATION_ERROR", "text must be a string", {"field": "content"}
        )

    # 1. Remove ONE leading BOM. Interior U+FEFF is preserved.
    if text.startswith("\ufeff"):
        text = text[1:]

    # 2. Newline canonicalization: CRLF -> LF, then remaining CR -> LF.
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 3. Reject U+0000.
    if "\x00" in text:
        raise DomainError(
            "INVALID_NULL_CHARACTER",
            "text contains a NUL (U+0000) character, which is not allowed",
            {"field": "content"},
        )

    # 4. Reject unpaired (and paired) surrogate code points: a Python str may
    #    carry them (e.g. after a UTF-16 decode); they are not valid Unicode
    #    scalar values and must never reach canonical content.
    if any(0xD800 <= ord(ch) <= 0xDFFF for ch in text):
        raise DomainError(
            "INVALID_SURROGATE",
            "text contains surrogate code points, which are not allowed",
            {"field": "content"},
        )

    # 5. NFC normalize (after the rejections, so normalization never sees
    #    invalid code points).
    content = unicodedata.normalize("NFC", text)

    # 6. Enforce the maximum canonical length (code points).
    if len(content) > max_codepoints:
        raise DomainError(
            "TEXT_TOO_LARGE",
            "text exceeds the maximum allowed length",
            {
                "max_codepoints": max_codepoints,
                "actual_codepoints": len(content),
                "field": "content",
            },
        )

    return CanonicalText(content=content, content_hash=sha256_hex(content))


def canonicalize_utf8(
    data: bytes, max_codepoints: int = DEFAULT_MAX_CODEPOINTS
) -> CanonicalText:
    """Canonicalize UTF-8 bytes (file import path).

    Decoding is strict: malformed UTF-8 raises ``INVALID_UTF8`` instead of
    being silently replaced. The remaining pipeline is identical to
    :func:`canonicalize_text`.
    """
    if not isinstance(data, (bytes, bytearray)):
        raise DomainError(
            "VALIDATION_ERROR", "content bytes must be bytes", {"field": "content"}
        )
    try:
        text = bytes(data).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DomainError(
            "INVALID_UTF8",
            "content is not valid UTF-8",
            {"field": "content", "byte_offset": exc.start},
        ) from exc
    return canonicalize_text(text, max_codepoints=max_codepoints)
