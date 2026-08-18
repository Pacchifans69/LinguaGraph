"""BCP-47 (RFC 5646) syntactic validation tests.

Contract: syntactic validation only; language_tag is data with no allow-list;
no claim of semantic validation against the IANA registry.
"""

import pytest

from app.api.errors import DomainError
from app.text.bcp47 import GRANDFATHERED_TAGS, validate_language_tag

# Tags that must be accepted (syntactically well formed).
VALID_TAGS: list[str] = [
    "en",
    "de",
    "fr",
    "es",  # primary languages, no fixed allow-list implied
    "en-GB",
    "de-CH",
    "fr-CA",
    "es-419",  # region: 2 alpha or 3 digits
    "zh-Hant",  # script
    "sr-Latn-RS",  # language-script-region
    "de-AT-1996",  # variant (DIGIT 3alphanum)
    "de-DE-1901",  # single variant
    "sl-rozaj-biske",  # multiple DISTINCT variants
    "en-US-u-co-phonebk",  # extension (u extension)
    "en-a-foo",  # extension with generic singleton
    "en-a-foo-x-bar",  # extension + private use
    "x-private",  # private use only
    "en-x-foo",
    "und",  # reserved "und" language
    "english",  # 7-alpha language subtag: syntactically valid, unregistered
    "EN",
    "En-GB",  # matching is case-insensitive
    "en-1234",  # variant: DIGIT 3alphanum
    "en-12345",  # variant: 5alphanum
    "en-x-a-x-b",  # private use; later "x" is an ordinary private-use subtag
    "i-klingon",  # grandfathered (irregular)
    "en-GB-oed",  # grandfathered (irregular)
    "art-lojban",  # grandfathered (regular)
    "zh-min-nan",  # grandfathered (regular)
    "no-bok",
]


@pytest.mark.parametrize("tag", VALID_TAGS)
def test_valid_tags_are_accepted(tag: str) -> None:
    assert validate_language_tag(tag) == tag


def test_grandfathered_set_is_populated() -> None:
    # Sanity: the frozen RFC 5646 grandfathered list is present.
    for tag in ("i-klingon", "en-gb-oed", "art-lojban", "zh-min-nan", "no-bok"):
        assert tag in GRANDFATHERED_TAGS


# Tags that must be rejected.
INVALID_TAGS: list[tuple[str, str]] = [
    ("", "empty"),
    ("e", "language subtag too short"),
    ("en-", "trailing hyphen"),
    ("-en", "leading hyphen"),
    ("en--GB", "empty subtag"),
    ("a", "singleton without extension"),
    ("x", "private use without subtag"),
    ("en-x", "private use without subtag"),
    ("en-1", "region must be 2 alpha or 3 digits"),
    ("en-12", "region must be 2 alpha or 3 digits"),
    ("en-12a", "3-char digit-prefixed subtag is not a variant/region"),
    ("123", "tag starting with digits"),
    ("en_US", "underscore separator is not BCP-47"),
    ("abcdefghi", "subtag longer than 8 characters"),
    ("en-abcdefghi", "variant longer than 8 characters"),
    ("en-a", "extension needs a 2-8 char subtag"),
    ("en-a-b", "extension subtag too short"),
    ("en-a-foo-a-bar", "duplicate extension singleton"),
    ("de-DE-1901-1901", "duplicate variant subtag"),
    ("sl-rozaj-ROZAJ", "duplicate variant subtag (case-insensitive)"),
]


@pytest.mark.parametrize(("tag", "_reason"), INVALID_TAGS)
def test_invalid_tags_are_rejected(tag: str, _reason: str) -> None:
    with pytest.raises(DomainError) as excinfo:
        validate_language_tag(tag)
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.details["field"] == "language_tag"


def test_error_does_not_leak_validation_into_semantic_claims() -> None:
    # A syntactically valid but unregistered tag is accepted: this validator
    # performs syntactic validation only (no IANA registry lookup).
    assert validate_language_tag("qaa") == "qaa"  # reserved-for-local-use range
    assert validate_language_tag("en-zz") == "en-zz"  # unregistered region


def test_non_string_input_is_rejected() -> None:
    with pytest.raises(DomainError):
        validate_language_tag(None)  # type: ignore[arg-type]
