# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a
language-neutral workbench for reading parallel texts side by side, selecting
canonical text spans, and building persistent multilingual alignment groups by
hand.

Primary demonstration languages are English, German, French, and Spanish, but
the domain model uses BCP-47 `language_tag` and contains no language-specific
schema structure.

## Current milestone

M3 — Human-Reviewed Word/Token Segmentation Foundation — is complete.

Candidate `d4254c1239e649b17dc4ae6d6f995e52bd4635db` (tree
`bf59e847b8874c90b76032e92fb006343b4662d6`) was merged by rebase through
PR #12. Resulting `main` is
`fc607b597bee35aff31a06a3945fa7a256f6b5c8` with the same application
tree. No later checkpoint is authorized.

## Evidence status

M3 Gate 2 passed under its approved External Infrastructure Exception.
Independent hosted Linux proof is retained in
`Pacchifans69/linguagraph-m3-proof@2e95d307374bc279f42d1048caf988d2b730169c`;
CircleCI pipeline #5 passed the complete required gates.

GitHub Actions runs for candidate push, PR, and merged main failed before any
step began. They are provider diagnostics, not application failures.
`G2-X01` remains `OPEN / EXTERNAL`.

Static Human Diff Review and Human Runtime Acceptance passed in Edge and Chrome
at 1280×720 and 1440×900. A non-blocking UX comprehension note remains for
Word-like classification versus whole-layer token deletion.

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
- `docs/development/M2_CONTRACT.md` — completed frozen M2 execution contract;
- `docs/development/M3_CONTRACT.md` — active frozen M3 execution contract;
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

The active M3 schema head is:

```text
0004 (head)
```

M2 adds `0003` for sentence segmentation; M3 adds `0004` for exact-basis token
segmentation. `0001` through `0003` remain unchanged.

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
npx.cmd playwright test e2e/golden-path.spec.ts e2e/unicode.spec.ts e2e/segmentation.spec.ts e2e/token-segmentation.spec.ts
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

The completed M2 milestone adds an independent persisted sentence-segmentation
layer, server-validated complete partitions, stale-content protection,
Human-reviewed manual/Intl.Segmenter drafts, and a Segmentation panel outside
the canonical text root. Segment entities are not alignment Spans and do not
enter the Alignment Tray in M2.

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

## Completed M3 implementation boundary

M3 delivered the bounded human-reviewed word/token segmentation foundation.
Contract, implementation, proof, static review, runtime acceptance, PR, and
rebase merge are complete. The implementation branch remains retained pending
separately authorized exact-SHA cleanup.

## Post-M3 development boundary

No work beyond M3 is authorized. Any next checkpoint requires a new bounded
contract and explicit Human approval.

The M3 implementation branch remains retained at
`d4254c1239e649b17dc4ae6d6f995e52bd4635db` pending separately authorized
exact-SHA cleanup. All proof and diagnostic evidence remains retained;
`G2-X01` remains `OPEN / EXTERNAL`.
