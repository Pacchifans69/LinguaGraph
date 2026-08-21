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

**M0.6 — Alignment Visualization** (COMPLETE / MERGED)

M0.1, M0.2, M0.3, M0.4, M0.5, and M0.6 have been human-reviewed, approved,
and merged into `main`.

M0.3 GitHub state:

- PR #5 — `M0.3 — Document Workspace`
- final implementation head: `33bfaef20c2e64bed92fe00aa147d74611ac41ad`
- merge commit: `1230ffe0282adac3a20c1aafac6c2271c788b198`
- merged: 2026-08-19

M0.4 GitHub state:

- PR #6 — `M0.4 — Selection Engine`
- approved base: `46b255481518d079a5604a770b9d3036647f8a89`
- final implementation head: `2d0d4bcf6dd562e3cab003aa615049628c173999`
- merge commit: `b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad`
- merged: 2026-08-20

M0.4 Gate 2: PASS — human merge decision: APPROVED — M0.4: COMPLETE / MERGED.

M0.4 base provenance (historical): the original M0.4 implementation attempt
was created from the reviewed M0.3 implementation head
`33bfaef20c2e64bed92fe00aa147d74611ac41ad` because the implementation
environment could not reach the remote. During Gate 2 base reconciliation,
remote repository state was restored and verified, and the M0.4 branch was
rebased onto the approved post-M0.3 checkpoint base
`46b255481518d079a5604a770b9d3036647f8a89`. The final reviewed and merged
branch was therefore correctly based on `46b255…`; the earlier `33bfaef`
base is retained only as historical provenance of the implementation attempt
and is no longer the current branch base.

M0.5 GitHub state:

- PR #7 — `M0.5 — Alignment Persistence`
- approved base: `0f8bccd721e9659f1f75074a2e9638d05f27800f`
- final reviewed implementation head: `b6714d6454063b6c656631fe63fc23e6813d28f4`
- merge commit: `8d1a57b41f2fb717faca02f3162b4770e62ffbff`
- merged: 2026-08-20

M0.5 lifecycle:

- Gate 1: PASS;
- contract reconstruction/freeze: PASS;
- Gate 2: PASS;
- Human Diff Review: PASS (including the final test-only synchronization
  fix HR-R1);
- human merge decision: APPROVED;
- Gate 3 closeout audit: PASS.

The M0.5 merge commit `8d1a57b…` has no file-tree difference from the final
reviewed implementation head `b6714d6…` (verified during Gate 3 closeout).

M0.6 GitHub state:

- PR #8 — `M0.6 — Alignment Visualization`
- approved base: `aea0a45e740bb9400c7e6dc25fcc88e956a25ee0`
- reviewed implementation lineage:
  - `f8d53d7dc9dd0548c14fc122fd5dddfb646a6955` —
    `feat(web): implement M0.6 visualization foundation`
  - `fa44a767be0df7331b1ae08e8b93f19b4cf84633` —
    `fix(web): harden M0.6 visualization interactions`
  - `e3433799d027c27e759e7bdc44df13c209d0b8e8` —
    `feat(web): complete M0.6 alignment inspector`
  - `f86d6429d41e76d4093e08898a9e7879e3774c49` —
    `fix(web): harden M0.6 inspector mutation lifecycle`
- final reviewed implementation head: `f86d6429d41e76d4093e08898a9e7879e3774c49`
- merge commit: `55442d4ce7f71bd28c3368de641802f942e57055`
- merged: 2026-08-21

M0.6 lifecycle:

- Gate 1: PASS;
- contract reconstruction/freeze: PASS;
- Round 1 Human Review: PASS after bounded fixes;
- Round 2 Human Review: PASS after bounded fixes;
- Gate 2: PASS;
- human merge decision: APPROVED;
- Gate 3 closeout audit: PASS.

The M0.6 merge commit `55442d4…` has no file-tree difference from the final
reviewed implementation head `f86d642…` (verified during Gate 3 closeout).

Next implementation checkpoint:

**M0.7 — Hardening (NOT STARTED)**

- no M0.7 implementation has begun;
- next M0.7 work starts from the post-M0.6 merged `main` state;
- a fresh checkpoint conversation, repository-reality reconstruction, Gate 1,
  contract reconstruction from the authoritative sources, and human contract
  review/freeze are required before implementation;
