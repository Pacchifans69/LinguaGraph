# LinguaGraph M5 — Human-Reviewed POS Annotation Foundation

## Contract Status

**Status:** FROZEN — HUMAN APPROVED
**Human contract review / freeze authorization date:** 2026-09-09
**Approved pre-freeze durable base:** `68fedc4c8cba80201333e6550231b805e0f0853c`
**Approved pre-freeze durable tree:** `3bea6efd9662fe746328d2a7814fa65e1efb917f`
**Implementation authorization:** NOT GRANTED by this freeze. Bounded M5 implementation may begin only after the docs-only freeze commit is independently verified and the Human separately authorizes creation of the implementation branch.
**Planned implementation branch:** `m5-human-reviewed-pos-annotation-foundation`

This contract is the authoritative bounded execution contract for M5.

It inherits:

- the accepted M0 architecture and invariants;
- the completed M1 interaction/presentation boundary;
- the completed M2 persistent sentence-segmentation layer;
- the completed M3 sentence-bound token-segmentation layer;
- the completed M4 sparse token-occurrence lemma-annotation layer;
- ADR-001 through ADR-012.

M5 does not silently reopen those decisions.

---

## 1. Goal

M5 establishes one minimal persistent Human-reviewed coarse part-of-speech
annotation over an exact saved M3 word-like token occurrence.

The bounded workflow is:

```text
saved Human-reviewed token layer
→ choose an eligible saved word-like token
→ choose one frozen coarse POS value
→ validate and save
→ reload exact persisted annotation
→ edit explicitly
→ delete explicitly
```

A POS annotation is occurrence-level linguistic metadata.

The intended dependency graph becomes:

```text
canonical TextVersion
        ↓
saved sentence layer
        ↓
saved token layer
        ↓
saved token Segment.id
        ├── optional Human-reviewed lemma annotation
        └── optional Human-reviewed coarse POS annotation
```

Lemma and POS are sibling annotations. Neither requires or owns the other.

M5 does not establish morphology, syntax, language-specific POS tagsets,
Lexeme identity, dictionary identity, generic annotation ontology, or
automatic POS tagging.

---

## 2. Terminology and Identity Boundary

### 2.1 Token occurrence

A **token occurrence** is an existing persisted M3 `Segment` whose owning
`SegmentationLayer.granularity` is `token`.

Its exact persistent occurrence identity is `Segment.id`.

Coordinates, `exact_text`, sentence basis, and Human-reviewed
`is_word_like` remain owned by M3.

### 2.2 Eligible word-like token

An M5 POS target is eligible only when:

```text
owning layer granularity == token
AND
segment.is_word_like == TRUE
```

M5 never reinterprets or recomputes `is_word_like`.

### 2.3 Coarse POS annotation

A **coarse POS annotation** is one optional Human-selected value from the
frozen M5 vocabulary bound directly to one exact eligible saved token
`Segment.id`.

### 2.4 Lemma/POS independence

The following states are all valid:

```text
no lemma, no POS
lemma only
POS only
lemma + POS
```

M5 introduces no FK or semantic dependency between `TokenLemmaAnnotation` and
`TokenPosAnnotation`.

Equal lemma strings do not imply equal POS. Equal POS values do not imply
shared lexical identity.

### 2.5 Existing distinct identities

The following remain distinct:

```text
TextVersion
sentence Segment
token Segment
TokenLemmaAnnotation
TokenPosAnnotation
Alignment Span
AlignmentGroup / AlignmentMember
render run
```

No M5 entity substitutes for another.

---

## 3. Frozen Inherited Primitives

### 3.1 Canonical text and coordinates

M5 preserves:

- backend-authoritative canonical UTF-8/NFC TextVersion content;
- one leading BOM stripped and CRLF/CR → LF;
- rejection of NUL and surrogate code points;
- no whole-text trim, whitespace collapse, lowercasing, punctuation rewrite,
  or NFKC;
- SHA-256 `content_hash` over canonical UTF-8 content;
- Unicode code-point API/database offsets;
- zero-based half-open ranges `[start, end)`;
- backend-derived token `exact_text`;
- JavaScript UTF-16 conversion only through the existing shared offset layer.

POS does not own or mutate text or coordinates.

### 3.2 Segmentation authority

M5 preserves:

- one authoritative sentence layer per eligible TextVersion;
- one exact-basis exhaustive token layer;
- sentence-bound token partitions;
- persisted Human-reviewed `is_word_like` classification;
- explicit parent/dependent lifecycle;
- no automatic re-anchoring across retokenization.

### 3.3 Alignment

