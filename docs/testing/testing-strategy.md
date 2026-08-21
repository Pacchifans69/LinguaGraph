# LinguaGraph — Testing Strategy (as built, M0.7)

This document describes the testing architecture as actually implemented
and the rules for what counts as evidence. It is a description, not a new
authority: the authoritative testing requirements are
`docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` section 13 and the
M0 Definition of Done (spec section 76).

## 1. Test levels

### 1.1 Backend unit tests (`apps/api/app/tests/unit/`)

Pure-function and boundary tests without a database:

- canonical text pipeline (`test_canonical.py`) — the mandatory vectors
  (`A🙂B` = 3, `für größere Häuser` = 18, `Café 🙂 mañana für français` =
  26, BOM/CRLF/NUL/surrogate/NFC rules);
- offset utilities (`test_offsets.py`), BCP-47 syntactic validation
  (`test_bcp47.py`);
- alignment invariant predicates and schema boundaries
  (`test_alignment_invariants.py`, `test_alignment_schema.py`,
  `test_text_version_patch_schema.py`);
- configuration, health endpoint, integrity-error classification, and the
  disposable-database fail-closed guard
  (`test_config.py`, `test_health.py`, `test_integrity_classification.py`,
  `test_disposable_db.py`).

### 1.2 Backend integration tests (`apps/api/app/tests/integration/`)

Run against **real PostgreSQL** (PostgreSQL 18; SQLite is prohibited as an
integration-test substitute). The session fixture creates a uniquely named
disposable database (`linguagraph_m02_<uuid>`), migrates it to Alembic
HEAD, and drops it at session end; each test starts from a truncated schema.

Covered: domain schema constraints (`test_domain_schema.py`), persistence
(`test_persistence.py`), project/document/TextVersion APIs
(`test_projects_api.py`, `test_documents_api.py`,
`test_text_versions_api.py`), TextVersion deletion incl. the ADR-005
destructive reset (`test_text_version_deletion.py`), request-body limits
(`test_request_body_limit.py`), workspace read model
(`test_workspace_api.py`), the transaction-clean Session contract
(`test_write_transaction.py`), AlignmentService incl. the real-PostgreSQL
concurrent Span get-or-create (`test_alignment_service.py`), alignment HTTP
endpoints (`test_alignments_api.py`), and the disposable-database lifecycle
(`test_disposable_db_integration.py`).

### 1.3 Disposable databases and migration verification

Shared, fail-closed machinery in `apps/api/app/db/disposable.py`:

- database names must carry the reserved `linguagraph_` prefix (and the
  E2E namespace must be EXACTLY `linguagraph_e2e_<12 lowercase hex>`);
  `assert_disposable_db_url` fails closed before any SQL runs — the normal
  development database can never be created/migrated/read/written/dropped
  by a disposable flow;
- migration tests (`test_migrations.py`): empty → head (session fixture),
  head → base → head cycle on a dedicated disposable database, and the
  M0.1 no-op revision guard. The Alembic helper restores the environment
  exactly (M0.7 W5): a pre-existing `DATABASE_URL` is reinstated with its
  exact previous value (including the empty-string case and the failure
  path); an absent `DATABASE_URL` stays absent;
- the Playwright E2E backend (`apps/api/app/e2e/server.py`) uses the same
  lifecycle for its own disposable database and records it for the
  Node-side `globalTeardown` drop (`app.e2e.drop`, also fail-closed).

### 1.4 Frontend unit/component tests (Vitest + React Testing Library)

- shared text engine: offset conversion, selection engine (incl. exact
  run-boundary endpoints, surrogate splits, cross-version rejection),
  boundary segmentation (`src/shared/text/*.test.ts`);
- rendering: RenderedSpanRegistry, run-state classification, connector
  geometry helpers (`src/shared/rendering/*.test.ts`);
- components/pages: TextPanel, AlignmentTray, WorkspacePage, ImportPanel
  flows, ProjectsPage, DocumentsPage, SavedAlignments, AlignmentInspector
  (note/member/delete/mutation-freeze), workspace reducer/provider,
  preferences, normalize, alignment API hooks;
- Playwright configuration guards (`src/test/playwrightConfig.test.ts`) —
  E2E isolation properties are mechanically asserted;
- shared UI (M0.7): `ConfirmDialog` focus lifecycle, delete-error
  visibility for projects/documents, pending destructive-delete freeze
  (`src/shared/ui/ConfirmDialog.test.tsx` and page tests).

### 1.5 Playwright E2E (`apps/web/e2e/`)

- `golden-path.spec.ts` — the historical M0.3+M0.4+M0.5+M0.6 proof:
  project/document/versions via UI, panel hide/show/reorder + reload
  preferences, native selections (incl. `Café 🙂 mañana für français`
  offsets), tray staging rules, atomic create, persistence, reload,
  four-language visualization, hover/activate/connectors, Inspector
  note/remove/delete, reload persistence and orphan cleanup;
- `unicode.spec.ts` — the M0.7 Unicode **release blocker**: real browser
  selections before/at/after the emoji → code-point offsets → Create
  Alignment through the real user path (no API-created persisted spans) →
  server-derived `exact_text` → PostgreSQL persistence → reload → rendered
  annotation state → hover/activate highlight + counterpart behavior. It
  directly verifies canonical content, code-point start/end offsets,
  `exact_text`, persisted Span/member/group state, reload persistence,
  rendered state and highlighting.
- Both specs run against the isolated disposable E2E database; the Vite
  instance Playwright starts proxies `/api` only to that same isolated API
  (`reuseExistingServer: false`, `--strictPort`).

## 2. CI (GitHub Actions)

`.github/workflows/ci.yml` verifies the M0 release baseline on every push
and pull request:

- Python 3.13 (uv) + `uv sync --frozen`;
- Node 24 + `npm ci`;
- PostgreSQL 18 service container;
- backend pytest suite with **real PostgreSQL integration**;
- migration safety: `alembic upgrade head` + `current` (asserts
  `0002 (head)`) + `alembic check` (no drift);
- frontend lint, typecheck, test, production build;
- Playwright golden path + Unicode release blocker;
- a fail-closed guard step fails the job if the backend suite reports any
  skipped test — a run where PostgreSQL integration tests were skipped
  never counts as successful M0 CI evidence.

## 3. Local verification

- `.\scripts\dev.ps1` — run the application (never a verification tool).
- `.\scripts\verify.ps1` — thin orchestration of the authoritative
  commands (backend pytest, alembic current/check, frontend
  lint/typecheck/test/build, Playwright golden path + Unicode spec);
  stops and exits non-zero on the first failure; preserves development
  data (destructive migration cycles happen only on disposable databases
  inside pytest).

Exact commands are listed in the root `README.md` ("Verification
commands").

## 4. Local evidence vs CI evidence

- **Local evidence**: the developer runs the commands above on their own
  machine and reports pass/fail counts, environment versions, and the
  PostgreSQL server used. Integration tests skip (with an explicit
  message) when no PostgreSQL server is configured — a skipped
  integration run must be reported explicitly and never described as full
  verification.
- **CI evidence**: an actual GitHub Actions run of `ci.yml` that completed
  with the integration tests executing (the skip guard passed). Workflow
  configuration alone is NOT CI evidence; only a completed run is. This
  document does not claim CI evidence that does not exist.