- do not reuse `m0.6-alignment-visualization` as the M0.7 base.

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

**COMPLETE / MERGED**

GitHub:

- PR #6 — `M0.4 — Selection Engine`
- approved base: `46b255481518d079a5604a770b9d3036647f8a89`
- final implementation head: `2d0d4bcf6dd562e3cab003aa615049628c173999`
- merge commit: `b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad`
- merged: 2026-08-20

M0.4 Gate 2: PASS — human merge decision: APPROVED.

Base: `46b255481518d079a5604a770b9d3036647f8a89` (approved post-M0.3
checkpoint base; see the historical base provenance in section 1).

Historical implementation branch: `m0.4-selection-engine` (deleted after
M0.4 Gate 3 closeout / branch cleanup).

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
  span/alignment-group membership sets (overlapping Spans supported;
  sweep-set implementation with output-sensitive membership emission — dense
  overlap is quadratic only in emitted membership cardinality, never in
  inactive-span scans); concatenated run text equals canonical
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

### M0.5 — Alignment Persistence

Status:

**COMPLETE / MERGED**

GitHub:

- PR #7 — `M0.5 — Alignment Persistence`
- approved base: `0f8bccd721e9659f1f75074a2e9638d05f27800f`
- final reviewed implementation head: `b6714d6454063b6c656631fe63fc23e6813d28f4`
- merge commit: `8d1a57b41f2fb717faca02f3162b4770e62ffbff`
- merged: 2026-08-20

Lifecycle:

- Gate 1: PASS;
- contract reconstruction/freeze: PASS;
- Gate 2: PASS;
- Human Diff Review: PASS (plus the final test-only synchronization fix
  HR-R1);
- human merge decision: APPROVED;
- Gate 3 closeout audit: PASS.

M0.5 closed the core M0 persistence loop (native selection → PendingSpan →
Alignment Tray → Create Alignment → atomic backend persistence → workspace
refetch → reload-verified persistence).

Implemented — backend:

- complete atomic `AlignmentService` create/update/delete, each owning
  exactly one `write_transaction` (transaction-clean Session contract
  intact; routes never commit/rollback);
- `POST /api/v1/documents/{document_id}/alignments` (201), `PATCH
  /api/v1/alignments/{alignment_id}` (200), `DELETE
  /api/v1/alignments/{alignment_id}` (204) with the stable
  `{code, message, details}` envelope (NOT_FOUND/SPAN_OUT_OF_RANGE/
  CROSS_DOCUMENT_ALIGNMENT/INSUFFICIENT_ALIGNMENT_MEMBERS/
  DUPLICATE_ALIGNMENT_MEMBER/VALIDATION_ERROR) and no exception leakage;
- coordinate-only member input (`text_version_id`/`start`/`end`);
  quote/direction/contentHash are never accepted; contentHash stays a
  frontend-only stale-selection guard;
- server-derived `exact_text`/`prefix`/`suffix` from canonical content;
- all frozen alignment invariants via `alignment_invariants.py`
  (cardinality, distinct versions, same-document, duplicate-span,
  same-version non-overlap; adjacent/separated allowed; cross-group
  overlap/reuse allowed);
- PostgreSQL concurrency-safe Span get-or-create
  (`INSERT ... ON CONFLICT (text_version_id, start_offset, end_offset)
  DO NOTHING RETURNING`; the outer alignment transaction is never aborted);
- PATCH note / full-member-replacement semantics (omission = unchanged,
  `note: null` clears, `members` = full replacement set, note length <=
  4000 enforced at both the service and HTTP boundaries);
- explicit `updated_at` advancement on any logical change (no-op PATCH
  leaves it unchanged);
- orphan Span cleanup on PATCH replacement and DELETE, exactly compatible
  with the reviewed ADR-005 destructive-reset orphan semantics (candidates
  deleted only at zero surviving memberships; shared spans and unrelated
  bare spans preserved).

Implemented — frontend:

- Create Alignment action over the PendingSpan tray (ADR-007), sending
  coordinates only;
- frontend create validity: >=2 pending members AND >=2 distinct
  TextVersions (backend remains authoritative);
- in-flight tray/staging freeze while the create request is pending
  (Create/Clear/Remove/Add-to-Alignment disabled; staging rejected with a
  FROZEN reason);
