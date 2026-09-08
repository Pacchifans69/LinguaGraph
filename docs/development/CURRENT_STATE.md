# LinguaGraph — Current Engineering State

This file is the durable engineering handoff and navigation index for the
current repository state. It summarizes facts needed to reconstruct the
project without relying on chat history.

It does not replace accepted ADRs, frozen milestone contracts, executable
tests, Alembic history, merged PR/Git history, or retained provider evidence.

---

## 0. Current durable status

M3 — Human-Reviewed Word/Token Segmentation Foundation — is complete.

The frozen M3 contract, bounded implementation, exact-candidate hosted proof,
Static Human Diff Review, Human Runtime Acceptance, PR #12, rebase merge,
post-merge durable-state closure, and exact-guarded implementation-branch
cleanup have completed.

M4 — Human-Reviewed Lemma Annotation Foundation — now has a Human-approved
frozen execution contract in `docs/development/M4_CONTRACT.md`.

**M4 implementation is NOT STARTED / NOT AUTHORIZED.** The docs-only freeze
changes no application code, migration, test, dependency, runtime, or workflow
state. No M4 implementation branch may be created until this freeze is
independently verified and the Human separately authorizes bounded
implementation.

M4 approved pre-freeze coordinates:

- base: `3cada0d2dcdcf349152aacc53992b15190271a75`;
- tree: `51564978a2e92ce8de61997219b3d8c596a6fa9a`;
- planned implementation branch:
  `m4-human-reviewed-lemma-annotation-foundation`.

`G2-X01` remains `OPEN / EXTERNAL`. The M3 External Infrastructure Exception
does not carry forward to M4.

---

## 1. Repository checkpoint

Current completed implementation checkpoint: **M3 — Human-Reviewed Word/Token
Segmentation Foundation**.

Current normative checkpoint: **M4 — Human-Reviewed Lemma Annotation
Foundation / CONTRACT FROZEN / IMPLEMENTATION NOT AUTHORIZED**.

Durable M3 implementation and closure coordinates:

- reviewed candidate: `d4254c1239e649b17dc4ae6d6f995e52bd4635db`;
- candidate / post-rebase application tree:
  `bf59e847b8874c90b76032e92fb006343b4662d6`;
- PR #12: merged by rebase;
- post-rebase implementation `main`:
  `fc607b597bee35aff31a06a3945fa7a256f6b5c8`;
- post-merge durable-state closure:
  `366ca893da187d5fa2239b3fd538853e3b57211a`;
- branch-cleanup durable record / M4 pre-freeze parent:
  `3cada0d2dcdcf349152aacc53992b15190271a75`;
- pre-freeze parent tree:
  `51564978a2e92ce8de61997219b3d8c596a6fa9a`.

The M4 docs-only freeze commit is the commit containing this state update; its
parent must be exactly `3cada0d2dcdcf349152aacc53992b15190271a75`. Resolve
the freeze commit/tree directly from Git history rather than embedding a
self-referential SHA in this file.

### Checkpoint ledger

| Checkpoint | PR | Final reviewed implementation | Merge / durable implementation result |
|---|---:|---|---|
| M0.1 Repository Foundation | #1 | historical implementation lineage | `5bfdb9b` |
| M0.2 Persistence Model | #2 | `71ab918` | `c92204f` |
| M0.3 Document Workspace | #5 | `33bfaef20c2e64bed92fe00aa147d74611ac41ad` | `1230ffe0282adac3a20c1aafac6c2271c788b198` |
| M0.4 Selection Engine | #6 | `2d0d4bcf6dd562e3cab003aa615049628c173999` | `b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad` |
| M0.5 Alignment Persistence | #7 | `b6714d6454063b6c656631fe63fc23e6813d28f4` | `8d1a57b41f2fb717faca02f3162b4770e62ffbff` |
| M0.6 Alignment Visualization | #8 | `f86d6429d41e76d4093e08898a9e7879e3774c49` | `55442d4ce7f71bd28c3368de641802f942e57055` |
| M0.7 Hardening | #9 | `580e27cbea09e50f40782a92da426e7332e8a54d` | rebase → `697b019dc2820c67dacbc0b58a718e198ab655be` |
| M1 Workbench Interaction & UI Foundation | #10 | `bdd32cbaed63966c346caaf44f1fd3a0197750a7` | rebase → `3a3361aebdb7c9c8d3a1b850c5b30dc9f5a5b6ea` |
| M2 Linguistic Segmentation Foundation | #11 | `7cf756694e429abc50bf604ab2757fb3e44959c6` | rebase → `8972609a86d15d411917aafe6cf02c4577b7176f` |
| M3 Word/Token Segmentation Foundation | #12 | `d4254c1239e649b17dc4ae6d6f995e52bd4635db` | rebase → `fc607b597bee35aff31a06a3945fa7a256f6b5c8` |
| M4 Human-Reviewed Lemma Annotation Foundation | — | implementation not started | contract frozen only |

