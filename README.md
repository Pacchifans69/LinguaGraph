# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a
language-neutral workbench for reading parallel texts side by side, selecting
canonical text spans, and building persistent multilingual alignment groups by
hand.

Primary demonstration languages are English, German, French, and Spanish, but
the domain model uses BCP-47 `language_tag` and contains no language-specific
schema structure.

## Current milestone

M4 — Human-Reviewed Lemma Annotation Foundation — is implemented, Human
reviewed, merged by rebase through PR #13, and durably recorded through the
post-merge closeout.

Final reviewed and independently proven candidate:

`ac1cd40ae190577783453050f2cbc209cd3958a6`

Candidate tree:

`18eff900b903d7f3743aa88fa9390d3dbdebc477`

Post-rebase implementation `main`:

`4cc435893207cdd32216012ca887d338e1932250`

Its tree is exactly the reviewed candidate tree, so M4 Gate 3
candidate-to-main identity is **PASS / EXACT**.

Exact-guarded implementation-branch cleanup has passed. M4 is therefore
**COMPLETE / MERGED / CLOSED**.

M5 — Human-Reviewed POS Annotation Foundation — now has a Human-approved
frozen execution contract in `docs/development/M5_CONTRACT.md` on the approved
pre-freeze base:

```text
base  68fedc4c8cba80201333e6550231b805e0f0853c
tree  3bea6efd9662fe746328d2a7814fa65e1efb917f
```

M5 implementation has **not** started and is **not authorized**. The planned
implementation branch `m5-human-reviewed-pos-annotation-foundation` may not be
created until the freeze commit is independently verified and the Human
separately authorizes bounded implementation.

The frozen M5 scope is one optional Human-reviewed coarse POS annotation per
saved `is_word_like = TRUE` token occurrence, using the closed fifteen-value
LinguaGraph vocabulary defined by the contract. It does not authorize XPOS,
morphology, syntax, automatic POS tagging, Lexeme identity, or generic EAV.

## Evidence status

M4 Gate 2 passed under a Human-approved M4-specific External Infrastructure
Exception.

The canonical GitHub Actions exact-candidate attempt — run #80 /
`34245187052` — reproduced `G2-X01` before any workflow step executed. This is
retained provider evidence and not an application failure.

Independent hosted exact-candidate proof passed:

- repository: `Pacchifans69/linguagraph-m4-proof`;
- proof commit: `c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f`;
- proof tree: `33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`;
- CircleCI build/pipeline: `#1`;
- status: `ci/circleci: m4-exact-candidate-proof` — **SUCCESS**.

That proof preserved exact application SHA/tree and frozen base while running
Python 3.13, Node 24, PostgreSQL 18, Alembic empty → `0005` / current / check,
the full real-PostgreSQL backend suite with zero skips, `npm ci`, lint,
typecheck, Vitest, production build, the golden/Unicode/M2/M3/M4 Playwright
paths, cleanup, dependency-hash checks, and final provenance/tree integrity.

Static Human Diff Review: **PASS**.

Human Runtime Acceptance: **PASS**.

The initial HRA missing-panel observation was traced to stale Windows services
from a different local checkout, not the exact candidate. The exact candidate
passed the Human lemma workflow.

`G2-X01` remains `OPEN / EXTERNAL`. `HRA-F09` remains inherited non-blocking
visual debt.

The M4 External Infrastructure Exception does not carry forward to M5. Any M5
alternative hosted proof path requires fresh exact-candidate evidence and a
separate Human-approved M5-specific exception at Gate 2.

## Authoritative documents

Read these when reconstructing project state:

- `AGENTS.md` — workflow rules and current phase;
- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` — frozen M0
  specification and Definition of Done;
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` — accepted
  pre-implementation engineering report;
- `docs/adr/` — accepted as-built architecture decisions through ADR-012; M5
  requires a bounded ADR-013 during implementation;
- `docs/development/CURRENT_STATE.md` — durable engineering handoff;
- `docs/development/M1_CONTRACT.md` — completed frozen M1 contract;
- `docs/development/M2_CONTRACT.md` — completed frozen M2 execution contract;
- `docs/development/M3_CONTRACT.md` — completed frozen M3 execution contract;
- `docs/development/M4_CONTRACT.md` — completed frozen M4 execution contract;
- `docs/development/M5_CONTRACT.md` — active frozen M5 execution contract;
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

The current **as-built** schema head is:

```text
0005 (head)
```

M2 adds `0003` for sentence segmentation; M3 adds `0004` for exact-basis token
segmentation; M4 adds additive `0005_human_reviewed_lemma_annotations.py` for
the sparse occurrence-level `token_lemma_annotations` table.

`0001` through `0004` remain unchanged by M4.

## Verification

Windows one-command verification:

```powershell
.\scripts\verify.ps1
```

Windows PowerShell 5.1 fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