M5 preserves existing Alignment Span, symmetric N:M AlignmentGroup,
AlignmentMember, tray, rendering, Inspector, hover/active, connector and
orphan-cleanup semantics.

POS annotation is not Alignment state.

### 3.4 State ownership

M5 preserves:

- TanStack Query as persisted frontend server-state authority;
- React component/reducer state for ephemeral UI state;
- no optimistic persisted domain authority;
- document workspace snapshot as the persisted read authority;
- canonical text root unchanged.

### 3.5 Transaction ownership

M5 preserves:

```text
HTTP route
→ application/domain service
→ SQLAlchemy persistence
```

Services own transaction boundaries. Routes never commit or roll back. Every
public service call must return with a transaction-clean SQLAlchemy Session.

### 3.6 Runtime baseline

Unchanged:

```text
Python       3.13
Node.js      24
PostgreSQL   18
```

---

## 4. Frozen M5 Coarse-POS Vocabulary

M5 defines one self-contained closed vocabulary:

```text
ADJ
ADP
ADV
AUX
CCONJ
DET
INTJ
NOUN
NUM
PART
PRON
PROPN
SCONJ
VERB
X
```

Frozen basic meanings:

| Tag | Meaning |
|---|---|
| `ADJ` | adjective |
| `ADP` | adposition |
| `ADV` | adverb |
| `AUX` | auxiliary |
| `CCONJ` | coordinating conjunction |
| `DET` | determiner |
| `INTJ` | interjection |
| `NOUN` | noun |
| `NUM` | numeral |
| `PART` | particle |
| `PRON` | pronoun |
| `PROPN` | proper noun |
| `SCONJ` | subordinating conjunction |
| `VERB` | verb |
| `X` | other / no more specific available category |

The labels and basic category meanings are aligned with the corresponding
Universal Dependencies v2 UPOS categories as design provenance. The frozen
LinguaGraph contract above is the M5 authority; external documentation is not a
dynamic runtime or schema authority.

M5 deliberately excludes `PUNCT` and `SYM` because its target set remains the
M3 Human-reviewed `is_word_like = TRUE` subset. M5 therefore does **not** claim
complete Universal Dependencies annotation conformance.

M5 also excludes:

```text
XPOS / language-specific tagsets
morphological features
project-defined POS labels
free-text POS labels
```

Any later vocabulary expansion requires a separately Human-governed contract.

---

## 5. POS Value Semantics

The submitted value is an exact case-sensitive string.

Accepted values are exactly the fifteen frozen tags in section 4.

The service performs no automatic:

```text
trim
uppercasing
lowercasing
case-folding
alias conversion
XPOS mapping
language-specific rewriting
```

Examples:

```text
"NOUN"   valid
"VERB"   valid
"noun"   invalid
"Noun"   invalid
" NOUN"  invalid
"NOUN "  invalid
"PUNCT"  invalid in M5
"SYM"    invalid in M5
"NN"     invalid
"CUSTOM" invalid
```

Stable domain error for a string outside the frozen vocabulary:

```text
INVALID_POS_VALUE
HTTP 422
```

The HTTP request schema must type `pos_tag` only as `str` with
`extra="forbid"`. Frozen membership validation belongs to the domain service,
so invalid strings reach `INVALID_POS_VALUE` instead of being converted into
Pydantic `VALIDATION_ERROR`.

A non-string JSON value or an extra request field remains an HTTP/Pydantic
boundary failure:

```text
VALIDATION_ERROR
HTTP 422
```

---

## 6. Target Eligibility Validation

A POS target is valid only when:

```text
owning layer granularity == token
AND
segment.is_word_like == TRUE
```

Invalid structurally existing targets include:

```text
sentence Segment
separator / punctuation / whitespace token with is_word_like != TRUE
```

Such a target returns:

```text
INVALID_POS_TARGET
HTTP 422
```

A missing or replaced token id returns:

```text
NOT_FOUND
HTTP 404
```

The frontend may not override `is_word_like` as part of POS save.

---

## 7. Required Domain and Persistence Scope

M5 adds exactly one persistent entity:

```text
TokenPosAnnotation
```

Required table:

```text
token_pos_annotations
```

Required fields:

```text
id                UUID PRIMARY KEY
token_segment_id  UUID NOT NULL
pos_tag           VARCHAR(5) NOT NULL
created_at        timestamptz NOT NULL
updated_at        timestamptz NOT NULL
```

Required constraints:

```text
FOREIGN KEY token_segment_id
    REFERENCES segments(id)
    ON DELETE CASCADE

UNIQUE(token_segment_id)

CHECK pos_tag IN (
    'ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ',
    'DET', 'INTJ', 'NOUN', 'NUM', 'PART',
    'PRON', 'PROPN', 'SCONJ', 'VERB', 'X'
)
```

