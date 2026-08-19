"""BCP-47 (RFC 5646) syntactic validation for ``language_tag``.

``language_tag`` is data: there is NO fixed allow-list of supported languages
(the system must accept any language without a schema migration). This module
validates the RFC 5646 *syntax* — subtag positions, lengths, character sets,
extension singleton uniqueness, private-use shape, and the grandfathered set.

It deliberately does NOT claim semantic validation: it does not check the
IANA Language Subtag Registry, so an unregistered but syntactically well
formed tag (e.g. ``english`` as a 7-letter language subtag) is accepted.
Matching is case-insensitive, as required by RFC 5646; the caller's original
spelling is preserved.
"""

from __future__ import annotations

from app.api.errors import DomainError

# Grandfathered tags enumerated in RFC 5646 section 2.2.9. They are exempt
# from the regular langtag grammar. The set is frozen by the RFC; these are
# matched case-insensitively (RFC 5646 tags are case-insensitive).
GRANDFATHERED_TAGS: frozenset[str] = frozenset(
    {
        # Irregular grandfathered tags.
        "en-gb-oed",
        "i-ami",
        "i-bnn",
        "i-default",
        "i-enochian",
        "i-hak",
        "i-klingon",
        "i-lux",
        "i-mingo",
        "i-navajo",
        "i-pwn",
        "i-tao",
        "i-tay",
        "i-tsu",
        "sgn-be-fr",
        "sgn-be-nl",
        "sgn-ch-de",
        # Regular grandfathered tags.
        "art-lojban",
        "cel-gaulish",
        "no-bok",
        "no-nyn",
        "zh-guoyu",
        "zh-hakka",
        "zh-min",
        "zh-min-nan",
        "zh-xiang",
    }
)

# Defensive upper bound aligned with the storage column (String(100)); real
# tags are far shorter (RFC 5646 suggests processors accept up to 35 chars).
_MAX_TAG_LENGTH = 100


def _is_ascii_alpha(value: str) -> bool:
    return value.isascii() and value.isalpha()


def _is_ascii_alnum(value: str) -> bool:
    return value.isascii() and value.isalnum()


def _is_variant_subtag(value: str) -> bool:
    """RFC 5646 variant: 5*8alphanum or (DIGIT 3alphanum)."""
    if 5 <= len(value) <= 8 and _is_ascii_alnum(value):
        return True
    return len(value) == 4 and value[0].isdigit() and _is_ascii_alnum(value[1:])


def _is_extension_subtag(value: str) -> bool:
    """RFC 5646 extension subtag: 2*8alphanum."""
    return 2 <= len(value) <= 8 and _is_ascii_alnum(value)


def _is_private_use_subtag(value: str) -> bool:
    """RFC 5646 private-use subtag: 1*8alphanum."""
    return 1 <= len(value) <= 8 and _is_ascii_alnum(value)


def _invalid(tag: str, reason: str) -> DomainError:
    return DomainError(
        "VALIDATION_ERROR",
        "invalid BCP-47 language tag",
        {"field": "language_tag", "language_tag": tag, "reason": reason},
    )


def validate_language_tag(tag: str) -> str:
    """Return ``tag`` unchanged when it is syntactically valid BCP-47.

    Raises ``DomainError(VALIDATION_ERROR)`` otherwise. Pure syntactic check:
    no IANA registry lookup, no allow-list.
    """
    if not isinstance(tag, str) or not tag:
        raise _invalid(tag, "tag is empty")
    if len(tag) > _MAX_TAG_LENGTH:
        raise _invalid(tag, "tag exceeds maximum length")

    lower = tag.lower()

    # Grandfathered tags bypass the regular grammar.
    if lower in GRANDFATHERED_TAGS:
        return tag

    subtags = lower.split("-")
    if any(part == "" for part in subtags):
        raise _invalid(tag, "empty subtag")

    # Private use only: "x" 1*("-" 1*8alphanum).
    if subtags[0] == "x":
        if len(subtags) < 2 or not all(_is_private_use_subtag(p) for p in subtags[1:]):
            raise _invalid(tag, "malformed private-use section")
        return tag

    pos = 0

    # language = 2*3ALPHA ["-" extlang] / 4ALPHA / 5*8ALPHA
    language = subtags[pos]
    if not (2 <= len(language) <= 8) or not _is_ascii_alpha(language):
        raise _invalid(tag, "invalid language subtag")
    pos += 1

    # extlang = 3ALPHA *2("-" 3ALPHA) — only after a 2-3 alpha language.
    if len(language) <= 3:
        extlang_count = 0
        while (
            pos < len(subtags)
            and extlang_count < 3
            and len(subtags[pos]) == 3
            and _is_ascii_alpha(subtags[pos])
        ):
            pos += 1
            extlang_count += 1

    # script = 4ALPHA
    if pos < len(subtags) and len(subtags[pos]) == 4 and _is_ascii_alpha(subtags[pos]):
        pos += 1

    # region = 2ALPHA / 3DIGIT
    if pos < len(subtags):
        part = subtags[pos]
        if (len(part) == 2 and _is_ascii_alpha(part)) or (
            len(part) == 3 and part.isdigit()
        ):
            pos += 1

    # *("-" variant); RFC 5646: the same variant subtag MUST NOT be used more
    # than once in one tag (subtags are lowercased above, so this check is
    # inherently case-insensitive).
    variants_seen: set[str] = set()
    while pos < len(subtags) and _is_variant_subtag(subtags[pos]):
        variant = subtags[pos]
        if variant in variants_seen:
            raise _invalid(tag, f"duplicate variant subtag '{variant}'")
        variants_seen.add(variant)
        pos += 1

    # *("-" extension); each extension singleton must be unique.
    singletons: set[str] = set()
    while pos < len(subtags) and len(subtags[pos]) == 1 and _is_ascii_alnum(
        subtags[pos]
    ) and subtags[pos] != "x":
        singleton = subtags[pos]
        if singleton in singletons:
            raise _invalid(tag, f"duplicate extension singleton '{singleton}'")
        singletons.add(singleton)
        pos += 1
        if pos >= len(subtags) or not _is_extension_subtag(subtags[pos]):
            raise _invalid(tag, "extension must have at least one 2-8 character subtag")
        pos += 1
        while pos < len(subtags) and _is_extension_subtag(subtags[pos]):
            pos += 1

    # ["-" privateuse]
    if pos < len(subtags):
        if subtags[pos] != "x" or pos + 1 >= len(subtags):
            raise _invalid(tag, "malformed private-use section")
        pos += 1
        if not all(_is_private_use_subtag(p) for p in subtags[pos:]):
            raise _invalid(tag, "malformed private-use section")
        pos = len(subtags)

    if pos != len(subtags):
        raise _invalid(tag, "unexpected subtag")

    return tag
