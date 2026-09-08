# LinguaGraph M4 — Human-Reviewed Lemma Annotation Foundation

## Contract Status

**Status:** FROZEN — HUMAN APPROVED  
**Human contract review / freeze date:** 2026-09-08  
**Approved pre-freeze durable base:** `3cada0d2dcdcf349152aacc53992b15190271a75`  
**Approved pre-freeze durable tree:** `51564978a2e92ce8de61997219b3d8c596a6fa9a`  
**Implementation authorization:** NOT GRANTED by this freeze. Bounded M4 implementation may begin only after this docs-only freeze commit is independently verified and the Human separately authorizes creation of the implementation branch.  
**Planned implementation branch:** `m4-human-reviewed-lemma-annotation-foundation`

This contract is the authoritative bounded execution contract for M4.

It inherits:

- the accepted M0 architecture and invariants;
- the completed M1 interaction/presentation boundary;
- the completed M2 persistent sentence-segmentation layer;
- the completed M3 sentence-bound token-segmentation layer;
- ADR-001 through ADR-011.

M4 does not silently reopen those decisions.

---

## 1. Goal

M4 establishes a minimal persistent Human-reviewed lemma annotation over an
exact saved M3 token occurrence.

The bounded workflow is:

```text
saved Human-reviewed token layer
→ choose an eligible saved word-like token
→ enter lemma
→ validate and save
→ reload exact persisted annotation
→ edit explicitly
→ delete explicitly
```

A lemma annotation is occurrence-level linguistic metadata.

M4 does not establish:

- a cross-occurrence Lexeme identity;
- dictionary identity;
- lexical relations;
- POS;
- morphology;
- syntax;
- automatic lemmatization;
- automatic alignment.

The intended dependency chain becomes:

```text
canonical TextVersion
        ↓
saved sentence layer
        ↓
saved token layer
        ↓
saved word-like token occurrence
        ↓
optional Human-reviewed lemma annotation
```

---

## 2. Terminology Boundary

### 2.1 Token occurrence

A **token occurrence** is an existing persisted M3 `Segment` whose owning
`SegmentationLayer.granularity` is `token`.

It has an exact persistent identity through `Segment.id`.

Its canonical coordinates, `exact_text`, sentence basis, and Human-reviewed
`is_word_like` value remain owned by M3.

### 2.2 Word-like token

A **word-like token** is a saved token occurrence with:

```text
is_word_like = TRUE
```

M4 does not reinterpret or recompute this classification.

### 2.3 Lemma annotation

A **lemma annotation** is one optional Human-authored lemma string bound to one
exact saved word-like token occurrence.

Examples:

```text
"houses"  → "house"
"Häuser"  → "Haus"
"suis"    → "être"
"am"      → "be"
```

### 2.4 Lexeme

M4 introduces no `Lexeme` entity and no persistent claim that two token
occurrences denote the same lexical object.

Two token occurrences may independently carry equal lemma strings without
acquiring shared identity.

### 2.5 Existing distinct identities

The following remain distinct:

```text
TextVersion
sentence Segment
token Segment
lemma annotation
Alignment Span
AlignmentGroup / AlignmentMember
render run
```

No M4 entity may substitute for another.

---

## 3. Frozen Inherited Primitives

### 3.1 Canonical text

M4 preserves the existing backend-authoritative canonical text contract:

- strict UTF-8 ingestion;
- strip one leading BOM;
- CRLF / CR → LF;
- reject NUL and surrogate code points;
- NFC canonicalization;
- no whole-text trim;
- no whitespace collapse;
- no lowercasing;
- no punctuation rewrite;
- no NFKC;
- SHA-256 `content_hash` over canonical UTF-8 content.

M4 never becomes a second authority for TextVersion text.

### 3.2 Coordinates and token authority

M4 preserves:

- Unicode code-point offsets;
- zero-based half-open `[start, end)` ranges;
- backend-derived token `exact_text`;
- sentence-bound token partition;
- exact saved token `Segment.id` as occurrence identity.

