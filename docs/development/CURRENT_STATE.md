# LinguaGraph — Current Engineering State

This file is a durable engineering handoff and navigation index.

It summarizes where the repository currently stands so that a new human,
ChatGPT conversation, or coding Agent can reconstruct the project state
without relying on chat history.

It is NOT a replacement for the accepted ADRs, the authoritative
pre-implementation specification/report, the repository implementation,
Alembic migration history, or merged GitHub PR history.

---

## 1. Repository checkpoint

Last completed implementation checkpoint:

**M0.3 — Document Workspace** (COMPLETE / MERGED)

Most recent implementation checkpoint:

**M0.4 — Selection Engine** (IMPLEMENTED — awaiting human review)

M0.1, M0.2, and M0.3 have been human-reviewed, approved, and merged into
`main`.

M0.3 GitHub state:

- PR #5 — `M0.3 — Document Workspace`
- final implementation head: `33bfaef20c2e64bed92fe00aa147d74611ac41ad`
- merge commit: `1230ffe0282adac3a20c1aafac6c2271c788b198`
- merged: 2026-08-19

M0.4 implementation is complete but has NOT yet been human-reviewed/merged.
M0.5 has NOT started and must not begin until M0.4 has been human-reviewed,
approved, and merged into `main`.

M0.4 base provenance (historical): the original M0.4 implementation attempt
was created from the reviewed M0.3 implementation head
`33bfaef20c2e64bed92fe00aa147d74611ac41ad` because the implementation
environment could not reach the remote. During Gate 2 base reconciliation,
remote repository state was restored and verified. The M0.4 branch was then
rebased onto the approved post-M0.3 checkpoint base
`46b255481518d079a5604a770b9d3036647f8a89`. The earlier `33bfaef` base is
retained only as historical provenance of the implementation attempt and is
no longer the current branch base.

---

## 2. Completed checkpoints

### M0.1 — Repository Foundation

Status:

**COMPLETE / MERGED**

GitHub:

- PR #1 — `M0.1 — Repository Foundation`
- merge commit: `5bfdb9b`

Established:

- monorepo foundation;
- FastAPI backend skeleton;
- `/api/v1/health`;
- SQLAlchemy / Alembic foundation;
- PostgreSQL 18 development/test foundation;
- React + TypeScript + Vite frontend;
- TanStack Query provider;
- pytest / Vitest / React Testing Library;
- runtime and package-manager baselines;
- developer setup documentation.

### M0.2 — Persistence Model

Status:

**COMPLETE / MERGED**

GitHub:

- PR #2 — `M0.2 — Persistence Model`
- final implementation head: `71ab918`
- merge commit: `c92204f`

Implemented:

- six language-neutral SQLAlchemy domain models;
- Alembic revision `0002` for the M0 domain schema;
- PostgreSQL constraints, indexes, FKs and cascade behavior;
- canonical-text utilities;
- Unicode code-point offset utilities;
- BCP-47 syntactic validation;
- Project / ParallelDocument / TextVersion persistence services;
- Span persistence foundation and server-derived quote/context metadata;
- alignment invariant predicates;
- ADR-005 destructive TextVersion reset behavior;
- mechanically safe service-owned transaction boundaries;
- real PostgreSQL integration-test foundation.

M0.2 deliberately did NOT implement:

- HTTP CRUD/workspace routes and schemas;
- Document Workspace UI;
- text import UI;
- frontend selection engine;
- complete AlignmentService;
- alignment mutation HTTP endpoints;
- concurrency-safe alignment Span get-or-create;
- visualization/connectors;
- later NLP/linguistic layers.

Those remain assigned to their later checkpoints (HTTP CRUD/workspace and
text import UI are now implemented by M0.3).

### M0.3 — Document Workspace

Status:

**COMPLETE / MERGED**

GitHub:

- PR #5 — `M0.3 — Document Workspace`
- final implementation head: `33bfaef20c2e64bed92fe00aa147d74611ac41ad`
- merge commit: `1230ffe0282adac3a20c1aafac6c2271c788b198`

Implemented:

- Project HTTP CRUD (`POST/GET/GET/PATCH/DELETE /api/v1/projects[/{id}]`);
- ParallelDocument HTTP CRUD (project-scoped and document-scoped paths);
- TextVersion HTTP boundary: JSON plain-text paste, strict UTF-8 `.txt`
  multipart import (canonical UTF-8 pipeline: reject malformed, strip one
  leading BOM, CRLF/CR -> LF, reject NUL/surrogates, NFC, configured size,
  hash of canonical content), get, metadata-only `PATCH` (`label`,
  `sort_order` — content is never accepted), delete and
  `DELETE ?force=true` (ADR-005);
- stable `{code, message, details}` API error contract, including
  HTTP/Pydantic validation conversion and duplicate-label `CONFLICT` without
  SQLAlchemy/PostgreSQL exception leakage. Only the PostgreSQL
  `uq_text_versions_document_label` unique violation is translated to
  `CONFLICT` (driver constraint-name classification — unexpected integrity
  errors propagate); explicit `null` for PATCH `label`/`sort_order` is
  rejected at the Pydantic boundary (422), while omission still means
  "leave unchanged";
- raw HTTP request-body size enforcement (`MAX_REQUEST_BODY_BYTES`) via
  `app/api/middleware.py`: actual received-byte counting for both the JSON
  paste and the multipart upload paths, rejected before unbounded
  buffering with the stable 413 `TEXT_TOO_LARGE` envelope; separate from
  the canonical-text `MAX_TEXT_VERSION_CODEPOINTS` limit;
- workspace read model service
  (`GET /api/v1/documents/{id}/workspace`) returning flat collections for
  document / text_versions / spans / alignment_groups / alignment_members;
  deterministic TextVersion ordering `(sort_order, created_at, id)`;
- transaction-clean workspace reads (one owned `read_transaction`, fully
  materialized snapshot, no lazy load after service return);
- frontend route tree `-> /projects -> /projects/:projectId/documents ->
  /documents/:documentId/workspace` (react-router);
- `features/projects`, `features/documents`, `features/workspace` modules,
  shared API client + error boundary;
- TanStack Query server state with the accepted query keys and mutation
  invalidation;
- TextPanels: language tag, label, hide control, exact canonical content as
  plain pre-wrap text (no `dangerouslySetInnerHTML`, no selection/annotation
  rendering);
- per-document panel preferences
  (`linguagraph.workspace.preferences.v1.<documentId>`), open/hide/reorder,
  stale-id reconciliation against server TextVersion ids;
- paste + `.txt` import UI; force-delete confirmation dialog warning about
  annotations/groups;
- M0.3 backend integration tests, frontend Vitest/RTL tests, and the
  Playwright golden-path slice (through workspace creation — no selection).

### M0.3 human-review fix pass (same checkpoint, no new scope)

Review findings A/B/C were fixed without touching the frozen schema/ADRs or
the transaction contract:

- **A — Playwright database isolation:** the E2E backend
  (`apps/api/app/e2e/server.py`) runs on a uniquely-created disposable
  PostgreSQL database (`linguagraph_e2e_<uuid>`), migrated to Alembic HEAD
  and dropped on exit; `reuseExistingServer: false` for the API webServer;
  the spec's delete-everything clean-slate strategy was removed. The shared
  lifecycle lives in `app/db/disposable.py` (used by both the pytest
  fixtures and the E2E wrapper) with a fail-closed
  `assert_disposable_db_url` guard; mechanically guarded by
  `apps/web/src/test/playwrightConfig.test.ts` and the disposable-db unit/
  integration tests.
- **B — MAX_REQUEST_BODY_BYTES:** enforced on actual received bytes for
  JSON paste and multipart upload (`app/api/middleware.py`, 413
  `TEXT_TOO_LARGE` before unbounded buffering), with HTTP integration tests
  for oversized JSON/multipart and just-below-limit requests.
- **C — PATCH null + IntegrityError classification:** explicit null
  `label`/`sort_order` rejected at the Pydantic boundary; only
  `uq_text_versions_document_label` violations become duplicate-label
  `CONFLICT` (create and PATCH); non-label IntegrityErrors propagate.

### M0.3 final human-review fix (same checkpoint, no new scope)

