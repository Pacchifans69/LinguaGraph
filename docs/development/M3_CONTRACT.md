# LinguaGraph M3 — Human-Reviewed Word/Token Segmentation Foundation

## Contract Status

**Status:** FROZEN — HUMAN APPROVED  
**Human freeze date:** 2026-09-07  
**Approved pre-freeze durable base:** `f0d205fea996a5027d469255987c63b7ade17b51`  
**Approved pre-freeze durable tree:** `ae01d94f3e9d3e75bcff39dc4ba1b9795da231a6`  
**Implementation authorization:** NOT GRANTED by this freeze. Bounded M3 implementation may begin only after the docs-only freeze commit is verified and the Human separately authorizes creation of the implementation branch.  
**Planned implementation branch:** `m3-word-token-segmentation-foundation`

This contract is the authoritative bounded execution contract for M3. It
inherits the accepted M0 architecture, the completed M1 interaction boundary,
and the completed M2 persistent sentence-segmentation layer. It does not
silently reopen ADR-001 through ADR-010.

---

## 1. Goal

M3 extends the persistent linguistic-segmentation layer with one
Human-reviewed word/token partition for each eligible TextVersion.

The bounded workflow is:

```text
saved sentence layer
→ generate or manually construct token draft
→ review token boundaries and word-like classification
→ split / merge / classify
→ save authoritative token layer
→ reload exact partition
→ delete explicitly
```

M3 prepares stable token occurrences for later lexical annotation. It does not
implement lemma, POS, morphology, syntax, dictionary integration, automatic
alignment, or token-to-tray behavior.

---

## 2. Terminology Boundary

- **sentence layer** — the authoritative M2 `SegmentationLayer` whose
  `granularity` is `sentence`;
- **token layer** — one authoritative complete partition whose `granularity`
  is `token`;
- **token** — every interval in the partition, including lexical-looking text,
  punctuation, and whitespace;
- **word-like token** — a token whose Human-reviewed `is_word_like` value is
  `true`;
- **separator token** — a token whose Human-reviewed `is_word_like` value is
  `false`;
- **token suggestion** — ephemeral locale-sensitive runtime output;
- **Alignment Span** — the existing arbitrary occurrence used by Alignment;
- **render run** — the existing derived flat DOM rendering unit.

`word` is not introduced as a second independent granularity. Word-like
status is reviewed metadata on an exhaustive token partition.

Token, Alignment Span, sentence Segment, and render run remain distinct
identities. Implementation must not reuse Alignment entities or render runs as
token storage.

---

## 3. Frozen Inherited Primitives

### 3.1 Canonical text and coordinates

M3 preserves:

- backend-authoritative UTF-8/NFC TextVersion content;
- one leading BOM stripped and CRLF/CR → LF;
- no whitespace collapse, whole-text trim, lowercasing, punctuation rewrite,
  or NFKC;
- `content_hash` derived from canonical UTF-8 content;
- Unicode code-point API/database offsets;
- zero-based half-open ranges `[start, end)`;
- JavaScript UTF-16 conversion only through the existing shared offset utility;
- backend-derived `exact_text`.

### 3.2 Alignment and rendering

M3 preserves:

- arbitrary contiguous Alignment `Span`;
- symmetric N:M `AlignmentGroup`;
- atomic AlignmentService behavior and orphan cleanup;
- frontend-only pending Alignment Tray;
- TanStack Query ownership of server state;
- local reducer ownership of ephemeral workspace interaction;
- the flat canonical `[data-text-content-root]`;
- one Text node per `[data-run]`;
- canonical root `textContent` exact equality;
- native drag selection;
- RenderedSpanRegistry binding;
- alignment hover/active and connector semantics;
- HRA-F09 as separately governed visual debt.

Saving or deleting token segmentation must not create, delete, or mutate
Alignment Spans, Members, or Groups.

### 3.3 Runtime and persistence

- Python 3.13;
- Node.js 24;
- PostgreSQL 18;
- FastAPI → service → SQLAlchemy modular monolith;
- Alembic-only schema evolution;
- React / TypeScript / Vite;
- real PostgreSQL for integration proof.

---

## 4. Layer Dependency Model

A token layer requires one current saved sentence layer for the same
TextVersion.

Required invariants:

1. `token_layer.basis_layer_id` identifies the exact sentence layer used
   during token review.
2. The basis layer must exist, belong to the same TextVersion, have
   `granularity = sentence`, and carry the same current `content_hash`.
