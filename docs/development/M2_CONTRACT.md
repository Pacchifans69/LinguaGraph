# LinguaGraph M2 — Linguistic Segmentation Foundation

## Contract Status

**Status:** FROZEN — HUMAN APPROVED  
**Human freeze date:** 2026-09-05  
**Approved pre-freeze durable base:** `8ad87aaa789d86535adf3aed34035317c515b6e6`  
**Approved pre-freeze durable tree:** `f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`  
**Implementation authorization:** bounded M2 implementation only after a new implementation branch is created from the docs-only contract-freeze commit containing this file.  
**Planned implementation branch:** `m2-linguistic-segmentation-foundation`

This contract is the authoritative bounded execution contract for M2. It
inherits the accepted M0 architecture and the completed M1
presentation/interaction boundary. It does not silently reopen ADR-001 through
ADR-009.

---

## 1. Goal

M2 establishes the first persistent linguistic-segmentation layer above
canonical TextVersion content.

The first bounded vertical slice is sentence segmentation. Users can generate
a locale-sensitive sentence-boundary suggestion, review it, split or merge
adjacent segments, save one authoritative sentence-segmentation layer, reload
it, and delete it explicitly.

M2 prepares stable sentence units for later sentence-alignment and linguistic
annotation checkpoints. It does not perform automatic alignment or broader
linguistic analysis.

---

## 2. Terminology Boundary

The repository already contains
`apps/web/src/shared/text/segmentation.ts`. That module performs rendering
boundary segmentation:

```text
canonical content + persisted Alignment Spans
→ flat minimal DOM runs
```

Its output is a rendering structure. It is not a linguistic segmentation
layer and is not persistent domain authority.

M2 introduces these distinct terms:

- **SegmentationLayer** — one persisted, reviewed segmentation of one
  TextVersion at one granularity;
- **Segment** — one ordered canonical-text interval belonging to a
  SegmentationLayer;
- **sentence suggestion** — ephemeral boundaries proposed by a runtime
  segmenter before Human save;
- **render run** — the existing flat DOM unit derived for alignment rendering.

Implementation must not reuse Alignment `Span`, `AlignmentMember` or
`AlignmentGroup` as storage for linguistic segments. Existing render-run
segmentation may be adapted only where strictly necessary to preserve display
integration; its semantic role must remain rendering-only.

---

## 3. Frozen Inherited Primitives

### 3.1 Canonical text and coordinates

The following remain frozen:

- backend-authoritative TextVersion canonicalization;
- strict UTF-8 for file ingestion;
- one leading BOM stripped;
- CRLF/CR → LF;
- Unicode NFC;
- no whitespace collapse, whole-text trim, lowercasing, punctuation rewrite or
  NFKC;
- `content_hash` derived from canonical UTF-8 content;
- all persisted/API coordinates use Unicode code-point offsets;
- ranges are zero-based, start-inclusive and end-exclusive: `[start, end)`;
- JavaScript UTF-16 offsets are converted only through the existing shared
  offset utility;
- API never accepts JavaScript UTF-16 offsets.

### 3.2 Alignment layer

The following remain unchanged:

- arbitrary contiguous Alignment `Span`;
- symmetric N:M `AlignmentGroup`;
- `AlignmentMember`;
- AlignmentService invariants;
- atomic alignment create/update/delete;
- orphan Alignment Span cleanup;
- pending Alignment Tray remains frontend-only until Create Alignment.

A Segment is not an Alignment Span. Saving or deleting segmentation must not
create, delete or mutate AlignmentGroups, AlignmentMembers or Alignment Spans.

### 3.3 Frontend and rendering

The following remain frozen:

- TanStack Query owns persisted/server state;
- local reducer/state owns ephemeral workspace interaction;
- canonical content root remains a flat sequence of `[data-run]` elements;
- each run contains exactly one Text node;
- content-root `textContent` equals canonical TextVersion content exactly;
- no controls, labels, separators or duplicate text are inserted into the
  canonical content root;
- native drag selection remains valid;
- `RenderedSpanRegistry` remains the Alignment Span → DOM bridge;
- connector binding/activation semantics remain unchanged;
- HRA-F09 remains separately governed visual debt.

### 3.4 Runtime and persistence

- Python 3.13;
- Node.js 24;
- PostgreSQL 18;
- FastAPI → service → SQLAlchemy modular monolith;
- Alembic-only schema evolution;
- React / TypeScript / Vite;
- no SQLite substitution for integration proof.

---

## 4. Required Domain and Persistence Scope