Lemma annotation does not own or mutate token coordinates.

### 3.3 Alignment

M4 preserves:

- arbitrary contiguous Alignment `Span`;
- symmetric N:M `AlignmentGroup`;
- existing Alignment creation/update/delete semantics;
- Alignment Tray behavior;
- canonical rendering;
- connector behavior;
- HRA-F09 as separately governed visual debt.

Lemma annotation is not Alignment state.

### 3.4 State ownership

M4 preserves:

- TanStack Query as persisted frontend server-state authority;
- React component/reducer state for ephemeral UI state;
- no optimistic persisted domain authority;
- workspace snapshot as authoritative persisted read model;
- canonical content root unchanged.

### 3.5 Transaction ownership

M4 preserves:

```text
HTTP route
→ application/domain service
→ SQLAlchemy persistence
```

Services own transactions.

Routes never commit or roll back.

A public service call must return with the SQLAlchemy Session transaction-clean.

### 3.6 Runtime baseline

Unchanged:

```text
Python       3.13
Node.js      24
PostgreSQL   18
```

---

## 4. Token-Lemma Dependency Model

A lemma annotation requires one exact current saved token occurrence.

Required invariants:

1. The target `Segment` exists.
2. Its owning layer has `granularity = token`.
3. Its owning token layer belongs to exactly one TextVersion.
4. `Segment.is_word_like` is exactly `TRUE`.
5. The lemma annotation binds by exact persisted `Segment.id`, not by text
   search or coordinates supplied by the frontend.
6. At most one authoritative lemma annotation exists for one token occurrence.
7. A token layer with any lemma dependents may not be normally replaced.
8. A token layer with any lemma dependents may not be normally deleted.
9. Such token mutation fails with `409 SEGMENTATION_HAS_DEPENDENTS`.
10. The Human must explicitly delete dependent lemma annotations before
    ordinary retokenization.
11. M4 performs no automatic re-anchoring, transfer, copying, matching, or
    recovery of lemma annotations across token replacement.
12. Forced TextVersion destruction may cascade lemma annotations atomically
    with their token/sentence hierarchy.

The dependency graph is:

```text
sentence layer
    ↓
token layer
    ↓
token Segment
    ↓
TokenLemmaAnnotation
```

Normal parent mutation is fail-closed when an M4 dependent exists.

---

## 5. Concurrency and Locking Invariant

Lemma mutation and token mutation must serialize on the existing TextVersion
mutation root.

For lemma PUT or DELETE, the service must:

1. identify the target token and owning TextVersion;
2. acquire the corresponding TextVersion row with `SELECT ... FOR UPDATE`;
3. revalidate the exact target token/layer under that transaction;
4. perform the lemma mutation only after that lock is held.

Token segmentation replacement/deletion continues to use the same TextVersion
root lock before dependency inspection and mutation.

This establishes one lock ordering for:

```text
lemma mutation
↔ token replacement/delete
↔ inherited segmentation mutation
```

A concurrent token replacement must therefore either:

- observe the lemma dependent and fail closed; or
- complete first, after which the stale token id no longer resolves and the
  lemma mutation fails closed.

M4 must not introduce a second incompatible lock ordering.

No general repository-wide concurrency redesign is authorized.

---

## 6. Required Domain and Persistence Scope

M4 adds one persistent entity only:

```text
TokenLemmaAnnotation
```

Required table:

```text
token_lemma_annotations
```

Required fields:

```text
id                UUID PRIMARY KEY
token_segment_id  UUID NOT NULL
lemma             TEXT NOT NULL
created_at        timestamptz NOT NULL
updated_at        timestamptz NOT NULL
```

Required persistence constraints:

```text
FOREIGN KEY token_segment_id
    REFERENCES segments(id)
    ON DELETE CASCADE

UNIQUE(token_segment_id)
```

The unique constraint provides the one-authoritative-lemma-per-token invariant.

M4 must not redundantly store:

```text
text_version_id
segmentation_layer_id
language_tag
token start/end
token exact_text
is_word_like
sentence basis id
```