- **A (final) — E2E frontend proxy fail-closed to the SAME isolated API:**
  the Vite instance Playwright starts is never reused
  (`reuseExistingServer: false`) and runs with `--strictPort` (fails, never
  falls back, if the port is taken). `playwright.config.ts` derives a single
  `API_PORT` and passes `env: { VITE_API_PROXY_TARGET:
  'http://127.0.0.1:<API_PORT>' }` to that Vite process; `vite.config.ts`
  uses `VITE_API_PROXY_TARGET` (falling back to the ordinary development
  backend `http://localhost:8000` ONLY for plain `npm run dev`). The
  browser's `/api` requests therefore can only reach the isolated E2E
  backend, regardless of `PLAYWRIGHT_API_PORT`. Verified with a non-default
  `PLAYWRIGHT_API_PORT=8011` run while a decoy 500-backend listened on port
  8000: the golden path passed and the decoy logged ZERO hits.
- **E2E DB namespace guard hardened:** the E2E guard now matches the
  documented `linguagraph_e2e_` namespace EXACTLY
  (`linguagraph_e2e_<12 lowercase hex>`); names merely beginning with
  `linguagraph_e2e` (e.g. `linguagraph_e2eevil_*`) are refused. The normal
  development-database rejection test is preserved.

M0.3 deliberately did NOT implement (deferred to later checkpoints):

- browser Selection/Range handling, UTF-16 <-> code-point frontend
  conversion, selection engine utilities, boundary segmentation, annotation
  runs, PendingSpan, Alignment Tray, Add-to-Alignment (M0.4);
- complete AlignmentService, alignment mutation HTTP endpoints, Span
  get-or-create, alignment persistence UI, hover/active behavior, Inspector,
  SVG connectors, RenderedSpanRegistry (M0.5 / M0.6).

No Alembic migration was added in M0.3: the M0.2 schema proved non-defective
and the M0.3 changes are HTTP/frontend only.

### M0.4 — Selection Engine

Status:

**IMPLEMENTED — awaiting human review** (not yet merged into `main`)

Base: `46b255481518d079a5604a770b9d3036647f8a89` (approved post-M0.3
checkpoint base; see the historical base provenance in section 1).

Implementation branch: `m0.4-selection-engine`.

Implemented (frontend only):

- `apps/web/src/shared/text/` — the single UTF-16 ↔ Unicode code-point
  conversion strategy (ADR-001): `codePointLength`, `sliceByCodePoints`,
  `utf16OffsetToCodePointOffset`, `codePointOffsetToUtf16Offset`, with
  surrogate-pair split rejection, integer/range validation, and the
  mandatory regression vectors (`A🙂B` = 3, `für größere Häuser` = 18,
  `Café 🙂 mañana für français` = 26);
