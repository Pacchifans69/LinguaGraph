# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a
language-neutral workbench for reading parallel texts side by side, selecting
canonical text spans, and building persistent multilingual alignment groups by
hand.

Primary demonstration languages are English, German, French, and Spanish, but
the domain model uses BCP-47 `language_tag` and contains no language-specific
schema structure.

## Current milestone

**M2 — Linguistic Segmentation Foundation:
CONTRACT FROZEN / IMPLEMENTATION BRANCH NOT YET CREATED**

M2 Gate 1 passed against durable pre-freeze base
`8ad87aaa789d86535adf3aed34035317c515b6e6` / tree `f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`. Human approved and froze
`docs/development/M2_CONTRACT.md` on 2026-09-05.

The bounded first slice introduces a persistent, Human-reviewed sentence
segmentation layer with Unicode code-point coordinates, complete-partition and
stale-content guards, atomic replacement, Alembic `0003`, and a Segmentation
panel outside the canonical text root. Word/token segmentation, automatic or
candidate alignment, NLP/LLM providers and direct segment-to-tray behavior
remain deferred.

The implementation branch has not been created. After this docs-only freeze
commit is independently verified, the next safe action is to create
`m2-linguistic-segmentation-foundation` from that exact commit.

The last completed implementation milestone remains:

**M1 — Workbench Interaction & UI Foundation:
COMPLETE / MERGED / CLOSED**

The historical `m1-workbench-ui-foundation` branch was deleted under an
exact-SHA guard after durable-state closure; retained proof and diagnostic
evidence remains available.

M1 merged in PR #10. Its final reviewed and independently proven candidate was
`bdd32cbaed63966c346caaf44f1fd3a0197750a7`; rebase merge produced durable
implementation `main@3a3361aebdb7c9c8d3a1b850c5b30dc9f5a5b6ea` with exact
candidate-to-main tree identity
`c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`.

## Evidence status

M1 Gate 2 result:

**PASS under the approved M1 External Infrastructure Exception**

The exception waived only successful execution specifically on a
GitHub-hosted runner.

- exact candidate/tree:
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7` /
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`;
- independent CircleCI proof:
  **PASS** on pipeline #3;
- executable proof config:
  `Pacchifans69/-linguagraph-m1-proof@81b35eb3191b1d449eb74934553d547fb9f7221d`;
- full PostgreSQL/backend/frontend/build/Playwright/Unicode gates:
  PASS;
- final tracked-tree and cleanup guards:
  PASS;
- Static Human Diff Review:
  PASS;
- Human Runtime Acceptance at 1280 × 720 and 1440 × 900:
  PASS.

GitHub Actions exact-candidate runs #34 and #35 and post-merge `main` run #36
all failed before any workflow step began. The repository does not claim a
GitHub Actions PASS.

`G2-X01` remains **OPEN / EXTERNAL**. The accepted M1 external proof is
checkpoint-specific; the historical M0.7 proof was not reused as M1 evidence.

The proof repository README retains an obsolete initial candidate pin. The
executable config and successful run at `81b35eb…` pin the final candidate and
are the accepted provenance authority.

## Authoritative documents

Read these when reconstructing project state:

- `AGENTS.md` — workflow rules and current phase;
- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` — frozen M0
  specification and Definition of Done;
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` — accepted
  pre-implementation engineering report;
- `docs/adr/` — accepted ADR-001 … ADR-009;
- `docs/development/CURRENT_STATE.md` — durable engineering handoff;
- `docs/development/M1_CONTRACT.md` — frozen completed M1 contract;
- `docs/development/M2_CONTRACT.md` — active frozen M2 execution contract;
- `docs/development/M0_7_CLOSEOUT.md` — M0.7 Gate 2/Human Review/merge/Gate 3
  evidence ledger;
- `docs/architecture/ARCHITECTURE.md` — as-built architecture;
- `docs/api/api-contract.md` — as-built HTTP contract;
- `docs/testing/testing-strategy.md` — testing/evidence rules;
- `docs/testing/manual-acceptance.md` — human M0 walkthrough.

## Repository layout

```text
apps/api/            FastAPI backend (Python 3.13, uv)
apps/web/            React + TypeScript + Vite frontend (Node 24)
docs/                ADRs, pre-implementation records, as-built docs
infra/postgres/      PostgreSQL bootstrap scripts
compose.yml          PostgreSQL 18 local development service
scripts/dev.ps1      safe local launcher
scripts/verify.ps1   local verification orchestration
.github/workflows/   canonical GitHub Actions workflow configuration
```

## Prerequisites

ADR-009 runtime baseline:

| Component | Required baseline |
|---|---|
| Python | 3.13.x |
| uv | current compatible release |
| Node.js | 24.x LTS |
| PostgreSQL | 18.x |
| Git | any current release |
| Docker Desktop | recommended for local PostgreSQL on Windows |

Quick checks:

```powershell
uv --version
node --version
npm.cmd --version
uv run python --version
```

`node --version` must report `v24.x`.

## Setup from a clean checkout

### Backend

Create `apps/api/.env` from the example and keep it untracked:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Then synchronize exactly from the lockfile:

```powershell
cd apps/api
uv sync --frozen
cd ../..
```

### Frontend

```powershell
cd apps/web
npm.cmd ci
cd ../..
```

Use `npm install` only when intentionally changing dependency manifests;
normal verification uses the committed lockfile.

### PostgreSQL 18

Preferred local path:

```powershell
docker compose up -d postgres
docker compose ps
```