M0.5 and M0.6 merge commits were verified to contain the exact reviewed file
trees. M0.7, M1, M2, and M3 used repository-permitted rebase merge; their Gate 3
bridges are exact candidate-to-durable-main tree identities.

---

## 2. M1 durable provenance

### Base, branch, and candidate

- approved pre-freeze durable base:
  `f77ad4d94a309d47507b4fe7297f0ccf436144a6`;
- docs-only contract-freeze / implementation base:
  `41c299d9e4984d0fa2620e0990207cdc715ca0d1`;
- implementation branch:
  `m1-workbench-ui-foundation`;
- final reviewed and independently proven candidate:
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7`;
- candidate parent:
  `a1216ced95f6e954bef3f3eef543d66cd821dc03`;
- candidate tree:
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`;
- pre-merge compare:
  ahead 20 / behind 0, with merge base exactly `41c299d…`;
- implementation diff:
  17 frontend files, +1713 / -720.

The candidate remained frozen through final Gate 2 audit, Static Human Diff
Review, Human Runtime Acceptance, PR creation, and Human Merge Decision.

### PR and merge

PR #10: `M1 — Workbench Interaction & UI Foundation`

At merge decision time repository policy was:

```text
merge commit   disabled
squash merge  disabled
rebase merge  enabled
```

After explicit Human authorization, PR #10 was merged by rebase on 2026-09-04.
GitHub recorded the durable implementation `main` tip immediately after merge:

`3a3361aebdb7c9c8d3a1b850c5b30dc9f5a5b6ea`

Its tree is:

`c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`

The frozen candidate has the same tree. Therefore:

**candidate → durable implementation main tree identity: PASS / EXACT**

The rebase rewrote commit identities while preserving the reviewed file tree.
This is the Gate 3 provenance bridge between exact-candidate proof and durable
`main`.

---

## 3. M1 lifecycle

- repository reality reconstruction / Gate 1: PASS;
- M1 contract reconstruction: PASS;
- Human Contract Review / freeze: PASS;
- bounded implementation: PASS;
- candidate freeze: PASS;
- Gate 2 integrity audit: PASS;
- M1 External Infrastructure Exception: APPROVED;
- independent hosted exact-candidate proof: PASS;
- Gate 2 final decision: PASS under the approved M1 exception;
- Static Human Diff Review: PASS;
- Human Runtime Acceptance: PASS;
- PR #10: created and reviewed;
- Human Merge Decision: APPROVED;
- PR #10: MERGED by rebase;
- Gate 3 post-merge integrity: PASS / EXACT;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS.

M1 is closed. This completion does not authorize M2.

---

## 4. M1 Gate 2 evidence

### Formal result

**Gate 2 PASS under the approved M1 External Infrastructure Exception**

The exception waived one provider-specific requirement:

`successful execution proof specifically on a GitHub-hosted runner`

It did not waive semantic gates, clean hosted Linux, Python 3.13, Node 24,
PostgreSQL 18, provenance, database migration checks, backend/frontend/E2E
tests, zero-skip enforcement, cleanup, retained evidence, or tree integrity.

### GitHub Actions provider state

**GitHub Actions provider proof: BLOCKED / EXTERNAL**

**G2-X01: OPEN / EXTERNAL**

Exact evidence:

| Run | Event / ref | Head | Job | Executed steps |
|---|---|---|---:|---:|
| #34 / `33652467976` | push / `m1-workbench-ui-foundation` | `bdd32cba…` | `100322655934` | 0 |
| #35 / `33879001093` | pull request #10 | `bdd32cba…` | `101042762478` | 0 |
| #36 / `33879478955` | push / `main` after merge | `3a3361ae…` | `101044332707` | 0 |

