# ADR-011: Sentence-bound token segmentation

## Status

Accepted (frozen for M3)

## Context

The M2 sentence layer provides stable Human-reviewed linguistic units, but
later lexical annotation requires an exhaustive token occurrence layer. A
token partition cannot be inferred safely from Alignment Spans or render runs,
and locale-sensitive `Intl.Segmenter` output varies by runtime and reports
JavaScript UTF-16 indices.

## Decision

M3 extends the generic `SegmentationLayer` / `Segment` model with one `token`
granularity.

- Every token layer stores `basis_layer_id`, the exact current sentence layer
  for the same TextVersion and content hash.
- Tokens form a complete Unicode code-point partition and every saved sentence
  boundary is also a token boundary.
- Every token Segment stores a required Human-reviewed Boolean
  `is_word_like`; sentence Segments keep that field null.
- Word-mode `Intl.Segmenter` runs independently inside each sentence. Its
  sentence-local UTF-16 indices are converted to global code-point offsets by
  the existing shared utility. Output remains ephemeral until explicit save.
- Replacing or deleting a sentence layer with a token dependent fails with
  `SEGMENTATION_HAS_DEPENDENTS`; the user explicitly deletes tokens first.
  Forced TextVersion deletion retains its existing atomic cascade semantics.
- Token replacement is atomic, stale-content and stale-basis guarded, and
  derives `exact_text` on the backend.
- Alignment Spans, groups, rendering, selection, tray behavior, and connector
  routing remain independent and unchanged.

## Alternatives considered

- Separate `word` and `token` layers: rejected because they would create
  competing authorities. Word-like status is metadata on one exhaustive token
  partition.
- Store tokens as Alignment Spans or render runs: rejected because those have
  different identities and lifecycles.
- Permit tokens without saved sentences: rejected because exact basis identity
  and sentence-boundary refinement are M3 invariants.
- Cascade token deletion during ordinary sentence mutation: rejected because
  it would silently destroy Human-reviewed annotation.
- Add a tokenizer/polyfill: rejected; M3 adds no dependency and manual review
  remains available.

## Consequences

- Alembic HEAD advances from `0003` to `0004`.
- Workspace layer/segment arrays gain nullable `basis_layer_id` and
  `is_word_like` fields.
- Sentence mutation can now return a stable dependency conflict.
- Clients can inspect punctuation and whitespace tokens without making them a
  second copy of canonical text.
- Lemma, POS, morphology, syntax, token-to-tray behavior, automatic alignment,
  and HRA-F09 routing remain outside M3.