Those values remain derivable from the existing authoritative token hierarchy.

Cross-table eligibility invariants such as token granularity and
`is_word_like = TRUE` are enforced by the application service.

---

## 7. Rejected Persistence Designs

M4 must not implement the following alternatives.

### 7.1 `segments.lemma`

Lemma is not a segmentation property shared by every Segment granularity.

The existing `segments` table must not become a generic linguistic-annotation
object.

### 7.2 Generic annotation/EAV framework

M4 does not create a generalized:

```text
Annotation
AnnotationLayer
attribute/value
property bag
```

framework for hypothetical future POS, morphology, syntax, dictionary, or
other annotation.

### 7.3 Lexeme entity

M4 does not create:

```text
Lexeme
VocabularyEntry
DictionaryEntry
LexicalIdentity
```

or equivalent shared lexical identity.

### 7.4 Alignment storage

Lemma may not be stored on:

```text
Span
AlignmentMember
AlignmentGroup
```

---

## 8. Lemma Value Semantics

The submitted lemma is a Human-authored Unicode string.

Before persistence, the backend must:

1. reject NUL;
2. reject surrogate code points;
3. normalize to NFC;
4. validate the normalized value.

Required normalized-value constraints:

```text
1 <= Unicode code-point length <= 200
```

Leading or trailing Unicode whitespace is invalid.

The service rejects it; it does not silently trim it.

Internal whitespace is permitted.

M4 performs no automatic:

```text
lowercasing
uppercasing
case-folding
NFKC
stemming
language-specific rewriting
punctuation rewriting
dictionary lookup
```

Examples:

```text
"Haus"  remains "Haus"
"être"  remains "être"
```

Normalization may convert canonically equivalent Unicode sequences to NFC, but
otherwise the Human-authored value remains authoritative.

Stable domain error:

```text
INVALID_LEMMA_VALUE
HTTP 422
```

---

## 9. Eligibility Validation

A lemma target is valid only when:

```text
owning layer granularity == token
AND
segment.is_word_like == TRUE
```

Invalid examples:

```text
sentence Segment
whitespace token
punctuation/separator token
nonexistent Segment
```

A structurally existing but ineligible Segment returns:

```text
INVALID_LEMMA_TARGET
HTTP 422
```

A missing target returns:

```text
NOT_FOUND
HTTP 404
```

M4 does not allow the frontend to override `is_word_like` as part of lemma
save.

---

## 10. Migration Contract

Add one Alembic revision:

```text
0005_human_reviewed_lemma_annotations.py
```

Expected M4 Alembic HEAD:

```text
0005
```

Required forward scope:

```text
CREATE TABLE token_lemma_annotations
```

with the fields and constraints defined in this contract.

Revisions:

```text
0001
0002
0003
0004
```

remain byte-for-byte unchanged.

M4 does not rewrite migration history.

### 10.1 Upgrade

Required path:

```text
0004 → 0005
```

Existing M0–M3 rows must remain unchanged.

### 10.2 Downgrade

Required path:

```text
0005 → 0004
```

Downgrade removes only M4-owned lemma schema/data.

Sentence and token segmentation rows survive.

### 10.3 Full migration proof

Required:

```text
empty → 0005
0004 → 0005
0005 → 0004
0004 → 0005 again
alembic current
alembic check
```

All destructive migration-cycle testing continues to use guarded disposable
PostgreSQL databases only.

---

## 11. API Contract

Add:

```text
PUT    /api/v1/token-segments/{token_segment_id}/lemma
DELETE /api/v1/token-segments/{token_segment_id}/lemma
```

No standalone M4 lemma GET endpoint is required.

The document workspace snapshot remains the persisted read authority.

---

## 12. Lemma PUT

Endpoint:

```text
PUT /api/v1/token-segments/{token_segment_id}/lemma
```

Request:

```json
{
  "lemma": "house"
}
```

The frontend supplies no:

```text
text_version_id
token_layer_id
coordinates
exact_text
is_word_like
content_hash
language tag
```

as competing authority.

The backend resolves all target identity from `token_segment_id`.

Required service behavior:

1. begin one write transaction;
2. resolve target ownership sufficiently to locate the TextVersion;
3. lock that TextVersion;
4. re-resolve/revalidate the exact token under the lock;
5. require token granularity;
6. require `is_word_like = TRUE`;
7. validate and NFC-normalize the lemma;
8. find the existing annotation for that token;
9. create, update, or perform a logical no-op;
10. return authoritative persisted annotation;
11. commit exactly once;
12. return with a transaction-clean Session.

Response:

```json
{
  "id": "...",
  "token_segment_id": "...",
  "lemma": "house",
  "created_at": "...",
  "updated_at": "..."
}
```

Status:

```text
200 OK
```

for create, update, and no-op.

### 12.1 Logical no-op

If the normalized submitted lemma exactly equals the persisted lemma:

- no logical write occurs;
- `updated_at` does not advance.

---

## 13. Lemma DELETE

Endpoint:

```text
DELETE /api/v1/token-segments/{token_segment_id}/lemma
```

Required behavior:

- acquire the same TextVersion-root mutation lock;
- validate the exact token ownership;
- delete only the corresponding lemma annotation;
- preserve token segmentation;
- preserve sentence segmentation;
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

Deletion is an explicit user action.

M4 does not require a modal confirmation for deleting one lemma annotation.

---

## 14. Stable Errors

M4 adds:

```text
INVALID_LEMMA_TARGET     422
INVALID_LEMMA_VALUE      422
```

M4 inherits, where applicable:

```text
NOT_FOUND                        404
SEGMENTATION_HAS_DEPENDENTS      409
TEXT_HAS_ANNOTATIONS             409
VALIDATION_ERROR                 422
INTERNAL_ERROR                   500
```

Unexpected persistence failures must never expose SQLAlchemy/PostgreSQL
internals.

No separate:

```text
STALE_LEMMA_CONTENT
STALE_LEMMA_BASIS
```

contract is introduced.

Exact persisted `token_segment_id` is the basis identity. A replaced/deleted
token id fails closed as missing.

---

## 15. Workspace Read Model

Extend:

```text
GET /api/v1/documents/{document_id}/workspace
```

with one additive flat collection:

```text
token_lemma_annotations
```

Item shape:

```json
{
  "id": "...",
  "token_segment_id": "...",
  "lemma": "house",
  "created_at": "...",
  "updated_at": "..."
}
```

The backend query must scope annotations through:

```text
TokenLemmaAnnotation
→ Segment
→ SegmentationLayer
→ TextVersion
→ document
```

The complete snapshot remains materialized inside one owned read transaction.

No ORM lazy traversal after transaction close is allowed.

Deterministic server ordering must be used; frontend correctness must not rely
on that collection's incidental order.

---

## 16. Frontend Normalization

The existing flat-workspace normalization model is extended additively.

Required normalized forms:

```text
lemmaAnnotations
lemmaAnnotationsById
lemmaAnnotationByTokenSegmentId
```

No denormalized duplicate server authority is introduced.

After successful lemma mutation, TanStack Query invalidates/refetches the
authoritative workspace snapshot.

No optimistic persistent lemma state is authoritative.

---

## 17. Frontend Product Scope

Add a bounded lemma annotation UI surface outside the canonical text root.

Recommended component:

```text
LemmaAnnotationPanel
```

The per-TextVersion composition becomes conceptually:

```text
TextPanel
SentenceSegmentationPanel
TokenSegmentationPanel
LemmaAnnotationPanel
```

### 17.1 Prerequisite state

If no saved token layer exists:

```text
Save token segmentation before adding lemma annotations.
```

No lemma target exists until a persisted token `Segment.id` exists.

### 17.2 Eligible rows

The panel displays only authoritative saved token segments satisfying:

```text
is_word_like === true
```

For each eligible token it may display:

- backend-authoritative `exact_text`;
- saved token coordinates as informational metadata;
- current lemma if present;
- editable lemma input;
- save action;
- explicit delete action.

Separator tokens are not lemma-editable.

### 17.3 Saved authority only

Lemma controls bind only to saved token IDs.

An unsaved `TokenDraft` in the token editor is never a lemma target.

Therefore:

```text
saved Segment.id  → eligible identity
unsaved draft     → no persistent lemma identity
```

### 17.4 Mutation state

The UI must represent:

- loading;
- no saved token prerequisite;
- no eligible word-like tokens;
- existing annotations;
- unsaved lemma input;
- saving;
- deleting;
- validation failure;
- missing/stale token after refetch;
- token dependency conflict.

M4 may reuse existing shared button/error/loading primitives.

### 17.5 Canonical DOM

No lemma label, input, metadata, duplicate text, or annotation UI may be
inserted into:

```text
[data-text-content-root]
```

Canonical rendering and native selection remain unchanged.

---

## 18. Token Mutation with Lemma Dependents

Extend existing token replacement/delete service behavior.

Before replacing or deleting an existing token layer, while holding the
TextVersion mutation lock, the service must determine whether any M4 lemma
annotation depends on a token in that layer.

If yes:

```text
409 SEGMENTATION_HAS_DEPENDENTS
```

Recommended error details include:

```text
text_version_id
token_layer_id
dependency_type = "lemma_annotations"
```

No hidden cascade option is introduced.

The required Human workflow is:

```text
delete dependent lemma annotations
→ replace/delete token layer
→ annotate the new saved tokens if desired
```

---

## 19. No Automatic Re-Anchoring

M4 must not attempt to carry lemma metadata through retokenization.

For example:

```text
saved token:
"can't"
lemma = "can"

retokenized:
"ca" + "n't"
```

M4 does not infer whether the old lemma should:

- move;
- copy;
- split;
- disappear;
- transform.

Therefore M4 forbids:

```text
coordinate remapping
exact-text matching
fuzzy matching
lemma carry-forward
automatic token reconciliation
automatic lexical reassignment
```

Lossy parent mutation is prevented instead by explicit dependency blocking.

---

## 20. TextVersion Lifecycle

Existing TextVersion annotation policy remains authoritative.

Because saved sentence/token segmentation already counts as annotation:

- ordinary content replacement remains blocked;
- ordinary annotated TextVersion deletion remains blocked;
- existing `force=true` destructive reset remains the only forced TextVersion
  destruction path.

The M4 FK chain must permit:

```text
TextVersion
→ SegmentationLayer
→ Segment
→ TokenLemmaAnnotation
```

to be destroyed atomically during existing forced TextVersion deletion.

No M4-specific:

```text
force_lemma
cascade_lemma
```

parameter is introduced.

Integration tests must prove the real PostgreSQL cascade and application-level
lifecycle.

---

## 21. Alignment Independence

Required bidirectional independence:

```text
lemma create/update/delete
    ↛ Span
    ↛ AlignmentMember
    ↛ AlignmentGroup

Alignment create/update/delete
    ↛ TokenLemmaAnnotation
```

Lemma annotations are linguistic metadata above token occurrences.

Alignment remains current-document occurrence correspondence.

M4 must not add lemma fields to Alignment entities.

---

## 22. Dependency, Configuration, and Runtime Boundary

M4 adds no runtime/package dependency.

Frozen unless separately amended by Human authority:

```text
apps/api/pyproject.toml
apps/api/uv.lock
apps/web/package.json
apps/web/package-lock.json
```

No new:

```text
lemmatizer
NLP toolkit
dictionary package
ICU binding
model runtime
LLM SDK
remote linguistic provider
frontend state library
```

is authorized.

Runtime baseline remains:

```text
Python 3.13
Node 24
PostgreSQL 18
```

---

## 23. Workflow Boundary

Bounded verification updates may change only what M4 implementation makes
factually necessary, principally:

```text
Alembic expected HEAD: 0004 → 0005
M4 backend/frontend test inclusion
M4 Playwright inclusion
milestone labels/comments
```

No CI provider redesign is authorized.

The existing GitHub Actions external-provider issue:

```text
G2-X01 = OPEN / EXTERNAL
```

remains external project debt.

No previous checkpoint's External Infrastructure Exception is inherited
automatically by M4.

---

## 24. Allowed Change Surface

### Backend

```text
apps/api/alembic/versions/0005_*.py

apps/api/app/db/models/lemma_annotation.py
apps/api/app/db/models/__init__.py

apps/api/app/services/lemma_annotation_service.py
apps/api/app/services/segmentation_service.py
apps/api/app/services/workspace_service.py

apps/api/app/schemas/lemma_annotation.py
apps/api/app/schemas/workspace.py

apps/api/app/api/routes/lemma_annotations.py
apps/api/app/api/errors.py
apps/api/app/main.py

apps/api/app/tests/
```

`apps/api/app/services/text_version_service.py` is not part of the default M4
change surface.

It may be changed only if implementation proves a direct M4 lifecycle necessity
that cannot be satisfied through the existing FK cascade and current
force-delete semantics. Such necessity must be reported explicitly before
broadening the change.

### Frontend

```text
apps/web/src/features/lemma/
apps/web/src/features/workspace/api.ts
apps/web/src/features/workspace/normalize.ts
apps/web/src/features/workspace/WorkspacePage.tsx
apps/web/src/styles.css
apps/web/src/**/*.test.*
apps/web/e2e/
```

### Documentation

```text
docs/adr/ADR-012-*.md
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

Any code/configuration change outside this surface requires:

1. a direct M4 necessity;
2. explicit reporting;
3. Human review before the scope is broadened.

Unrelated cleanup is prohibited.

---

## 25. Documentation Freeze Surface

The M4 docs-only contract-freeze commit is strictly limited to:

```text
docs/development/M4_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

The freeze commit contains no:

```text
implementation code
migration
test modification
dependency modification
lockfile modification
runtime change
workflow modification
branch creation
```

`docs/architecture/ARCHITECTURE.md` and `docs/api/api-contract.md` remain
as-built documents and are not updated to describe unimplemented M4 behavior
during contract freeze.

Their existing stale M2/M3 phase wording is non-blocking documentation debt and
may be corrected during the authorized M4 implementation documentation update
when the corresponding as-built facts are true.

---

## 26. ADR-012 Obligation

Bounded M4 implementation must add an architecture decision record equivalent
to:

```text
ADR-012 — Token-occurrence lemma annotations
```

It must record at least:

- sparse occurrence-level annotation;
- direct token `Segment.id` identity;
- no Lexeme entity;
- no generic annotation/EAV framework;
- separation from Alignment;
- explicit dependency blocking on retokenization;
- forced TextVersion cascade semantics;
- no automatic re-anchoring.

ADR-012 must remain consistent with this frozen execution contract and cannot
broaden it.

---

## 27. Explicit Non-Goals

M4 v1 excludes:

- POS annotation;
- morphology;
- dependency syntax;
- constituency syntax;
- phrase/chunk annotation;
- subword/model tokenization;
- grapheme-aware editing;
- Lexeme entities;
- cross-occurrence lexical identity;
- cross-document lexical identity;
- dictionary entries;
- dictionary APIs;
- definitions;
- pronunciation;
- examples;
- etymology;
- cognates;
- borrowings;
- derivational relations;
- lexical relation ontology;
- automatic lemmatization;
- rule-based lemmatization;
- NLP providers/toolkits;
- LLM providers;
- machine translation;
- token-to-Alignment-Tray staging;
- token selection snapping;
- automatic sentence alignment;
- automatic token alignment;
- candidate alignment;
- connector-routing redesign;
- HRA-F09 remediation;
- authentication;
- collaboration;
- generic concurrency redesign;
- Redis;
- Neo4j;
- Elasticsearch;
- vector databases;
- general graph/search infrastructure;
- pagination;
- virtualization;
- runtime upgrades;
- dependency modernization;
- CI-provider redesign;
- rewriting Alembic revisions `0001` through `0004`.

