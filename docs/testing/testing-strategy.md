# LinguaGraph — Testing Strategy (as built through M7; Gate 3 complete)

This document describes the inherited M0/M1 testing architecture, M2/M3
segmentation coverage, M4 lemma-annotation coverage, M5 coarse-POS coverage,
M6 mode-oriented Workbench coverage, M7 alignment-concurrency coverage, and
the rules for what counts as evidence. It is descriptive, not a new authority:
the accepted pre-implementation report and frozen milestone contracts remain
authoritative.

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
**CLOSED / PASS** for the final exact M6 candidate
`6af2c25e172d81725b97037945e38c047fba9941`; see section 8.

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

Consequences for this historical M0.7 GitHub-provider record:

- do not describe GitHub Actions as PASS;
- do not infer an application/test failure from this pre-step provider event;
- do not retroactively classify the M0.7 GitHub-provider `G2-X01` record as
  recovered or closed without a successful GitHub-provider run for that
  lineage;
- if hosted runners recover, rerun the frozen semantic workflow against the
  then-current durable release lineage.

Later checkpoints govern `G2-X01` under their own separately authorized
evidence contracts and may record their own exact-candidate disposition; M6
records `G2-X01` **CLOSED / PASS** for final exact candidate
`6af2c25e172d81725b97037945e38c047fba9941` in section 8. That disposition is
specific to M6's separately Human-authorized M6-EXI-03 path, does not
retroactively recover the M0.7 GitHub-provider record, and does not mean
Alibaba ECS was a GitHub-hosted run. GitHub Actions itself must still not be
described as PASS unless a real GitHub Actions semantic run succeeds.

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

## 8. Final M6 exact-candidate evidence and Gate 3

The final reviewed / independently proven M6 candidate is:

```text
candidate_sha    6af2c25e172d81725b97037945e38c047fba9941
candidate_tree   7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c
candidate_parent 773aae151766038a451ee5b18f5923467b8a3e56
frozen_main      cb61725fe9f05c704a6f80b67c6343f49ade9234
```

Accepted C5 independent hosted proof:

```text
proof repository  Pacchifans69/linguagraph-m6-proof
proof_sha         274aae9f86fb8da9571edf1e197696035d6fb4a3
proof_tree        b331cd16642ba2c293bb6b83d2310f85b2af35e6
proof_parent      1c05663a2e90918e5de98631a9209a7f76822cdc
provider          Alibaba ECS
instance          i-j6c13vpnkuq6xbbhyxzw
authorization     SPENT / MUST NOT REUSE
adapter rc        0
formal outcome    PASS
```

Required proof stages all completed with `exit=0`:

```text
guard_core
guard_remote
fetch_candidate
deps_pre
install_runtimes
backend
frontend
playwright
integrity
```

Established semantic/integrity baseline:

```text
Python 3.13.15 / Node v24.17.0 / PostgreSQL 18.6
exact SHA/tree/frozen-base guard            PASS
Alembic empty → 0006 / current / check      PASS
backend pytest (real PostgreSQL)            PASS (587 passed, zero skipped)
Vitest                                      PASS (35 files / 519 passed)
Playwright                                  PASS (32 passed / retries=0)
semantic-stage failures                     NONE
disposable database cleanup                 PASS
dependency/tree/provenance integrity        PASS
candidate final worktree                    CLEAN
final remote guard                          PASS / unchanged
host-side artifact manifest                 PASS (45 / 45)
off-host archive SHA-256 verification       PASS / exact
off-host extracted artifact manifest        PASS (45 / 45)
```

Deterministic archive SHA-256:

`7a7a555167e9f8d0957baffc14ff4058e0cd939117d5774ebb3fa881b0f8c403`

Authorization SHA-256:

`5c0acedd8308bddf8d6fdd6f1486aac7660fd209b9160a05c3d648d9eb965609`

For exact candidate `6af2c25e172d81725b97037945e38c047fba9941`:

- `G2-X01`: **CLOSED / PASS**;
- M6 Gate 2: **PASS / ESTABLISHED**;
- bounded corrective Static Human Diff Review: **PASS / zero blocking
  findings**.

Fresh Human Runtime Acceptance completed on the earlier accepted application
epoch `a5a981db77e33905f2c71c234616c6779e3ebc6c`; `HRA-F01` is **CLOSED /
HUMAN ACCEPTED**. `HRA-F09` remains **OPEN / DEFERRED / NON-BLOCKING**.

### 8.1 C5-P01

During C5 orchestration, the raw one-shot authorization token was briefly
staged in a root-only `0600` temporary file before process-environment
injection, then removed before adapter execution. This is retained as
`C5-P01`: **procedural / non-semantic / non-blocking for proof validity**.
The raw token is absent from the retained proof archive. The authorization is
spent and must not be reused; no rerun is required or authorized.