Current as-built semantic verification entry points:

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
npx.cmd playwright test e2e/golden-path.spec.ts e2e/unicode.spec.ts e2e/segmentation.spec.ts e2e/token-segmentation.spec.ts e2e/lemma-annotation.spec.ts
```

A full release-baseline proof requires real PostgreSQL integration tests and a
zero-skip guard. A run with skipped integration tests is not a full pass.

The accepted M4 exact-candidate hosted proof established:

```text
Python 3.13 / Node 24 / PostgreSQL 18    PASS
exact SHA/tree/frozen-base guard          PASS
uv sync --frozen                          PASS
Alembic empty → 0005 / current / check    PASS
full real-PostgreSQL backend suite        PASS
zero skipped-test guard                   PASS
npm ci / lint / typecheck / Vitest        PASS
production build                          PASS
Playwright golden + Unicode + M2/M3/M4    PASS
disposable database cleanup               PASS
dependency/tree/provenance integrity      PASS
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
preserving M0 semantics.

M2 adds an independent persisted Human-reviewed sentence-segmentation layer.

M3 adds one saved sentence-bound exhaustive token layer with Human-reviewed
`is_word_like` classification.

M4 adds sparse Human-reviewed occurrence-level lemma annotation bound directly
to saved eligible token `Segment.id`:

- one optional lemma per saved word-like token occurrence;
- `PUT` and `DELETE /api/v1/token-segments/{token_segment_id}/lemma`;
- NFC/value validation without automatic case folding, trimming, stemming, or
  dictionary rewriting;
- retokenization fail-closed while lemma dependents exist;
- shared TextVersion-root mutation ordering;
- flat workspace `token_lemma_annotations` read authority;
- `LemmaAnnotationPanel` outside the canonical text root;
- explicit save/reload/edit/delete;
- Alignment independence.

M4 does not introduce Lexeme identity, POS/morphology/syntax, generic EAV
annotation, automatic lemmatization, automatic alignment, NLP/LLM providers,
or automatic re-anchoring.

## Known limitations / retained debt

These remain accepted at the M4 durable boundary:

- GitHub-hosted-runner execution remains unavailable under `G2-X01`; the
  checkpoint-specific CircleCI proof is retained release evidence, not a
  declaration that GitHub Actions recovered.
- Connector routing uses frozen center-to-hub geometry and can visually cross
  text glyphs while binding correctness remains intact (`HRA-F09`).
- A malformed/broken local Node command that resolves but emits no version
  stdout can produce a low-level PowerShell/.NET prerequisite diagnostic.
- Existing mutation locking is not a general collaborative locking protocol;
  M4 only adds the bounded token/lemma TextVersion-root serialization required
  by its contract.
- The initial M4 HRA page mismatch came from stale services in a different
  Windows checkout. It is recorded as an environment observation rather than
  an M4 product defect.
- Later lexical ontology, automatic NLP/LLM features, authentication,
  collaboration, graph/vector/search infrastructure, advanced connector
  routing and later workbench expansion remain outside the completed M4
  checkpoint.

## Completed M3 implementation boundary

M3 delivered the bounded Human-reviewed word/token segmentation foundation.
Contract, implementation, proof, static review, runtime acceptance, PR, and
rebase merge are complete. The implementation branch was deleted only after
the approved exact-SHA and required-main guards passed.

The M3 implementation branch
`m3-word-token-segmentation-foundation@d4254c1239e649b17dc4ae6d6f995e52bd4635db`
was deleted after the guard verified
`origin/main@366ca893da187d5fa2239b3fd538853e3b57211a`. GitHub independently
returns 404 for the ref. All proof and diagnostic evidence remains retained;
`G2-X01` remains `OPEN / EXTERNAL`.

## Completed M4 implementation boundary

M4 delivered the bounded Human-reviewed lemma-annotation foundation defined by
`docs/development/M4_CONTRACT.md` and ADR-012.

Durable implementation coordinates:

```text
frozen implementation base
4e12a11e266367e0a368c6128f722a620ce47ed3

final reviewed/proven candidate
ac1cd40ae190577783453050f2cbc209cd3958a6

candidate/application tree
18eff900b903d7f3743aa88fa9390d3dbdebc477

PR
#13

merge method
rebase

post-rebase implementation main
4cc435893207cdd32216012ca887d338e1932250
```

Gate 3 confirmed exact candidate-to-main tree identity.

The implementation branch
`m4-human-reviewed-lemma-annotation-foundation@ac1cd40ae190577783453050f2cbc209cd3958a6`
was deleted only after the Human-approved exact guard verified durable
`main@d90b0f52f96869d2710aa4b592514f34b7e2dd99`. GitHub independently returns
404 and an empty branch-search result for the deleted ref.

Proof repositories, CircleCI records/artifacts, GitHub Actions diagnostics,
PR #13, and candidate commit history remain retained.

No later checkpoint is authorized by this closeout.