3. Each token lies wholly inside exactly one saved sentence.
4. Every sentence boundary is also a token boundary.
5. A token may not cross a sentence boundary.
6. Replacing or deleting a sentence layer while a token layer depends on it is
   rejected with `SEGMENTATION_HAS_DEPENDENTS`.
7. The user must explicitly delete the token layer before replacing or
   deleting its sentence basis.
8. Forced TextVersion deletion may cascade both layers atomically.
9. Deleting or replacing the token layer never mutates the sentence layer.

M3 does not add an implicit destructive cascade to normal sentence
replacement or deletion.

---

## 5. Required Domain and Persistence Scope

M3 reuses the generic M2 `SegmentationLayer` and `Segment` entities.

### 5.1 SegmentationLayer extension

Add:

```text
basis_layer_id UUID NULL
```

Rules:

```text
sentence layer:
  granularity = sentence
  basis_layer_id = NULL

token layer:
  granularity = token
  basis_layer_id = current sentence layer id
```

Required constraints:

- accepted granularities are `sentence | token`;
- one active layer per `(text_version_id, granularity)`;
- indexed self-referential foreign key for `basis_layer_id`;
- database cascade supports forced TextVersion destruction;
- ordinary service operations enforce the non-destructive dependency rule.

### 5.2 Segment extension

Add:

```text
is_word_like BOOLEAN NULL
```

Rules:

```text
sentence Segment:
  is_word_like = NULL

token Segment:
  is_word_like = TRUE | FALSE
```

The service rejects a token Segment without Boolean classification and a
sentence Segment carrying token classification.

### 5.3 Token partition invariants

For non-empty content:

- at least one token;
- first start is zero;
- final end equals canonical code-point length;
- adjacent boundaries meet exactly;
- no gaps, overlaps, duplicates, or zero-length intervals;
- consecutive ordinals begin at zero;
- token slices concatenate exactly to canonical content;
- every `exact_text` is backend-derived;
- all sentence boundaries are preserved;
- every token belongs to exactly one sentence.

Empty canonical content uses an empty token collection but still requires the
empty authoritative sentence layer as its basis.

---

## 6. Migration

Add:

`0004_word_token_segmentation_foundation.py`

Expected Alembic HEAD:

`0004`

Migration scope:

- add `basis_layer_id`;
- add `is_word_like`;
- expand the granularity constraint to `sentence | token`;
- add the self-reference and index;
- preserve existing M2 sentence rows with both new fields as `NULL`.

Revisions `0001` through `0003` remain byte-for-byte unchanged. Upgrade,
downgrade, and downgrade→upgrade cycles must preserve M0–M2 data outside the
explicit M3 additions.

---

## 7. API Contract

Add:

```text
PUT    /api/v1/text-versions/{text_version_id}/segmentations/token
DELETE /api/v1/text-versions/{text_version_id}/segmentations/token
```

### 7.1 Token PUT

Request:

```text
content_hash
basis_sentence_layer_id
requested_locale
resolved_locale
origin
segments[
  {
    start,
    end,
    is_word_like
  }
]
```

Accepted origins:

`manual | intl_segmenter`

The service must:

1. lock the TextVersion;
2. verify `content_hash`;
3. load and lock the exact sentence basis;
4. verify same TextVersion, granularity, and content hash;
5. validate locale and origin;
6. validate the complete token partition;
7. validate sentence-boundary refinement;
8. derive every `exact_text`;
9. replace only the token layer and children atomically;
10. return authoritative persisted data.

Any failure rolls back the complete replacement.

### 7.2 Token DELETE

- missing TextVersion/layer: `404 NOT_FOUND`;
- existing token layer: explicit deletion, `204`;
- explicit UI confirmation;
- no sentence or Alignment side effect.

### 7.3 Existing sentence endpoints

Existing sentence PUT/DELETE gain dependent-layer detection. Attempting
sentence replacement or deletion while a token layer exists returns:

`409 SEGMENTATION_HAS_DEPENDENTS`

No hidden cascade parameter is introduced in M3 v1.

### 7.4 Stable errors

Coverage must distinguish:

```text
NOT_FOUND
STALE_SEGMENTATION_CONTENT
STALE_SEGMENTATION_BASIS
INVALID_SEGMENTATION_LOCALE
INVALID_SEGMENTATION_ORIGIN
INVALID_SEGMENTATION_PARTITION
INVALID_TOKEN_CLASSIFICATION
TOKEN_CROSSES_SENTENCE_BOUNDARY
SEGMENT_OUT_OF_RANGE
SEGMENTATION_HAS_DEPENDENTS
```