All three jobs completed with failure before checkout or any workflow step.
Step APIs returned empty/null and usable logs were unavailable
(`BlobNotFound`). No application, migration, test, build, or Playwright command
executed in those GitHub-hosted runs.

This reproduces the known provider/pre-step failure pattern. It does not
constitute an application failure, does not establish GitHub Actions PASS, and
does not close `G2-X01`. No undisclosed provider root cause is inferred.

Only a later successful GitHub-hosted-runner proof on the then-current durable
release lineage may justify Human review of `G2-X01` closure.

### Accepted independent hosted proof

- isolated proof repository:
  `Pacchifans69/-linguagraph-m1-proof`;
- accepted executable proof commit:
  `81b35eb3191b1d449eb74934553d547fb9f7221d`;
- CircleCI pipeline:
  #3;
- successful status context:
  `ci/circleci: m1-exact-candidate-proof`;
- exact application SHA:
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7`;
- exact application tree:
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`.

The proof established:

```text
clean hosted Linux                       PASS
Python 3.13 / Node 24 / PostgreSQL 18    PASS
exact SHA and tree pin                   PASS
uv sync --frozen                         PASS
Alembic empty → 0002 (head)              PASS
Alembic current / check                  PASS
real-PostgreSQL backend suite            PASS
zero skipped-test guard                  PASS
npm ci                                   PASS
lint / typecheck / Vitest                PASS
production build                         PASS
Playwright golden path                   PASS
Playwright Unicode release blocker       PASS
disposable database cleanup              PASS
final tracked-tree integrity             PASS
```

The proof repository README still names the initial pre-fix candidate. It is a
stale descriptive file and is not the final provenance authority. The
executable config at `81b35eb…` pins the accepted final SHA/tree, and its
successful CircleCI run is the execution record.

Historical M0.7 CircleCI evidence proves only the M0.7 candidate and was not
used as M1 proof. ADR-009 remains unchanged.

---

## 5. M1 implemented outcome and scope integrity

M1 established:

- application-owned design tokens for the current product surfaces;
- bounded shared Button, PageHeader, Toolbar, and feedback primitives;
- clearer Projects → Documents → Workspace hierarchy;
- explicit workspace, panel, selection, pending-alignment,
  persisted-alignment, and destructive action layers;
- coherent loading, empty, error, focus, disabled, and pending states;
- centralized workspace Escape and PrimaryModifier+Enter behavior;
- editable-target and pending-mutation shortcut guards;
- focused shared-primitive and keyboard regression tests;
- disambiguated Playwright locators required by the final UI hierarchy.

Static audit confirmed:

- no backend source or service change;
- no database or Alembic revision;
- Alembic HEAD remains `0002`;
- no API contract change;
- no dependency manifest or lockfile drift;
- no runtime baseline change;
- no ADR change;
- no canonical GitHub Actions workflow change;
- no weakening, skipping, or deletion of existing tests;
- no implementation of an M1 non-goal;
- no mutation of retained M0.7 proof evidence.

The canonical text DOM remains a flat sequence of `[data-run]` children, each
with one text node and canonical `textContent`. Unicode code-point persistence,
native selection, panel preferences, AlignmentService invariants,
RenderedSpanRegistry binding, connector activation, and persistence semantics
remain intact.

HRA-F09 connector routing debt was intentionally preserved.

---

## 6. Human review and runtime acceptance

Static Human Diff Review: **PASS**

Human Runtime Acceptance: **PASS**

Browsers and viewports:

- Microsoft Edge at 1280 × 720 and 1440 × 900;
- Google Chrome at the same representative desktop sizes.

Accepted runtime coverage included:

- Projects and Documents hierarchy;
- workspace/panel action hierarchy;
- open/hide/reorder preference persistence;
- native drag selection and canonical offsets;
- tray staging and removal;
- Escape semantics;
- Ctrl+Enter / Meta+Enter creation guards;
- alignment persistence and reload;
- hover/click counterpart activation;
- connector binding;
- Inspector note/member mutation;
- alignment deletion;
- destructive confirmation;
- focus visibility;
- loading and empty states;
- Unicode/code-point behavior.

