# LinguaGraph M7 — Alignment Mutation Concurrency Hardening

## Contract Status

**Status:** FROZEN — HUMAN APPROVED

**Human contract review / freeze authorization date:** 2026-09-19

**Approved pre-freeze durable base:** `e0b50eb647ae8901a8ff574e7b4d1aa2d6c41107`

**Approved pre-freeze durable tree:** `5b659f23f21d4fd96e4b5cb87f970b575b975ccf`

**Implementation authorization:** NOT GRANTED by this freeze. Bounded M7
implementation may begin only after the docs-only freeze commit is
independently verified and the Human separately authorizes creation of the
implementation branch.

**Planned implementation branch:**
`m7-alignment-mutation-concurrency-hardening`

This contract is the authoritative bounded execution contract for M7.

It inherits:

- the accepted M0 domain model and Alignment invariants;
- the completed M1 interaction/presentation boundary;
- the completed M2–M5 linguistic persistence and mutation contracts;
- the completed M6 mode-oriented Workbench information architecture;
- ADR-001 through ADR-014.

M7 does not silently reopen those decisions.

---

## 1. Goal and Governing Retained Debt

M7 closes the retained backend correctness debt for Alignment mutation
concurrency.

The as-built pre-freeze system has these relevant properties:

- Alignment create/update/delete are atomic service-owned transactions;
- concurrent identical Span creation is protected by PostgreSQL
  `INSERT ... ON CONFLICT DO NOTHING` get-or-create;
- same-group Alignment PATCH has no general backend serialization contract;
- Alignment mutation versus destructive TextVersion deletion has no shared
  cross-service lock order;
- `TextVersion.replace_content()`, segmentation mutation, lemma mutation, and
  POS mutation already serialize on `TextVersion FOR UPDATE`;
- the frontend Inspector suppresses overlapping same-group mutations generated
  by that UI, but frontend suppression is not backend correctness authority.

M7 establishes a deterministic pessimistic serialization model for the scoped
backend mutation paths without changing Alignment identity, API shape,
persistence schema, frontend behavior, or the M0–M6 domain model.

---

## 2. Bounded Scope

### 2.1 In scope

M7 governs concurrency for:

1. Alignment CREATE;
2. Alignment PATCH;
3. Alignment DELETE;
4. PATCH versus PATCH on the same AlignmentGroup;
5. PATCH/DELETE races on the same AlignmentGroup;
6. Alignment mutation versus destructive TextVersion DELETE;
7. Alignment CREATE versus TextVersion `replace_content()`;
8. Span create/reuse/orphan-cleanup correctness under those races;
9. real-PostgreSQL audit of Alignment mutation versus ParallelDocument DELETE;
10. real-PostgreSQL audit of Alignment mutation versus Project DELETE.

### 2.2 Audit-only adjacent scope

ParallelDocument deletion and Project deletion remain outside the authorized
production implementation scope.

They are mandatory concurrency audit surfaces only.

If audit evidence reveals a deadlock, database exception leak, dangling state,
resurrection, or unstable non-domain failure that cannot be explained without
changing those production deletion paths, implementation must STOP and return
to Human scope review.

The Agent may not silently broaden M7.

### 2.3 Explicitly out of scope

M7 does not authorize:

- authentication, permissions, or collaboration;
- WebSocket/event synchronization;
- ETag / `If-Match`;
- optimistic version columns;
- a generic repository-wide lock manager;
- schema redesign or Alembic `0007`;
- Alignment identity or N:M semantics redesign;
- Span identity redesign;
- Project or ParallelDocument production deletion redesign without a new Human
  scope decision;
- segmentation, lemma, or POS redesign;
- machine candidate alignment;
- frontend feature redesign;
- connector routing / `HRA-F09` remediation;
- workflow-provider redesign;
- dependency, lockfile, or runtime-baseline changes.

---

## 3. Inherited Domain Invariants