M2 adds exactly two language-neutral relational entities.

### 4.1 SegmentationLayer

Required scalar fields:

```text
id
text_version_id
granularity
requested_locale
resolved_locale
origin
content_hash
created_at
updated_at
```

M2 accepted values:

```text
granularity: sentence
origin:       manual | intl_segmenter
```

Rules:

- one active layer per `(text_version_id, granularity)`;
- M2 accepts only `sentence`;
- `requested_locale` starts from the TextVersion BCP-47 `language_tag`;
- `resolved_locale` records the locale reported by the suggestion runtime;
- manual-only construction may use the validated TextVersion locale for both
  locale fields;
- `content_hash` must equal the current TextVersion `content_hash`;
- locale values must pass the project's existing syntactic language-tag
  boundary or implementation must STOP and report a concrete incompatibility.

### 4.2 Segment

Required scalar fields:

```text
id
segmentation_layer_id
ordinal
start_offset
end_offset
exact_text
created_at
```

Database-enforced constraints:

- foreign keys with cascade from TextVersion → SegmentationLayer → Segment;
- `ordinal >= 0`;
- `start_offset >= 0`;
- `end_offset > start_offset`;
- unique `(segmentation_layer_id, ordinal)`;
- unique `(segmentation_layer_id, start_offset, end_offset)`;
- indexed parent foreign keys;
- constrained accepted values for M2 granularity and origin.

Service-enforced invariants:

- Segment coordinates address the owning TextVersion;
- `0 <= start < end <= code_point_length(content)`;
- `exact_text == content[start:end]` by Unicode code point;
- the backend derives `exact_text`; the client never supplies it as
  authority;
- ordinals are consecutive from zero;
- non-empty content is partitioned completely: first start is zero, adjacent
  boundaries meet exactly, and final end equals canonical content length;
- no gap, overlap, duplicate interval or zero-length Segment;
- empty content has an empty Segment collection;
- the submitted `content_hash` is verified before any mutation;
- layer replacement and all child replacement occur in one transaction;
- any failure rolls back the complete replacement.

### 4.3 Migration

Create one new Alembic revision:

`0003_linguistic_segmentation_foundation.py`

Expected post-M2 Alembic head:

`0003`

Revision `0001` and `0002` must remain byte-for-byte unchanged. Upgrade and
downgrade must preserve the existing six-table M0 schema exactly outside the
new segmentation tables.

---

## 5. TextVersion Immutability and Deletion

M2 must add `ADR-010 — Persistent Linguistic Segmentation Layer`.

ADR-010 records:

- separation of linguistic segments from Alignment Spans;
- canonical code-point coordinate inheritance;
- complete-partition and atomic-replacement rules;
- segmentation as annotation state for TextVersion immutability;
- TextVersion destructive-deletion behavior;
- independent segmentation deletion.

Required behavior:

- a TextVersion with a persisted SegmentationLayer is annotated;
- any internal unannotated-content replacement path must reject content
  mutation while segmentation exists;
- default TextVersion deletion must report `TEXT_HAS_ANNOTATIONS` when
  segmentation or alignment annotation exists;
- existing `force=true` deletion may atomically cascade segmentation together
  with the already-governed alignment cleanup;
- deleting a SegmentationLayer requires explicit UI confirmation;
- deleting a SegmentationLayer does not delete or mutate alignment data;
- deleting alignment data does not delete segmentation.

ADR-001 through ADR-009 remain unchanged. ADR-010 is additive authority scoped
to M2.

---

## 6. API Contract

Add the following endpoints under `/api/v1`:

```text
PUT    /text-versions/{text_version_id}/segmentations/sentence
DELETE /text-versions/{text_version_id}/segmentations/sentence
```

### 6.1 Full replacement PUT

The request contains:

```text
content_hash
requested_locale
resolved_locale
origin
segments[{start, end}]
```

The PUT contract is full replacement:

1. load TextVersion;
2. verify current `content_hash`;
3. validate locale/granularity/origin;
4. validate and normalize ordered coordinates;
5. derive every `exact_text` from canonical content;
6. validate the complete partition;
7. replace the layer and children atomically;
8. return the authoritative persisted layer and segments.

Stable errors must distinguish at least:

- missing TextVersion;
- stale content hash;
- unsupported granularity;
- invalid locale;
- invalid range;
- invalid partition;
- request-body limit;
- unexpected internal failure without database-detail leakage.

The exact error-code names must be documented and tested. Stale content is a
conflict; malformed coordinates/partition are validation failures.