Recorded observations:

1. DevTools touch emulation changed pointer behavior and initially suppressed
   desktop selection/hover. Desktop input mode passed in Edge and Chrome.
2. A translated/reused browser tab produced one React `removeChild` exception
   after alignment deletion. The server deletion succeeded, and deletion
   passed in a clean untranslated environment. This was recorded as a
   non-candidate environment observation.
3. Edge's native selection mini menu may consume the first Escape. The first
   Escape delivered to the page clears the current/native selection while
   preserving staged tray members; a second physical keypress may therefore
   be required when the browser consumes the first.
4. HRA-F09 remains OPEN / NON-BLOCKING VISUAL DEBT: the frozen center-to-hub
   connector geometry can cross text glyphs while remaining bound to the
   correct spans.

---

## 7. Current architecture and schema baseline

Accepted ADRs: **ADR-001 through ADR-011**, frozen until a later governed
decision changes them. M4 requires a bounded ADR-012 during implementation;
that ADR is not created by contract freeze.

Runtime baseline:

| Component | Baseline |
|---|---|
| Python | 3.13 |
| Node.js | 24 |
| PostgreSQL | 18 |
| Alembic HEAD | `0004` |

Core language-neutral entities remain:

```text
Project
ParallelDocument
TextVersion
Span
AlignmentGroup
AlignmentMember
SegmentationLayer
Segment
```

Core invariants remain:

- canonical UTF-8/NFC text and LF normalization;
- Unicode code-point `[start, end)` offsets;
- immutable annotated TextVersion content;
- atomic server-owned alignment mutations;
- server-derived exact text/context;
- language-neutral schema;
- authoritative workspace snapshot for persisted frontend state;
- TanStack Query for server state;
- local reducer/state for ephemeral workspace interaction;
- frontend-only pending Alignment Tray;
- canonical flat text DOM and RenderedSpanRegistry bridge.

M1 adds the presentation/interaction substrate. M2 adds an independent
sentence segmentation domain with complete partitions, stale-content guards,
atomic replacement, server-derived exact text and an adjacent Segmentation
panel. M3 extends the generic segmentation model with an exact-sentence-basis
token layer, exhaustive token partitions and Human-reviewed `is_word_like`
classification. Sentence/token Segments remain distinct from Alignment Spans
and do not enter the tray.

Persistent lemma annotation, Lexeme identity, POS/morphology/syntax,
automatic alignment, NLP/LLM assistance, advanced workspace geometry and
connector-routing redesign are not part of the current as-built state. Only
the bounded M4 lemma contract is now frozen; its implementation remains absent.

---

## 8. Verification entry points

Local Windows run:

```powershell
.\scripts\dev.ps1
```

Windows PowerShell 5.1 execution-policy fallback:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Local verification:

```powershell
.\scripts\verify.ps1
```

or:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

Canonical GitHub Actions workflow:

`.github/workflows/ci.yml`

The workflow remains canonical despite current provider execution blockage.
The current executable verification surface is still the completed M3 baseline
and Alembic `0004`; contract freeze alone does not update workflow commands.
See `docs/testing/testing-strategy.md` for evidence semantics.

---

## 9. Known retained limitations and evidence

Open/non-blocking items:

- `G2-X01` — GitHub-hosted-runner execution remains OPEN / EXTERNAL;
- HRA-F07 — a malformed local `node` command that resolves without version
  stdout can surface a low-level PowerShell/.NET diagnostic;
- HRA-F09 — connector lines can cross text glyphs under frozen routing;
- accepted concurrency behavior is not a collaborative locking protocol;
- M4 explicitly excludes automatic lemmatization, Lexeme/generic annotation
  ontology, NLP/LLM providers, automatic alignment, authentication/
  collaboration, graph/vector infrastructure, connector-routing redesign and
  runtime/dependency modernization.

Retained M0.7 evidence must not be altered while `G2-X01` remains open:

- `ci/m0.7-external-proof@7ae9ce47570c8581423ed2932daf99d417acf52e`;
- `diagnostic/actions-indexing@e825a785883357d877d12003dc59615ea2bf586e`;
- historical setup refs `m0.7-ci-proof` and `circleci-project-setup`;
- `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`;
- `Pacchifans69/actions-runner-probe@e3a96b0b49a5612bf43d209d8e2991df95dc30a5`;
- CircleCI artifacts/metadata and GitHub Actions diagnostics.

