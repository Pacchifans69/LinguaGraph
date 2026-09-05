# ADR-010: Persistent linguistic segmentation layer

## Status

Accepted (frozen for M2)

## Context

LinguaGraph needs stable sentence units before later sentence-alignment and
linguistic-annotation work. Existing Alignment `Span` objects represent
arbitrary textual occurrences participating in correspondence hyperedges.
The frontend module `shared/text/segmentation.ts` divides canonical text into
render runs for overlapping alignment display. Neither is an authoritative
linguistic segmentation.

Sentence suggestions from `Intl.Segmenter` are locale- and
implementation-sensitive and use JavaScript UTF-16 indices. Persisting those
indices or treating runtime output as permanent authority would violate the
existing canonical-text coordinate contract.

## Decision

M2 introduces independent relational `SegmentationLayer` and `Segment`
entities.

- A TextVersion has at most one active layer per granularity; M2 accepts only
  `sentence`.
- Segment ranges use inherited Unicode code-point offsets over canonical NFC
  TextVersion content.
- A saved non-empty layer is an ordered, gap-free, overlap-free complete
  partition. Empty content has no Segment rows.
- The backend validates the submitted content hash, derives every
  `exact_text`, and replaces the layer and all children atomically.
- `requested_locale`, runtime `resolved_locale`, and
  `manual | intl_segmenter` origin are retained as provenance.
- `Intl.Segmenter` output is an ephemeral suggestion until explicit Human
  save. UTF-16 indices are converted through the shared offset utility.
- Persisted segmentation counts as annotation state. Normal TextVersion
  deletion is blocked; the existing explicit `force=true` flow may cascade
  segmentation in the same transaction.
- Explicit segmentation deletion removes only that layer and its segments. It
  never creates, deletes, or mutates Alignment Spans, Members, or Groups.

## Alternatives considered

- Reuse Alignment Spans as sentences: rejected because occurrence alignment and
  complete linguistic partition have different identity and lifecycle rules.
- Persist render runs: rejected because they are derived display structure and
  may change with Alignment annotations.
- Persist JavaScript UTF-16 indices: rejected because API/database coordinates
  are Unicode code points.
- Add a segmentation library or polyfill: rejected for M2; the built-in runtime
  suggestion is optional and manual construction must remain available.
- Save partial boundaries: rejected because gaps and overlaps would make the
  layer unreliable for later work.

## Consequences

- Alembic HEAD advances from `0002` to `0003`.
- Workspace snapshots gain flat segmentation layer and segment collections.
- TextVersion immutability/deletion checks include segmentation.
- Suggestions can vary across browsers, while saved Human-reviewed code-point
  coordinates reload exactly.
- Word/token segmentation, direct tray staging, automatic alignment, and
  broader linguistic annotation remain future contract decisions.