M7 preserves all existing M0 Alignment rules.

### 3.1 AlignmentGroup

An AlignmentGroup remains one symmetric N:M hyperedge:

- minimum two members;
- minimum two distinct TextVersions;
- all members belong to the same ParallelDocument;
- multiple non-overlapping spans from one TextVersion remain allowed;
- one Span may participate in multiple AlignmentGroups.

M7 adds no source/target direction and no relation type.

### 3.2 Span identity

A Span remains identified by persisted coordinates under one TextVersion.

The database uniqueness contract remains:

```text
UNIQUE(text_version_id, start_offset, end_offset)
```

Server-derived `exact_text`, `prefix`, and `suffix` remain authoritative.

The accepted PostgreSQL get-or-create algorithm remains valid and must not be
replaced by a bare outer-transaction IntegrityError rollback pattern.

### 3.3 TextVersion canonical authority

M7 preserves:

- canonical Unicode normalization;
- content-hash semantics;
- Unicode code-point offsets;
- immutable annotated content semantics;
- ADR-005 destructive reset behavior;
- existing segmentation/lemma/POS dependent semantics.

---

## 4. Transaction Ownership

M7 preserves the modular-monolith boundary:

```text
HTTP route
→ application/domain service
→ SQLAlchemy persistence
```

Services own transactions.

Routes do not commit, roll back, or orchestrate row locks.

Every public service mutation must return with the SQLAlchemy Session
transaction-clean.

No long-lived lock survives the service transaction.

---

## 5. Canonical Serialization Model

### 5.1 Alignment topology root

The Human-approved canonical Alignment topology serialization root is:

```text
ParallelDocument
```

A scoped Alignment mutation must acquire the relevant ParallelDocument row
using PostgreSQL row locking before mutation-authoritative Alignment state is
validated or changed.

### 5.2 Canonical lock order

When TextVersion state participates, the canonical order is:

```text
ParallelDocument FOR UPDATE
        ↓
participating TextVersion rows FOR UPDATE
sorted deterministically by UUID
        ↓
re-resolve authoritative state
        ↓
validate
        ↓
mutate
```

The deterministic UUID ordering is required whenever more than one
TextVersion row is locked.

No M7 path may intentionally acquire the same lock family in reverse order.

### 5.3 Existing TextVersion-root mutation

Segmentation, lemma, and POS mutations already lock only their owning
TextVersion and do not subsequently acquire ParallelDocument.

M7 must preserve that property.

M7 must not introduce:

```text
TextVersion
→ ParallelDocument
```

as a competing lock order.

### 5.4 AlignmentGroup row locks

An AlignmentGroup row lock may be used after the canonical ParallelDocument
root is held when locally useful, but it is not a second serialization root
and cannot establish a competing lock order.

---

## 6. Locator-Only Pre-Lock Rule

The frozen rule is:

```text
PRE-LOCK READS ARE LOCATORS, NOT MUTATION AUTHORITY.
```

Before the canonical root lock is acquired, a service may resolve only the
minimum identity necessary to locate the root, such as:

```text
alignment_id → document_id
text_version_id → document_id
```

State read before the root lock may not be trusted for:

- current member authority;
- proposed/current TextVersion participation;
- Span reuse/deletion decisions;
- orphan cleanup;
- canonical text slicing;
- Alignment invariant validation;
- TextVersion annotation checks;
- destructive-reset decisions.

After canonical locks are held, every such fact must be re-resolved from the
database.

If the locator itself disappears before the root can be locked, the service
must return the existing stable domain NOT_FOUND outcome.

---

## 7. Cross-Document Lock Exclusion

While holding one ParallelDocument root, an Alignment transaction must never
lock a TextVersion that belongs to a different ParallelDocument.

For CREATE/PATCH:

1. lock the canonical ParallelDocument;
2. resolve submitted TextVersion identities under that root;
3. reject missing targets with existing NOT_FOUND semantics;
4. reject foreign-document targets with existing
   `CROSS_DOCUMENT_ALIGNMENT` semantics;
5. only then lock same-document participating TextVersions in deterministic
   UUID order.

This prevents malformed cross-document requests from creating a cross-document
lock graph.

---

## 8. Alignment CREATE Contract

Alignment CREATE must execute one service-owned transaction.

Required ordering:

```text
locate requested ParallelDocument
→ lock ParallelDocument
→ resolve submitted TextVersions under root
→ reject missing / cross-document targets
→ lock participating TextVersions in sorted UUID order
→ re-resolve canonical TextVersion content
→ validate coordinates / overlaps / membership invariants
→ get-or-create Spans
→ create AlignmentGroup / AlignmentMembers
→ commit
```

The service may not create a Span from canonical content observed before the
required locks are held.

---

## 9. Alignment PATCH Contract

PATCH preserves its existing partial-field semantics.

Required ordering:

```text
pre-resolve alignment_id → document_id locator only
→ lock ParallelDocument
→ re-resolve AlignmentGroup
→ resolve current + proposed participating TextVersions
→ reject missing / cross-document proposed targets
→ lock union(current, proposed) TextVersions in sorted UUID order
→ re-resolve authoritative group/member/span state
→ validate
→ apply only supplied PATCH fields
→ exact orphan cleanup
→ commit
```

### 9.1 Concurrent PATCH semantics

Concurrent PATCHes to the same AlignmentGroup must be serial-equivalent.

Both may succeed when both remain valid.

For overlapping supplied fields, the later serialized write determines the
final value.

A field omitted by the later PATCH retains the already-committed authoritative
value from the earlier serialized mutation.

No unique-constraint or raw database exception may leak as the normal
concurrency outcome.

M7 does not introduce optimistic conflict/version semantics.

---

## 10. Alignment DELETE Contract

Required ordering:

```text
pre-resolve alignment_id → document_id locator only
→ lock ParallelDocument
→ re-resolve AlignmentGroup
→ resolve participating TextVersions
→ lock them in sorted UUID order
→ re-resolve authoritative membership state
→ delete AlignmentGroup / members
→ exact orphan cleanup
→ commit
```

If the group disappeared before authoritative re-resolution, return existing
NOT_FOUND semantics.

---

## 11. TextVersion Destructive DELETE Integration

The existing ADR-005 deletion semantics remain authoritative.

M7 changes only the locking/re-resolution discipline.

For TextVersion DELETE, including `force=true`:

```text
pre-resolve text_version_id → document_id locator only
→ lock ParallelDocument
→ re-resolve + lock TextVersion
→ inspect current segmentation / Span / membership authority
→ apply existing block-or-delete semantics
→ revalidate affected AlignmentGroups
→ perform required group/orphan cleanup
→ commit
```

The service must not lock TextVersion first and then acquire ParallelDocument.

Existing outcomes such as `TEXT_HAS_ANNOTATIONS` remain unchanged.

---

## 12. TextVersion Content Replacement Integration

`replace_content()` remains legal only for an unannotated TextVersion.

M7 changes its lock order to:

```text
pre-resolve text_version_id → document_id locator only
→ lock ParallelDocument
→ re-resolve + lock TextVersion
→ re-check spans / segmentation
→ replace canonical content only if still unannotated
→ commit
```

This creates a deterministic race contract with Alignment CREATE:

- Alignment first: replacement subsequently observes the new Span and fails
  closed with existing `TEXT_HAS_ANNOTATIONS`;
- replacement first: Alignment subsequently derives Span metadata from the new
  authoritative canonical content.

No stale pre-lock content may become Span authority.

---

## 13. Frozen Observable Concurrency Outcomes

### 13.1 PATCH ↔ PATCH same group

Both requests serialize.

Both may succeed if their operations remain valid.

