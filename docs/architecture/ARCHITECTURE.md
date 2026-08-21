# LinguaGraph — Architecture (as built, M0.7)

This document describes the architecture as actually implemented at the
M0.7 hardening checkpoint. It is a description, not a new authority: the
accepted ADRs (`docs/adr/ADR-001…ADR-009`) and the authoritative
pre-implementation documents
(`docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`,
`M0_PREIMPLEMENTATION_REPORT.md`) remain authoritative. Where this document
and an ADR disagree, the ADR wins.

## 1. System overview

LinguaGraph is a local, single-user **manual alignment workbench**: users
create projects and parallel documents, add arbitrary-language text
versions, select text spans with the native browser selection, and build
multilingual alignment groups by hand. M0 deliberately implements no
authentication, no collaboration, no NLP/LLM features, no machine
translation, and no distributed infrastructure.

The end-to-end request/rendering path:

```text
browser
  → React / TanStack Query (apps/web)
  → /api/v1 (Vite dev-server proxy in development)
  → FastAPI route (apps/api/app/api/routes)
  → application/domain service (apps/api/app/services)
  → SQLAlchemy 2.0 ORM (apps/api/app/db)
  → PostgreSQL 18
```

The workspace snapshot read model flows back through the same layers and is
normalized into lookup maps by the frontend; the frontend renders canonical
text as flat boundary-segmented runs and never persists any domain state
optimistically.

## 2. Modules and layers

### 2.1 Frontend (`apps/web` — React 19 + TypeScript + Vite)

- **Route tree**: `/` → `/projects` → `/projects/:projectId/documents` →
  `/documents/:documentId/workspace`.
- **Server state**: TanStack Query owns everything fetched from `/api/v1`
  (projects, documents, workspace snapshot, alignment mutations). Query
  keys follow the report: `['projects']`, `['project', id]`,
  `['documents', projectId]`, `['document', id]`, `['workspace',
  documentId]`, plus document-scoped mutation keys.
- **Ephemeral UI state**: a `WorkspaceProvider` (React Context + reducer)
  scoped to the workspace route owns `currentSelection`, `pendingMembers`
  (the Alignment Tray, ADR-007), `hoveredAlignmentId`,
  `activeAlignmentId`, and the inspector mutation-freeze flag. Nothing
  ephemeral is persisted to `localStorage`; only per-document panel
  preferences are
  (`linguagraph.workspace.preferences.v1.<documentId>`).
- **Shared text engine** (`src/shared/text/`, framework-light, unit-tested
  without React):
  - `offset.ts` — the single UTF-16 ↔ Unicode code-point conversion
    strategy (ADR-001): `codePointLength`, `sliceByCodePoints`,
    `utf16OffsetToCodePointOffset`, `codePointOffsetToUtf16Offset`;
  - `selection.ts` — native `Selection`/`Range` → canonical code-point
    `PendingSpan`, fail-closed result codes, canonical-quote integrity,
    reverse locator;
  - `segmentation.ts` — canonical content + persisted Spans + alignment
    memberships → flat minimal runs (overlap supported; concatenated run
    text equals canonical content exactly);
  - `types.ts` — shared types.
- **Rendering** (`src/shared/rendering/`): `RenderedSpanRegistry`
  (`Map<spanId, HTMLElement[]>` — the canonical span→DOM bridge, never
  selector-discovered), run visual-state classification (never color-only),
  connector geometry helpers.
- **Workspace components** (`src/features/workspace/`): `TextPanel`
  (canonical content root with flat `<span data-run data-start data-end>`
  runs, `white-space: pre-wrap`, no `dangerouslySetInnerHTML`),
  `AlignmentTray`, `ConnectorOverlay` (SVG, `pointer-events: none`,
  rAF-coalesced recomputation), `ImportPanel`.
- **Alignments** (`src/features/alignments/`): `SavedAlignments` (read-only
  persisted representation + keyboard-accessible activation index),
  `AlignmentInspector` (note editing, member removal, delete — all driven
  by the authoritative workspace snapshot, no optimistic persisted state).
- **Shared UI**: `ErrorMessage` (`role="alert"`), `LoadingMessage`
  (`role="status"`), `EmptyState`, `ConfirmDialog` (accessible destructive
  confirmation with focus lifecycle, M0.7).

### 2.2 Backend (`apps/api` — FastAPI modular monolith, ADR-008)

Strict layering:

```text
HTTP route (parse/validate HTTP, map responses)
    → application/domain service (business rules, transaction ownership)
    → SQLAlchemy 2.0 persistence (models in app/db/models)
```

- **Routes** (`app/api/routes/`): health, projects, documents,
  text_versions, workspace, alignments. Routes never commit/rollback.
- **Services** (`app/services/`): `ProjectService`, `DocumentService`,
  `TextVersionService`, `AlignmentService`, `WorkspaceService`. Write
  services own exactly one `write_transaction`; read services own one
  `read_transaction`; the Session is transaction-clean between public
  service calls (a caller-owned pending transaction/mutation raises
  `SessionNotCleanError`).
