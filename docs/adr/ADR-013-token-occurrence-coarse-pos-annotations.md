# ADR-013: Token-occurrence coarse POS annotations

## Status

Accepted (frozen for M5)

## Context

M3 provides an exhaustive, Human-reviewed token partition with an authoritative
Boolean `is_word_like` per token and an exact persistent `Segment.id` per
occurrence. M4 added one sparse occurrence-level lemma annotation on that
identity. M5 adds the second, independent occurrence-level linguistic
annotation: one Human-selected coarse part-of-speech value for one concrete
saved token occurrence.

The existence of a second annotation type is not authorization for generic
ontology work. A generic `Annotation`/`AnnotationType`/`AnnotationLayer`/EAV
framework would be built for hypothetical future morphology, syntax, and
dictionary features rather than for the feature actually implemented, and would
make every current query indirect. A combined nullable lemma+POS
`token_annotations` row would fuse two independent Human workflows into one
lifecycle. Storing POS on `segments` would turn the granularity-generic
partition table into a linguistic annotation bag. A `Lexeme`/shared-vocabulary
entity would assert cross-occurrence lexical identity that M5 neither needs nor
can verify. Storing POS on Alignment `Span`, `AlignmentMember`, or
`AlignmentGroup` would conflate occurrence correspondence with lexical
metadata.

Retokenization is again the pressure. Token replacement deletes and recreates
every `Segment`; a POS value keyed to a deleted occurrence has no valid
identity. M5 must not guess whether an old POS value should move, copy, split,
or vanish.

## Decision

M5 adds exactly one sparse occurrence-level table, the sibling of
`token_lemma_annotations`:

```text
token_pos_annotations
  id                UUID PRIMARY KEY
  token_segment_id  UUID NOT NULL  FK segments(id) ON DELETE CASCADE
  pos_tag           VARCHAR(5) NOT NULL
  created_at        timestamptz NOT NULL
  updated_at        timestamptz NOT NULL
  UNIQUE(token_segment_id)
  CHECK pos_tag IN ('ADJ','ADP','ADV','AUX','CCONJ','DET','INTJ','NOUN',
                    'NUM','PART','PRON','PROPN','SCONJ','VERB','X')
```

- **Sparse typed occurrence-level annotation.** No row means "this token
  occurrence has no saved coarse POS". There is no POS layer, no row per token,
  and no generic attribute/value storage.
- **Direct token `Segment.id` binding.** The annotation stores no
  `text_version_id`, token layer id, language tag, coordinates, `exact_text`,
  `is_word_like`, sentence basis id, or lemma. Those remain owned by the token
  hierarchy and are resolved server-side from `token_segment_id`; the client
  cannot supply competing target authority.
- **Eligibility is application-enforced and never recomputed.** A target is
  valid only when the `Segment` exists, its owning layer has
  `granularity = token`, and the persisted `is_word_like` is `TRUE`. Sentence
  segments and non-word-like tokens fail with `INVALID_POS_TARGET`; missing or
  replaced targets fail with `NOT_FOUND`. M5 never reinterprets, recomputes, or
  overrides the M3 Human classification.
- **Closed fifteen-value coarse vocabulary.** Exactly `ADJ`, `ADP`, `ADV`,
  `AUX`, `CCONJ`, `DET`, `INTJ`, `NOUN`, `NUM`, `PART`, `PRON`, `PROPN`,
  `SCONJ`, `VERB`, `X`. Values are exact and case-sensitive: the service
  performs no trim, upper/lowercasing, case folding, alias mapping,
  language-specific rewriting, or XPOS conversion, so `"NOUN"` is valid while
  `"noun"`, `" NOUN"`, `"NOUN "`, `"PUNCT"`, `"SYM"`, `"NN"` and `"CUSTOM"` are
  `INVALID_POS_VALUE`.
- **Universal Dependencies v2 provenance, without a conformance claim.** The
  fifteen labels correspond to UD v2 UPOS categories as *design provenance*
  only. `PUNCT` and `SYM` are deliberately excluded because M5's target set is
  the Human-reviewed `is_word_like = TRUE` subset. M5 therefore does not claim
  complete UD annotation conformance, and no UD runtime, parser, tagger, or
  dataset is a dependency or schema authority.
- **Boundary/domain error separation.** The request schema types `pos_tag` as a
  plain `str` with `extra="forbid"`, deliberately not a `Literal`/enum of the
  fifteen values. An unknown or malformed *string* is a domain
  `INVALID_POS_VALUE` (422); a *non-string* JSON value or an extra field remains
  a Pydantic/HTTP `VALIDATION_ERROR` (422).
- **One authority per occurrence.** `UNIQUE(token_segment_id)` and the service
  behavior agree: `PUT` creates, updates, or logically no-ops. A logical no-op
  emits no UPDATE, so `updated_at` does not advance. Concurrent `PUT`s to one
  token serialize on the shared root lock, so no unique/integrity failure
  leaks and the final value is the last serialized write.
