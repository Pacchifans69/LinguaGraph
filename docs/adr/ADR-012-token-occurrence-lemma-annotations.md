# ADR-012: Token-occurrence lemma annotations

## Status

Accepted (frozen for M4)

## Context

M3 provides an exhaustive, Human-reviewed token partition with an authoritative
Boolean `is_word_like` per token and an exact persistent `Segment.id` per
occurrence. M4 adds the smallest useful lexical annotation on top of that
identity: a Human-authored lemma for one concrete token occurrence.

The alternatives all introduce authority the milestone does not need. A
cross-occurrence `Lexeme` entity would assert that two occurrences denote the
same lexical object — a claim M4 does not make and cannot verify. Storing lemma
on `segments` would turn the generic segmentation table into a linguistic
annotation bag shared by every granularity. A generic
`Annotation`/`AnnotationLayer`/EAV framework would be built for hypothetical
future POS, morphology, syntax, and dictionary features rather than for the
feature actually implemented. Storing lemma on Alignment `Span`,
`AlignmentMember`, or `AlignmentGroup` would conflate occurrence correspondence
with lexical metadata.

Retokenization is the other pressure. Token replacement deletes and recreates
every `Segment`; a lemma keyed to a deleted occurrence has no valid identity.
M4 must not guess whether an old lemma should move, copy, split, or vanish.

## Decision

M4 adds exactly one sparse occurrence-level table:

```text
token_lemma_annotations
  id                UUID PRIMARY KEY
  token_segment_id  UUID NOT NULL  FK segments(id) ON DELETE CASCADE
  lemma             TEXT NOT NULL
  created_at        timestamptz NOT NULL
  updated_at        timestamptz NOT NULL
  UNIQUE(token_segment_id)
```

- **Sparse occurrence-level annotation.** No row means "this token occurrence
  has no saved lemma". There is no lemma layer and no row per token.
- **Direct token `Segment.id` binding.** The annotation stores no
  `text_version_id`, token layer id, language tag, coordinates, `exact_text`,
  `is_word_like`, or sentence basis id. Those remain owned by the token
  hierarchy and are resolved server-side from `token_segment_id`; the client
  cannot supply competing target authority.
- **Eligibility is application-enforced.** A target is valid only when the
  `Segment` exists, its owning layer has `granularity = token`, and
  `is_word_like` is `TRUE`. Sentence segments and non-word-like tokens fail
  with `INVALID_LEMMA_TARGET`; missing targets fail with `NOT_FOUND`.
- **One authority per occurrence.** `UNIQUE(token_segment_id)` and the service
  behavior agree: `PUT` creates, updates, or logically no-ops. A logical no-op
  emits no UPDATE, so `updated_at` does not advance.
- **Value contract.** NUL and surrogate code points are rejected, the value is
  NFC-normalized, then validated as 1..200 Unicode code points with no leading
  or trailing Unicode whitespace. The service never trims, lowercases,
  case-folds, NFKC-normalizes, stems, or consults a dictionary. `Haus` stays
  `Haus`; `être` stays `être`.
- **No Lexeme, no generic annotation framework.** Two occurrences may carry
  equal lemma strings and remain independently annotated rows.
- **Alignment independence.** Lemma is never stored on `Span`,
  `AlignmentMember`, or `AlignmentGroup`. Lemma mutation does not touch
  Alignment rows, and Alignment mutation does not touch lemma rows.
- **Retokenization dependency blocking.** While any token of the current token
  layer carries a saved lemma, `PUT`/`DELETE` of that token segmentation fails
  with `409 SEGMENTATION_HAS_DEPENDENTS` (`dependency_type =
  "lemma_annotations"`). The Human workflow is: delete the dependent lemmas,
  then replace/delete tokens, then annotate the new tokens if desired. No
  `force`/`cascade`/`preserve`/`reanchor` option exists.
- **Forced TextVersion cascade.** The `ON DELETE CASCADE` FK plus the existing
  `force=true` TextVersion destruction path remove
  `TextVersion → SegmentationLayer → Segment → TokenLemmaAnnotation`
  atomically, with no M4-specific service change.
- **No automatic re-anchoring.** M4 performs no coordinate remapping,
  exact-text or fuzzy matching, lemma carry-forward, or token reconciliation.
- **Shared mutation root.** Lemma `PUT`/`DELETE` acquire the same
  `TextVersion` `SELECT ... FOR UPDATE` root lock that token segmentation
  replacement/deletion uses, then re-resolve and revalidate the exact token
  while holding it. A concurrent retokenization therefore either observes the
  dependent and fails closed, or wins first so the stale token id no longer
  resolves and the lemma mutation fails closed.

## Alternatives considered

- `segments.lemma` column: rejected — `segments` is a granularity-generic
  partition table, not a linguistic annotation object.
- Generic annotation/EAV framework: rejected — no second annotation kind
  exists in M4; the framework would be speculative.
- `Lexeme` / `VocabularyEntry` / `DictionaryEntry` / `LexicalIdentity`:
  rejected — cross-occurrence lexical identity is out of scope.
- Lemma on Alignment entities: rejected — Alignment is current-document
  occurrence correspondence, a different identity with a different lifecycle.
- Cascade or re-anchor lemma through retokenization: rejected — silent
  migration would destroy Human-reviewed annotation without consent.
- Add an NLP/lemmatizer/dictionary dependency: rejected — M4 adds no runtime
  dependency and no automatic lemmatization.

## Consequences

- Alembic HEAD advances from `0004` to `0005`.
- The workspace snapshot gains one flat `token_lemma_annotations` collection
  scoped through annotation → Segment → SegmentationLayer → TextVersion →
  document, with deterministic ordering.
- `INVALID_LEMMA_TARGET` (422) and `INVALID_LEMMA_VALUE` (422) join the stable
  error contract; `SEGMENTATION_HAS_DEPENDENTS` (409) now also covers lemma
  dependents.
- Retokenization requires explicit lemma cleanup, which is deliberate friction
  in exchange for never losing or silently moving Human annotation.
- POS, morphology, syntax, phrase/chunk annotation, subword tokenization,
  Lexeme identity, dictionary data, automatic lemmatization, translation,
  token-to-tray behavior, automatic alignment, connector-routing redesign, and
  HRA-F09 remain outside M4.