- **Domain errors** (`app/api/errors.py`): every expected failure is a
  `DomainError` with a stable `{code, message, details}` envelope; HTTP and
  Pydantic validation failures are converted to the same envelope. Database
  exception strings never leak to clients.
- **Text utilities** (`app/text/`): `canonical.py` (the authoritative
  canonicalization pipeline, ADR-002), `offsets.py` (code-point offsets),
  `bcp47.py` (syntactic RFC 5646 validation).
- **Configuration** (`app/core/config.py`): pydantic-settings, environment
  driven (`DATABASE_URL`, `TEST_DATABASE_URL`, `CORS_ORIGINS`,
  `MAX_TEXT_VERSION_CODEPOINTS`, `MAX_REQUEST_BODY_BYTES`, `LOG_LEVEL`).
- **Middleware** (`app/api/middleware.py`): raw request-body size limit
  (413 `TEXT_TOO_LARGE` before unbounded buffering).
- **Disposable-database machinery** (`app/db/disposable.py`): the shared,
  fail-closed lifecycle used by both the pytest integration fixtures and
  the Playwright E2E backend; never targets the development database.

### 2.3 Database (PostgreSQL 18, ADR-004)

Six domain tables, all language-neutral (ADR-001…ADR-006): `projects`,
`parallel_documents`, `text_versions`, `spans`, `alignment_groups`,
`alignment_members`. Schema is managed exclusively by Alembic (revision
`0002` is the M0.7 head; `0001` is the no-op foundation). Constraints and
indexes live in the migration; cross-table invariants are service
responsibilities. See `docs/api/api-contract.md` for the offset contract
and `docs/development/CURRENT_STATE.md` section 4 for the schema summary.

## 3. Important boundaries

- **Unicode coordinate system (ADR-001)**: persisted/API offsets are
  zero-based, start-inclusive, end-exclusive Unicode **code-point**
  offsets. JavaScript UTF-16 offsets are converted by the single frontend
  utility layer and are never sent to the API. React components never
  implement offset conversion themselves.
- **Canonical text (ADR-002)**: the backend is the authority; the frontend
  renders and selects only server-returned canonical content. The pipeline:
  strict UTF-8 decode → strip one leading BOM → CRLF/CR → LF → reject
  NUL/surrogates → NFC → size limit → hash of canonical content.
- **Alignment semantics (ADR-003, ADR-006)**: `AlignmentGroup` is a
  symmetric N:M hyperedge ("these text occurrences correspond in this
  ParallelDocument"). No source/target fields, no relation types, no
  language-specific schema.
- **Text immutability (ADR-005)**: annotated `TextVersion.content` is
  immutable; deletion of an annotated version requires the explicit
  `DELETE ?force=true` destructive-reset flow, which revalidates affected
  groups against all invariants and deletes invalid groups atomically.
- **Pending selections (ADR-007)**: the tray is ephemeral frontend state;
  nothing persists until one atomic Create-Alignment request.
- **State ownership (report section 10)**: TanStack Query = server state;
  reducer/Context = ephemeral UI; localStorage = per-document panel
  preferences only. No Redux/Zustand.
- **Transaction ownership (report section 11)**: services own transaction
  boundaries; routes never commit/rollback; integration tests assert the
  session is transaction-clean after service calls.
- **Server-derived annotation metadata (report section 4)**: the client
  sends coordinates only; `exact_text`/`prefix`/`suffix` are derived from
  canonical content by the server.
- **Test/database isolation (M0.3 review hardening)**: integration and E2E
  flows run on uniquely named disposable databases
  (`linguagraph_*` / `linguagraph_e2e_<12 hex>`); `assert_disposable_db_url`
  fails closed; the E2E frontend proxy is pinned to the isolated E2E API.

## 4. Known limitations (unchanged)

- Concurrent PATCHes to the same AlignmentGroup have no general backend
  concurrency-control contract (no SELECT FOR UPDATE, no optimistic
  locking, no ETags/version columns — deferred beyond M0). The Inspector
  prevents overlapping same-group mutations generated by this UI only.
- Alignment mutation versus concurrent destructive TextVersion deletion
  needs a future cross-service concurrency/locking policy.
- The real-PostgreSQL concurrent Span get-or-create test proves the
  accepted algorithm but does not deterministically force every possible
  uncommitted conflict interleaving (optional strengthening, non-blocking).
- M0 enforces code-point boundaries only; grapheme-cluster editing is
  deferred.

## 5. Environment and operations

- ADR-009 baseline: Python 3.13 (uv), Node 24, PostgreSQL 18. CI uses a
  GitHub Actions PostgreSQL 18 service container (`.github/workflows/ci.yml`).
- `.\scripts\dev.ps1` (Windows): safe one-command launcher — Docker Compose
  PostgreSQL 18 only, FastAPI and Vite run locally.
- `.\scripts\verify.ps1` (Windows): thin orchestration over the
  authoritative verification commands; never destructive to development
  data.