Recommended stable constraint names:

```text
token_pos_annotations_pkey
fk_token_pos_annotations_token_segment_id_segments
uq_token_pos_annotations_token_segment_id
ck_token_pos_annotations_pos_tag
```

The Alembic migration and SQLAlchemy ORM metadata must declare the same named
POS CHECK constraint so `alembic check` sees no schema/model drift.

The table must not redundantly store:

```text
text_version_id
segmentation_layer_id
language_tag
token coordinates
token exact_text
is_word_like
sentence basis id
lemma
```

Those remain owned by the existing token hierarchy and sibling lemma entity.

The unique constraint supplies the one-authoritative-POS-per-token invariant;
no redundant ordinary index on `token_segment_id` is required.

---

## 8. Rejected Persistence Designs

M5 must not implement:

### 8.1 `segments.pos`

POS is not segmentation metadata shared by every Segment granularity. The
`segments` table must not become a generic linguistic-annotation object.

### 8.2 Combined lemma/POS row

M5 does not merge independent lemma and POS lifecycles into one nullable
`token_annotations` row.

### 8.3 Generic annotation/EAV framework

M5 does not introduce generalized:

```text
Annotation
AnnotationType
AnnotationLayer
attribute/value
property bag
```

storage for hypothetical future morphology, syntax, dictionary or other
annotations.

### 8.4 Lexeme / vocabulary identity

M5 does not create:

```text
Lexeme
VocabularyEntry
DictionaryEntry
LexicalIdentity
Sense
```

or infer shared identity from lemma/POS equality.

### 8.5 Alignment storage

POS may not be stored on `Span`, `AlignmentMember`, or `AlignmentGroup`.

---

## 9. Lemma/POS Lifecycle Independence

Required bidirectional independence:

```text
lemma create/update/delete ↛ TokenPosAnnotation
POS create/update/delete   ↛ TokenLemmaAnnotation
```

Deleting one sibling annotation preserves the other.

A token may carry POS without lemma and lemma without POS.

M5 performs no automatic lemma→POS or POS→lemma derivation.

---

## 10. Concurrency and Locking Invariant

POS mutation uses the same TextVersion mutation root already used by token and
lemma mutation.

For POS PUT or DELETE, the service must:

1. identify the target token and owning TextVersion sufficiently to locate the
   mutation root;
2. acquire that `TextVersion` row with `SELECT ... FOR UPDATE`;
3. re-resolve the exact token/layer while the lock is held;
4. revalidate token granularity and `is_word_like = TRUE`;
5. perform the POS mutation only after the lock is held.

The established ordering becomes:

```text
lemma mutation
↔ POS mutation
↔ token replacement/delete
↔ inherited segmentation mutation

shared mutation root: TextVersion row
```

A concurrent token replacement must either:

- observe annotation dependents and fail closed; or
- complete first, after which the stale token id no longer resolves and the
  annotation mutation fails closed.

Concurrent lemma and POS writes on the same token serialize on the same root
lock but mutate independent rows. Both may succeed and both authoritative rows
must survive.

Concurrent POS writes to the same token must serialize without leaking a
unique-constraint/integrity failure. The final persisted value is the value of
the serialized write that completes last; no optimistic versioning contract is
introduced.

M5 introduces no second lock ordering and no general repository-wide
concurrency redesign. The separately retained Alignment concurrency debt is
outside M5.

---

## 11. Token-Annotation Dependency Model

Ordinary token-layer replacement or deletion is fail-closed while any M4/M5
token-occurrence annotation depends on a token in that layer.

Required invariant:

```text
lemma dependent exists OR POS dependent exists
→ token replace/delete returns 409 SEGMENTATION_HAS_DEPENDENTS
```

Therefore:

```text
delete lemma while POS remains → still blocked
delete POS while lemma remains → still blocked
delete all annotation dependents → token mutation permitted
```

The Human must explicitly delete every dependent occurrence annotation before
ordinary retokenization or token-layer deletion.

M5 performs no hidden cascade in normal token mutation.

---

## 12. `SEGMENTATION_HAS_DEPENDENTS` Details Contract

The stable error code remains:

```text
SEGMENTATION_HAS_DEPENDENTS
HTTP 409
```

M5 does not redefine every use of this inherited code.

### 12.1 Sentence-layer mutation blocked by token layer

The existing M3 sentence→token dependency details remain unchanged. M5 does
not require `dependency_type` or `dependency_types` for that inherited case.

### 12.2 Token-layer mutation blocked by occurrence annotations