Retained M1 evidence includes:

- implementation candidate `bdd32cba…` and its Git history;
- PR #10 and Actions runs #34–#36;
- `Pacchifans69/-linguagraph-m1-proof@81b35eb…`;
- CircleCI pipeline #3 and its status/artifacts;
- Human Runtime Acceptance observations.

Retained M2/M3 proof repositories, CircleCI records/artifacts, GitHub Actions
diagnostics, PRs, reviewed candidates, and Human acceptance records remain
protected while relevant durable evidence is required. Contract freeze does
not mutate any proof or diagnostic evidence.

---

## 10. Cleanup status

**M1 implementation-branch cleanup: PASS.**

Deleted historical implementation ref:

`m1-workbench-ui-foundation@bdd32cbaed63966c346caaf44f1fd3a0197750a7`

Cleanup evidence:

1. pre-delete GitHub verification proved that the remote branch pointed
   exactly to `bdd32cba…`;
2. PR #10 remained merged and the candidate tree remained identical to the
   durable implementation tree;
3. the Human-executed PowerShell guard re-read the exact remote SHA before
   deletion;
4. `git push origin --delete m1-workbench-ui-foundation` succeeded;
5. local cleanup/prune completed and the guard reported:
   `PASS: exact-guarded M1 implementation branch cleanup complete.`;
6. an independent post-delete GitHub ref lookup returned HTTP 404 `Not Found`.

Evidence preservation was rechecked after deletion:

- `main` remained at the M1 durable-state closure commit
  `7ac15558095d7374a47b3636875ead3d20cd5101` before this cleanup-record
  commit;
- `ci/m0.7-external-proof` remained
  `7ae9ce47570c8581423ed2932daf99d417acf52e`;
- `diagnostic/actions-indexing` remained
  `e825a785883357d877d12003dc59615ea2bf586e`;
- M1 proof commit
  `Pacchifans69/-linguagraph-m1-proof@81b35eb3191b1d449eb74934553d547fb9f7221d`
  remained available;
- M0.7 proof commit
  `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`
  remained available;
- runner probe
  `Pacchifans69/actions-runner-probe@e3a96b0b49a5612bf43d209d8e2991df95dc30a5`
  remained available;
- GitHub Actions history, CircleCI execution records, and retained artifacts
  were not modified.

The deleted implementation branch is distinct from retained Gate 2 evidence.
No proof or diagnostic ref was deleted.

## 11. M2 durable closure

### 11.1 Final status

**M2 — Linguistic Segmentation Foundation: COMPLETE / MERGED / CLOSED**

The frozen `docs/development/M2_CONTRACT.md` acceptance criteria are satisfied.
No later checkpoint is implied or authorized by this historical closure.

### 11.2 Provenance

- approved pre-freeze durable base:
  `8ad87aaa789d86535adf3aed34035317c515b6e6`;
- approved pre-freeze durable tree:
  `f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`;
- docs-only contract-freeze / implementation base:
  `59e39ac436d8b1e3b4a29992b80fe72f3be2b13f`;
- freeze tree:
  `3564dbcdb5e897db9d07dfc67b9d705eab14e056`;
- implementation branch:
  `m2-linguistic-segmentation-foundation`;
- final reviewed and independently proven candidate:
  `7cf756694e429abc50bf604ab2757fb3e44959c6`;
- candidate parent:
  `f367f53f0c0de1dcef1f46f62cefbe4fc911d207`;
- candidate tree:
  `cbdd9e77407a6bd853a4856ca7a927da679d3ed3`;
- frozen-base compare:
  ahead 13 / behind 0, merge base exactly the implementation base;
- implementation scope:
  13 commits, 43 files, +3163 / -122.

The candidate remained frozen through the final independent proof, bounded
Static Human Diff Review, Human Runtime Acceptance, PR creation, and merge
decision.

### 11.3 Gate 2

Formal result:

**PASS under the approved M2 External Infrastructure Exception**

The exception waived only successful proof specifically on a GitHub-hosted
runner. It did not waive exact provenance, hosted Linux, Python 3.13, Node 24,
PostgreSQL 18, dependency locks, migrations, semantic tests, Playwright,
cleanup, or tree integrity.

