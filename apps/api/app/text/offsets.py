"""Unicode code-point offset utilities (ADR-001).

All persisted/API offsets are Unicode code-point offsets into the canonical
``TextVersion.content``: zero-based, start inclusive, end exclusive.

Python ``str`` is a sequence of Unicode code points (PEP 393), so ``len()``
counts code points and slicing ``content[start:end]`` slices by code points;
these helpers exist so the contract is explicit and never re-implemented
elsewhere (a frontend equivalent lives in ``apps/web/src/shared/text``).
"""

from __future__ import annotations

from app.api.errors import DomainError

# Accepted context-window policy: prefix/suffix anchoring metadata is the
# preceding/following 32 code points of the canonical content.
DEFAULT_CONTEXT_WINDOW = 32


def code_point_length(text: str) -> int:
    """Number of Unicode code points in ``text``.

    Verified against the accepted contract: this is NOT a UTF-16 length, NOT a
    byte length, NOT a grapheme-cluster count. Python ``len(str)`` counts code
    points.
    """
    return len(text)


def slice_by_code_points(text: str, start: int, end: int) -> str:
    """Slice ``text`` by code-point offsets ``[start, end)``."""
    return text[start:end]


def validate_span_bounds(content: str, start: int, end: int) -> None:
    """Enforce ``0 <= start < end <= code_point_length(content)``.

    Raises ``SPAN_OUT_OF_RANGE`` otherwise. This is the canonical guard for
    every span derived from a TextVersion's content.
    """
    length = code_point_length(content)
    if start < 0 or end <= start or end > length:
        raise DomainError(
            "SPAN_OUT_OF_RANGE",
            "span offsets are outside the text version content",
            {
                "start_offset": start,
                "end_offset": end,
                "content_code_points": length,
            },
        )


def extract_exact_text(content: str, start: int, end: int) -> str:
    """Derive ``exact_text``: the canonical content slice ``[start, end)``.

    The server always derives this from the canonical content; a client-supplied
    quote is never treated as authority.
    """
    validate_span_bounds(content, start, end)
    return slice_by_code_points(content, start, end)


def extract_context(
    content: str, start: int, end: int, window: int = DEFAULT_CONTEXT_WINDOW
) -> tuple[str, str]:
    """Derive ``(prefix, suffix)`` anchoring metadata.

    ``prefix`` is the up-to-``window`` code points immediately before ``start``;
    ``suffix`` the up-to-``window`` code points immediately after ``end``.
    Both are clamped at the content edges.
    """
    validate_span_bounds(content, start, end)
    prefix_start = max(0, start - window)
    suffix_end = min(code_point_length(content), end + window)
    return (
        slice_by_code_points(content, prefix_start, start),
        slice_by_code_points(content, end, suffix_end),
    )


def validate_exact_text_match(
    content: str, start: int, end: int, exact_text: str
) -> None:
    """Verify ``content[start:end] == exact_text`` (code-point slicing).

    Raises ``VALIDATION_ERROR`` when the stored/claimed quote does not match
    the canonical content at the given offsets.
    """
    validate_span_bounds(content, start, end)
    actual = slice_by_code_points(content, start, end)
    if actual != exact_text:
        raise DomainError(
            "VALIDATION_ERROR",
            "exact_text does not match the canonical content at the given offsets",
            {"field": "exact_text"},
        )