Final state must equal some legal serial execution of the two PATCH requests.

No raw IntegrityError may leak.

### 13.2 PATCH ↔ DELETE same group

Legal outcomes:

```text
PATCH first:
PATCH succeeds
→ DELETE re-resolves and may succeed

DELETE first:
DELETE succeeds
→ PATCH re-resolves to NOT_FOUND
```

### 13.3 DELETE ↔ DELETE same group

Exactly one may delete the group.

The other re-resolves to NOT_FOUND.

### 13.4 CREATE ↔ force DELETE participating TextVersion

Legal outcomes:

```text
CREATE first:
delete observes newly authoritative Alignment state
and applies existing ADR-005 force semantics

DELETE first:
CREATE re-resolves missing TextVersion
→ NOT_FOUND
```

No deleted TextVersion, Span, or membership may be resurrected.

### 13.5 PATCH ↔ force DELETE participating TextVersion

PATCH first:

- destructive deletion must evaluate the updated authoritative membership
  topology.

Delete first:

- PATCH must re-resolve and fail closed through stable domain semantics.

### 13.6 Alignment DELETE ↔ force DELETE TextVersion

Either legal serialized order may occur.

The result must contain no:

- double-cleanup database failure;
- dangling AlignmentMember;
- deleted-but-required shared Span;
- invalid surviving AlignmentGroup.

### 13.7 CREATE ↔ replace_content

The frozen outcomes are those in section 12.

---

## 14. Span Cleanup Invariant Under Concurrency

A Span may be deleted as an orphan if and only if, under the serialized
authoritative state:

```text
zero surviving AlignmentMember references remain
```

M7 must prove:

- no surviving AlignmentMember references a deleted Span;
- no shared Span required by another surviving group is deleted;
- no scoped operation leaks a true orphan that should be cleaned;
- no invalid AlignmentGroup survives a scoped destructive path;
- cleanup remains atomic with its owning mutation.

Existing Span reuse across groups remains valid.

---

## 15. Project / ParallelDocument Deletion Audit Boundary

### 15.1 ParallelDocument DELETE

Production redesign is not authorized.

M7 must audit real PostgreSQL concurrency between scoped Alignment mutation and
ParallelDocument deletion.

Expected safe serial behavior:

- Alignment root lock first → document deletion waits, then cascade deletes the
  complete document subtree;
- document deletion first → Alignment root re-resolution fails with NOT_FOUND.

### 15.2 Project DELETE

Production redesign is not authorized.

M7 must audit real PostgreSQL concurrency between scoped Alignment mutation and
Project deletion/cascade.

### 15.3 Audit STOP rule

If either audit reveals any of the following:

- deadlock;
- leaked IntegrityError or unstable database exception;
- dangling AlignmentMember;
- resurrected Span/AlignmentGroup/TextVersion;
- other non-domain corruption/failure requiring production deletion changes;

implementation must STOP and return to Human scope review.

The Agent may not modify Project or ParallelDocument deletion services under
the frozen M7 contract unless the Human explicitly broadens scope.

---

## 16. Persistence and Migration Boundary

M7 changes no persistence schema.

Frozen:

```text
Alembic HEAD: 0006
new revision: NONE
ORM schema: unchanged
database constraints: unchanged
```

Required migration verification still includes:

```text
alembic current
alembic check
```

Expected result:

```text
current head = 0006
alembic check = no new upgrade operations detected
```

Existing migration files remain byte-for-byte unchanged.

---

## 17. API Boundary

M7 adds no route and changes no request/response shape.

Existing endpoints retain their HTTP/domain semantics.

M7 adds no new stable domain error code.

In particular, M7 does not introduce:

```text
CONCURRENT_MODIFICATION
ETag
If-Match
version
revision
```

Concurrency correctness is server-side pessimistic serialization plus
authoritative re-resolution.

---

## 18. Frontend Boundary