### 8.2 GitHub-provider diagnostics

Automatic GitHub Actions did not provide semantic execution evidence:

- final-candidate run #114 / `35343563836`: failure before repository-defined
  steps, `steps=[]`, logs unavailable / `BlobNotFound`;
- post-merge main run #115 / `35363051019`, job `105658759117`: same
  pre-step fingerprint.

These runs are provider diagnostics, not application/test failures. GitHub
Actions itself must not be described as PASS.

### 8.3 Rebase merge and evidence continuity

PR #15 merged the final candidate by rebase.

```text
reviewed/proven candidate
6af2c25e172d81725b97037945e38c047fba9941
tree 7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c

post-rebase implementation main
afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7
tree 7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c
```

The trees are exactly identical, therefore:

**M6 Gate 3 candidate → post-rebase main tree identity: PASS / EXACT.**

Rebase changed commit identities. Exact-candidate proof remains evidence for
the candidate content, and Gate 3 tree identity proves that the same content
entered durable main.

The subsequent post-merge durable-state closure is docs-only and changes the
four durable state/evidence documents. It is not itself a fresh semantic proof
candidate and does not rewrite the established Gate 2/Gate 3 evidence bridge.

That closure is `f66b6e51e0925d635a0c512969d60de497ed01d2` / tree `7aeaf56384ddd04ed14a29c64ae215b71eff70f4`. Exact-guarded
cleanup then deleted only historical branch
`m6-mode-oriented-workbench-information-architecture@6af2c25e172d81725b97037945e38c047fba9941` after exact durable-main and branch-head guards passed.
Post-delete `main` remained unchanged; GitHub independently returned
`404 Branch not found` and an empty branch-search result. The candidate
commit remains addressable by SHA, PR #15 remains merged, and proof
`main@274aae9f86fb8da9571edf1e197696035d6fb4a3` remains unchanged.

M6 lifecycle status after this cleanup is **COMPLETE / MERGED / CLOSED**.

### 8.4 Post-proof provider state

After C5 and off-host archive verification, Alibaba ECS instance
`i-j6c13vpnkuq6xbbhyxzw` was normally stopped in **economical mode**. Private
IPv4 `172.23.68.215` and the instance identity are retained; the former
system-assigned public IPv4 was released. This operational state does not alter
the accepted proof.

## 9. Evidence retention

Retain as durable M6 evidence:

- final M6 candidate SHA and candidate tree;
- PR #15 merge history and Gate 3 exact-tree record;
- final M6 proof source, archive checksum, 45/45 manifest, and C5-P01 record;
- PR #9 history;
- GitHub-hosted-runner failure runs and diagnostic evidence;
- public runner-probe evidence;
- external CI provider/run identifiers;
- external config repository SHA;
- runtime/gate output artifacts and checksums;
- candidate → durable-main tree-identity record.

See `docs/development/M0_7_CLOSEOUT.md` for the complete closeout ledger.


## 10. M7 Alignment concurrency candidate

M7 adds no schema, API, frontend feature, dependency, or runtime change. Its
checkpoint-specific correctness evidence is real-PostgreSQL concurrency
coverage bound to the frozen `M7_CONTRACT.md`.

Required implementation races are `C-R01` through `C-R09`; mandatory
audit races are `C-A01` and `C-A02`. Tests use separate SQLAlchemy
Sessions/connections and deterministic blockers (`FOR UPDATE`,
`threading.Barrier`, or `Event`) with bounded waits/joins. A bounded sleep
may support a controlled blocker but cannot be the sole synchronization
mechanism.

The production lock order under test is:

```text
ParallelDocument
→ participating TextVersion rows sorted by UUID
→ authoritative re-resolution
→ validate
→ mutate
```

Project/ParallelDocument deletion remains audit-only. An audit failure that
requires production changes is a Human STOP condition rather than implicit
scope expansion.

For the predecessor implementation epoch
`854137cd498569f7c3d770d3b82be51042080edd` (tree
`7b5306fbd37a158cd1fb688fd050d20cfc5aec74`), the required M7 semantics were
first established under the Human-approved M7-specific External Infrastructure
Exception `M7-EXI-01` after canonical GitHub Actions run #124 /
`35422565869` failed before repository-defined steps. Historical accepted
proof source `4274eeae6211a1744ac63958a026ff95670f445b` (tree
`2270f665b2659f88dcdd88bed216828e32e5a7ff`) remains exact evidence for that
epoch, with archive SHA-256
`2529a1e06989058c2a7acdac69374912ba2ccee32ba59c5438d2c746c8eed2a3`.
It does not serve as the final successor proof.