Accepted independent hosted proof:

- repository:
  `Pacchifans69/linguagraph-m2-proof`;
- executable proof commit:
  `bf1be70ad3115f4474fe432eef4db2c05394e128`;
- proof tree:
  `eec06a88e2682a436e24fbdd9bc0dcac58301e58`;
- CircleCI pipeline #6:
  SUCCESS;
- exact application candidate/tree:
  `7cf756694e429abc50bf604ab2757fb3e44959c6` /
  `cbdd9e77407a6bd853a4856ca7a927da679d3ed3`;
- retained artifacts:
  40.

The proof executed the frozen semantic matrix: Python 3.13, Node 24,
PostgreSQL 18, `uv sync --frozen`, Alembic empty → `0003` / current / check,
full pytest against real PostgreSQL with a zero-skip guard, `npm ci`, lint,
typecheck, Vitest, production build, Playwright golden path, Unicode release
blocker and M2 segmentation path, disposable-database cleanup, and final
tracked-tree/proof integrity.

GitHub Actions provider evidence:

- exact-candidate push run #53 / `34019986551`, job
  `101450659607`: failure before steps, steps `[]`;
- PR run #54 / `34035107519`, job `101491623119`:
  failure before steps, steps `[]`;
- post-merge `main` run #55 / `34036214018`, job
  `101494649799`: failure before steps, steps `[]`.

No application, migration, test, build, or Playwright command ran in those
jobs. GitHub Actions provider proof remains **BLOCKED / EXTERNAL** and
`G2-X01` remains **OPEN / EXTERNAL**. No provider internal root cause is
asserted.

### 11.4 Human review

Bounded Static Human Diff Review:

**PASS — BLOCKER 0 / HIGH 0 / MEDIUM 0.**

One nonblocking stale implementation-detail comment remains in
`apps/web/src/shared/rendering/spanRegistry.ts`. The runtime invariant is
correct; changing tracked source after the proven candidate would have created
a new candidate, so the comment remains recorded for a later authorized scope.

Human Runtime Acceptance:

**PASS.**

The Human completed M2 and inherited regression scenarios in:

- Microsoft Edge at 1280 × 720 and 1440 × 900;
- Google Chrome at 1280 × 720 and 1440 × 900.

Acceptance included manual and locale-sensitive sentence segmentation,
preview/discard, split/merge, save/reload/delete, Unicode/emoji boundaries,
canonical selection, inherited Alignment behavior, connector stability, and
clean alignment deletion without the browser-translation `removeChild` crash.

`HRA-F09` remains recorded visual debt: the inherited center-to-hub connector
geometry can overlap or cross text. Routing was not redesigned in M2.

### 11.5 Merge and Gate 3

PR #11 — `M2 — Linguistic Sentence Segmentation Foundation` — was created
against exact base `59e39ac436d8b1e3b4a29992b80fe72f3be2b13f` and exact head
`7cf756694e429abc50bf604ab2757fb3e44959c6` after explicit Human
authorization.

Repository settings allowed rebase merge only. After a separate explicit
Human merge authorization, GitHub merged PR #11 by rebase on 2026-09-06.

Durable implementation `main` tip immediately after merge:

`8972609a86d15d411917aafe6cf02c4577b7176f`

Rebase merge rewrote commit identities. Gate 3 therefore used exact tree
identity:

```text
candidate 7cf7566... tree = cbdd9e77407a6bd853a4856ca7a927da679d3ed3
main      8972609... tree = cbdd9e77407a6bd853a4856ca7a927da679d3ed3
```

**Gate 3 result: PASS / EXACT TREE IDENTITY.**

The durable implementation `main` is 13 commits ahead of the implementation
base and 0 behind, with merge base exactly
`59e39ac436d8b1e3b4a29992b80fe72f3be2b13f`. PR #11 is closed with
`merged=true`. No candidate content was lost or added.

### 11.6 Delivered durable outcome

M2 durably establishes:

- independent persisted sentence segmentation, separate from Alignment spans;
- one authoritative sentence layer per TextVersion/granularity;
- complete canonical-text partitions and backend-derived exact text;
- Unicode code-point persisted coordinates;
- stale-content protection and atomic full replacement;
- independent segmentation deletion and annotation-aware TextVersion deletion;
- authoritative workspace read-model normalization;
- manual construction plus ephemeral `Intl.Segmenter` suggestions;
- split/adjacent-merge, preview/discard/save/reload/delete UI lifecycle;
- Alembic `0003` while `0001` and `0002` remain unchanged;
- preserved canonical DOM, native selection, Alignment tray, hover/active
  visualization, and connector binding;
- no package/runtime baseline drift;
- no M2 explicit non-goal implemented.

### 11.7 Cleanup and retention

Durable truths:

- M2: **COMPLETE / MERGED / CLOSED**;
- PR #11: merged by rebase;
- formal reviewed/proven candidate:
  `7cf756694e429abc50bf604ab2757fb3e44959c6`;
- durable implementation merge lineage:
  `main@8972609a86d15d411917aafe6cf02c4577b7176f` immediately after merge;
- candidate/main implementation trees:
  exactly equal;
- Gate 2:
  PASS under the approved M2 External Infrastructure Exception;
- CircleCI independent proof:
  PASS;
- GitHub Actions provider proof:
  BLOCKED / EXTERNAL;
- `G2-X01`:
  OPEN / EXTERNAL;
- Alembic head:
  `0003`;
- ADR-001 through ADR-010:
  retained;
- `HRA-F09`:
  retained visual debt.

Implementation-branch cleanup is **PASS**.

Cleanup evidence:

- the Human-run guard fetched `origin/main` and the implementation branch;
- `origin/main` equaled the exact durable closure commit
  `557a31825accf2d7c789df4ca211d7cb1bfe723b`;
- the remote branch equaled exact reviewed candidate
  `7cf756694e429abc50bf604ab2757fb3e44959c6` before deletion;
- the remote branch was deleted and remote-tracking refs were pruned;
- the Human-reported terminal guard ended with
  `PASS: exact-guarded M2 implementation branch cleanup complete.`;
- GitHub independently returns HTTP 404 `Branch not found` and an empty branch
  search result for `m2-linguistic-segmentation-foundation`;
- PR #11 and the candidate commit remain available as historical provenance.

Proof/diagnostic cleanup is **DEFERRED** while `G2-X01` remains open. The M2
proof repository/commit, CircleCI pipeline/artifacts, M0.7/M1 proof
repositories, GitHub Actions diagnostics, runner probe, and retained support
evidence remain protected and were not modified by branch cleanup.

## 12. M3 durable closure

### 12.1 Final status

M3 is complete. Its bounded contract, implementation, proof, reviews, PR,
rebase merge, durable closure, and branch cleanup are recorded below.

M4 contract freeze is the next normative checkpoint boundary, but it does not
retroactively alter M3 and does not authorize M4 implementation.

### 12.2 Provenance

- pre-contract main: `f0d205fea996a5027d469255987c63b7ade17b51`;
- contract-freeze commit: `fa861409947705f658209e53b8c507b535c5233a`;
- implementation branch: `m3-word-token-segmentation-foundation`;
- reviewed candidate: `d4254c1239e649b17dc4ae6d6f995e52bd4635db`;
- candidate tree: `bf59e847b8874c90b76032e92fb006343b4662d6`;
- PR: `#12`; merge method: rebase;
- merged main: `fc607b597bee35aff31a06a3945fa7a256f6b5c8`;
- merged main tree: `bf59e847b8874c90b76032e92fb006343b4662d6`;
- post-merge durable-state closure:
  `366ca893da187d5fa2239b3fd538853e3b57211a`;
- branch-cleanup durable record:
  `3cada0d2dcdcf349152aacc53992b15190271a75`.

Candidate and merged-main trees are identical.

### 12.3 Gate 2 and retained evidence

M3 Gate 2 passed under the approved External Infrastructure Exception, which
waived only successful execution on a GitHub-hosted runner.

Accepted proof:

- repository: `Pacchifans69/linguagraph-m3-proof`;
- commit: `2e95d307374bc279f42d1048caf988d2b730169c`;
- tree: `bef4156bd68b48b3d28156d22d2a3c8567de05c2`;
- CircleCI pipeline: `#5`; result: `SUCCESS`.

