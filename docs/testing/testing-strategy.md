# LinguaGraph — Testing Strategy (as built, M0.7 closeout)

This document describes the testing architecture actually implemented at M0
closure and the rules for what counts as evidence. It is descriptive, not a
new authority: the authoritative testing requirements remain the accepted
pre-implementation report and the M0 Definition of Done.

## 1. Test levels

### 1.1 Backend unit tests

Location: `apps/api/app/tests/unit/`

Covers pure functions and boundaries without requiring a database, including:

- canonical text and mandatory Unicode vectors;
- Unicode code-point offset utilities;
- BCP-47 syntactic validation;
- alignment invariant/schema boundaries;
- TextVersion PATCH boundaries;
- configuration and dotenv behavior;
- health endpoint;
- integrity-error classification;
- disposable-database fail-closed guards;
- bounded database-engine construction / connection timeout behavior.

### 1.2 Backend integration tests

Location: `apps/api/app/tests/integration/`

Integration tests run against **real PostgreSQL**. SQLite is not an accepted
substitute for this level.

The session fixture creates a uniquely named disposable database, migrates it
to Alembic HEAD, and cleans it up. Tests cover:

- domain-schema constraints;
- persistence services;
- Project/ParallelDocument/TextVersion HTTP boundaries;
- destructive TextVersion reset semantics;
- request-body limits;
- workspace read model;
- transaction ownership;
- AlignmentService and real-PostgreSQL concurrent Span get-or-create;
- alignment HTTP mutations;
- disposable-database lifecycle;
- migration safety.

A release-baseline run in which integration tests are skipped is not a full
pass.

### 1.3 Disposable databases and migration verification

Shared fail-closed machinery lives in `apps/api/app/db/disposable.py`.

Rules:

- destructive test/E2E operations may target only mechanically recognized
  disposable database names;
- the normal development database must never be created/dropped/reset by a
  disposable flow;
- E2E names use the exact guarded namespace
  `linguagraph_e2e_<12 lowercase hex>`;
- migration tests prove empty → HEAD and head → base → head behavior on
  disposable databases;
- the M0.1 no-op revision guard remains covered;
- temporary `DATABASE_URL` changes restore the exact previous environment
  state, including absent and empty-string cases;
- Playwright's backend uses the same disposable lifecycle and fail-closed
  cleanup path.

Current Alembic head: `0002`.

### 1.4 Frontend unit/component tests

Technology: Vitest + React Testing Library.

Coverage includes:

- UTF-16 ↔ Unicode code-point conversion;
- native Selection/Range canonicalization and reverse location;
- segmentation / overlapping run membership;
- RenderedSpanRegistry and connector geometry helpers;
- TextPanel / AlignmentTray / workspace state and lifecycle;
- project/document error presentation;
- persisted alignment creation and mutation;
- Alignment Inspector note/member/delete behavior;
- mutation freeze / pending destructive locks;
- ConfirmDialog focus/keyboard lifecycle;
- Playwright configuration isolation guards.

### 1.5 Playwright E2E

Location: `apps/web/e2e/`

`golden-path.spec.ts` proves the integrated M0 user loop: project/document/text
creation, panel preferences, native selection, tray staging, persistence,
reload, multi-language visualization, hover/activation/connectors, Inspector
mutation, deletion and orphan cleanup.

`unicode.spec.ts` is the M0.7 Unicode **release blocker**. It exercises real
browser selections before/at/after an astral-plane emoji, canonical code-point
offsets, Alignment creation through the user path, server-derived
`exact_text`, PostgreSQL persistence, reload, rendered annotation state and
counterpart highlighting.

Both specs use an isolated disposable E2E database. The Vite instance started
by Playwright proxies `/api` only to the isolated E2E backend and is not
silently reused.

## 2. Canonical release-baseline workflow configuration

`.github/workflows/ci.yml` is the canonical M0 release-baseline workflow
configuration. Its semantic gates are:

- Python 3.13;
- `uv sync --frozen`;
- Node 24;
- `npm ci`;
- PostgreSQL 18 service;
- backend pytest with real PostgreSQL;
- fail-closed skipped-test guard;
- Alembic empty-database upgrade/current/check with `0002 (head)` assertion;
- frontend lint;
- frontend typecheck;
- Vitest / React Testing Library;
- production build;
- Playwright golden path;
- Playwright Unicode release blocker.

Workflow configuration by itself is not execution evidence.

## 3. M0.7 provider-specific GitHub Actions state

At M0.7 closeout, GitHub-hosted-runner execution is **BLOCKED / EXTERNAL**.

`G2-X01` remains **OPEN / EXTERNAL**.

