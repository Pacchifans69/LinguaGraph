# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a
language-neutral workbench for reading parallel texts side by side, selecting
canonical text spans, and building persistent multilingual alignment groups by
hand.

Primary demonstration languages are English, German, French, and Spanish, but
the domain model uses BCP-47 `language_tag` and contains no language-specific
schema structure.

## Current milestone

**M0 — Manual Alignment Workbench: COMPLETE**

All planned M0 checkpoints are complete and merged:

- M0.1 — Repository Foundation
- M0.2 — Persistence Model
- M0.3 — Document Workspace
- M0.4 — Selection Engine
- M0.5 — Alignment Persistence
- M0.6 — Alignment Visualization
- M0.7 — Hardening

M0.7 merged in PR #9. Its approved base was
`7b3e61c547a7831275ae5fb01458ed0bdd7c202c`; the final reviewed and
independently proven candidate was
`580e27cbea09e50f40782a92da426e7332e8a54d`. Repository policy allowed only
rebase merge, producing durable implementation `main`
`697b019dc2820c67dacbc0b58a718e198ab655be` immediately after merge. Gate 3
proved that both commits point to the exact same file tree
`16c2bd3f5a8c5cb4960e193896547093fe091c87`.

The M0 golden loop is complete:

```text
create Project
→ create ParallelDocument
→ add arbitrary-language TextVersions
→ select canonical text ranges
→ stage members in the Alignment Tray
→ create and persist an AlignmentGroup
→ reload
→ hover/click aligned text
→ visualize counterparts/connectors
→ inspect, edit and delete the alignment
```

M0.7 adds the release-hardening layer: real-PostgreSQL integration and
migration-from-zero proof, Unicode release-blocker E2E coverage,
error/loading/empty-state and accessibility hardening, destructive-operation
pending locks, production-build verification, safe Windows launch/verification
scripts, CI configuration, and as-built documentation.

Detailed closeout evidence is in
`docs/development/M0_7_CLOSEOUT.md`.

## Evidence status

M0.7 Gate 2 result:

**Gate 2 PASS under approved External Infrastructure Exception**

The exception is narrow and remains visible in durable state:

- GitHub Actions provider proof: **BLOCKED / EXTERNAL**;
- `G2-X01`: **OPEN / EXTERNAL**;
- independent CircleCI proof: **PASS** on exact candidate `580e27c…`;
- accepted external config:
  `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`;
- ADR-009: unchanged.

GitHub-hosted runner attempts, including the post-merge `main@697b019…` run,
continue to fail before any job step starts. The repository therefore does
**not** claim a GitHub Actions PASS. The external proof executed the frozen
semantic gates on hosted Linux with Python 3.13, Node 24, and PostgreSQL 18.

## Authoritative documents

Read these when reconstructing project state:

- `AGENTS.md` — workflow rules and current phase;
- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` — frozen M0
  specification and Definition of Done;
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` — accepted
  pre-implementation engineering report;
- `docs/adr/` — accepted ADR-001 … ADR-009;
- `docs/development/CURRENT_STATE.md` — durable engineering handoff;
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

M0.7 adds no Alembic revision.

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
npm.cmd exec playwright test -- golden-path.spec.ts unicode.spec.ts
```

A full release-baseline proof requires real PostgreSQL integration tests. A
run with skipped integration tests is not a full pass.

The accepted M0.7 external Gate 2 proof recorded:

```text
Python       3.13.15
Node         24.20.0
PostgreSQL   18.6
Alembic      0002 (head)
Backend      390 passed
skip guard   PASS
npm ci       PASS
lint         PASS
typecheck    PASS
Vitest/RTL   PASS
build        PASS
Playwright   golden + Unicode PASS
DB cleanup   PASS
tracked tree PASS
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

M0 consists of:

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

For details and invariants, use the ADRs and the as-built architecture/API
files rather than treating this README as a second specification.

## Known limitations / retained debt

These do not invalidate M0 closure:

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

## Post-M0 development

There is no authorized M0.8 checkpoint. The M0 specification describes future
architectural directions, but a concrete post-M0 milestone must be separately
contracted and frozen before implementation. Start from current `main`; do not
reuse the historical `m0.7-hardening` branch as a new feature branch.