Earlier proof attempts and diagnostic evidence remain retained. GitHub Actions
runs for candidate push (#72), PR (#73), post-merge implementation main (#74),
post-closure main (#75), and branch-cleanup durable main (#76) failed before
any repository step started; no application command executed. `G2-X01`
remains `OPEN / EXTERNAL`.

The M3 External Infrastructure Exception is checkpoint-specific and provides
no M4 Gate 2 authorization.

### 12.4 Human review

Static Human Diff Review passed for
`d4254c1239e649b17dc4ae6d6f995e52bd4635db`.

Human Runtime Acceptance passed in Edge and Chrome at 1280×720 and 1440×900.
Reported persistence/deletion observations matched the frozen semantics:
Word-like is classification metadata over an exhaustive token partition, and
Delete tokens removes the complete token layer. Retain a non-blocking UX
comprehension note. HRA-F09 routing is unchanged.

### 12.5 Cleanup and retention

The Human approved deletion of
`m3-word-token-segmentation-foundation@d4254c1239e649b17dc4ae6d6f995e52bd4635db`
under an exact-SHA guard requiring
`origin/main@366ca893da187d5fa2239b3fd538853e3b57211a`.

The Human-run guard fetched both refs, matched both exact SHAs, deleted only the
M3 implementation branch, pruned the remote-tracking ref, and reported:

`PASS: exact-guarded M3 implementation branch cleanup complete.`

GitHub's refs API independently returns 404 for the deleted branch.

All proof repositories, successful artifacts, failed diagnostic pipelines, and
GitHub Actions provider evidence remain retained. `G2-X01` remains
`OPEN / EXTERNAL`.

## 13. M4 contract freeze

### 13.1 Status

**M4 — Human-Reviewed Lemma Annotation Foundation: CONTRACT FROZEN / HUMAN
APPROVED / IMPLEMENTATION NOT STARTED / IMPLEMENTATION NOT AUTHORIZED**

The Human approved the reconstructed M4 contract and separately authorized its
docs-only freeze on 2026-09-08.

Approved pre-freeze base:

`3cada0d2dcdcf349152aacc53992b15190271a75`

Approved pre-freeze tree:

`51564978a2e92ce8de61997219b3d8c596a6fa9a`

Governing contract:

`docs/development/M4_CONTRACT.md`

Planned implementation branch, not yet authorized:

`m4-human-reviewed-lemma-annotation-foundation`

### 13.2 Frozen bounded outcome

M4 is restricted to one sparse persistent Human-reviewed lemma annotation per
eligible saved word-like token occurrence.

The approved design binds annotation identity directly to exact persisted M3
`Segment.id`; it does not introduce Lexeme identity or a generic linguistic
annotation framework.

Required core lifecycle:

```text
saved word-like token
→ optional Human lemma annotation
→ save / reload / edit / explicit delete
```

Token replacement/deletion must fail closed while lemma dependents exist.
Lemma and token mutations serialize through the existing TextVersion-root lock
ordering. Forced TextVersion destruction may cascade annotation rows through
the existing segmentation hierarchy.

M4 requires a future additive Alembic `0005` and ADR-012 during implementation,
but neither exists at contract freeze. The current as-built schema remains
`0004` and accepted ADRs remain ADR-001 through ADR-011.

### 13.3 Frozen exclusions

M4 does not authorize:

- Lexeme or shared vocabulary identity;
- POS, morphology, syntax, phrase/chunk annotation;
- automatic/rule-based lemmatization;
- NLP/LLM/dictionary providers;
- automatic/candidate alignment;
- token-to-Alignment-Tray behavior;
- connector-routing/HRA-F09 redesign;
- authentication/collaboration;
- generic annotation/EAV frameworks;
- graph/vector/search infrastructure;
- runtime or package dependency upgrades;
- CI-provider redesign;
- rewriting migrations `0001`–`0004`.

### 13.4 Freeze scope and next authority boundary

The docs-only freeze is limited to:

```text
docs/development/M4_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It must contain no application, migration, test, dependency, lockfile,
runtime, workflow, or branch change.

After the freeze commit is independently verified for exact parent/tree and
four-file scope, the project stops at the next Human authority boundary:

```text
Bounded Agent Prompt
→ Human authorization of implementation branch
```

No M4 implementation branch or implementation work is authorized by the
contract freeze itself.