For token-layer replacement/deletion blocked by token-occurrence annotations,
required details include:

```text
text_version_id
token_layer_id
dependency_types
```

`dependency_types` is the complete authoritative set of annotation dependency
types actually present, in this fixed canonical order:

```text
lemma_annotations
pos_annotations
```

Examples:

Lemma only:

```json
{
  "dependency_type": "lemma_annotations",
  "dependency_types": ["lemma_annotations"]
}
```

POS only:

```json
{
  "dependency_type": "pos_annotations",
  "dependency_types": ["pos_annotations"]
}
```

Lemma + POS:

```json
{
  "dependency_types": ["lemma_annotations", "pos_annotations"]
}
```

The legacy scalar `dependency_type` is retained only when the complete set has
exactly one member. It is omitted for multiple dependents so no artificial
"primary" dependency is implied.

Frontend consumers use `dependency_types` when present and may normalize an
inherited scalar-only fixture to a one-element list.

This additive details shape is not a generic dependency ontology.

---

## 13. No Automatic Re-Anchoring or Transfer

M5 must not carry POS metadata across retokenization through:

```text
coordinate remapping
exact-text matching
fuzzy matching
POS copying
POS inference
lemma-based matching
automatic token reconciliation
```

Lossy parent mutation is prevented by explicit dependency blocking instead.

---

## 14. Migration Contract

Add one Alembic revision:

```text
0006_human_reviewed_pos_annotations.py
```

Expected M5 implementation HEAD:

```text
0006
```

Required forward scope is strictly additive:

```text
CREATE TABLE token_pos_annotations
```

with the fields and constraints defined above.

Revisions `0001` through `0005` remain byte-for-byte unchanged.

### 14.1 Upgrade

Required path:

```text
0005 → 0006
```

All existing M0–M4 rows, including lemma annotations, survive unchanged.

### 14.2 Downgrade

Required path:

```text
0006 → 0005
```

Downgrade removes only M5-owned POS schema/data. Sentence/token segmentation
and M4 lemma rows survive.

### 14.3 Full migration proof

Required:

```text
empty → 0006
0005 → 0006
0006 → 0005
0005 → 0006 again
alembic current == 0006
alembic check PASS
```

All destructive migration-cycle testing continues to use guarded disposable
PostgreSQL databases only.

---

## 15. API Contract

Add exactly:

```text
PUT    /api/v1/token-segments/{token_segment_id}/pos
DELETE /api/v1/token-segments/{token_segment_id}/pos
```

No standalone POS GET endpoint is required. The document workspace snapshot
remains the persisted read authority.

---

## 16. POS PUT

Endpoint:

```text
PUT /api/v1/token-segments/{token_segment_id}/pos
```

Request:

```json
{
  "pos_tag": "NOUN"
}
```

The frontend supplies no competing authority such as:

```text
text_version_id
token_layer_id
coordinates
exact_text
is_word_like
content_hash
language_tag
lemma
```

Required behavior:

1. begin one owned write transaction;
2. resolve target ownership sufficiently to locate the TextVersion;
3. lock the TextVersion root;
4. re-resolve/revalidate the exact token under lock;
5. require token granularity and `is_word_like = TRUE`;
6. validate the exact frozen POS value in the domain service;
7. find the existing POS annotation for that token;
8. create, update, or perform a logical no-op;
9. return the authoritative persisted annotation;
10. commit exactly once through the shared transaction owner;
11. return transaction-clean.

Response:

```json
{
  "id": "...",
  "token_segment_id": "...",
  "pos_tag": "NOUN",
  "created_at": "...",
  "updated_at": "..."
}
```

Status:

```text
200 OK
```

for create, update, and no-op.

### 16.1 Logical no-op

If the submitted POS exactly equals the persisted value:

- no logical write occurs;
- `updated_at` does not advance.

---

## 17. POS DELETE

Endpoint:

```text
DELETE /api/v1/token-segments/{token_segment_id}/pos
```

Required behavior:

- acquire the same TextVersion-root mutation lock;
- revalidate exact target ownership/eligibility;
- delete only the corresponding POS annotation;
- preserve lemma;
- preserve token/sentence segmentation;
- preserve Alignment;
- return transaction-clean.

Success:

```text
204 No Content
```

Missing token or missing annotation:

```text
404 NOT_FOUND
```

Deletion is explicit. M5 does not require a modal confirmation for deleting one
POS annotation.

---

## 18. Stable Errors

M5 adds:

```text
INVALID_POS_TARGET     422
INVALID_POS_VALUE      422
```

M5 inherits, where applicable:

```text
VALIDATION_ERROR                 422
NOT_FOUND                        404
SEGMENTATION_HAS_DEPENDENTS      409
TEXT_HAS_ANNOTATIONS             409
INTERNAL_ERROR                   500
```

Unexpected persistence failures never expose SQLAlchemy/PostgreSQL internals.

No separate stale-POS content/basis code is introduced. Exact saved
`token_segment_id` is the basis identity; a replaced/deleted token id fails
closed as missing.

---

## 19. Workspace Read Model

Extend:

```text
GET /api/v1/documents/{document_id}/workspace
```

with one additive flat collection:

```text
token_pos_annotations
```

Item shape:

```json
{
  "id": "...",
  "token_segment_id": "...",
  "pos_tag": "NOUN",
  "created_at": "...",
  "updated_at": "..."
}
```

Backend scoping must follow:

```text
TokenPosAnnotation
→ Segment
→ SegmentationLayer
→ TextVersion
→ document
```

The annotation stores no redundant document/version authority.

The complete workspace snapshot remains materialized inside one owned read
transaction. No lazy ORM traversal after transaction close is allowed.

Deterministic server ordering is required; frontend correctness may not depend
on incidental collection order.

---

## 20. Frontend Normalization

Extend the existing flat-workspace normalization additively with:

```text
posAnnotations
posAnnotationsById
posAnnotationByTokenSegmentId
```

Existing lemma maps remain independent and unchanged.

After successful POS mutation, TanStack Query invalidates/refetches the
authoritative workspace snapshot. The mutation response is not adopted as an
optimistic persisted authority.

---

## 21. Frontend Product Scope

Add one bounded POS annotation surface outside the canonical text root.

Recommended component:

```text
PosAnnotationPanel
```

Conceptual per-TextVersion composition:

```text
TextPanel
SentenceSegmentationPanel
TokenSegmentationPanel
LemmaAnnotationPanel
PosAnnotationPanel
```

M5 does not create a universal/generic annotation editor.

### 21.1 Prerequisite and target authority

No saved token layer:

```text
Save token segmentation before adding POS annotations.
```

Rows are built only from persisted saved token Segments of the current saved
token layer. An unsaved `TokenDraft` is never a POS target.

Only saved segments with `is_word_like === true` are editable.

### 21.2 POS control

The UI uses an accessible controlled selection over the exact frozen fifteen
values. It does not expose a free-text POS field.

For each eligible saved token it may display:

- backend-authoritative `exact_text`;
- coordinates as informational metadata;
- current POS if present;
- controlled POS selector;
- save action;
- explicit delete action.

### 21.3 UI states

Required states include:

- loading;
- missing saved-token prerequisite;
- no eligible word-like tokens;
- unannotated token;
- existing annotation;
- dirty selection;
- saving;
- deleting;
- value/target validation error;
- NOT_FOUND/stale target;
- token dependency conflict.

### 21.4 Canonical DOM

No POS label, control, duplicate token text or metadata may be inserted inside:

```text
[data-text-content-root]
```

Canonical rendering and native selection remain unchanged.

The separate POS panel's workspace density is a Human Runtime Acceptance
question, not authorization for a generic annotation-panel redesign.

---

## 22. TextVersion Lifecycle

Existing TextVersion annotation policy remains authoritative.

Ordinary content replacement/deletion remains blocked by the existing saved
segmentation/annotation state. Existing `force=true` destructive reset remains
the only forced TextVersion destruction path.

The FK chain must permit:

```text
TextVersion
→ SegmentationLayer
→ Segment
   ├→ TokenLemmaAnnotation
   └→ TokenPosAnnotation
```

to be destroyed atomically during the existing forced TextVersion deletion.

No M5-specific `force_pos` or `cascade_pos` parameter is introduced.

`text_version_service.py` is not part of the default M5 change surface. It may
be changed only if implementation proves a direct frozen-M5 lifecycle
necessity that cannot be satisfied by the existing FK cascade and force-delete
semantics; such necessity must be reported for Human scope review first.

---

## 23. Alignment Independence

Required bidirectional independence:

```text
POS create/update/delete
    ↛ Span
    ↛ AlignmentMember
    ↛ AlignmentGroup

Alignment create/update/delete
    ↛ TokenPosAnnotation
```

Existing Alignment concurrency debt remains separately deferred and is not an
M5 prerequisite or M5 implementation surface.

---

## 24. Dependency, Runtime, and Configuration Boundary

M5 adds no runtime/package dependency.

Frozen unless separately amended by Human authority:

```text
apps/api/pyproject.toml
apps/api/uv.lock
apps/web/package.json
apps/web/package-lock.json
```

No new:

```text
POS tagger
NLP toolkit
Universal Dependencies parser/runtime
morphology package
dictionary package
model runtime
LLM SDK
remote linguistic provider
frontend state library
```

is authorized.

Runtime baseline remains Python 3.13 / Node 24 / PostgreSQL 18.

---

## 25. Workflow Boundary and G2-X01

Bounded verification updates may change only what M5 implementation makes
factually necessary, principally:

```text
Alembic expected HEAD: 0005 → 0006
M5 backend/frontend test inclusion
M5 Playwright inclusion
milestone labels/comments
```

No CI-provider redesign is authorized.

`G2-X01` remains:

```text
OPEN / EXTERNAL
```

The M4 External Infrastructure Exception does not carry forward to M5.

At M5 Gate 2:

1. first attempt canonical GitHub-hosted verification on the exact frozen M5
   candidate;
2. independently inspect whether repository workflow steps execute;
3. distinguish application failure from pre-step provider failure;
4. retain exact run/job/provenance evidence.

If the same provider/pre-step failure persists, any alternative hosted proof
path requires a new explicit **M5-specific** Human External Infrastructure
Exception. No exception is pre-authorized by this contract.

Such an exception may not waive exact candidate/tree/base provenance, clean
hosted environment, Python 3.13, Node 24, PostgreSQL 18, migration proof,
backend tests, zero skips, frontend verification, production build,
Playwright, cleanup, or tracked-tree integrity.

---

## 26. Default Allowed Implementation Change Surface

### Backend

```text
apps/api/alembic/versions/0006_*.py

apps/api/app/db/models/pos_annotation.py
apps/api/app/db/models/__init__.py

apps/api/app/services/pos_annotation_service.py
apps/api/app/services/segmentation_service.py
apps/api/app/services/workspace_service.py

apps/api/app/schemas/pos_annotation.py
apps/api/app/schemas/workspace.py

apps/api/app/api/routes/pos_annotations.py
apps/api/app/api/errors.py
apps/api/app/main.py

apps/api/app/tests/
```

### Frontend

```text
apps/web/src/features/pos/
apps/web/src/features/workspace/api.ts
apps/web/src/features/workspace/normalize.ts
apps/web/src/features/workspace/WorkspacePage.tsx
apps/web/src/styles.css
apps/web/src/**/*.test.*
apps/web/e2e/
```

### Implementation documentation

```text
docs/adr/ADR-013-*.md
docs/api/api-contract.md
docs/architecture/ARCHITECTURE.md
docs/testing/
docs/development/
AGENTS.md
README.md
```

### Verification

```text
.github/workflows/ci.yml
scripts/verify.ps1
```

Default prohibited implementation surfaces include:

```text
apps/api/app/services/text_version_service.py
apps/api/app/services/alignment_service.py and other Alignment services
apps/web/src/shared/text/ coordinate/selection engine
runtime/dependency manifests and lockfiles
```

A change outside the default surface requires direct M5 necessity, explicit
reporting, and Human review before scope broadening. Unrelated cleanup is
prohibited.

---

## 27. Documentation Freeze Surface

The M5 docs-only contract-freeze commit is strictly limited to:

```text
docs/development/M5_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It contains no:

```text
implementation code
migration
ADR-013 implementation record
test modification
dependency modification
lockfile modification
runtime change
workflow modification
implementation branch creation
```

`docs/architecture/ARCHITECTURE.md`, `docs/api/api-contract.md`, and
`docs/testing/testing-strategy.md` remain as-built M4 documents during the
freeze. They must not describe unimplemented M5 behavior as current reality.

---

## 28. ADR-013 Obligation

Bounded M5 implementation must add an ADR equivalent to:

```text
ADR-013 — Token-occurrence coarse POS annotations
```

It must record at least:

- exact saved token `Segment.id` occurrence identity;
- eligibility restricted to persisted `is_word_like = TRUE` tokens;
- the closed fifteen-value LinguaGraph coarse-POS vocabulary;
- UD-v2-aligned provenance without a complete-UD-conformance claim;
- dedicated sparse typed persistence;
- lemma/POS sibling independence;
- no generic annotation/EAV framework;
- no Lexeme identity;
- shared TextVersion-root locking;
- explicit multi-dependent retokenization blocking;
- no automatic re-anchoring;
- Alignment independence.

ADR-013 must remain consistent with this frozen execution contract and cannot
broaden it.

---

## 29. Explicit Non-Goals

M5 v1 excludes:

- `PUNCT` / `SYM` annotation;
- complete UD annotation conformance;
- XPOS / language-specific POS tagsets;
- morphology / morphological features;
- dependency syntax;
- constituency syntax;
- phrase/chunk annotation;
- subword/model tokenization;
- grapheme-aware editing;
- Lexeme / VocabularyEntry / Sense identity;
- dictionary entries/APIs, definitions, pronunciation, examples;
- etymology, cognates, borrowings, derivational relations;
- automatic POS tagging;
- rule-based/statistical/neural POS suggestion;
- automatic lemmatization;
- NLP/LLM providers or toolkits;
- machine translation;
- token-to-Alignment-Tray staging;
- token selection snapping;
- automatic/candidate sentence or token alignment;
- generic Annotation/EAV framework;
- generic dependency ontology;
- general Alignment concurrency redesign;
- connector-routing redesign / HRA-F09 remediation;
- authentication / collaboration;
- Redis, Neo4j, Elasticsearch, vector databases, graph/search infrastructure;
- pagination / virtualization;
- runtime/dependency modernization;
- CI-provider redesign;
- rewriting Alembic revisions `0001` through `0005`.

---

## 30. Backend Testing Obligations

Required coverage includes:

### 30.1 Migration / schema

```text
empty → 0006
0005 → 0006
0006 → 0005
0005 → 0006 again
M0–M4 row preservation
M4 lemma preservation across 0005↔0006 cycle
M5-only row removal on downgrade
0001–0005 historical integrity
named ORM/migration CHECK constraint agreement
alembic current == 0006
alembic check PASS
```

### 30.2 POS domain/API

```text
create POS on eligible saved word-like token
reload exact persisted POS
edit POS
logical no-op preserves updated_at
delete POS
one POS per token

accept every one of the fifteen frozen tags
reject lowercase / mixed-case forms
reject leading/trailing whitespace
reject PUNCT / SYM
reject unknown string as INVALID_POS_VALUE
reject non-string as VALIDATION_ERROR
reject extra request fields

reject sentence Segment
reject non-word-like token
reject missing/stale token

POS without lemma
lemma without POS
lemma + POS coexist
POS delete preserves lemma
lemma delete preserves POS

transaction rollback
transaction-clean Session
stable error envelope
```

### 30.3 Dependency / lifecycle

```text
token replacement blocked by POS dependent
token deletion blocked by POS dependent
lemma-only dependent reports complete dependency_types
POS-only dependent reports complete dependency_types
lemma + POS reports both in canonical order
legacy scalar retained only for exactly-one-dependent token-annotation case
sentence→token dependency details unchanged

delete lemma while POS remains → still blocked
delete POS while lemma remains → still blocked
delete all dependents → token mutation succeeds

ordinary TextVersion lifecycle unchanged
force TextVersion deletion cascades lemma + POS
Alignment deletion preserves POS
POS deletion preserves Alignment
workspace document scoping / deterministic materialization
```

### 30.4 Concurrency on real PostgreSQL 18

At minimum prove meaningful real-service paths for:

```text
POS mutation ↔ token replacement/delete
lemma PUT ↔ POS PUT on the same saved token
concurrent POS writes to one saved token
```

Required invariants:

- no silent annotation loss;
- no leaked unique/integrity failure on accepted races;
- same TextVersion-root ordering is obeyed;
- lemma/POS siblings both survive their serialized independent writes;
- tests do not claim exhaustive proof of every PostgreSQL interleaving.

---

## 31. Frontend Testing Obligations

Required coverage includes:

```text
missing saved-token prerequisite
saved-token prerequisite
only authoritative saved token ids used
only is_word_like === true tokens editable
unsaved TokenDraft never becomes POS target

exact fifteen-value controlled selector
unannotated state
existing POS state
create / edit / logical no-op / delete
POS without lemma
lemma without POS
lemma + POS coexistence
pending state
INVALID_POS_TARGET / INVALID_POS_VALUE / NOT_FOUND handling
multi-dependent conflict presentation and recovery
workspace normalization / posAnnotationByTokenSegmentId

canonical content-root regression
native selection regression
sentence segmentation regression
token segmentation regression
lemma regression
Alignment Tray regression
Alignment hover/active regression
connector regression
```

No existing test may be weakened, deleted, skipped, or filtered to make M5
pass.

---

## 32. M5 Playwright Path

Add a bounded M5 E2E path such as:

```text
e2e/pos-annotation.spec.ts
```

Required primary path:

```text
create/import TextVersion
→ save sentence segmentation
→ save token segmentation
→ choose saved eligible word-like token
→ save POS
→ reload workspace
→ verify exact persisted POS
→ edit POS
→ reload
→ verify edit
→ delete POS
→ verify POS absent
→ verify sentence/token/lemma/Alignment state unchanged
```

Required sibling/dependency path:

```text
save lemma + POS on one/current token layer
→ attempt token replacement/delete
→ receive dependency block identifying both annotation types
→ delete only lemma
→ token mutation remains blocked by POS
→ delete POS
→ token mutation succeeds
```

Also test the reverse sibling-deletion order.

Multilingual fixtures must exercise the same closed vocabulary without adding
language-specific tagsets. Unicode token identity must remain intact.

---

## 33. Complete Gate 2 Semantic Surface

Nominal complete M5 verification must include:

```text
uv sync --frozen