Static Human Diff Review then identified `M7-SHDR-F01` in the durable
lifecycle documentation. The bounded four-file state-alignment correction
created final semantic candidate
`c7aae26e3abaa34b3756ffe96ee718beaf8524b3` (tree
`1afa65b74a41ef43699425bbcc3ccbb30cb64658`, unique parent
`854137cd498569f7c3d770d3b82be51042080edd`). Because that was a new Product
tree, fresh exact-candidate evidence was required and was obtained.

Canonical GitHub Actions successor run #125 / `35436499631` targeted exact
`c7aae26e...` but failed before repository-defined steps
(`runner_id=0`, `steps=[]`), providing no semantic evidence. The separately
Human-authorized successor M7-EXI-01 path used this exact proof source:

```text
proof repository  Pacchifans69/linguagraph-m7-proof
proof_sha         e749a0356d53db05961e6cb538bff605e53e79ec
proof_tree        c8561e2624ea6c602a664eaf7393f8fb6fc74a8f
proof_parent      186fc97b8213b9b2902ccabc1ff2efb937c333c2
provider          Alibaba ECS
instance          i-j6c6wx48n07xnkpoxsjc
adapter rc        0
formal outcome    PASS
```

Established semantic/integrity result for exact Product candidate
`c7aae26e...`:

```text
Python 3.13 / Node 24 / PostgreSQL 18      PASS
exact SHA/tree/frozen-base provenance      PASS
Alembic empty → 0006 / current / check     PASS
backend pytest                             PASS (602 passed, zero required skips)
required M7 concurrency matrix             PASS (15 / 15 retained JUnit cases)
lint / typecheck                           PASS
Vitest                                     PASS (35 files / 519 passed)
production build                           PASS
Playwright                                 PASS (32 passed / retries=0)
dependency / candidate tree integrity      PASS
disposable database cleanup                PASS
final remote guards                        PASS
off-host artifact acceptance               PASS
artifact manifest                          PASS (47 / 47)
```

Deterministic archive SHA-256:

`159f07b0fc30fb0526228f1a781cf8f8daf533605853aba6b37817a283656ed0`

Authorization SHA-256:

`426760ce9875a6f127f73df1e4bc24c9f27fc67889d2363cf543ea1444618dcb`

The authorization is **SPENT / MUST NOT REUSE**. After off-host archive and
manifest acceptance, exact proof ECS `i-j6c6wx48n07xnkpoxsjc` and exact
system disk `d-j6c6wx48n07xnkpm461g` were released and both were verified
absent.

The executable proof-source README at `e749a035...` intentionally retains its
pre-run status because the exact source was frozen before authorization.
Post-run authority is the retained formal archive plus the Product evidence
ledger.

Human Pre-PR lifecycle-state consistency review established `M7-LSR-01`:
recording the already-established proof result in durable state necessarily
creates a docs-only successor, so the terminal post-proof evidence-ledger
closure is not treated as another semantic proof candidate. It may change only
`README.md`, `AGENTS.md`, `docs/development/CURRENT_STATE.md`, and this
testing-strategy document. Exact Gate 2 authority remains
`c7aae26e3abaa34b3756ffe96ee718beaf8524b3`; the closure requires bounded
final Static Human Review before PR or Human merge decision and does not
authorize or require another hosted proof.


### 10.1 M7 post-merge evidence bridge

PR #16 merged by rebase after explicit Human Merge Decision. The terminal
reviewed PR head
`d769e018064dd1d6a529f7e043c7163b7e92c3ed` and post-rebase
`main@f56b413f97742946b51e00a24b55f806cc5452f8` share exact tree
`d28126bca178db8ee9d17c737b820eacf6403d34`; M7 Gate 3 is therefore
**PASS / EXACT**.

This does not move Gate 2 authority away from exact semantic candidate
`c7aae26e3abaa34b3756ffe96ee718beaf8524b3`. The M7-LSR-01 docs-only bridge
and this post-merge durable-state closure are evidence/lifecycle bookkeeping,
not fresh semantic proof candidates.

PR-event run #128 / `35442492489` and post-merge push run #129 /
`35442844140` both failed before repository-defined steps
(`runner_id=0`, `steps=[]`). They remain provider/pre-step diagnostics and
do not supersede the accepted successor hosted proof.

The retained implementation branch remains
`m7-alignment-mutation-concurrency-hardening@d769e018064dd1d6a529f7e043c7163b7e92c3ed`
until separately authorized exact-guarded cleanup. This docs-only post-merge
closure requires no fresh hosted proof or runtime acceptance.