The failure pattern is provider/pre-step: the hosted job fails before checkout
or any other workflow step begins. This was reproduced across the candidate
workflow, diagnostic workflows, an independent public hosted-runner probe,
PR #9 run #8, and post-merge `main` run #9.

Post-merge example:

```text
run       33306945264 (#9)
head      697b019dc2820c67dacbc0b58a718e198ab655be
job       99245049374
result    failure
steps     none/null
logs      none usable
```

Consequences:

- do not describe GitHub Actions as PASS;
- do not infer an application/test failure from this pre-step provider event;
- do not close `G2-X01` without a later successful provider-specific run;
- if hosted runners recover, rerun the frozen semantic workflow against the
  then-current durable release lineage.

## 4. Approved External Infrastructure Exception evidence

M0.7 Gate 2 formally concluded:

**Gate 2 PASS under approved External Infrastructure Exception**

The exception waived only provider-specific GitHub-hosted-runner execution.
All semantic gates, runtime requirements, hosted Linux execution, provenance
and integrity rules remained mandatory.

Accepted CircleCI proof:

```text
project      Pacchifans69/LinguaGraph
pipeline     #5 / 623ce1b5-8f9f-46e4-baf5-f0134f1f7b8d
workflow     m0-7-external-proof
workflow id  9c12d9eb-f946-413e-9beb-8c5937139bcd
job          bf4da739-325b-4f3f-80a5-448714160e46
app SHA      580e27cbea09e50f40782a92da426e7332e8a54d
config repo  Pacchifans69/linguagraph-ci-proof-
config SHA   920a6ee1eda077539bf3dc60964dac6a5eb25b94
Python       3.13.15
Node         24.20.0
PostgreSQL   18.6
Alembic      0002 (head)
backend      390 passed
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

The proof was exact-SHA and fail-closed: pipeline application revision and
actual checkout `git rev-parse HEAD` both equaled the formal candidate. The
external config lineage was separate from the application lineage.

The accepted proof does not close `G2-X01` and is not called a GitHub Actions
PASS.

## 5. Rebase-merge provenance and evidence continuity

Repository policy allowed only rebase merge for PR #9. GitHub therefore
rewrote commit identities when the frozen candidate entered `main`.

Gate 3 established the evidence bridge by comparing tree identities:

```text
formal candidate
580e27cbea09e50f40782a92da426e7332e8a54d
 tree 16c2bd3f5a8c5cb4960e193896547093fe091c87

durable implementation main immediately after merge
697b019dc2820c67dacbc0b58a718e198ab655be
 tree 16c2bd3f5a8c5cb4960e193896547093fe091c87
```

The trees are exactly identical. The CircleCI proof remains evidence for the
exact candidate content; Gate 3 tree identity proves that the same content
entered the durable main lineage despite rebase SHA rewriting.

## 6. Local verification

- `.\scripts\dev.ps1` runs the application; it is not itself a release proof.
- `.\scripts\verify.ps1` orchestrates the local verification gates and exits
  non-zero on first failure.

Windows PowerShell 5.1 may require process-local execution-policy bypass:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

This does not require a machine-wide policy change.

Local results must report runtime versions and whether real PostgreSQL tests
actually executed. An integration suite that skipped because PostgreSQL was
unavailable is partial evidence only.

## 7. Evidence taxonomy

Use these terms precisely.

### Local evidence

Commands executed on a developer machine. Useful for reproduction and human
acceptance, but not equivalent to hosted CI evidence.

### GitHub-provider evidence

An actual GitHub Actions run of `.github/workflows/ci.yml` whose semantic
steps execute and complete. At M0.7 closeout this evidence is unavailable
because `G2-X01` is still open.

### Approved external CI evidence

The exact independent CircleCI proof recorded in section 4, accepted under the
narrow External Infrastructure Exception. This is the formal hosted Gate 2
proof for M0.7 while GitHub-provider execution remains blocked.

### Human Runtime Acceptance

Manual browser/runtime verification of the user-facing flows documented in
`docs/testing/manual-acceptance.md`. M0.7 HRA completed PASS. Human acceptance
supplements automated proof; it does not replace the automated semantic gates.

## 8. Evidence retention

Retain until the separate cleanup decision:

- formal candidate ref/SHA;
- PR #9 history;
- GitHub-hosted-runner failure runs and diagnostic evidence;
- public runner-probe evidence;
- external CI provider/run identifiers;
- external config repository SHA;
- runtime/gate output artifacts and checksums;
- candidate → durable-main tree-identity record.

See `docs/development/M0_7_CLOSEOUT.md` for the complete closeout ledger.