Alembic empty → 0006
alembic current
alembic check

full backend pytest suite
real PostgreSQL 18 integration coverage
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
Playwright M4 lemma annotation
Playwright M5 POS annotation

tracked-tree integrity
```

The canonical workflow may express these through existing wrappers but may not
weaken their semantic meaning.

---

## 34. Human Runtime Acceptance Boundary

Fresh M5 Human Runtime Acceptance is required before merge decision.

At minimum verify:

- saved-token prerequisite and exact saved-token targeting are understandable;
- only word-like saved tokens expose POS controls;
- the controlled fifteen-tag selector is operable and comprehensible;
- POS can exist without lemma;
- lemma can exist without POS;
- lemma and POS coexist without lifecycle interference;
- create/reload/edit/delete all work from authoritative state;
- multi-dependent token blocking clearly identifies the required cleanup;
- deleting only one sibling leaves the parent correctly blocked;
- deleting all dependents restores token mutation;
- multilingual examples are usable without language-specific tagsets;
- canonical text/native selection remain unchanged;
- existing sentence/token/lemma/Alignment workflows remain usable;
- independent POS-panel workspace density remains acceptable;
- HRA-F09 remains separately governed unless explicitly reopened.

Human Runtime Acceptance supplements automated Gate 2 evidence and does not
replace it.

---

## 35. Definition of Done

M5 implementation is complete only when all of the following are true:

1. One saved eligible word-like token can own at most one persistent coarse POS
   annotation.
2. POS binds directly to exact saved `Segment.id`.
3. Only the fifteen frozen values are accepted.
4. M5 makes no complete-UD-conformance claim and excludes `PUNCT` / `SYM`.
5. `is_word_like` remains inherited M3 Human authority.
6. POS may exist without lemma.
7. Lemma may exist without POS.
8. Lemma and POS may coexist as independent sibling rows.
9. POS create/edit/no-op/delete persist exactly across authoritative reload.
10. Logical no-op preserves `updated_at`.
11. Invalid target and invalid value fail closed with stable errors.
12. Pydantic boundary failures remain distinct from domain POS-value failures.
13. One token cannot acquire multiple authoritative POS rows.
14. Ordinary token replacement/deletion is blocked by lemma and/or POS
    dependents.
15. Multi-dependent details report the complete token-annotation dependent set
    without changing M3 sentence→token details.
16. Deleting one sibling does not unblock parent mutation while another
    dependent remains.
17. M5 performs no automatic re-anchoring or annotation transfer.
18. POS and lemma mutations share the existing TextVersion-root ordering.
19. Meaningful real-PostgreSQL races prove no silent loss or leaked integrity
    failure.
20. Existing force TextVersion destruction removes POS through the ownership
    cascade without a new force parameter.
21. Alignment and POS remain bidirectionally independent.
22. Workspace snapshot remains the persisted frontend read authority.
23. POS UI remains outside the canonical text root and unsaved token drafts are
    never persistent targets.
24. No generic annotation/EAV ontology or Lexeme identity is introduced.
25. No XPOS, morphology, syntax or automatic POS tagging is introduced.
26. No runtime/package dependency or runtime baseline change is introduced.
27. Alembic head is exactly `0006` and revisions `0001`–`0005` are unchanged.
28. Backend/frontend/Playwright and retained M0–M4 release surfaces pass without
    weakened/skipped tests.
29. `G2-X01` remains correctly classified unless separately proven recovered;
    no prior exception is carried forward.
30. Static Human Diff Review and Human Runtime Acceptance both pass before any
    Human merge decision.

---

## 36. Freeze and Authorization Boundary

This docs-only contract freeze does **not** authorize implementation.

After the freeze is durably landed, the next safe sequence is:

```text
independently verify exact freeze commit/tree and four-file scope
→ Human separately authorizes bounded implementation branch
→ create implementation branch from exact frozen main
→ bounded implementation
```

Until that separate Human authorization:

```text
NO implementation branch
NO migration
NO application code change
NO test change
NO ADR-013 implementation record
NO workflow change
NO dependency change
```