- document-scoped create-mutation isolation (keyed document workspace
  remount + `['alignment-create', documentId]` mutation key), so a
  pending/error doc-A mutation never leaks into doc B;
- stable API error display with the pending tray retained for
  correction/retry on failure;
- minimal read-only persisted-alignment representation derived entirely
  from the authoritative workspace snapshot (no optimistic state);
- workspace refetch after success; persistence survives reload (E2E
  prove).

M0.5 deliberately did NOT implement (deferred to later checkpoints):

- hover/active counterpart visualization, SVG connectors, connector
  geometry/routing, RenderedSpanRegistry, Alignment Inspector (editable or
  read-only beyond the minimal saved list), note/member-edit UI,
  delete-from-Inspector UI (M0.6);
- automatic alignment, NLP, LLM, translation, dictionaries, linguistic
  relations, authentication, collaboration, pagination, virtualization,
  new infrastructure.

No Alembic migration was added in M0.5: the M0.2 schema proved non-defective
for the frozen contract. Alembic remains at `0002 (head)`; `alembic check`
reports no schema drift.

Known non-blocking hardening observations (retained for future
reconstruction; NOT solved during M0.5):

1. concurrent PATCHes to the same AlignmentGroup do not yet have a
   dedicated concurrency-control contract; pathological interleavings may
   surface an unexpected integrity failure
   (`uq_alignment_members_group_span`);
2. Alignment mutation versus concurrent destructive TextVersion deletion
   needs a future cross-service concurrency/locking policy;
3. the real-PostgreSQL concurrent Span get-or-create test proves the
   accepted algorithm with independent Sessions/transactions, but its
   barrier does not deterministically force every possible uncommitted
   conflict interleaving.

### M0.6 — Alignment Visualization

Status:

**COMPLETE / MERGED**

GitHub:

- PR #8 — `M0.6 — Alignment Visualization`
- approved base: `aea0a45e740bb9400c7e6dc25fcc88e956a25ee0`
- final reviewed implementation head: `f86d6429d41e76d4093e08898a9e7879e3774c49`
- merge commit: `55442d4ce7f71bd28c3368de641802f942e57055`
- merged: 2026-08-21

Implemented (frontend-only; see section 1 for the full reviewed lineage
`f8d53d7` → `fa44a76` → `e343379` → `f86d642`):

Visualization foundation:

- persisted-alignment annotation indicators (class-only, non-color-cued,
  never per-character DOM; the canonical content root textContent invariant
  holds);
- `hoveredAlignmentId` / `activeAlignmentId` document-scoped ephemeral
  state (never persisted, never in TanStack Query, never in localStorage;
  document workspace remount clears both; snapshot reconciliation clears
  ids whose group disappeared);
- `active ?? hovered` connector precedence — exactly one connector set;
- active + secondary hover highlighting (distinct non-color states);
- deterministic overlap ambiguity chooser for multi-group runs (no
  arbitrary first-group selection; current-run membership reconciliation);
- keyboard-accessible persisted-alignment activation (SavedAlignments
  index);
- native text-selection activation guard (a drag-selection tail click never
  activates);
- explicit panel-layout connector invalidation, stale-geometry provenance,
  and rAF-coalesced recomputation (see the review-hardening record below).

Rendering architecture:

- `RenderedSpanRegistry` (`Map<spanId, HTMLElement[]>`): the canonical
  span→DOM bridge; semantic span identity is never discovered through
  `querySelector`/`data-span-id` parsing;
- multi-element / multi-ClientRect member geometry (spans split across
  runs and wrapped lines), clipped to each owning `.text-panel-body`
  viewport; hidden/offscreen members skipped; fewer than 2 visible anchors
  → no connectors;
- nearest-provisional-hub anchor selection (deterministic);
- SVG `ConnectorOverlay` over `.panels-container`, `pointer-events: none`,
  overlay-relative coordinates, idle listener detachment, no polling;
- panel reorder / hide/show / scroll / resize support.

Alignment Inspector:

- driven only by the current normalized workspace snapshot (groupsById /
  membersByGroup / spansById / versionsById) — no second domain store;
- human-readable member/version/quote/offset display;
- note editing: textarea, explicit Save (no autosave), max 4000, empty
  draft → `{ note: null }`, no trimming, omission = unchanged; draft
  reconciled against the authoritative note only when no unsaved edit
  exists;
