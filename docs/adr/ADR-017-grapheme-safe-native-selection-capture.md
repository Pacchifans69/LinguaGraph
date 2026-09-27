# ADR-017: Grapheme-Safe Native Selection Capture

## Status

Accepted for the M9 implementation candidate

## Context

LinguaGraph persists and exposes canonical text coordinates as Unicode
code-point offsets (ADR-001). The existing native Selection/Range capture path
already rejects UTF-16 surrogate-pair splits and converts browser UTF-16
positions into canonical code-point offsets. A legal code-point boundary can
still lie inside one user-perceived extended grapheme cluster, including emoji
modifier sequences, ZWJ sequences, regional-indicator flags, and combining
sequences.

Changing persisted coordinates to grapheme indices would break established
Span/Alignment identity and historical data. Snapping a browser selection would
also rewrite user intent and make authoring direction-dependent.

## Decision

Grapheme validation applies only to **new native canonical TextPanel selection
capture**.

The complete canonical `TextVersion.content` is segmented in the frontend
with platform `Intl.Segmenter` using `granularity: "grapheme"`. Segmenter
UTF-16 indices are converted through the existing shared
`utf16OffsetToCodePointOffset` utility before they become boundary authority.
`language_tag` and rendered `[data-run]` boundaries are not grapheme
authority.

After the inherited DOM/root/hash/end-point validation resolves both native
endpoints to canonical code-point offsets, both offsets must be complete-
content grapheme boundaries. An internal grapheme endpoint fails closed as
`INVALID_GRAPHEME_BOUNDARY`. No snapping, expansion, shrinking, nearest-
boundary selection, or native Range rewrite is permitted.

If the required Segmenter capability is absent, throws, or returns malformed /
non-tiling / otherwise unusable output, capture fails closed as
`GRAPHEME_SEGMENTER_UNAVAILABLE`; there is no code-point-only fallback.

Every failed recapture clears stale `currentSelection` so a previous valid
selection cannot remain stageable. Already-staged pending tray members are not
cleared. Only the two M9-specific failures gain new bounded user feedback.

Persisted/API offsets remain Unicode code points. Reverse
`canonicalRangeToDomRange` remains code-point based, so historical
code-point-valid intra-grapheme ranges remain readable/renderable without
migration.

## Alternatives considered

- Persist grapheme indices: rejected because it changes the canonical
  coordinate system and requires migration.
- Snap invalid endpoints to nearby grapheme boundaries: rejected because it
  rewrites user intent.
- Treat rendered run boundaries as valid grapheme boundaries: rejected because
  historical persisted ranges may split a grapheme and rendering segmentation
  is not authoring authority.
- Use `language_tag` to choose boundary semantics: rejected because grapheme
  validity is derived from canonical content, not linguistic annotation.
- Add a Unicode grapheme package/polyfill: rejected because supported runtime
  `Intl.Segmenter` is the bounded platform capability and M9 adds no
  dependency.
- Apply grapheme restrictions to reverse rendering or Sentence/Token manual
  editing: rejected as scope expansion.

## Consequences

- New native TextPanel selection authoring cannot create grapheme-internal
  endpoints.
- Historical code-point-valid persisted ranges remain compatible.
- Capability failure is explicit and fail closed.
- Backend, API, PostgreSQL schema, Alembic `0006`, dependencies, runtime
  baseline, connector/rendering authority, and workflow configuration remain
  unchanged.
- Sentence/Token manual split, backend grapheme validation, document
  revision/re-anchoring, and full grapheme-aware editing remain deferred.
- M9 requires automated exact-candidate Gate 2 evidence followed by targeted
  Human Runtime Acceptance before any merge decision.
