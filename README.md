# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a
language-neutral workbench for reading parallel texts side by side, selecting
canonical text spans, and building persistent multilingual alignment groups by
hand.

Primary demonstration languages are English, German, French, and Spanish, but
the domain model uses BCP-47 `language_tag` and contains no language-specific
schema structure.

## Current milestone

M5 — Human-Reviewed POS Annotation Foundation — has completed bounded
implementation, exact-candidate Gate 2, Human Static Diff Review, Human Runtime
Acceptance, PR #14, explicit Human Merge Decision, rebase merge, Gate 3 exact
tree verification, and post-merge durable-state closure.

Durable M5 coordinates:

```text
frozen implementation base
11176df91dd9dc3d1169e4bef41808b0abfa8656

final reviewed / independently proven candidate
139f3349b8556f5dd13d5c2d8808fda4a79dc819

candidate / post-rebase application tree
179aba060d5e798ace46ea6bed0a7c496a50e9ad

PR
#14

merge method
rebase

post-rebase implementation main
49163ee407c0dae7d9e20cc647cabc8ae98f75de
```

Gate 3 candidate-to-main identity is **PASS / EXACT**. The implementation
branch `m5-human-reviewed-pos-annotation-foundation` remains intentionally
retained pending separate Human-authorized exact-guarded cleanup.

Human Runtime Acceptance is **PASS WITH HUMAN-APPROVED UX DEFERRAL**.
`HRA-F01` — Workbench information architecture / panel density — remains
**OPEN / DEFERRED** and must be the first contract input of the next
Human-authorized Workbench Information Architecture checkpoint. It is not
resolved by M5.

### Completed previous milestone

M4 — Human-Reviewed Lemma Annotation Foundation — is implemented, Human
reviewed, merged by rebase through PR #13, durably recorded, and closed after
exact-guarded implementation-branch cleanup.

Final reviewed and independently proven candidate:

`ac1cd40ae190577783453050f2cbc209cd3958a6`

Candidate tree:

`18eff900b903d7f3743aa88fa9390d3dbdebc477`

Post-rebase implementation `main`:

`4cc435893207cdd32216012ca887d338e1932250`

Its tree is exactly the reviewed candidate tree, so M4 Gate 3
candidate-to-main identity is **PASS / EXACT**.

The frozen M5 scope is one optional Human-reviewed coarse POS annotation per
saved `is_word_like = TRUE` token occurrence, using the closed fifteen-value
LinguaGraph vocabulary defined by `docs/development/M5_CONTRACT.md`. It does
not authorize XPOS, morphology, syntax, automatic POS tagging, Lexeme identity,
or generic EAV.

## Evidence status

M5 Gate 2 passed under a Human-approved M5-specific External Infrastructure
Exception for the exact corrected candidate
`139f3349b8556f5dd13d5c2d8808fda4a79dc819` / tree
`179aba060d5e798ace46ea6bed0a7c496a50e9ad`.

Canonical GitHub Actions exact-candidate run `34564666636` reproduced
`G2-X01` before any repository-defined workflow step executed (`steps=[]`,
logs unavailable / `BlobNotFound`). PR-event run `34586589640` and post-merge
`main` run `34587072906` reproduced the same pre-step fingerprint. These are
retained provider diagnostics, not application failures.

Independent hosted exact-candidate proof passed:

- repository: `Pacchifans69/linguagraph-m5-proof`;
- proof commit: `4cf38bc3dee0c312d072ef2cc47ebdb821b32465`;
- proof tree: `a59a66ec392f418bf7e23d1cab67eae61f4810a4`;
- CircleCI build/pipeline: `#2`;
- status: `ci/circleci: m5-exact-candidate-proof` — **SUCCESS**.

That proof preserved exact application SHA/tree and frozen base while running
Python 3.13, Node 24, PostgreSQL 18, Alembic empty → `0006` / current / check,
the full real-PostgreSQL backend suite with zero skips, `npm ci`, lint,
typecheck, Vitest, production build, the golden/Unicode/M2/M3/M4/M5 Playwright
paths, cleanup, dependency-hash equality, and final proof/application
provenance/tree integrity. Hosted artifact audit recorded 23/23 proof stages
with exit code 0, backend `587 passed`, frontend `31 files / 441 passed`, and
Playwright `12 passed`.