Unexpected failures must not leak database details.

### 7.5 Workspace snapshot

Existing flat collections remain:

```text
segmentation_layers
segments
```

They gain additive M3 fields. Frontend normalization must index layers by
TextVersion and granularity without changing Alignment lookup behavior.

---

## 8. Suggestion and Human Review Boundary

M3 may use:

```js
new Intl.Segmenter(locale, { granularity: "word" })
```

The adapter runs separately inside each saved sentence interval and must:

- operate only on canonical server-returned content;
- retain requested and resolved locale;
- treat runtime indices as JavaScript UTF-16 code units;
- convert through the existing shared offset utility;
- translate sentence-local offsets into canonical global code-point offsets;
- capture `isWordLike`;
- verify exact tiling and sentence containment;
- fail closed on inconsistent output;
- keep output ephemeral until explicit Human save.

Runtime output and `isWordLike` are suggestions. Persisted Human-approved
coordinates and classification become authority. Any manual split, merge, or
classification edit changes draft origin to `manual`.

If word-granularity `Intl.Segmenter` is unavailable, manual construction
remains available. No polyfill or external tokenizer may be added.

---

## 9. Frontend Product Scope

Extend the Segmentation panel outside the canonical content root.

Required behavior:

- token controls are available only when a saved sentence layer exists;
- explain the missing-sentence prerequisite;
- generate token suggestions;
- start a manual partition derived from sentence boundaries;
- show every token range, exact preview, and word-like status;
- split at a valid code-point boundary;
- merge adjacent tokens only within one sentence;
- toggle word-like classification;
- discard unsaved changes;
- save atomically;
- reload exact persisted state;
- delete through confirmation;
- block overlapping mutations;
- display loading, empty, unsupported, validation, stale-basis, dependency, and
  pending states.

Merging across a sentence boundary is always disabled. No token control, label,
duplicate content, or separator may enter the canonical content root.

---

## 10. TextVersion and Layer Lifecycle

A saved token layer counts as annotation state.

Required behavior:

- ordinary TextVersion content replacement is blocked;
- ordinary TextVersion deletion is blocked;
- existing explicit `force=true` TextVersion deletion may cascade sentence
  and token layers atomically;
- Alignment deletion does not affect segmentation;
- segmentation deletion does not affect Alignment;
- token deletion preserves sentence segmentation;
- sentence replacement/deletion is blocked until its token dependent is
  explicitly removed.

---

## 11. Dependency, Configuration, and Workflow Boundary

M3 v1 adds no runtime or package dependency.

Unless separately amended:

- `apps/api/pyproject.toml` unchanged;
- `apps/api/uv.lock` unchanged;
- `apps/web/package.json` unchanged;
- `apps/web/package-lock.json` unchanged;
- runtime baselines unchanged;
- no ICU binding, NLP toolkit, dictionary, model, or segmentation polyfill.

Bounded verification changes may update Alembic HEAD `0003 → 0004`, local
verification paths, and M3 test inclusion. No CI provider redesign is
authorized.

---

## 12. Allowed Change Surface

```text
apps/api/alembic/versions/0004_*.py
apps/api/app/db/models/segmentation.py
apps/api/app/services/segmentation_service.py
apps/api/app/schemas/segmentation.py
apps/api/app/api/routes/segmentations.py
apps/api/app/services/workspace_service.py
apps/api/app/schemas/workspace.py
apps/api/app/services/text_version_service.py
apps/api/app/tests/

apps/web/src/features/segmentation/
apps/web/src/features/workspace/
apps/web/src/shared/text/
apps/web/e2e/

docs/adr/ADR-011-*.md
docs/api/api-contract.md
docs/architecture/ARCHITECTURE.md
docs/testing/
docs/development/
AGENTS.md
README.md

.github/workflows/ci.yml
scripts/verify.ps1
```

Workflow and verifier changes are limited to `0004` and M3 test execution.
Anything outside this surface requires a direct documented M3 necessity and
Human review. Unrelated cleanup is prohibited.

---

## 13. Documentation Freeze Surface

This docs-only contract-freeze commit changes only:

```text
docs/development/M3_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It may correct stale phrases describing the completed M2 contract or deleted
M2 branch as active. It contains no implementation, migration, dependency,
workflow, or test change.

---

## 14. Explicit Non-Goals

M3 v1 excludes:

- lemma, part-of-speech, morphology, and dependency syntax;
- phrase/chunk segmentation;
- subword or model tokenization;
- grapheme segmentation/editing;
- token-to-Alignment-Tray staging;
- selection snapping to tokens;
- automatic, candidate, sentence, or token alignment;
- NLP/LLM providers;
- dictionary, pronunciation, or examples;
- lexical identity or linguistic-relation ontology;
- translation;
- connector-routing redesign;
- HRA-F09 remediation;
- authentication/collaboration;
- graph/vector/search infrastructure;
- pagination/virtualization;
- runtime or dependency upgrades.

---

## 15. Testing Obligations

### 15.1 Backend

Required coverage:

- Alembic empty → `0004`;
- `0003 ↔ 0004` migration cycle;
- existing sentence-row preservation;
- layer/segment constraints and indexes;
- basis-layer identity and same-TextVersion validation;
- complete token partition and empty content;
- Unicode code-point exact text;
- astral-plane and combining-mark cases;
- whitespace and punctuation tokens;
- word-like Boolean validation;
- sentence-boundary refinement and cross-sentence rejection;
- stale content and stale basis rejection;
- atomic replacement rollback;
- dependent sentence mutation rejection;
- independent token deletion;
- TextVersion default/force deletion;
- transaction-clean service boundaries;
- workspace read model;
- stable error envelopes.

### 15.2 Frontend

Required coverage:

- word suggestion UTF-16 → code-point conversion;
- sentence-local → canonical-global offset conversion;
- `isWordLike` capture and Human override;
- manual construction;
- split/merge/classification rules;
- cross-sentence merge prevention;
- preview/discard/save/reload/delete;
- unsupported runtime;
- stale basis and dependency conflicts;
- workspace normalization;
- canonical DOM and native-selection regression;
- Alignment Tray, keyboard, hover/active, and connector regression.

### 15.3 Complete Gate 2

```text
uv sync --frozen
Alembic empty → 0004
alembic current
alembic check
full pytest on real PostgreSQL 18
zero skipped-test guard

npm ci
npm run lint
npm run typecheck
npm run test
npm run build