- member removal via backend PATCH full-replacement semantics
  (coordinate-only `{ text_version_id, start, end }` payloads);
- frontend removal preflight: >=2 members AND >=2 distinct TextVersions
  (backend remains authoritative);
- delete AlignmentGroup with destructive confirmation;
- target-scoped confirmation identity (a stale confirmation can never
  execute against another group/member);
- stable mutation errors (latest operation owns the error surface);
- same-group mutation freeze while any Inspector mutation is pending (note
  Save / Remove / Delete / Close / active switching / SavedAlignments
  activation / ambiguity chooser activation disabled), extending through
  the authoritative workspace refetch (the mutation awaits the refetch
  before settling);
- no optimistic persisted-domain mutation — authoritative workspace
  invalidate/refetch remains the read authority.

Golden path (apps/web/e2e/golden-path.spec.ts):

- preserves the M0.3/M0.4/M0.5 historical proof unchanged;
- M0.6 fixture shaping uses the backend PATCH capability as TEST SETUP only
  (no add-member UI implied);
- four-language EN/DE/FR/ES visualization: idle indicators, hover
  counterpart propagation, activation → Inspector + connectors, note
  persistence, REAL browser reorder geometry recomputation, hide/show
  connector participation, remove FR, reload persistence, delete group,
  and orphan Span cleanup proof at the API/workspace level.

M0.6 deliberately did NOT implement (deferred beyond M0.6 / later
checkpoints; no checkpoint is pre-assigned):

- automatic alignment, NLP, LLM, translation, dictionaries, linguistic
  relations, authentication, collaboration, pagination, virtualization,
  synchronized scrolling, complex connector routing.

M0.6 scope truth (frontend-only checkpoint):

- no backend production change — the backend PATCH/DELETE alignment
  endpoints from M0.5 are reused as-is;
- no database schema change and no Alembic migration (Alembic remains at
  `0002 (head)`);
- no npm dependency addition;
- no shared text-engine redesign (`shared/text/offset|selection|
  segmentation` untouched);
- no dedicated alignment GET/list endpoint;
- no add-member-to-existing-alignment UI (the golden-path fixture shaping
  uses the backend PATCH capability as TEST SETUP only, and the M0.6
  frontend itself contains no add-member surface);
- no Redux/Zustand or any new state framework (React Context +
  TanStack Query + the existing reducer are the whole state stack).

M0.6 implementation branch status:

- historical / merged implementation branch:
  `m0.6-alignment-visualization`;
- post-closeout branch cleanup: **COMPLETE**;
- the local `m0.6-alignment-visualization` branch and the corresponding
  `origin/m0.6-alignment-visualization` branch were deleted after the durable
  closure commits were human-reviewed and landed on `main`;
- M0.7 must not reuse the historical M0.6 implementation branch as its base.

M0.6 review-hardening record (all resolved during human review, none open):

Round 1 review fixed:

- explicit panel-layout connector invalidation (layoutKey derived from
  panelOrder + visiblePanels);
- native-selection click suppression;
- stale overlap-chooser membership (chooser re-resolves the CURRENT run);
- connector geometry provenance (stale lines can never render under a new
  alignment).

Round 2 review fixed:

- mutation freeze extends through the authoritative workspace refetch;
- destructive confirmation target identity (group/member-scoped);
- cross-mutation error ownership (latest operation wins);
- real E2E connector-coordinate recomputation proof during panel reorder.

No Alembic migration was added in M0.6: frontend-only checkpoint; Alembic
remains at `0002 (head)`; `alembic check` reports no schema drift.

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