Wait until `linguagraph-postgres` is healthy.

The normal development database is `linguagraph`. Integration and E2E
verification use guarded disposable databases and must never destructively
reset the development database.

## Running the application

From the repository root on PowerShell 7+:

```powershell
.\scripts\dev.ps1
```

On Windows PowerShell 5.1 where local script execution policy blocks direct
`.ps1` invocation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

The bypass applies to that PowerShell process; changing machine-wide execution
policy is not required.

The launcher:

- verifies Docker, uv and Node 24;
- starts/reuses PostgreSQL 18 without deleting data;
- preserves an existing `apps/api/.env` byte-for-byte;
- synchronizes backend dependencies from the frozen lockfile;
- applies forward-only Alembic migrations;
- starts FastAPI on port 8000 and Vite on port 5173;
- waits for the API health endpoint;
- fails closed on foreign port ownership and does not kill unrelated
  processes.

Endpoints:

```text
Frontend  http://localhost:5173
Health    http://127.0.0.1:8000/api/v1/health
API docs  http://localhost:8000/docs
```

## Database migrations

From `apps/api`:

```powershell
uv run alembic upgrade head
uv run alembic current
uv run alembic check
```

The M0 schema head is:

```text
0002 (head)
```

M1 adds no Alembic revision; Alembic HEAD remains `0002`.

## Verification

Windows one-command verification:

```powershell
.\scripts\verify.ps1
```

Windows PowerShell 5.1 fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

The authoritative semantic gates are:

Backend:

```powershell
cd apps/api
uv sync --frozen
uv run pytest
uv run alembic upgrade head
uv run alembic current
uv run alembic check
```

Frontend:

```powershell
cd apps/web
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npx.cmd playwright test e2e/golden-path.spec.ts e2e/unicode.spec.ts
```

A full release-baseline proof requires real PostgreSQL integration tests. A
run with skipped integration tests is not a full pass.

The accepted M1 external Gate 2 proof recorded:

```text
Python       3.13
Node         24
PostgreSQL   18
Alembic      0002 (head)
backend      full real-PostgreSQL suite PASS
skip guard   PASS
npm ci       PASS
lint         PASS
typecheck    PASS
Vitest/RTL   PASS
build        PASS
Playwright   golden + Unicode PASS
DB cleanup   PASS
tracked tree PASS
provenance   exact SHA/tree PASS
```

See `docs/testing/testing-strategy.md` for the distinction between local,
GitHub-provider, and approved external CI evidence.



## Configuration

Backend settings are environment-driven through
`apps/api/app/core/config.py`.

Important values:

| Variable | Default / role |
|---|---|
| `DATABASE_URL` | PostgreSQL development connection |
| `TEST_DATABASE_URL` | disposable integration-test server; falls back to `DATABASE_URL` |
| `CORS_ORIGINS` | frontend origins allowed for direct API calls |
| `MAX_TEXT_VERSION_CODEPOINTS` | canonical text size limit |
| `MAX_REQUEST_BODY_BYTES` | raw request-body byte limit |
| `LOG_LEVEL` | application log level |

Never commit `.env`.

## As-built architecture baseline

The M0 core consists of:

- a language-neutral PostgreSQL domain model: Project, ParallelDocument,
  TextVersion, Span, AlignmentGroup and AlignmentMember;
- canonical UTF-8/NFC text with Unicode code-point offsets;
- immutable annotated TextVersion content;
- atomic server-owned alignment mutations and server-derived quote metadata;
- a document-level workspace snapshot used as the frontend read authority;
- native browser Selection/Range conversion into canonical code-point ranges;
- a frontend-only pending Alignment Tray;
- persistent annotation rendering, hover/active counterpart discovery,
  SVG connectors and an Alignment Inspector;
- TanStack Query for server state and narrowly scoped React state/localStorage
  for ephemeral UI/preferences;
- real-PostgreSQL integration/E2E isolation through guarded disposable
  databases.

M1 adds bounded presentation primitives, application design tokens, coherent
feedback/action states, and centralized workspace keyboard behavior while
preserving those M0 semantics.

For details and invariants, use the ADRs and the as-built architecture/API
files rather than treating this README as a second specification.

## Known limitations / retained debt

These remain accepted at M1 durable closure:

- GitHub-hosted-runner execution remains unavailable under `G2-X01`; the
  accepted external CI proof remains the release evidence until provider
  recovery is proven.
- Connector routing uses frozen center-to-hub geometry and can visually cross
  text glyphs; binding correctness is intact.
- A malformed/broken local Node command that resolves but emits no version
  stdout can produce a low-level PowerShell/.NET prerequisite diagnostic.
- Previously accepted concurrency limits remain: same-group concurrent PATCH
  and destructive-operation interleavings are not redesigned into a broader
  collaborative locking model.
- M0 deliberately excludes machine translation, NLP/LLM alignment,
  authentication/collaboration, Redis/Neo4j/Elasticsearch/vector search,
  native desktop packaging, mobile/browser extensions and document-reader
  subsystems.

## M2 development boundary

M2 Gate 1 and Human Contract Review are complete. The contract is frozen; its
docs-only freeze commit must be verified before the implementation branch is
created.

After verification, create
`m2-linguistic-segmentation-foundation` from the exact freeze commit.
Implementation stays off `main` and follows
`docs/development/M2_CONTRACT.md`.

Do not recreate or reuse `m1-workbench-ui-foundation` or
`m0.7-hardening`. Prior checkpoint exceptions and proof runs do not authorize
M2 Gate 2.