Playwright golden path
Playwright Unicode release blocker
Playwright M2 sentence segmentation
Playwright M3 token segmentation
tracked-tree integrity
```

No existing test may be deleted, weakened, skipped, or filtered.

---

## 16. M3 Playwright Path

```text
create/import TextVersion
→ save sentence layer
→ generate or manually construct token layer
→ inspect punctuation/whitespace and word-like tokens
→ split / merge / reclassify
→ save
→ reload exact partition
→ verify sentence replacement is blocked
→ delete token layer with confirmation
→ replace/delete sentence layer
→ reload
```

Include multilingual and supplementary-plane Unicode fixtures.

---

## 17. Human Runtime Acceptance

Fresh HRA is required in Microsoft Edge and Google Chrome at:

```text
1280 × 720
1440 × 900
```

Acceptance covers:

- sentence prerequisite;
- suggestion and manual workflows;
- visible punctuation and whitespace representation;
- split, merge, and classification;
- save, reload, and delete;
- dependent sentence-operation blocking;
- clear loading/error/pending/confirmation states;
- native selection and canonical DOM;
- existing Alignment workflow;
- Unicode/emoji correctness;
- connector binding;
- HRA-F09 recorded without incidental redesign.

Human acceptance supplements automated proof and does not replace it.

---

## 18. Acceptance Criteria

M3 passes only when:

1. token layers remain independent of Alignment Spans and render runs;
2. every token layer binds to the exact current sentence layer;
3. tokens form a complete canonical-text partition;
4. tokens never cross sentence boundaries;
5. every token has Human-reviewed word-like classification;
6. coordinates remain Unicode code points;
7. exact text remains backend-derived;
8. replacement is atomic and stale-safe;
9. sentence dependency destruction is never implicit;
10. token deletion preserves sentence and Alignment data;
11. manual construction works without `Intl.Segmenter`;
12. runtime suggestions remain ephemeral until save;
13. Alembic HEAD is `0004`;
14. `0001`–`0003` remain unchanged;
15. canonical DOM/native selection remain exact;
16. all M0–M2 regressions pass;
17. full real-PostgreSQL/frontend/build/Playwright proof passes;
18. Unicode blocker and M3 HRA pass;
19. dependency/runtime baselines do not drift;
20. no M3 non-goal is implemented;
21. exact candidate provenance and post-run tree integrity pass;
22. `G2-X01` remains accurately represented.

---

## 19. Gate 2 / External Infrastructure Rule

M0.7, M1, and M2 External Infrastructure Exceptions are checkpoint-specific
and do not authorize M3 external proof.

Preferred proof remains canonical GitHub Actions on the exact frozen
candidate. If exact-candidate GitHub-hosted execution again fails before any
workflow step begins:

1. preserve run/job/step evidence;
2. do not claim application failure or PASS;
3. stop Gate 2;
4. obtain a fresh explicit M3 External Infrastructure Exception;
5. only then establish independent hosted proof for the exact M3 candidate.

Historical proof cannot prove M3. `G2-X01` remains independently governed.

---

## 20. Evidence and Provenance

Gate 2 evidence must bind:

- implementation base;
- exact final candidate SHA and tree;
- changed-file scope;
- migration head;
- runtime versions;
- every executed command and exit result;
- real PostgreSQL execution and zero skips;
- all Playwright paths;
- post-run tracked-tree integrity;
- external-provider evidence if separately authorized.

No PR or merge may precede Gate 2, Static Human Diff Review, Human Runtime
Acceptance, and explicit Human PR/merge authorization.

---

## 21. Risks and Controls

### R1 — Word and token become competing authorities

**Control:** one `token` granularity; Human-reviewed `is_word_like` metadata
expresses lexical-looking membership.

### R2 — Token data silently outlives its sentence basis

**Control:** exact `basis_layer_id`, content-hash validation, sentence-boundary
refinement, and dependent-operation conflicts.

### R3 — Runtime UTF-16 indices leak into persistence

**Control:** the existing shared UTF-16/code-point conversion utility plus
astral-plane tests.

### R4 — Locale-sensitive suggestion is mistaken for authority

**Control:** runtime output remains ephemeral until Human save; requested and
resolved locales and origin are retained.

### R5 — Token UI corrupts selection or canonical DOM

**Control:** controls remain outside the content root and inherited
DOM/selection regressions remain release blockers.

### R6 — Scope expands into lexical annotation or automatic alignment

**Control:** explicit non-goals and STOP conditions.

---

## 22. STOP Conditions

Implementation must stop and request Human review if M3 requires:

- a second `word` layer in addition to the token layer;
- token storage in Alignment Span;
- tokenization without an exact sentence basis;
- tokens crossing sentence boundaries;
- partial, gapped, or overlapping persisted token layers;
- client-authoritative exact text;
- UTF-16, byte, or grapheme-cluster persisted offsets;
- silent deletion of token data during sentence mutation;
- direct token-to-tray or selection-snapping behavior;
- lemma, POS, morphology, or syntax;
- external tokenizer, NLP, model, dictionary, or polyfill;
- canonical DOM semantic changes;
- Alignment or connector-routing redesign;
- dependency/runtime changes;
- API version break;
- test weakening or skipping;
- mutation/deletion of retained proof or diagnostic evidence;
- automatic reuse of an earlier infrastructure exception;
- unrelated change outside the allowed surface.

---

## 23. Execution Sequence

After this docs-only freeze commit is independently verified:

1. obtain explicit Human authorization to create the M3 branch;
2. create `m3-word-token-segmentation-foundation` from the exact freeze
   commit;
3. add ADR-011 and migration `0004`;
4. implement backend persistence/service/API/read-model behavior;
5. implement suggestion adapter and Human-review UI;
6. add all unit/integration/E2E coverage;
7. update bounded verification assertions and as-built documentation;
8. freeze one exact candidate;
9. run Gate 2;
10. conduct bounded Static Human Diff Review;
11. conduct Human Runtime Acceptance;
12. request explicit PR authorization;
13. request explicit merge authorization;
14. perform Gate 3, durable closure, and separately guarded branch cleanup.

---

## 24. Contract Exit State

```text
M0 manual Alignment core                 preserved
M1 interaction/presentation layer        preserved
M2 sentence segmentation                 preserved
M3 complete token partition              introduced
Human-reviewed word-like classification  introduced
sentence → token dependency              explicit
schema                                    0004
lexical annotation                        not introduced
token-to-tray behavior                    not introduced
automatic alignment                       not introduced
NLP/LLM provider                          not introduced
connector routing                         unchanged
G2-X01                                    independently governed
```