The full atomic Alignment create/update/delete service and the
concurrency-safe Span get-or-create (PostgreSQL `ON CONFLICT`) were
implemented and merged in **M0.5** (PR #7); this section documents the
foundations they build on.

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
reconciliation pass + human-review fix pass; merged 2026-08-20 via PR #6).
The latest ACTUAL results below are from the human-review fix pass, executed
after the rebase onto the approved base
`46b255481518d079a5604a770b9d3036647f8a89` (see section 1):

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
- `npm run test` — 175 passed (14 files), the latest M0.4 baseline: the
  82 selection-engine/Unicode tests in `src/shared/text/`, the
  TextPanel/AlignmentTray/WorkspacePage/reducer/normalize M0.4 coverage,
  all M0.3 tests preserved, PLUS the 3 human-review-fix tests
  (large-content/many-runs selection correctness; run-tiling fail-closed
  coverage; ephemeral-only state does not trigger preference writes)
- `npm run build` — passed
- `npx playwright test e2e/golden-path.spec.ts` — M0.3 + M0.4 slice, 1
  passed (26.2s), against the isolated disposable E2E database (default
  ports 8000/5173); the final run executed after `npm ci`
- `git diff --check` — clean

Tree-equivalence proof (Gate 2): after the rebase, the old pre-rebase M0.4
head (`1ced20dc85794923c39c9695ea05dc9546a524ba`) vs the reconciled head
differ in exactly `AGENTS.md`, `README.md`, and
`docs/development/CURRENT_STATE.md`; `git diff <old head> HEAD -- apps` is
EMPTY (no application/test/style/config/backend change; no dependency or
migration change). The human-review fix pass changed only
`selection.ts`/`segmentation.ts`/`WorkspaceProvider.tsx` plus directly
relevant tests and this file.

No independent GitHub CI evidence is claimed: verification is based on the
reported local execution above.

No SQLite implementation was introduced anywhere in the test stack.

---

## 10C. M0.5 verification baseline

Final locally reported M0.5 verification (implementation pass + Gate 2
review fixes + Human Diff Review fixes + the final test-only
synchronization fix; merged 2026-08-20 via PR #7; the latest ACTUAL results
below are from the final pre-PR candidate after the HR-R1 test fix):

- Python 3.13.15 (uv-pinned; `apps/api/.venv`)
- PostgreSQL 18.6 (native cluster) — used by all integration tests and by
  the Playwright E2E backend on its own disposable `linguagraph_e2e_*`
  database
- Node 24.19.0 (downloaded to a local prefix; ADR-009 baseline — the
  system-wide Node 22 was not used for verification)
- `uv sync --frozen` — passed
- `uv run pytest -q` — **378 passed** (298 M0.1–M0.4 + 80 M0.5 backend
  tests: alignment schema unit tests, AlignmentService integration tests
  incl. real-PostgreSQL concurrent Span get-or-create, and the alignment
  HTTP endpoint tests)
- `uv run alembic current` — `0002 (head)`
- `uv run alembic check` — no schema drift detected (no new migration)
- `npm ci` — passed
- `npm run lint` / `npm run typecheck` — passed
- `npm run test` — **191 passed (16 files)**: all M0.1–M0.4 tests preserved
  plus the M0.5 suite (request construction, create validity, in-flight
  tray freeze, document-transition mutation isolation, success/failure
  lifecycles, saved-alignment rendering)
- `npm run build` — passed
- `npx playwright test e2e/golden-path.spec.ts` — M0.3 + M0.4 + M0.5
  slice, 1 passed, against the isolated disposable E2E database: create
  alignment through the UI (same-version multi-span + distinct versions),
  tray clears, saved alignment appears, snapshot carries persisted
  Span/Group/Member rows, reload keeps the saved alignment and persisted
  data
- `git diff --check` — clean

Explicitly retained: **no independent GitHub CI evidence was available or
claimed** — verification is based on the reported local execution above.

No SQLite implementation was introduced anywhere in the test stack.

---

## 10D. M0.6 verification baseline

Final reported pre-merge verification (Round 1 implementation + Round 1
bounded review fixes + Round 2 Alignment Inspector + Round 2 bounded review
fixes; merged 2026-08-21 via PR #8; the latest ACTUAL results below are from
the final pre-PR candidate after the Round 2 review fixes):

- Python 3.13.x (uv-pinned; `apps/api/.venv`)
- PostgreSQL 18 (native cluster) — used by all integration tests and by the
  Playwright E2E backend on its own disposable `linguagraph_e2e_*` database
- Node 24.19.0 (downloaded to a local prefix; ADR-009 baseline — the
  system-wide Node 22 was not used for verification)
- `uv sync --frozen` — passed
- `uv run pytest -q` — **378 passed** (unchanged from M0.5: M0.6 is
  frontend-only and adds no backend tests)
- `uv run alembic current` — `0002 (head)`
- `uv run alembic check` — no schema drift detected (no new migration)
- `npm ci` — passed
- `npm run lint` / `npm run typecheck` — passed
- `npm run test` — **336 passed (22 files)**: all M0.1–M0.5 tests preserved
  plus the M0.6 suite (visualization states, annotation indicators, overlap
  ambiguity chooser, RenderedSpanRegistry, geometry helpers, ConnectorOverlay
  rendering + recompute lifecycle, Round 1 F01–F04 regressions, Alignment
  Inspector rendering/note/member-removal/delete/mutation-freeze/snapshot
  reconciliation, update/delete API hooks, Round 2 F01–F03 regressions)
- `npm run build` — passed
- `npx playwright test e2e/golden-path.spec.ts` — M0.3 + M0.4 + M0.5 +
  M0.6 slice, 1 passed, against the isolated disposable E2E database: the
  historical M0.3–M0.5 proof unchanged, then the four-language EN/DE/FR/ES
  visualization fixture (backend-PATCH test setup), idle indicators, hover
  counterpart propagation, activation → Inspector + connectors, note
  persistence, real browser reorder geometry recomputation, hide/show
  connector participation, remove FR, reload persistence, delete group, and
  orphan Span cleanup proof
- `git diff --check` — clean

Explicitly retained: **no independent GitHub CI evidence was available or
claimed** — verification is based on the reported local execution reviewed
by the human process.

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

**COMPLETE / MERGED** (PR #6; see section 1 and section 2).

### M0.5 — Alignment Persistence

**COMPLETE / MERGED** (PR #7; see section 1 and section 2).

Delivered (as frozen in the authoritative M0 documents): the complete
atomic AlignmentService create/update/delete, the POST/PATCH/DELETE
alignment mutation surface, concurrency-safe Span reuse/get-or-create
(PostgreSQL `ON CONFLICT`), server-derived quote metadata, all frozen
alignment invariants, PATCH note/full-member-replacement semantics with
explicit `updated_at` advancement, and ADR-005-compatible orphan Span
cleanup — plus the frontend Create Alignment seam, in-flight tray/staging
freeze, document-scoped create-mutation isolation, minimal read-only
persisted-alignment representation, and reload-verified persistence.

Historical implementation branch: `m0.5-alignment-persistence`
(deleted locally and remotely after M0.5 Gate 3 durable-state closure /
branch cleanup).
### M0.6 — Alignment Visualization

**COMPLETE / MERGED** (PR #8; see section 1 and section 2).

Delivered (frontend-only, as frozen in the authoritative M0 documents): the
persisted-alignment visualization foundation (annotation indicators,
hover/active ephemeral state, `active ?? hover` connector precedence,
deterministic ambiguity chooser, keyboard-accessible activation,
native-selection activation guard), the `RenderedSpanRegistry` + SVG
ConnectorOverlay rendering architecture (multi-element/multi-ClientRect
geometry, viewport clipping, nearest-hub anchors, rAF-coalesced
recomputation, panel-layout invalidation, stale-geometry provenance), and
the Alignment Inspector (note editing, member removal via PATCH
full-replacement, delete with confirmation, target-scoped confirmations,
same-group mutation freeze through the authoritative refetch, stable
mutation errors, no optimistic persisted-domain state), closing the full
visualization/edit/delete loop of the M0 golden path.

### M0.7 — Hardening

**NOT STARTED.**

Owns final integration/E2E/Unicode/accessibility/error-handling/build
hardening. M0.7 must start in a fresh checkpoint conversation:
reconstruct repository reality from the post-M0.6 closed `main`, perform
Gate 1, reconstruct the M0.7 contract from the authoritative sources and
the current repository, obtain human contract review/freeze, and only then
implement. Do not reuse `m0.6-alignment-visualization` as the M0.7 base.

NLP, LLM, machine translation, dictionary, linguistic knowledge graphs,
authentication, collaboration and distributed infrastructure remain outside
M0.

---

## 13. Next action

M0.6 is complete and merged. The next checkpoint is M0.7 — Hardening,
which has NOT started. A new checkpoint conversation must:

1. synchronize and read current merged `main` (post-M0.6);
2. perform Gate 1 (repository-reality reconstruction);
3. reconstruct the M0.7 checkpoint contract from this file, `AGENTS.md`, the
   authoritative pre-implementation documents, ADR-001…ADR-009, and current
   `main`;
4. obtain human contract review/freeze;
5. only then create the bounded M0.7 implementation branch and start
   implementation.

Do not begin M0.7 automatically, and do not reuse
`m0.6-alignment-visualization` as the M0.7 base.

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