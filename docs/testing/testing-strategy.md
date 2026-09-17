# LinguaGraph — Testing Strategy (M6 implementation candidate)

This document describes the inherited M0/M1 testing architecture, M2/M3
segmentation coverage, M4 lemma-annotation coverage, M5 coarse-POS coverage,
M6 mode-oriented Workbench coverage,
and the rules for what counts as evidence. It is descriptive, not a new authority: the accepted
pre-implementation report and frozen milestone contracts remain authoritative.

## 1. Test levels

### 1.1 Backend unit tests

Location: `apps/api/app/tests/unit/`

Covers pure functions and boundaries without requiring a database, including:

- canonical text and mandatory Unicode vectors;
- Unicode code-point offset utilities;
- BCP-47 syntactic validation;
- alignment invariant/schema boundaries;
- sentence-segmentation partition and request-schema boundaries;
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
- segmentation schema, service, HTTP replacement/delete, stale-content,
  rollback, Unicode exact-text and workspace read-model behavior;
- M4 lemma annotation lifecycle, eligibility, Unicode value contract,
  retokenization dependency blocking, TextVersion cascade, Alignment
  independence, workspace scoping and write-failure atomicity;
- real-PostgreSQL lemma-versus-retokenization serialization on the
  TextVersion root lock (two deterministic lock-ordering paths plus one
  genuinely concurrent race asserting no silent annotation loss; this is
  evidence for the accepted algorithm, not exhaustive interleaving proof);
- M5 coarse POS annotation lifecycle, eligibility, closed fifteen-value
  vocabulary, retokenization dependency blocking with the complete
  `dependency_types` payload, sibling lemma independence, TextVersion cascade,
  Alignment independence, workspace scoping and write-failure atomicity;
- real-PostgreSQL POS serialization on the shared TextVersion root lock
  (POS versus token replacement/deletion, lemma PUT versus POS PUT on one
  saved token, and concurrent POS writes to one token asserting no leaked
  unique/integrity failure and no silent annotation loss; again evidence for
  the accepted algorithm, not exhaustive interleaving proof);
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

Current Alembic head: `0006`.

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
- deterministic M6 initial mode/target and target reconciliation;
- mount-preserved task sessions, dirty/conflict summaries, document-leave
  protection, canonical-root invariants, and mode-independent connectors;
- sentence suggestion UTF-16/code-point conversion, complete partitions,
  manual split/merge and SegmentationPanel save/discard/delete behavior.
- word suggestion sentence-local UTF-16/global code-point conversion,
  word-like capture/override, cross-sentence merge prevention, and token
  preview/save/reload/delete behavior.

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

`segmentation.spec.ts` is the M2 sentence-segmentation release path. It
exercises an astral-emoji boundary, Human-reviewed manual split/save,
workspace persistence/reload, replacement, explicit confirmed deletion and
the continued independence of the Alignment Tray.

All release specs use an isolated disposable E2E database. The Vite instance started
by Playwright proxies `/api` only to the isolated E2E backend and is not
silently reused.

`token-segmentation.spec.ts` is the M3 exact-basis token release path. It
covers suggestion/manual review, Unicode tokens, split/merge/classification,
save/reload, sentence dependency conflict, and explicit token deletion.

`lemma-annotation.spec.ts` is the M4 lemma release path. It covers the saved
word-like-token prerequisite, create/reload/edit/reload/delete with exact
persisted values, astral/combining/non-ASCII Unicode identity, preserved
sentence/token segmentation and Alignment state, and the dependency path
(token replacement blocked while a lemma exists, then unblocked by explicit
lemma deletion).

`pos-annotation.spec.ts` is the M5 coarse-POS release path. It covers the saved
word-like-token prerequisite, the exact fifteen-value controlled selector,
create/reload/edit/reload/delete with exact persisted values, preserved sibling
lemma plus sentence/token segmentation and Alignment state, the multi-dependent
dependency path (lemma + POS blocking token replacement with both
`dependency_types`, still blocked after deleting one sibling, unblocked only
after deleting the last one, in both sibling-deletion orders), and
astral/combining/non-ASCII Unicode identity under the same closed vocabulary.

`workbench-information-architecture.spec.ts` is the M6 IA release path. It
covers two-version and four-version desktop compositions, the five task
destinations, deterministic target selection, mode-preserved Alignment
selection/tray/activation/connectors, dirty session continuity, canonical flat
runs, hide/reopen reconciliation, and the 1280×720 and 1440×900 acceptance
viewports.

## 2. Canonical release-baseline workflow configuration

`.github/workflows/ci.yml` is the canonical M6 candidate release-baseline workflow
configuration. Its semantic gates are:

- Python 3.13;
- `uv sync --frozen`;
- Node 24;
- `npm ci`;
- PostgreSQL 18 service;
- backend pytest with real PostgreSQL;
- fail-closed skipped-test guard;
- Alembic empty-database upgrade/current/check with `0006 (head)` assertion;
- frontend lint;
- frontend typecheck;
- Vitest / React Testing Library;
- production build;
- Playwright golden path;
- Playwright Unicode release blocker.
- Playwright M2 segmentation release path.
- Playwright M3 token segmentation release path.
- Playwright M4 lemma annotation release path.
- Playwright M5 coarse POS annotation release path.
- Playwright M6 Workbench information-architecture release path.

Workflow configuration by itself is not execution evidence.

## 3. M0.7 provider-specific GitHub Actions state

At M0.7 closeout, GitHub-hosted-runner execution is **BLOCKED / EXTERNAL**.

`G2-X01` remained **OPEN / EXTERNAL** through M0.7 and M5. It is
**CLOSED / PASS** for the exact current M6 application epoch
`a5a981db77e33905f2c71c234616c6779e3ebc6c`; see section 8.

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

## 8. Current M6 exact-candidate evidence (M6-EXI-03 Run #4)

The current M6 evidence epoch is the HRA-approved application candidate:

```text
candidate_sha    a5a981db77e33905f2c71c234616c6779e3ebc6c
candidate_tree   3859d5a1055a8670c6e02e4cd82201244a2f27da
candidate_parent 253637810455c6fcb490f9f6401b3009c8dcd1d5
frozen_main      cb61725fe9f05c704a6f80b67c6343f49ade9234
```

Accepted independent hosted proof:

```text
proof repository  Pacchifans69/linguagraph-m6-proof
proof_sha         68227e1bafe1423260879788d127ec1f5d055682
proof_tree        c3eb74c02cbb81e2cfdf564ec773ba2ceca4cc53
proof_parent      7315b612aaad60296f4236f77894abbe44a8b068
provider          Alibaba ECS
instance          i-j6c13vpnkuq6xbbhyxzw
run               M6-EXI-03 Run #4
authorization     SPENT / MUST NOT REUSE
adapter rc        0
formal outcome    PASS
```

Required proof stages (all `exit=0`):

```text
guard_core        exit=0
guard_remote      exit=0
fetch_candidate   exit=0
deps_pre          exit=0
install_runtimes  exit=0
backend           exit=0
frontend          exit=0
playwright        exit=0
integrity         exit=0
```

Established proof baseline (per the retained Run #4 evidence):

```text
Python 3.13 / Node 24 / PostgreSQL 18       PASS
exact SHA/tree/frozen-base guard            PASS
Alembic empty → 0006 / current / check      PASS (head 0006)
backend pytest (real PostgreSQL)            PASS (587 passed)
Vitest                                      PASS (504 passed)
Playwright                                  PASS (32 passed)
semantic-stage failures                     NONE
disposable database cleanup                 PASS
dependency/tree/provenance integrity        PASS
host-side artifact manifest                 PASS (45 entries, ALL OK)
off-host archive SHA-256 verification       PASS / exact match
off-host extracted artifact manifest        PASS (45 entries checked)
```

Deterministic proof archive SHA-256:

```text
9d4d88164a8faef2b3557f3bef866c34246cf81e659b9f03968531fc31adc126
```

Run #4 disposition: **PASS / COMPLETE / independently verified off-host**.

For this exact epoch:

- `G2-X01`: **CLOSED / PASS**;
- M6 Gate 2: **PASS / ESTABLISHED**;
- Fresh M6 Human Runtime Acceptance: **PASS / COMPLETE**;
- `HRA-F01`: **CLOSED / HUMAN ACCEPTED**;
- Static Human Diff Review: **PASS**, including the Human-accepted supplemental
  review `253637810455c6fcb490f9f6401b3009c8dcd1d5` →
  `a5a981db77e33905f2c71c234616c6779e3ebc6c` with zero blocking findings.

### 8.1 No automatic evidence transfer

Two rules govern current M6 evidence:

1. **Workflow configuration alone is not evidence.** The presence of the
   `.github/workflows/ci.yml` semantic gates listed in section 2 does not prove
   that any of them executed. Only an actually executed run with retained,
   exact-candidate provenance is evidence.
2. **Exact-candidate proof does not automatically transfer to a successor
   commit**, including a docs-only successor. Run #4 is bound only to
   `a5a981db77e33905f2c71c234616c6779e3ebc6c` / tree
   `3859d5a1055a8670c6e02e4cd82201244a2f27da`.

The M6-PRP-R1 docs-only state-alignment commit changes only `AGENTS.md`,
`README.md`, `docs/development/CURRENT_STATE.md`, and this
`docs/testing/testing-strategy.md`. It changes no application or runtime code,
but it does create a new Product SHA/tree. That successor must receive **fresh
exact-SHA/tree proof** before final PR readiness, and it must not be described
as independently proven until then. The Run #4 authorization is spent and must
not be reused. No PR is created and no merge is authorized.

## 9. Evidence retention

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