Human Static Diff Review: **PASS**.

Human Runtime Acceptance: **PASS WITH HUMAN-APPROVED UX DEFERRAL**.

`G2-X01` remains `OPEN / EXTERNAL`. `HRA-F01` remains `OPEN / DEFERRED`.
`HRA-F09` remains inherited non-blocking connector-routing visual debt.

## Authoritative documents

Read these when reconstructing project state:

- `AGENTS.md` — workflow rules and current phase;
- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` — frozen M0
  specification and Definition of Done;
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` — accepted
  pre-implementation engineering report;
- `docs/adr/` — accepted as-built architecture decisions through ADR-013;
- `docs/development/CURRENT_STATE.md` — durable engineering handoff;
- `docs/development/M1_CONTRACT.md` — completed frozen M1 contract;
- `docs/development/M2_CONTRACT.md` — completed frozen M2 execution contract;
- `docs/development/M3_CONTRACT.md` — completed frozen M3 execution contract;
- `docs/development/M4_CONTRACT.md` — completed frozen M4 execution contract;
- `docs/development/M5_CONTRACT.md` — completed frozen M5 execution contract;
- `docs/development/M0_7_CLOSEOUT.md` — M0.7 Gate 2/Human Review/merge/Gate 3
  evidence ledger;
- `docs/architecture/ARCHITECTURE.md` — as-built architecture;
- `docs/api/api-contract.md` — as-built HTTP contract;
- `docs/testing/testing-strategy.md` — testing/evidence rules;
- `docs/testing/manual-acceptance.md` — human M0 walkthrough.

No next implementation checkpoint is authorized by this closeout.

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
0006 (head)
```

M2 adds `0003` for sentence segmentation; M3 adds `0004` for exact-basis token
segmentation; M4 adds additive `0005_human_reviewed_lemma_annotations.py` for
the sparse occurrence-level `token_lemma_annotations` table; M5 adds additive
`0006_human_reviewed_pos_annotations.py` for the sparse occurrence-level
`token_pos_annotations` table.

`0001` through `0005` remain unchanged by M5.

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
npx.cmd playwright test e2e/golden-path.spec.ts e2e/unicode.spec.ts e2e/segmentation.spec.ts e2e/token-segmentation.spec.ts e2e/lemma-annotation.spec.ts e2e/pos-annotation.spec.ts
```

A full release-baseline proof requires real PostgreSQL integration tests and a
zero-skip guard. A run with skipped integration tests is not a full pass.

The accepted M5 exact-candidate hosted proof established:

```text
Python 3.13 / Node 24 / PostgreSQL 18       PASS
exact SHA/tree/frozen-base guard             PASS
uv sync --frozen                             PASS
Alembic empty → 0006 / current / check       PASS
full real-PostgreSQL backend suite           PASS (587)
zero skipped-test guard                      PASS
npm ci / lint / typecheck / Vitest           PASS (441 tests)
production build                             PASS
Playwright golden + Unicode + M2/M3/M4/M5   PASS (12)
disposable database cleanup                  PASS
dependency/tree/provenance integrity         PASS
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

M5 adds sparse Human-reviewed occurrence-level coarse POS annotation bound to
the same saved eligible token `Segment.id`:

- one optional POS tag per saved word-like token occurrence;
- exact closed vocabulary `ADJ ADP ADV AUX CCONJ DET INTJ NOUN NUM PART PRON PROPN SCONJ VERB X`;
- `PUT` and `DELETE /api/v1/token-segments/{token_segment_id}/pos`;
- independent lemma/POS sibling lifecycle;
- complete-set dependency blocking for token replacement/deletion;
- shared TextVersion-root mutation ordering for token/lemma/POS writes;
- flat workspace `token_pos_annotations` read authority;
- `PosAnnotationPanel` outside `[data-text-content-root]`;
- authoritative reload after persisted mutations;
- Alignment independence.

M5 does not introduce Lexeme identity, XPOS, morphology, syntax, generic EAV
annotation, automatic POS tagging/lemmatization/alignment, NLP/LLM providers,
or automatic re-anchoring.

## Known limitations / retained debt

These remain accepted at the M5 durable boundary:

- `G2-X01` — GitHub-hosted-runner execution remains `OPEN / EXTERNAL`; the
  checkpoint-specific CircleCI proof is retained release evidence, not a
  declaration that GitHub Actions recovered.
- `HRA-F01` — Workbench information architecture / panel density remains
  `OPEN / DEFERRED`. Fully expanded sentence/token/lemma/POS panels create
  excessive page height, scrolling cost and weak visual hierarchy; this must
  be the first contract input of the next Human-authorized Workbench
  Information Architecture checkpoint.
- Connector routing uses frozen center-to-hub geometry and can visually cross
  text glyphs while binding correctness remains intact (`HRA-F09`).
- A malformed/broken local Node command that resolves but emits no version
  stdout can produce a low-level PowerShell/.NET prerequisite diagnostic.
- Existing mutation locking is not a general collaborative locking protocol;
  M5 only extends the bounded TextVersion-root serialization required for
  token/lemma/POS mutation.
- Later lexical ontology, automatic NLP/LLM features, authentication,
  collaboration, graph/vector/search infrastructure, advanced connector
  routing and later workbench expansion remain outside completed M5.

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

## M5 implementation boundary

M5 delivered the bounded Human-reviewed coarse-POS foundation defined by
`docs/development/M5_CONTRACT.md` and ADR-013.

Durable implementation coordinates:

```text
frozen implementation base
11176df91dd9dc3d1169e4bef41808b0abfa8656

frozen base tree
03b1d0746bb89c5e57fe27e63e417ea274447287

final reviewed/proven candidate
139f3349b8556f5dd13d5c2d8808fda4a79dc819

candidate/application tree
179aba060d5e798ace46ea6bed0a7c496a50e9ad

PR
#14

merge method
rebase

post-rebase implementation main
49163ee407c0dae7d9e20cc647cabc8ae98f75de
```

Gate 3 confirmed exact candidate-to-main tree identity.

Delivered additively:

- Alembic `0006_human_reviewed_pos_annotations.py` and the sparse
  `token_pos_annotations` table (`UNIQUE(token_segment_id)`, named
  `ON DELETE CASCADE` token FK, named fifteen-value CHECK constraint);
- `PUT`/`DELETE /api/v1/token-segments/{token_segment_id}/pos` with
  create/update/logical-no-op (`updated_at` preserved) and explicit delete;
- the closed, case-sensitive fifteen-value coarse-POS vocabulary
  (`PUNCT`/`SYM` excluded; no complete-UD-conformance claim);
- `INVALID_POS_TARGET` / `INVALID_POS_VALUE` (422) with `VALIDATION_ERROR`
  retained for non-string values and extra request fields;
- lemma/POS sibling independence in both directions;
- multi-dependent retokenization blocking with the complete canonical
  `dependency_types` set and the single-member legacy scalar;
- the shared `TextVersion` root lock for POS, lemma and token mutation;
- workspace `token_pos_annotations` read authority with deterministic
  ordering;
- frontend `posAnnotations` / `posAnnotationsById` /
  `posAnnotationByTokenSegmentId` normalization and the bounded
  `PosAnnotationPanel` outside `[data-text-content-root]` with an exact
  fifteen-value controlled selector;
- backend, frontend and Playwright M5 coverage.

M5 Gate 2 is **PASS WITH M5-SPECIFIC EXTERNAL INFRASTRUCTURE EXCEPTION**;
Human Static Diff Review is **PASS**; Human Runtime Acceptance is **PASS WITH
HUMAN-APPROVED UX DEFERRAL**; Gate 3 is **PASS / EXACT**.

The implementation branch
`m5-human-reviewed-pos-annotation-foundation@139f3349b8556f5dd13d5c2d8808fda4a79dc819`
remains retained pending separate Human-authorized exact-guarded cleanup.
`G2-X01` remains `OPEN / EXTERNAL`; `HRA-F01` remains `OPEN / DEFERRED`.