- **Lemma/POS sibling independence.** `TokenPosAnnotation` and
  `TokenLemmaAnnotation` share no foreign key and no lifecycle. All four states
  are valid: neither, lemma only, POS only, lemma + POS. Deleting one sibling
  preserves the other. M5 performs no lemma→POS or POS→lemma derivation, and
  equal lemma strings or equal POS values imply no shared lexical identity.
- **No Lexeme, no generic annotation framework.** Two occurrences may carry
  equal POS values and remain independently annotated rows.
- **Alignment independence.** POS is never stored on `Span`,
  `AlignmentMember`, or `AlignmentGroup`. POS mutation does not touch Alignment
  rows, and Alignment mutation does not touch POS rows. The retained Alignment
  concurrency debt is not addressed here.
- **Shared TextVersion-root lock ordering.** POS `PUT`/`DELETE` acquire the same
  `TextVersion` `SELECT ... FOR UPDATE` root lock that token segmentation
  replacement/deletion and lemma mutation use, then re-resolve and revalidate
  the exact token while holding it. A concurrent retokenization therefore either
  observes the dependent and fails closed, or wins first so the stale token id
  no longer resolves and the POS mutation fails closed. No second lock ordering
  and no general concurrency redesign is introduced.
- **Multi-dependent retokenization blocking.** While any token of the current
  token layer carries a saved lemma and/or a saved POS annotation, `PUT`/`DELETE`
  of that token segmentation fails with `409 SEGMENTATION_HAS_DEPENDENTS`.
  `details.dependency_types` is the complete set in canonical order
  (`lemma_annotations`, `pos_annotations`); the legacy scalar
  `details.dependency_type` is emitted only when the complete set has exactly
  one member, so a multi-dependent conflict never implies a primary dependency.
  Deleting one sibling does not unblock the parent while the other remains. No
  `force`/`cascade`/`preserve`/`reanchor` option exists.
- **Forced TextVersion cascade.** The `ON DELETE CASCADE` FK plus the existing
  `force=true` TextVersion destruction path remove
  `TextVersion → SegmentationLayer → Segment → TokenPosAnnotation` atomically,
  with no M5-specific service change and no new `force_pos`/`cascade_pos`
  parameter.
- **No automatic re-anchoring.** M5 performs no coordinate remapping,
  exact-text or fuzzy matching, POS copying or inference, lemma-based matching,
  or token reconciliation.

## Alternatives considered

- `segments.pos` column: rejected — `segments` is a granularity-generic
  partition table, not a linguistic annotation object, and sentence segments
  must never carry a POS value.
- Combined lemma/POS `token_annotations` row: rejected — the two annotations
  have independent Human lifecycles; fusing them would make deleting one
  sibling require touching the other's row.
- Generic annotation/EAV framework or `AnnotationType`/`AnnotationLayer`:
  rejected — two concrete annotation types do not justify a speculative
  ontology, and M5 remains a bounded occurrence-level feature.
- `Lexeme` / `VocabularyEntry` / `DictionaryEntry` / `Sense` / `LexicalIdentity`:
  rejected — cross-occurrence lexical identity is out of scope.
- POS on Alignment entities: rejected — Alignment is current-document
  occurrence correspondence, a different identity with a different lifecycle.
- `PUNCT`/`SYM` in the vocabulary: rejected — M5 annotates only Human-reviewed
  word-like tokens and makes no complete-UD-conformance claim.
- Cascade or re-anchor POS through retokenization: rejected — silent migration
  would destroy Human-reviewed annotation without consent.
- Add a POS tagger, NLP toolkit, UD parser, LLM SDK, or frontend state library:
  rejected — M5 adds no runtime dependency and no automatic POS tagging.

## Consequences

- Alembic HEAD advances from `0005` to `0006`; revisions `0001`–`0005` remain
  byte-for-byte unchanged and the M5 downgrade removes only POS schema/data.
- The workspace snapshot gains one flat `token_pos_annotations` collection
  scoped through annotation → Segment → SegmentationLayer → TextVersion →
  document, with deterministic ordering.
- `INVALID_POS_TARGET` (422) and `INVALID_POS_VALUE` (422) join the stable error
  contract; `SEGMENTATION_HAS_DEPENDENTS` (409) now reports the complete
  occurrence-annotation dependent set.
- Retokenization requires explicit lemma **and** POS cleanup, which is
  deliberate friction in exchange for never losing or silently moving Human
  annotation.
- `PUNCT`/`SYM` annotation, complete UD conformance, XPOS, morphology,
  dependency/constituency syntax, phrase/chunk annotation, automatic POS
  tagging or suggestions, Lexeme/vocabulary/dictionary identity, generic
  annotation ontology, translation, token-to-Alignment-Tray staging, automatic
  alignment, Alignment concurrency redesign, connector-routing redesign, and
  HRA-F09 remediation remain outside M5.