- selection engine (`shared/text/selection.ts`): native browser
  Selection/Range → canonical code-point range with fail-closed result codes
  (`EMPTY_SELECTION`, `MULTI_RANGE_SELECTION`, `OUTSIDE_TEXT_CONTENT`,
  `CROSS_VERSION_SELECTION`, `UNSUPPORTED_SELECTION_BOUNDARY`,
  `INVALID_SELECTION_BOUNDARY`, `SELECTION_TEXT_MISMATCH`,
  `STALE_TEXT_VERSION`, `DOM_INTEGRITY_ERROR`); supported endpoint shapes:
  Text node inside a `data-run`, run-element child offsets 0/1, and ALL
  content-root child offsets (internal root boundaries map to the previous
  run's end, `DOM_INTEGRITY_ERROR` when adjacent run metadata disagrees);
  forward/backward direction normalization (direction is provenance only);
  canonical-quote integrity (`range.toString() === quote`) with the DOM text
  witness (`contentRoot.textContent === content`); reverse locator
  (canonical code-point range → native DOM Range);
- boundary segmentation (`shared/text/segmentation.ts`): canonical content +
  persisted Spans + alignment memberships → flat minimal runs with
  span/alignment-group membership sets (overlapping Spans supported; sweep
  set, no O(S²) scan per run); concatenated run text equals canonical
  content exactly; empty content produces no invented run;
- TextPanel: canonical content root `[data-text-content-root]` with
  `data-text-version-id`/`data-content-hash`, flat `<span data-run
  data-start data-end>` runs (exactly one Text node each), `white-space:
  pre-wrap`, no `dangerouslySetInnerHTML`; selection captured on
  mouseup/keyup; panel-local "Add to Alignment" action OUTSIDE the content
  root;
- workspace state (`WorkspaceProvider`/`workspaceReducer`): `currentSelection`
  and `pendingMembers` (PendingSpan, ADR-007) — frontend-only, never
  persisted to localStorage; explicit Add-to-Alignment staging (exact
  duplicate + same-version overlap rejection; adjacent/separated and
  cross-version ranges allowed); remove-one / clear-tray; Escape clears the
  current selection + native Selection only; panel hide clears that panel's
  current selection but retains its pending members; refetch reconciliation
  drops current/pending state for deleted TextVersions or changed content
  hashes (same id+hash retained); document change / provider remount clears
  ephemeral state while panel preferences still restore;
- AlignmentTray: pending-only tray with language tag, label, quote, remove
  and clear actions; NO persistence-capable Create Alignment action;
- normalization extension: `membersBySpan` lookup in `normalize.ts`;
- M0.4 unit/component tests (`shared/text/*.test.ts`, TextPanel,
  AlignmentTray, WorkspacePage, workspaceReducer, normalize) and the
  Playwright golden-path M0.4 slice (native browser selections including
  non-BMP `Café 🙂 mañana für français`; reload: panel preferences persist,
  tray does not; final snapshot asserts `spans == []`,
  `alignment_groups == []`, `alignment_members == []`).

M0.4 deliberately did NOT implement (deferred to later checkpoints):

- complete AlignmentService, alignment mutation HTTP endpoints,
  concurrency-safe Span get-or-create, server persistence of PendingSpan,
  Create Alignment persistence workflow, alignment orphan-Span cleanup
  (M0.5);
- hover/active counterpart visualization, Alignment Inspector, SVG
  connectors, RenderedSpanRegistry, connector ClientRects geometry (M0.6).

No Alembic migration was added in M0.4: the M0.2 schema proved non-defective
and the M0.4 changes are frontend-only. Alembic remains at `0002 (head)`;
`alembic check` reports no schema drift.

---

## 3. Frozen architecture baseline

The M0 pre-implementation architecture is closed.

Accepted ADRs:

- ADR-001 — Unicode code-point offsets
- ADR-002 — NFC canonical text
- ADR-003 — Alignment vs linguistic relations
- ADR-004 — PostgreSQL relational persistence
- ADR-005 — Annotated text immutability in M0
- ADR-006 — AlignmentGroup as N:M hyperedge
- ADR-007 — Pending selections remain client-side
- ADR-008 — Modular monolith
- ADR-009 — M0 environment baseline

Coding Agents must not reopen these decisions without an explicit
architecture review.

Important frozen properties include:

- language is data, represented by BCP-47 `language_tag`;
- no language-specific core schema;
- multiple TextVersions with the same language tag are allowed;
- persisted/API offsets are Unicode code-point offsets;
- canonical text uses NFC and LF normalization;
- canonicalization does not trim, collapse whitespace, lowercase, use NFKC,
  or normalize punctuation;
- AlignmentGroup is a symmetric N:M hyperedge;
- Alignment is separate from future linguistic relations;
- Spans can be reused across AlignmentGroups;
- annotated text follows ADR-005 immutability/destructive-reset rules;
- PostgreSQL is the M0 persistence engine;
- SQLite is not an acceptable integration-test substitute;
- backend architecture is a modular monolith:
  route -> service -> SQLAlchemy persistence.

---

## 4. Persistence schema state

Alembic history currently contains:

- `0001` — no-op M0.1 foundation revision;
- `0002` — M0.2 domain schema.

Revision `0001` remained unchanged during M0.2.

Revision `0002` creates:

- `projects`
- `parallel_documents`
- `text_versions`
- `spans`
- `alignment_groups`
- `alignment_members`

Important schema properties:

- UUID primary keys;
- timezone-aware timestamps;
- `ON DELETE CASCADE` FK behavior at the database layer;
- `UNIQUE(document_id, label)` for TextVersion labels;
- NO `UNIQUE(document_id, language_tag)`;
- `UNIQUE(text_version_id, start_offset, end_offset)` for Span reuse;
- Span CHECK constraints:
  - `start_offset >= 0`
  - `end_offset > start_offset`
- `UNIQUE(alignment_group_id, span_id)`;
- NO `UNIQUE(span_id)` on AlignmentMember.

Cross-row/cross-table alignment invariants remain service responsibilities,
not database-trigger responsibilities.

---

## 5. Canonical text and offset contract

Backend canonicalization is authoritative.

Pipeline:

1. strict UTF-8 decode for byte input;
2. remove one leading U+FEFF;
3. CRLF -> LF;
4. remaining CR -> LF;
5. reject U+0000;
6. reject surrogate code points;
7. normalize NFC;
8. enforce maximum canonical code-point length;
9. compute SHA-256 over UTF-8 canonical content.

Persisted Span offsets are:

- zero-based;
- start-inclusive;
- end-exclusive;
- Unicode code-point offsets.

Authoritative regression values:

- `für größere Häuser` = 18 code points;
- `Café 🙂 mañana für français` = 26 code points;
- `A🙂B` = 3 code points.

The frontend M0.4 selection engine must convert DOM / JavaScript UTF-16
positions to this code-point coordinate system. JavaScript UTF-16 offsets
must never be persisted directly.

---

## 6. BCP-47 contract

`language_tag` validation is syntactic RFC 5646 / BCP-47 validation only.

There is:

- no fixed language allow-list;
- no IANA registry lookup;
- no claim of semantic registry validation.

Duplicate variant subtags are rejected case-insensitively.

Examples rejected:

- `de-DE-1901-1901`
- `sl-rozaj-ROZAJ`

Syntactically valid but unregistered tags may still be accepted by design.

---

## 7. Alignment persistence foundation

M0.2 provides only the persistence model and invariant foundations.

AlignmentGroup:

- belongs to one ParallelDocument;
- has no source/target fields;
- is symmetric;
- represents correspondence only.

Alignment invariant foundations require:

- at least 2 members;
- at least 2 distinct TextVersions;
- all member TextVersions belong to the group's document;
- no duplicate Span within a group;
- same-version spans within one group must not overlap;
- same-version adjacent or separated spans are allowed;
- Spans may be reused across different AlignmentGroups;
- different AlignmentGroups may overlap.

The full atomic Alignment create/update/delete service remains **M0.5**.

Concurrency-safe Span get-or-create using PostgreSQL `ON CONFLICT` or a
SAVEPOINT remains **M0.5**.

---

## 8. ADR-005 destructive-reset behavior

Annotated TextVersion content is immutable.

Unannotated content may be replaced through the explicit service path.

Deleting a TextVersion that participates in alignments is blocked unless
the destructive force path is explicitly requested.

Force deletion runs atomically in one transaction.

For each affected AlignmentGroup:

- remove members belonging to the deleted TextVersion;
- revalidate the remaining group against ALL M0 alignment invariants;
- delete the group if it becomes invalid.

Important M0.2 human-review regression:

If deleting EN destroys:

- G1 = {EN_span, DE_span}

while the same DE_span also participates in an unaffected group:

- G2 = {DE_span, FR_span}

then DE_span MUST survive because G2 still references it.

Candidate orphan Spans are deleted only when they will have zero surviving
AlignmentMembers outside groups scheduled for deletion.

Unrelated groups and memberships must remain untouched.

---

## 9. Service transaction ownership contract

This contract was strengthened during M0.2 human review.

The SQLAlchemy Session must be transaction-clean between public service calls.

### Write services

`write_transaction`:

- requires no pre-existing transaction;
- requires no caller-owned pending ORM mutation;
- otherwise raises `SessionNotCleanError` before service work begins;
- creates its own transaction with `Session.begin()`;
- commits only its own transaction on success;
- rolls back only its own transaction on failure;
- never silently commits or rolls back caller-owned transactional state.

This rule covers caller-owned writes that have already been flushed:
after `flush()`, `db.new`, `db.dirty`, and `db.deleted` can all be empty
while an uncommitted database transaction still exists.

Therefore `db.in_transaction()` is part of the fail-fast boundary.

### Read services

`read_transaction` follows the same clean-entry rule.

A read service closes the read-only transaction that it itself autobegins
before returning, leaving the Session transaction-clean for the next service
call.

### M0.3 integration constraint

M0.3 routes/read models must not casually depend on ORM lazy relationship
loading after a service has returned.

Lazy loading can autobegin a new SQLAlchemy transaction and violate the
transaction-clean-between-service-calls contract.

Prefer explicit service queries/read models and deliberately loaded data at
the HTTP boundary.

Do not weaken this transaction contract merely to make route code convenient.

### M0.3 status

The M0.3 API layer implements this contract: `workspace_service` executes all
its queries inside one owned `read_transaction`, materializes the complete
snapshot before the transaction closes, and returns with
`db.in_transaction() == False`. Routes serialize scalar columns only (Pydantic
response models with `from_attributes=True`, no relationship traversal).
Integration tests assert both properties ("workspace service leaves Session
transaction-clean" and "HTTP serialization triggers no lazy load / autobegin").

---

## 10. M0.2 verification baseline

Final locally reported verification:

- Python 3.13.15
- PostgreSQL 18.6
- SQLAlchemy 2.0.52
- `uv sync --frozen` — passed
- `uv run pytest` — 231 passed
- integration tests — 102 passed against real PostgreSQL 18
- non-integration tests — 129 passed
- `uv run alembic check` — no schema drift detected
- disposable database:
  - empty -> head — passed
  - head -> base — passed
  - base -> head — passed
- `git diff --check` — clean

No SQLite implementation was introduced.

PR #2 had no PR-triggered GitHub Actions runs/status checks available during
final pre-merge review, so GitHub CI must not be described as independently
green for that checkpoint. The verified M0.2 test evidence came from the
reported real-PostgreSQL local run.

---

## 10A. M0.3 verification baseline

Final locally reported M0.3 verification (implementation pass + human-review
fix pass + final human-review fix; human review passed before PR #5 merge):

- Python 3.13.15 (uv-pinned)
- PostgreSQL 18 (native cluster) — used by all integration tests and by the
  Playwright E2E backend on its own disposable `linguagraph_e2e_*` database
- Node 24.19.0 (web)
- `uv sync --frozen` — passed
- `uv run pytest -q` — 298 passed (231 M0.1/M0.2 + 67 M0.3 incl. review-fix
  tests for body limits, constraint classification, PATCH nulls and the
  disposable-database guard)
- `uv run alembic check` — no schema drift detected (no new migration)
- `uv run alembic current` — `0002 (head)`
- `npm ci` — passed
- `npm run lint` / `npm run typecheck` — passed
- `npm run test` — 46 passed (10 files; ACTUAL value from the final run)
- `npm run build` — passed
- `npx playwright test e2e/golden-path.spec.ts` — M0.3 slice against the
  isolated disposable E2E database, default ports AND a non-default
  `PLAYWRIGHT_API_PORT=8011` run (decoy on port 8000 received zero hits)
- `git diff --check` — clean

No SQLite implementation was introduced anywhere in the test stack.

PR #5 had no PR-triggered GitHub Actions workflow runs/status checks available
during final pre-merge review. Therefore the verification above is the
reported local verification evidence and must not be described as independent
GitHub CI green.

---

## 10B. M0.4 verification baseline

Locally reported M0.4 verification (implementation pass + Gate 2 base
reconciliation pass; awaiting human review). The full suite was re-run from
the reconciled branch after the rebase onto the approved base
`46b255481518d079a5604a770b9d3036647f8a89` (see section 1), with identical
results:

- Python 3.13.x (uv-pinned; `apps/api/.venv`)
- PostgreSQL 18.6 (native cluster) — used by all integration tests and by
  the Playwright E2E backend on its own disposable `linguagraph_e2e_*`
  database
- Node 24.19.0 (downloaded to a local prefix; ADR-009 baseline — the
  system-wide Node 22 was not used for verification)
- `uv sync --frozen` — passed
- `uv run pytest -q` — 298 passed (unchanged from M0.3: M0.4 is
  frontend-only and adds no backend tests)
- `uv run alembic check` — no schema drift detected (no new migration)
- `uv run alembic current` — `0002 (head)`
- `npm ci` — passed (clean reinstall before the final verification pass)
- `npm run lint` / `npm run typecheck` — passed
- `npm run test` — 172 passed (14 files; 82 selection-engine/Unicode
  tests in `src/shared/text/`, plus TextPanel/AlignmentTray/WorkspacePage/
  reducer/normalize M0.4 coverage; all M0.3 tests preserved)
- `npm run build` — passed
- `npx playwright test e2e/golden-path.spec.ts` — M0.3 + M0.4 slice, 1
  passed (26.1s), against the isolated disposable E2E database (default
  ports 8000/5173); the final run executed after `npm ci`
- `git diff --check` — clean

Tree-equivalence proof (Gate 2): after the rebase, the old pre-rebase M0.4
head (`1ced20dc85794923c39c9695ea05dc9546a524ba`) vs the reconciled head
differ in exactly `AGENTS.md`, `README.md`, and
`docs/development/CURRENT_STATE.md`; `git diff <old head> HEAD -- apps` is
EMPTY (no application/test/style/config/backend change; no dependency or
migration change).

No SQLite implementation was introduced anywhere in the test stack.

---

## 11. Known non-blocking engineering notes

### Migration-test environment restoration

`test_migrations.py` currently has an internal Alembic helper that sets
`DATABASE_URL` for a disposable database and then removes the variable.

It does not currently cause the migration tests to target the development
database because every invocation explicitly installs the disposable URL.

However, the helper should eventually restore any pre-existing
`DATABASE_URL` value instead of unconditionally removing it.

This was reviewed as non-blocking for M0.2.

### PostgreSQL session timezone normalization

The M0.3 integration work made serialized timestamps consistent by pinning
every PostgreSQL session to UTC (`SET TIME ZONE 'UTC'` on connect, see
`app/db/session.py`). Without this, `timestamptz` reads rendered `+08:00`
while Python-side `utcnow()` defaults rendered `+00:00`, so the same instant
serialized differently across requests.

### Async text-version route

`POST /documents/{id}/text-versions` is `async` so the multipart body can be
awaited; the (local, single-user workbench) DB service call runs
synchronously on the request thread. Acceptable for M0; revisit if a
concurrent workload ever emerges.

---

## 12. Explicitly deferred work

### M0.4 — Selection Engine

**IMPLEMENTED — awaiting human review** (see section 2). M0.4 is not yet
merged into `main`.

### M0.5 — Manual Alignment

**HAS NOT STARTED.**

Owns:

- complete AlignmentService;
- atomic alignment create/update/delete;
- concurrency-safe Span reuse/get-or-create;
- alignment HTTP mutations;
- tray -> persistence workflow.

### M0.6 — Alignment Visualization

Owns hover/active propagation, Inspector and SVG connectors.

### M0.7 — Hardening

Owns final integration/E2E/Unicode/accessibility/error-handling/build
hardening.

NLP, LLM, machine translation, dictionary, linguistic knowledge graphs,
authentication, collaboration and distributed infrastructure remain outside
M0.

---

## 13. Next action

After M0.4 is human-reviewed, approved and merged into `main`:

1. synchronize local `main`;
2. create the M0.5 implementation branch from the reviewed post-M0.4 main;
3. start a fresh M0.5 Agent/session;
4. have that Agent read this file, `AGENTS.md`, the authoritative
   pre-implementation documents and all accepted ADRs;
5. implement M0.5 (Manual Alignment) only;
6. stop for human review before M0.6.

Do not begin M0.5 automatically, and do not skip the M0.4 human review.

---

## 14. Authority and reconstruction rules

Use this file as a navigation/handoff index, not as a second architecture
specification.

For architecture and invariant questions:

- accepted ADRs and the authoritative M0 pre-implementation documents govern.

For what code/schema actually exists:

- current `main`;
- Alembic migration history;
- executable tests

govern.

For review/merge history:

- merged GitHub pull requests and Git history govern.

`CURRENT_STATE.md` summarizes those sources and points a new Agent toward
them.

Chat transcripts and Agent exit reports are supporting context only and are
not authoritative engineering state.

If these sources appear to disagree, inspect the authoritative source instead
of silently reconciling the conflict from memory.