---

## 28. Backend Testing Obligations

Required backend coverage includes:

### Migration

```text
empty → 0005
0004 → 0005
0005 → 0004
downgrade then upgrade again
M0–M3 row preservation
M4-only row removal on downgrade
0001–0004 historical integrity
alembic current == 0005
alembic check PASS
```

### Domain/API

```text
create lemma on eligible word-like token
reload exact persisted lemma
edit lemma
logical no-op preserves updated_at
delete lemma

one lemma per token

reject sentence Segment
reject non-word-like token
reject missing target

NFC normalization
astral Unicode
combining-mark input
NUL rejection
surrogate rejection
empty rejection
leading-whitespace rejection
trailing-whitespace rejection
200-code-point boundary
over-limit rejection
internal whitespace preservation
case preservation

token replacement blocked by lemma dependent
token deletion blocked by lemma dependent

delete lemma
→ token replacement succeeds

sentence → token dependency behavior unchanged

ordinary TextVersion deletion behavior unchanged
force TextVersion deletion cascades lemma

Alignment deletion preserves lemma
lemma deletion preserves Alignment

workspace read model
document scoping
deterministic materialization

transaction rollback
transaction-clean Session
stable error envelope
```

### Concurrency

At least one real-PostgreSQL integration test must prove that lemma mutation
and token replacement do not silently race past the TextVersion-root dependency
contract.

The test need not claim exhaustive proof of every PostgreSQL interleaving, but
it must verify the accepted locking algorithm against a meaningful concurrent
path.

---

## 29. Frontend Testing Obligations

Required frontend coverage includes:

```text
missing saved-token prerequisite
saved-token prerequisite

only authoritative saved tokens used
only word-like tokens editable

exact saved token preview

unannotated state
existing annotation state

create
edit
logical no-op behavior
delete

NFC server-returned authority
pending mutation state
validation error
NOT_FOUND/stale-target handling
dependency conflict presentation

workspace normalization
lemmaAnnotationByTokenSegmentId

unsaved TokenDraft never becomes lemma target

canonical content-root regression
native selection regression
sentence segmentation regression
token segmentation regression
Alignment Tray regression
Alignment hover/active regression
connector regression
```

No existing test may be weakened, deleted, skipped, or filtered to make M4
pass.

---

## 30. M4 Playwright Path

Add a bounded M4 E2E path such as:

```text
e2e/lemma-annotation.spec.ts
```

Required primary path:

```text
create/import TextVersion
→ save sentence segmentation
→ save token segmentation
→ select a saved word-like token
→ add lemma
→ verify persisted state
→ reload workspace
→ verify exact lemma
→ edit lemma
→ reload
→ verify edit
→ delete lemma
→ verify lemma absent
→ verify sentence/token segmentation unchanged
→ verify Alignment state unchanged
```

Required dependency path:

```text
create lemma
→ attempt saved-token replacement/delete
→ receive dependency-blocked state
→ explicitly delete lemma
→ replace/delete token layer successfully
```

Required Unicode path includes non-ASCII and astral/combining content without
corrupting canonical text or token identity.

---

## 31. Complete Gate 2 Semantic Surface

Nominal complete M4 verification must include:

```text
uv sync --frozen

Alembic empty → 0005
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

tracked-tree integrity
```

The exact canonical workflow may express these commands through existing
repository wrappers, but it may not weaken their semantic meaning.

---

## 32. M4 Gate 2 Provider Policy

M3's External Infrastructure Exception does not authorize an M4 exception.

At M4 Gate 2:

1. first attempt canonical GitHub-hosted verification on the exact frozen M4
   candidate;
2. independently inspect whether the run executes repository steps;
3. distinguish application failure from pre-step provider failure;
4. preserve exact run/job/provenance evidence.

If `G2-X01` still prevents all workflow execution, M4 may use an alternative
proof path only after a new Human review explicitly approves an **M4-specific
External Infrastructure Exception**.