No frontend feature change is required or authorized.

Existing Inspector mutation suppression remains useful UX defense-in-depth but
is not backend correctness evidence.

M7 must not depend on a browser/client mutex for correctness.

Existing M6 Workbench IA, selection behavior, Alignment Tray, Inspector, and
connector behavior remain unchanged.

---

## 19. Required Real-PostgreSQL Concurrency Matrix

M7 implementation must add deterministic integration coverage for at least:

```text
C-R01  PATCH ↔ PATCH same AlignmentGroup
C-R02  PATCH ↔ DELETE same AlignmentGroup
C-R03  DELETE ↔ DELETE same AlignmentGroup

C-R04  CREATE Alignment ↔ force DELETE TextVersion
C-R05  PATCH Alignment ↔ force DELETE TextVersion
C-R06  DELETE Alignment ↔ force DELETE TextVersion

C-R07  CREATE Alignment ↔ replace_content

C-R08  shared Span survives competing serialized topology mutation
C-R09  true orphan Span is removed exactly once

C-A01  Alignment mutation ↔ DELETE ParallelDocument
C-A02  Alignment mutation ↔ DELETE Project
```

`C-A01` and `C-A02` are audit tests and may be parameterized across useful
Alignment mutation forms.

A failure of C-A01/C-A02 that requires changing the audit-only production
surface is a STOP condition, not automatic authorization.

---

## 20. Concurrency Test Discipline

The M7-specific race evidence must use real PostgreSQL 18.

Required characteristics:

- separate SQLAlchemy Sessions/connections for competing transactions;
- real threads/processes where appropriate;
- `threading.Barrier`, `Event`, or controlled lock-holder transactions to
  establish meaningful interleavings;
- bounded waits and bounded joins;
- explicit proof that a contended operation actually waited when a test claims
  lock serialization;
- post-race database invariant inspection;
- no skipped concurrency evidence.

Timing-only tests whose sole synchronization is arbitrary sleep are
insufficient as the only proof of a required race.

A small bounded sleep may be used only as supporting evidence after a
deterministic lock holder/event has established the contention point, matching
the accepted M4/M5 test precedent.

---

## 21. Full Regression Verification

M7-specific concurrency evidence supplements, not replaces, full regression
verification.

Gate 2 must include at least:

### Backend

```text
uv sync --frozen
alembic current
alembic check
full pytest against real PostgreSQL 18
zero skipped required tests
```

### Frontend

```text
npm ci
npm run lint
npm run typecheck
Vitest full suite
npm run build
```

### Browser

Full retained M0–M6 Playwright regression coverage must pass.

M7 does not require a new user-facing E2E feature path solely to restate a
backend row-lock race, but affected destructive/reset browser regressions must
remain green.

---

## 22. Gate 2 Hosted Evidence and G2-X01

M6's `G2-X01 CLOSED / PASS` and M6 Gate 2 `PASS / ESTABLISHED` are evidence
for the exact M6 candidate only.

They do not establish M7 Gate 2.

The M6 C5 authorization is:

```text
SPENT / MUST NOT REUSE
```

M7 Gate 2 must first attempt canonical GitHub-hosted verification on the exact
frozen M7 candidate and inspect whether repository-defined workflow steps
actually execute.

Recent main runs have continued to exhibit the historical provider/pre-step
fingerprint (`steps=[]`, logs unavailable / `BlobNotFound`). That diagnostic
does not waive any M7 semantic requirement.

If the provider/pre-step condition persists, any alternate hosted proof path
requires a new explicit M7-specific Human authorization / External
Infrastructure Exception.

No prior proof repository, token, provider instance, or stopped ECS host is
implicitly authorized for M7 execution.

No exception may waive:

- exact candidate/tree/frozen-base provenance;
- Python 3.13 / Node 24 / PostgreSQL 18;
- frozen dependency installation;
- Alembic integrity;
- full real-PostgreSQL backend tests;
- required M7 concurrency evidence with zero skips;
- frontend lint/typecheck/Vitest/build;
- retained Playwright regression;
- dependency integrity;
- cleanup;
- final remote/tree provenance.

---

## 23. Default Implementation Surface

Default authorized production surface after separate implementation
authorization:

```text
apps/api/app/services/alignment_service.py
apps/api/app/services/text_version_service.py
```

A narrowly scoped locking/concurrency helper under:

```text
apps/api/app/services/
```

is conditionally allowed only if it materially prevents duplicate lock-order
logic. It must not become a generic repository lock framework.

Required/allowed tests:

```text
apps/api/app/tests/integration/
apps/api/app/tests/
```

Implementation documentation may include:

```text
docs/adr/ADR-015-*.md
docs/architecture/ARCHITECTURE.md
docs/api/api-contract.md
docs/testing/
docs/development/
AGENTS.md
README.md
```

Any additional production surface requires direct M7 necessity and explicit
reporting. Audit failure that would require Project/Document deletion changes
requires Human scope review before modification.

---

## 24. Default Prohibited Implementation Surface

Unless separately authorized, M7 must not modify:

```text
apps/api/alembic/versions/
apps/api/app/db/models/
apps/web/src/
apps/web/e2e/
apps/api/pyproject.toml
apps/api/uv.lock
apps/web/package.json
apps/web/package-lock.json
.github/workflows/
```

Also prohibited:

- weakening existing tests;
- deleting/skipping retained race tests;
- changing M0–M6 frozen contracts;
- editing ADR-001 through ADR-014;
- Project/ParallelDocument production deletion redesign;
- generic lock manager abstractions;
- unrelated refactoring.

---

## 25. Dependency, Runtime, and Configuration Boundary

M7 adds no runtime/package dependency.

Runtime baseline remains:

```text
Python       3.13
Node.js      24
PostgreSQL   18
```

Dependency manifests and lockfiles remain unchanged.

No provider/configuration change is authorized by implementation scope unless
the Human separately authorizes an evidence-path operation.

---

## 26. Documentation Freeze Surface

The M7 docs-only contract-freeze commit is strictly limited to:

```text
docs/development/M7_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It contains no:

```text
implementation code
test modification
ADR-015 implementation record
architecture-as-built modification
API implementation modification
migration
workflow modification
dependency modification
lockfile modification
proof-repository modification
provider mutation
implementation branch creation
```

`docs/architecture/ARCHITECTURE.md`, `docs/api/api-contract.md`, and
`docs/testing/testing-strategy.md` remain as-built-through-M6 documents
during the freeze. They must not describe unimplemented M7 behavior as current
reality.

---

## 27. ADR-015 Obligation

Bounded M7 implementation must add an ADR equivalent to:

```text
ADR-015 — Document-Root Serialization for Alignment Mutations
```

It must record at least:

- ParallelDocument as Alignment topology serialization root;
- deterministic UUID ordering for participating TextVersion row locks;
- locator-only pre-lock reads;
- authoritative re-resolution under canonical locks;
- cross-document lock exclusion;
- serial-equivalent PATCH semantics;
- integration of destructive TextVersion DELETE;
- integration of `replace_content()`;
- Span orphan/shared-reference invariant;
- Project/ParallelDocument deletion audit boundary;
- rejection of ETag/optimistic versioning for M7;
- rejection of a generic repository lock manager.

ADR-015 must remain consistent with this frozen contract and cannot broaden
it.

ADR-015 is an implementation record and is deliberately absent from this
docs-only freeze commit.

---

## 28. Explicit Non-Goals

M7 excludes:

- any new product-facing feature;
- any new linguistic annotation type;
- morphology or syntax;
- machine/automatic Alignment;
- collaboration;
- authentication/permissions;
- optimistic concurrency protocol;
- general hierarchy locking redesign;
- Project/ParallelDocument deletion redesign absent a new Human decision;
- database schema changes;
- frontend IA or connector changes;
- CI-provider redesign;
- unrelated M0–M6 cleanup.

---

## 29. STOP Conditions

Implementation must stop and report before broadening scope if:

- canonical ordering `ParallelDocument → sorted TextVersion` cannot be
  preserved;
- an implementation path requires `TextVersion → ParallelDocument`;
- malformed cross-document input would require locking a foreign TextVersion
  while holding another document root;
- Project/ParallelDocument audit reveals production changes are necessary;
- schema/Alembic change becomes necessary;
- API request/response or stable error redesign becomes necessary;
- frontend functional changes become necessary;
- a new dependency/runtime change becomes necessary;
- an existing M0–M6 invariant must change;
- a required concurrency race cannot be proven against real PostgreSQL 18;
- a required retained regression must be weakened or skipped.

---

## 30. Definition of Done

M7 implementation is complete only when all of the following are true:

1. Alignment CREATE follows the canonical document-root lock order.
2. Alignment PATCH follows the canonical document-root lock order.
3. Alignment DELETE follows the canonical document-root lock order.
4. participating TextVersion locks are acquired in deterministic UUID order.
5. no scoped path introduces `TextVersion → ParallelDocument` lock inversion.
6. pre-lock reads remain locator-only.
7. mutation-authoritative state is re-resolved after canonical locks.
8. foreign-document submitted members are rejected before foreign row locking.
9. concurrent same-group PATCH is serial-equivalent.
10. PATCH/DELETE and DELETE/DELETE return only legal stable outcomes.
11. Alignment mutation versus destructive TextVersion deletion is serialized.
12. Alignment CREATE versus `replace_content()` is serialized.
13. ADR-005 force-delete semantics remain unchanged.
14. Span get-or-create semantics remain unchanged.
15. shared Spans survive when still referenced.
16. true orphans are removed exactly when unreferenced.
17. no dangling AlignmentMember can survive.
18. no invalid AlignmentGroup survives a scoped destructive operation.
19. C-R01 through C-R09 pass against real PostgreSQL 18.
20. C-A01 and C-A02 pass, or implementation stops for Human scope review.
21. no Project/ParallelDocument production deletion redesign occurs without
    separate Human authorization.
22. Alembic HEAD remains `0006`.
23. `alembic check` reports no new operations.
24. no schema/model migration is introduced.
25. no API route/request/response shape changes.
26. no new stable concurrency error protocol is introduced.
27. frontend behavior remains unchanged.
28. dependencies, lockfiles, and runtime baseline remain unchanged.
29. full backend regression passes with required tests unskipped.
30. lint, typecheck, Vitest, and production build pass.
31. retained M0–M6 Playwright regression passes.
32. exact-candidate Gate 2 evidence is established for M7 independently of M6.
33. ADR-015 is added during implementation and matches this frozen contract.
34. architecture/testing/state/user-facing documentation matches implemented
    reality before Human merge decision.
35. Static Human Diff Review passes before any Human merge decision.

Because M7 is backend concurrency hardening with no intended user-facing
feature change, a fresh broad UX acceptance exercise is not automatically
required by this contract. The Human may still require targeted runtime
acceptance if implementation behavior or review evidence makes it useful.

---

## 31. Freeze and Authorization Boundary

This docs-only contract freeze does **not** authorize implementation.

After the freeze is durably landed, the next safe sequence is:

```text
independently verify exact freeze commit/tree and exact four-file scope
→ Human separately authorizes bounded M7 implementation branch
→ create m7-alignment-mutation-concurrency-hardening from exact frozen main
→ bounded implementation
```

Until that separate Human authorization:

```text
NO implementation branch
NO application code change
NO test change
NO ADR-015 implementation record
NO workflow change
NO dependency change
NO proof execution
NO provider mutation
```