### 6.2 DELETE

- missing layer: `404 NOT_FOUND`;
- existing layer: explicit deletion, `204`;
- one transaction;
- no effect on Alignment entities.

### 6.3 Workspace read model

The document workspace snapshot gains two flat collections:

```text
segmentation_layers
segments
```

It remains fully materialized in one owned read transaction. Frontend
normalization must add lookup maps by layer and by TextVersion without
changing existing Alignment lookup semantics.

The API change is additive within `/api/v1`; existing field meanings must not
change.

---

## 7. Suggestion and Human Review

M2 may use the built-in ECMAScript Internationalization API:

```js
new Intl.Segmenter(locale, { granularity: "sentence" })
```

The suggestion adapter must:

- operate only on canonical server-returned content;
- request the TextVersion language tag;
- capture `resolvedOptions().locale`;
- treat returned indices as JavaScript UTF-16 code-unit positions;
- convert every index through the existing canonical UTF-16 ↔ code-point
  utility;
- verify that suggested slices concatenate to canonical content;
- fail closed if boundaries are invalid;
- keep suggestions ephemeral until explicit save.

Boundary output is locale- and implementation-sensitive. M2 does not claim
that Edge, Chrome and Node must independently produce byte-identical
suggestions for every language. The persisted, Human-approved coordinate
partition is authoritative after save.

If `Intl.Segmenter` is unavailable, the UI must expose a clear unsupported
suggestion state while retaining manual construction. M2 may not add a
polyfill or external segmentation package without contract review.

---

## 8. Frontend Product Scope

Add a bounded Segmentation panel outside the canonical content root.

Required behavior:

- display whether each TextVersion has a saved sentence layer;
- start manual construction as one full-content Segment for non-empty text;
- generate a locale-sensitive sentence suggestion;
- preview unsaved boundaries;
- split one Segment at a valid canonical code-point boundary;
- merge adjacent Segments;
- undo/discard unsaved preview by returning to the authoritative saved state;
- save the complete layer atomically;
- reload and reproduce the saved partition exactly;
- delete the layer through explicit confirmation;
- expose loading, empty, unsupported, validation, conflict and mutation-pending
  states using the M1 interaction vocabulary;
- prevent overlapping save/delete mutations.

No segmentation control may be inserted into the canonical text root.
Segmentation UI must remain usable at the accepted desktop viewports without
obscuring native text selection.

M2 does not add direct segment-to-Alignment-Tray staging or token snapping.
Those integrations require a later contract.

---

## 9. Dependency, Configuration and Workflow Boundary

M2 is expected to require no new package/runtime dependency.

Unless Human Review separately approves a contract amendment:

- `apps/api/pyproject.toml` must not change;
- `apps/api/uv.lock` must not change;
- `apps/web/package.json` must not change;
- `apps/web/package-lock.json` must not change;
- Python, Node and PostgreSQL baselines must not change;
- no ICU binding, NLP toolkit, language model, dictionary download or
  segmentation polyfill may be added.

Bounded verification configuration changes are required:

- canonical CI's Alembic-head assertion must change from `0002` to `0003`;
- local verification must expect `0003`;
- new M2 unit/integration/E2E tests must run in the canonical gates.

Changes to `.github/workflows/ci.yml` and `scripts/verify.ps1` are limited to
those requirements. Cache, matrix, deployment, release and provider
infrastructure redesign remain outside scope.

---

## 10. Allowed Change Surface

Expected implementation areas:

```text
apps/api/alembic/versions/0003_*.py
apps/api/app/db/models/
apps/api/app/services/
apps/api/app/schemas/
apps/api/app/api/routes/
apps/api/app/tests/
apps/web/src/features/segmentation/
apps/web/src/features/workspace/
apps/web/src/shared/text/
apps/web/e2e/
docs/adr/ADR-010-*.md
docs/api/api-contract.md
docs/architecture/ARCHITECTURE.md
docs/testing/
docs/development/
AGENTS.md
README.md
.github/workflows/ci.yml        # bounded 0003/test update only
scripts/verify.ps1              # bounded 0003/test update only
```

Any change outside these areas must have a direct documented M2 necessity.
Unrelated cleanup is prohibited.

---

## 11. Explicit Non-Goals

M2 v1 contains no implementation of:

- word segmentation;
- lexical tokenization;
- subword/model tokenization;
- token-boundary snapping;
- direct segment-to-tray staging;
- grapheme-cluster editing;
- lemma, POS, morphology or dependency annotation;
- candidate alignments;
- automatic sentence alignment;
- machine-assisted alignment;
- NLP or LLM providers;
- translation;
- linguistic-relation ontology;
- graph/vector/search infrastructure;
- authentication or collaboration;
- pagination or virtualization;
- free-form/resizable/dockable workspace layout;
- connector routing redesign;
- HRA-F09 remediation.

---

## 12. Testing Obligations

### 12.1 Complete inherited regression

At Gate 2 execute at minimum:

Backend:

```text
uv sync --frozen
Alembic empty → 0003
alembic current
alembic check
full pytest against real PostgreSQL 18
zero skipped-test guard
```

Frontend:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
Playwright golden path
Playwright Unicode release blocker
new M2 segmentation E2E
```

No existing test may be weakened, skipped, filtered or deleted to accommodate
M2.

### 12.2 Backend coverage

Required coverage includes:

- `0003` empty → HEAD and downgrade/upgrade cycles;
- database constraints and cascade behavior;
- manual and Intl-origin layers;
- complete/non-empty partition;
- empty-content layer;
- gap, overlap, duplicate, non-consecutive ordinal and out-of-range rejection;
- backend-derived Unicode `exact_text`;
- stale `content_hash` conflict;
- atomic full replacement rollback;
- independent segmentation deletion;
- TextVersion default/force deletion with segmentation;
- workspace flat read model;
- transaction-clean service boundaries;
- stable error envelopes without database leakage.

### 12.3 Frontend coverage

Required coverage includes:

- UTF-16 suggestion indices converted to code-point offsets;
- astral-plane emoji;
- NFC and combining-mark input through canonical server content;
- CJK and multilingual punctuation;
- suggestion tiling integrity;
- manual initialization;
- split and adjacent merge invariants;
- discard/save/delete lifecycle;
- stale-content and unsupported-runtime presentation;
- workspace normalization;
- canonical content DOM integrity;
- native drag selection;
- Alignment Tray, keyboard, alignment hover/active and connector regression.

Actual `Intl.Segmenter` tests must avoid claiming universal linguistic
correctness from a small fixture set. Adapter mechanics and persisted
coordinates must be deterministic; locale-sensitive output differences must
be recorded where observed.

### 12.4 Playwright

Add an integrated M2 path covering:

```text
create/import TextVersion
→ generate or manually construct sentence segmentation
→ split/merge
→ save
→ reload
→ exact persisted partition
→ delete with confirmation
→ reload
```

The existing golden path and Unicode release blocker remain mandatory.

---

## 13. Human Runtime Acceptance

M2 requires a fresh Human Runtime Acceptance pass in Microsoft Edge and Google
Chrome at:

```text
1280 × 720
1440 × 900
```

Acceptance covers:

- manual segmentation construction;
- locale-sensitive suggestion and resolved-locale display;
- preview/discard;
- split/merge;
- save/reload/delete;
- clear unsaved, pending, error and confirmation states;
- canonical text remains selectable;
- existing Alignment workflow remains usable;
- Unicode/emoji boundaries remain correct;
- no content-root control insertion or duplicated canonical text;
- existing connector binding remains correct;
- HRA-F09 is recorded without incidental redesign.

Human acceptance supplements automated proof and does not replace it.

---

## 14. Acceptance Criteria

M2 passes only when all conditions hold:

1. SegmentationLayer and Segment are independent from Alignment entities.
2. Alembic HEAD is `0003`; `0001` and `0002` are unchanged.
3. One authoritative sentence layer per TextVersion is persisted.
4. Saved Segments form an exact complete canonical-text partition.
5. All API/persisted coordinates remain Unicode code-point offsets.
6. Backend derives and verifies exact text.
7. Replacement is atomic and stale-content-safe.
8. Segmentation deletion has no Alignment side effect.
9. TextVersion annotation/deletion semantics include segmentation.
10. Workspace snapshot and frontend normalization remain authoritative.
11. Suggestions remain ephemeral until explicit Human save.
12. Manual construction works without `Intl.Segmenter`.
13. Canonical DOM and native selection invariants remain exact.
14. Existing Alignment creation, persistence and visualization regressions pass.
15. No dependency/runtime drift occurs.
16. Full real-PostgreSQL, frontend, build and Playwright gates pass.
17. Unicode release blocker passes.
18. Human Runtime Acceptance passes.
19. No M2 non-goal is implemented.
20. `G2-X01` remains represented accurately until independently resolved.

---

## 15. Gate 2 / External Infrastructure Rule

The M0.7 and M1 External Infrastructure Exceptions were
checkpoint-specific. Neither applies automatically to M2.

Preferred M2 proof:

- canonical GitHub Actions workflow;
- exact frozen candidate SHA/tree;
- hosted Linux;
- Python 3.13;
- Node 24;
- PostgreSQL 18;
- all semantic and integrity gates.

If GitHub-hosted execution fails before workflow steps begin:

1. do not call GitHub Actions PASS;
2. verify that no application/test command executed;
3. preserve exact run/job/step evidence;
4. STOP Gate 2;
5. present evidence for Human Review;
6. obtain a fresh explicit M2 External Infrastructure Exception before
   creating or using independent hosted proof.

Historical M0.7/M1 CircleCI runs prove only their recorded candidates.

---

## 16. Evidence and Provenance

Gate 2 evidence must bind:

- implementation base;
- final candidate SHA and tree;
- changed-file scope;
- migration head;
- runtime versions;
- every executed command and exit result;
- real-PostgreSQL execution and zero skips;
- Playwright paths;
- post-run tracked-tree integrity;
- external-provider evidence if separately authorized.

No PR or merge may precede Gate 2, Static Human Diff Review, Human Runtime
Acceptance and explicit Human PR/merge authorization.

---

## 17. Risks and Controls

### R1 — Render segmentation and linguistic segmentation are conflated

**Control:** separate domain names, persistence and tests; existing render-run
module remains rendering-only.

### R2 — UTF-16 indices leak into persisted data

**Control:** single shared conversion utility plus astral-plane release tests.

### R3 — Runtime sentence output varies by locale/engine

**Control:** suggestions are ephemeral; requested/resolved locale and origin
are recorded; saved coordinates become Human-approved authority.

### R4 — Invalid cross-row partitions reach persistence

**Control:** complete service validation and one atomic replacement
transaction, backed by local database constraints.

### R5 — Segmentation silently changes TextVersion deletion

**Control:** ADR-010, default annotation block, explicit force flow and Human
confirmation.

### R6 — New UI corrupts canonical DOM/native selection

**Control:** controls remain outside the content root; complete M0/M1 DOM and
selection regression.

### R7 — Migration proof or CI still assumes 0002

**Control:** bounded canonical-workflow and local-verifier head updates with
explicit `0003` assertions.

### R8 — Scope expands into tokenization or automatic alignment

**Control:** sentence-only granularity and explicit STOP conditions.

---

## 18. STOP Conditions

Implementation must stop and report if any of the following becomes necessary:

- reuse of Alignment Span as Segment storage;
- modification of ADR-001 through ADR-009;
- byte, UTF-16 or grapheme-cluster persisted offsets;
- partial/gapped/overlapping persisted sentence layers;
- client-authoritative `exact_text`;
- non-atomic layer replacement;
- new runtime/package dependency;
- external ICU/NLP/model/dictionary/polyfill dependency;
- word/token/subword segmentation;
- direct segment-to-tray snapping/staging;
- candidate or automatic alignment;
- canonical text DOM invariant change;
- RenderedSpanRegistry semantic change;
- connector routing redesign;
- runtime-baseline change;
- API version break;
- weakening/removal/skip of an existing test;
- mutation/deletion of retained M0.7/M1 proof or diagnostic evidence;
- automatic reuse of a prior External Infrastructure Exception;
- change outside the allowed surface without a direct M2 necessity.

---

## 19. Execution Sequence

After this docs-only freeze commit is verified:

1. create `m2-linguistic-segmentation-foundation` from the exact freeze
   commit;
2. implement ADR-010 and migration `0003`;
3. implement backend model/service/API/read-model behavior;
4. implement frontend suggestion adapter and Segmentation panel;
5. add unit/integration/E2E coverage;
6. update bounded verification head assertions;
7. update as-built documentation;
8. freeze one exact candidate;
9. run Gate 2;
10. conduct Static Human Diff Review;
11. conduct Human Runtime Acceptance;
12. request explicit PR authorization;
13. request explicit merge authorization;
14. perform Gate 3 and durable-state closure.

---

## 20. Contract Exit State

Successful M2 completion establishes:

```text
M0 manual Alignment core              preserved
M1 presentation/interaction layer     preserved
persistent sentence layer             introduced
Human-reviewed sentence partitions    stable
schema                                 0003
word/token layer                       not introduced
candidate alignment                    not introduced
automatic sentence alignment          not introduced
G2-X01                                 independently governed
```