Such an exception may not waive:

- exact candidate provenance;
- exact application tree;
- clean hosted environment;
- Python 3.13;
- Node 24;
- PostgreSQL 18;
- migration proof;
- backend tests;
- zero skips;
- frontend tests;
- production build;
- Playwright;
- tracked-tree integrity.

No M4 exception is pre-authorized by this contract.

---

## 33. Human Runtime Acceptance Boundary

M4 implementation must remain usable as a Human-reviewed manual annotation
workflow.

Runtime acceptance should verify at minimum:

- the token-to-lemma relationship is understandable;
- word-like token targeting is clear;
- separator tokens are not presented as lemma targets;
- entering/editing/deleting lemma is operable;
- token mutation dependency failure is comprehensible;
- users can recover by explicitly deleting dependent lemmas;
- canonical text remains visually and interactively unchanged;
- sentence/token workflows remain understandable;
- existing Alignment workflow remains usable.

Human Runtime Acceptance is separate from automated Gate 2 evidence.

---

## 34. Definition of Done

M4 implementation is complete only when all of the following are true:

1. One saved eligible word-like token can own one persistent Human lemma
   annotation.
2. The annotation binds to exact saved `Segment.id`.
3. Lemma values obey the frozen Unicode/value contract.
4. Saved lemma persists exactly across reload.
5. Lemma can be explicitly edited.
6. Lemma can be explicitly deleted.
7. Invalid targets fail closed.
8. Invalid values fail closed.
9. One token cannot acquire multiple authoritative lemma rows.
10. Retokenization cannot silently destroy or migrate lemma annotations.
11. Token replacement/delete is blocked while lemma dependents exist.
12. Lemma/token concurrent mutation obeys the TextVersion-root lock contract.
13. Forced TextVersion destruction atomically removes lemma dependents.
14. Alignment semantics remain unchanged.
15. Canonical text and canonical DOM remain unchanged.
16. Workspace snapshot remains authoritative.
17. Alembic HEAD is `0005`.
18. Revisions `0001` through `0004` remain unchanged.
19. M0–M3 regression tests remain green.
20. No integration test is silently skipped in accepted full proof.
21. No runtime dependency is added.
22. No frontend/backend package dependency is added.
23. No explicit M4 non-goal is implemented.
24. Gate 2 evidence meets the then-authorized M4 provider policy.
25. Static Human Diff Review passes.
26. Human Runtime Acceptance passes.
27. Candidate provenance is frozen before PR/merge.
28. No merge occurs without a separate Human Merge Decision.

---

## 35. Stop Conditions

Implementation must stop and report rather than silently broaden the milestone
if any of the following becomes necessary:

- introducing Lexeme identity;
- adding POS/morphology/syntax concepts;
- adding automatic lemmatization;
- adding a dictionary/NLP/LLM provider;
- changing canonical text semantics;
- changing offset semantics;
- changing M3 token identity;
- rewriting migrations `0001`–`0004`;
- modifying package manifests/lockfiles;
- upgrading runtime baselines;
- redesigning CI providers;
- redesigning connector routing;
- redesigning Alignment semantics;
- introducing a generic annotation framework;
- changing `text_version_service.py` for a reason not directly required by
  verified M4 lifecycle behavior;
- changing files outside the allowed surface without a documented direct
  necessity.

At such a boundary, the Agent must report the conflict and wait for Human
authority.

---

## 36. Freeze and Implementation Authority Boundary

This contract is Human-approved and is frozen by a dedicated docs-only commit
whose parent must be exactly:

`3cada0d2dcdcf349152aacc53992b15190271a75`

and whose changed-file scope must be limited to:

```text
docs/development/M4_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

After the freeze commit is independently verified:

```text
Contract Freeze
→ verify exact freeze commit/tree
→ Bounded Agent Prompt
→ Human authorization of implementation branch
→ Implementation Branch
```

No implementation branch may be created before that separate Human
authorization.
