# LinguaGraph — Current Engineering State

This file is the durable engineering handoff and navigation index for the
current repository state. It summarizes facts needed to reconstruct the
project without relying on chat history.

It does not replace accepted ADRs, frozen milestone contracts, executable
tests, Alembic history, merged PR/Git history, or retained provider evidence.

---

## 0. Current durable status

M6 — Mode-Oriented Workbench Information Architecture — is **COMPLETE /
MERGED / CLOSED**. Gate 2, Human review, PR #15 rebase merge, Gate 3 exact
tree identity, durable-state closure, and exact-guarded implementation-branch
cleanup are complete.

Durable M6 coordinates:

- frozen Product `main`:
  `cb61725fe9f05c704a6f80b67c6343f49ade9234`; tree
  `839705a3577652d1f9127a737a9535fe7f025d60`;
- final reviewed / independently proven candidate:
  `6af2c25e172d81725b97037945e38c047fba9941`; tree `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`; unique parent
  `773aae151766038a451ee5b18f5923467b8a3e56`; subject `fix(M6): close PR review findings`;
- PR #15:
  **MERGED BY REBASE** after explicit Human Merge Decision;
- post-rebase implementation `main`:
  `afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7`; tree `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`;
- candidate → post-rebase `main` tree identity:
  **PASS / EXACT**;
- post-merge durable-state closure:
  `f66b6e51e0925d635a0c512969d60de497ed01d2`; closure tree `7aeaf56384ddd04ed14a29c64ae215b71eff70f4`;
- implementation-branch cleanup:
  **PASS / EXACT-GUARDED**; historical
  `m6-mode-oriented-workbench-information-architecture@6af2c25e172d81725b97037945e38c047fba9941` deleted after exact guards; post-delete `main`
  remained `f66b6e51e0925d635a0c512969d60de497ed01d2`; GitHub branch endpoint returned
  `404 Branch not found` and branch search returned empty.

Final M6 Gate 2 evidence:

- proof repository:
  `Pacchifans69/linguagraph-m6-proof`;
- proof source:
  `274aae9f86fb8da9571edf1e197696035d6fb4a3`; tree `b331cd16642ba2c293bb6b83d2310f85b2af35e6`; parent `1c05663a2e90918e5de98631a9209a7f76822cdc`;
- provider:
  Alibaba ECS, instance `i-j6c13vpnkuq6xbbhyxzw`;
- C5 hosted result:
  **PASS / COMPLETE / independently verified off-host**;
- semantic counts:
  pytest `587 passed`; Vitest `35 files / 519 passed`; Playwright
  `32 passed / retries=0`;
- Alembic head:
  `0006`; empty → head / current / check **PASS**;
- dependency integrity, candidate cleanliness, disposable-database cleanup and
  final remote guard:
  **PASS**;
- artifact manifest:
  **45 / 45 PASS**;
- deterministic archive SHA-256:
  `7a7a555167e9f8d0957baffc14ff4058e0cd939117d5774ebb3fa881b0f8c403`;
- authorization SHA-256:
  `5c0acedd8308bddf8d6fdd6f1486aac7660fd209b9160a05c3d648d9eb965609`;
- authorization:
  **SPENT / MUST NOT REUSE**;
- `G2-X01`:
  **CLOSED / PASS** for exact candidate `6af2c25e172d81725b97037945e38c047fba9941`;
- M6 Gate 2:
  **PASS / ESTABLISHED**.

Fresh M6 Human Runtime Acceptance completed on application epoch
`a5a981db77e33905f2c71c234616c6779e3ebc6c`; `HRA-F01` is **CLOSED /
HUMAN ACCEPTED**. The later PR-review corrective successor `6af2c25e172d81725b97037945e38c047fba9941`
received bounded corrective Static Human Diff Review and fresh exact-candidate
hosted proof. `HRA-F09` remains **OPEN / DEFERRED / NON-BLOCKING**.

`C5-P01` is retained as a **procedural / non-semantic / non-blocking**
deviation: the raw one-shot authorization token was briefly staged in a
root-only `0600` temporary file before environment injection, then removed
before adapter execution. The raw token is absent from retained artifacts; no
rerun is authorized.

GitHub Actions candidate run #114 and post-merge main push run #115 /
`35363051019` failed before any repository-defined step (`steps=[]`, logs
unavailable / `BlobNotFound`). They remain provider/pre-step diagnostics and
do not constitute application/test failures.

After C5 and off-host verification, the proof ECS was normally stopped in
**economical mode**. Instance `i-j6c13vpnkuq6xbbhyxzw` and private IPv4
`172.23.68.215` remain retained; the former system-assigned public IPv4 was
released. This is post-proof operational state and does not alter Gate 2 or
Gate 3 evidence.

M5 — Human-Reviewed POS Annotation Foundation — has completed bounded
implementation, exact-candidate Gate 2, Human Static Diff Review, Human Runtime
Acceptance, PR #14, explicit Human Merge Decision, rebase merge, Gate 3 exact
candidate-to-main tree verification, docs-only post-merge durable-state
closure, and exact-guarded implementation-branch cleanup.

M5 is **COMPLETE / MERGED / CLOSED**.

M5 durable implementation coordinates:

- approved pre-freeze durable base:
  `68fedc4c8cba80201333e6550231b805e0f0853c`;
- approved pre-freeze durable tree:
  `3bea6efd9662fe746328d2a7814fa65e1efb917f`;
- frozen implementation base:
  `11176df91dd9dc3d1169e4bef41808b0abfa8656`;
- frozen base tree:
  `03b1d0746bb89c5e57fe27e63e417ea274447287`;
- historical implementation branch:
  `m5-human-reviewed-pos-annotation-foundation`;
- final reviewed / independently proven candidate:
  `139f3349b8556f5dd13d5c2d8808fda4a79dc819`;
- candidate tree:
  `179aba060d5e798ace46ea6bed0a7c496a50e9ad`;
- PR #14: merged by rebase;
- post-rebase implementation `main`:
  `49163ee407c0dae7d9e20cc647cabc8ae98f75de`;
- post-rebase implementation tree:
  `179aba060d5e798ace46ea6bed0a7c496a50e9ad`;
- candidate → post-rebase `main` tree identity:
  **PASS / EXACT**;
- post-merge durable-state closure:
  `3c02f5fd087edce0f12692f901a697667ecfd31a`;
- durable closure tree:
  `40b497d3459113ad66a5fe0800adec95a1bf3479`;
- implementation-branch cleanup:
  **PASS / EXACT-GUARDED**.

The cleanup guard required exact durable
`main@3c02f5fd087edce0f12692f901a697667ecfd31a` and exact branch
`m5-human-reviewed-pos-annotation-foundation@139f3349b8556f5dd13d5c2d8808fda4a79dc819`.
Both matched before deletion. The remote branch was deleted; the post-delete
remote `main` remained exactly `3c02f5fd087edce0f12692f901a697667ecfd31a`.
GitHub independently returned `404 Branch not found` for the branch endpoint
and an empty branch-search result. PR #14 and the reviewed candidate commit
remain retained as provenance.

M5 Gate 2 result:

**PASS WITH M5-SPECIFIC EXTERNAL INFRASTRUCTURE EXCEPTION**

Accepted independent hosted proof:

- repository:
  `Pacchifans69/linguagraph-m5-proof`;
- proof commit:
  `4cf38bc3dee0c312d072ef2cc47ebdb821b32465`;
- proof tree:
  `a59a66ec392f418bf7e23d1cab67eae61f4810a4`;
- CircleCI build/pipeline:
  #2;
- status context:
  `ci/circleci: m5-exact-candidate-proof`;
- result:
  **SUCCESS**.

The proof artifact audit recorded 23/23 proof stages with exit code 0, backend
`587 passed`, frontend `31 files / 441 passed`, Playwright `12 passed`, zero
backend skips, unchanged dependency hashes, cleanup PASS, and final exact
application/proof provenance.

Canonical GitHub Actions exact-candidate run `34564666636`, PR-event run
`34586589640`, post-merge `main` run `34587072906`, and durable-closure run
`34588391377` all reproduced the provider/pre-step `G2-X01` fingerprint: the
M5 verification job ended before any repository-defined workflow step
(`steps=[]`, runner id 0 / unavailable runner execution, unusable or empty
logs). No application command executed in those runs.

`G2-X01` therefore remains **OPEN / EXTERNAL**. The M5-specific exception
waived only GitHub-hosted runner executability and did not waive any semantic
verification requirement.

Human Static Diff Review:

**PASS.**

Human Runtime Acceptance:

**PASS WITH HUMAN-APPROVED UX DEFERRAL.**

`HRA-F01` — Workbench information architecture / panel density — was not
resolved by M5. It became the first frozen input and required Human acceptance
target of M6, and has since been **CLOSED / HUMAN ACCEPTED** by the M6 Human
Runtime Acceptance for application epoch `a5a981...` (section 0).

M4 — Human-Reviewed Lemma Annotation Foundation — is
**COMPLETE / MERGED / CLOSED**. Its historical durable provenance remains
recorded in section 13.

## 1. Repository checkpoint

Current merged implementation checkpoint: **M6 — Mode-Oriented Workbench
Information Architecture**.

Current M6 lifecycle state:

**COMPLETE / MERGED / CLOSED.**

The exact reviewed/proven M6 candidate `6af2c25e172d81725b97037945e38c047fba9941` entered durable
`main` by rebase as `afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7`. Their
trees are exactly identical at `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`.
The post-merge durable-state closure is `f66b6e51e0925d635a0c512969d60de497ed01d2` / tree
`7aeaf56384ddd04ed14a29c64ae215b71eff70f4`. Exact-guarded branch cleanup then deleted only
`m6-mode-oriented-workbench-information-architecture@6af2c25e172d81725b97037945e38c047fba9941`; post-delete `main` remained unchanged and GitHub
independently verified branch absence.

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
| M4 Human-Reviewed Lemma Annotation Foundation | #13 | `ac1cd40ae190577783453050f2cbc209cd3958a6` | rebase → `4cc435893207cdd32216012ca887d338e1932250` |
| M5 Human-Reviewed POS Annotation Foundation | #14 | `139f3349b8556f5dd13d5c2d8808fda4a79dc819` | rebase → `49163ee407c0dae7d9e20cc647cabc8ae98f75de`; Gate 3 exact tree identity PASS; branch cleanup PASS |
| M6 Mode-Oriented Workbench Information Architecture | #15 | `6af2c25e172d81725b97037945e38c047fba9941` | rebase → `afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7`; Gate 3 exact tree identity PASS; durable closure `f66b6e51e0925d635a0c512969d60de497ed01d2`; branch cleanup PASS / EXACT-GUARDED |

M0.5 and M0.6 merge commits preserved exact reviewed trees. M0.7 and M1–M6
used repository-permitted rebase merge; their Gate 3 evidence bridges use exact
reviewed-candidate to durable-implementation-main tree identities.

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

Accepted ADRs: **ADR-001 through ADR-014**, frozen until a later governed
decision changes them.

Runtime baseline:

| Component | Baseline |
|---|---|
| Python | 3.13 |
| Node.js | 24 |
| PostgreSQL | 18 |
| Alembic HEAD | `0006` |

Current language-neutral persistent entities include:

```text
Project
ParallelDocument
TextVersion
Span
AlignmentGroup
AlignmentMember
SegmentationLayer
Segment
TokenLemmaAnnotation
TokenPosAnnotation
```

Core invariants remain:

- canonical UTF-8/NFC text and LF normalization;
- Unicode code-point `[start, end)` offsets;
- immutable annotated TextVersion content;
- atomic server-owned Alignment mutations;
- server-derived exact text/context;
- language-neutral schema;
- authoritative workspace snapshot for persisted frontend state;
- TanStack Query for server state;
- local reducer/state for ephemeral workspace interaction;
- frontend-only pending Alignment Tray;
- canonical flat text DOM and RenderedSpanRegistry bridge.

M1 supplies the bounded presentation/interaction substrate. M2 adds independent
sentence segmentation. M3 adds exact-sentence-basis exhaustive token
segmentation plus Human-reviewed `is_word_like`.

M4 adds one sparse optional Human-reviewed lemma per eligible saved word-like
token occurrence, directly keyed to persisted token `Segment.id`. Lemma state
remains independent of Alignment. Retokenization fails closed while lemma
dependents exist, and lemma/token mutations use the frozen TextVersion-root
serialization order.

M5 adds one sparse optional Human-reviewed coarse POS annotation per eligible
saved word-like token occurrence, keyed to the same persisted token
`Segment.id`. Lemma and POS are independent siblings (neither owns, requires,
derives, mutates or deletes the other). The closed fifteen-value coarse
vocabulary excludes `PUNCT`/`SYM` and claims no complete Universal Dependencies
conformance. POS state remains independent of Alignment; token replacement or
deletion is blocked while a lemma and/or POS dependent exists, reporting the
complete `dependency_types` set; POS, lemma and token mutations share the
TextVersion-root serialization order.

M5 deliberately does **not** include Lexeme/shared vocabulary identity, XPOS,
morphology, syntax, generic EAV annotations, automatic lemmatization/POS
annotation/alignment, NLP/LLM providers, or automatic re-anchoring.

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

The workflow remains canonical despite the current provider/pre-step execution
blockage.

The current candidate verification baseline is M6 / Alembic `0006` and
includes:

```text
full real-PostgreSQL pytest + zero-skip guard
Alembic empty → 0006 / current / check
npm ci
lint
typecheck
Vitest
production build
Playwright golden-path
Playwright Unicode
Playwright M2 sentence segmentation
Playwright M3 token segmentation
Playwright M4 lemma annotation
Playwright M5 POS annotation
Playwright M6 Workbench information architecture
cleanup / dependency-hash / final tree integrity
```

See `docs/testing/testing-strategy.md` for evidence semantics.

## 9. Known retained limitations and evidence

Open/non-blocking or explicitly deferred items:

- `G2-X01` — historically the GitHub-hosted-runner `OPEN / EXTERNAL` finding;
  **CLOSED / PASS** for final exact M6 candidate `6af2c25...`, established by
  C5 proof `274aae9...` (section 15), with M0–M5 epochs retaining their own
  recorded status;
- `HRA-F01` — Workbench information architecture / panel density was
  `OPEN / ACTIVE M6 TARGET`; **CLOSED / HUMAN ACCEPTED** by the M6 Human Runtime
  Acceptance for `a5a981...` (section 15);
- HRA-F07 — a malformed local `node` command that resolves without version
  stdout can surface a low-level PowerShell/.NET diagnostic;
- HRA-F09 — inherited connector lines can cross text glyphs under frozen
  routing;
- accepted mutation serialization is not a general collaborative locking
  protocol;
- later lexical ontology, automatic NLP/LLM behavior, authentication,
  collaboration, graph/vector infrastructure and connector-routing redesign
  remain outside completed M6.

Retained provider/proof evidence remains protected; proof/diagnostic cleanup
remains deferred. It includes historical M0.7 diagnostics and:

- M1 proof:
  `Pacchifans69/-linguagraph-m1-proof@81b35eb3191b1d449eb74934553d547fb9f7221d`;
- M2 proof:
  `Pacchifans69/linguagraph-m2-proof@bf1be70ad3115f4474fe432eef4db2c05394e128`;
- M3 proof:
  `Pacchifans69/linguagraph-m3-proof@2e95d307374bc279f42d1048caf988d2b730169c`;
- M4 proof:
  `Pacchifans69/linguagraph-m4-proof@c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f`;
- M4 proof tree:
  `33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`;
- M4 CircleCI build/pipeline #1:
  `ci/circleci: m4-exact-candidate-proof` — SUCCESS;
- exact M4 GitHub Actions diagnostic run #80 / `34245187052`;
- M5 proof:
  `Pacchifans69/linguagraph-m5-proof@4cf38bc3dee0c312d072ef2cc47ebdb821b32465`;
- M5 proof tree:
  `a59a66ec392f418bf7e23d1cab67eae61f4810a4`;
- M5 CircleCI build/pipeline #2:
  `ci/circleci: m5-exact-candidate-proof` — SUCCESS;
- exact M5 candidate GitHub Actions diagnostic run `34564666636`;
- PR-event diagnostic run `34586589640`;
- post-merge `main` diagnostic run `34587072906`;
- durable-closure diagnostic run `34588391377`.

Successful checkpoint-specific CircleCI proofs do not themselves close
`G2-X01`; they are accepted semantic evidence under their respective
Human-approved exceptions.

Proof/diagnostic cleanup remains deferred. Historical implementation-branch
cleanup does not delete proof repositories, provider diagnostics, PR history,
or reviewed candidate commits.

## 10. Cleanup status

**M5 implementation-branch cleanup: PASS / EXACT-GUARDED.**

Deleted historical implementation ref:

`m5-human-reviewed-pos-annotation-foundation@139f3349b8556f5dd13d5c2d8808fda4a79dc819`

Cleanup evidence:

1. the Human-run guard fetched remote refs and verified
   `main@3c02f5fd087edce0f12692f901a697667ecfd31a` exactly;
2. the same guard verified the implementation branch exactly at
   `139f3349b8556f5dd13d5c2d8808fda4a79dc819` before deletion;
3. `git push origin --delete m5-human-reviewed-pos-annotation-foundation`
   succeeded;
4. the post-delete guard reported the remote M5 branch as absent;
5. the post-delete guard re-read remote `main` and confirmed it remained exactly
   `3c02f5fd087edce0f12692f901a697667ecfd31a`;
6. GitHub independently returned HTTP 404 `Branch not found` for the branch
   endpoint and an empty branch-search result;
7. PR #14 remains merged and the reviewed candidate commit remains directly
   addressable by SHA;
8. `Pacchifans69/linguagraph-m5-proof` remains at accepted proof commit
   `4cf38bc3dee0c312d072ef2cc47ebdb821b32465` / tree
   `a59a66ec392f418bf7e23d1cab67eae61f4810a4`.

The deleted implementation branch is distinct from retained Gate 2 evidence.
No proof or diagnostic ref was deleted.

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

## 13. M4 durable closure

### 13.1 Final status

**M4 — Human-Reviewed Lemma Annotation Foundation:
COMPLETE / MERGED / CLOSED**

The frozen contract, implementation, Gate 2, Human reviews, PR #13, rebase
merge, Gate 3, durable-state closure, and exact-guarded implementation-branch
cleanup are complete.

No later checkpoint is implied or authorized.

### 13.2 Provenance

- approved pre-freeze durable base:
  `3cada0d2dcdcf349152aacc53992b15190271a75`;
- approved pre-freeze tree:
  `51564978a2e92ce8de61997219b3d8c596a6fa9a`;
- docs-only contract-freeze / implementation base:
  `4e12a11e266367e0a368c6128f722a620ce47ed3`;
- freeze tree:
  `f3b09f9d9934686a07bdbbe7944f22d2df76f6e2`;
- implementation branch:
  `m4-human-reviewed-lemma-annotation-foundation`;
- original bounded candidate:
  `5d9fccf31803a6fc1accdb5a6d0c2d967e5bcfb3`;
- final corrected, reviewed and independently proven candidate:
  `ac1cd40ae190577783453050f2cbc209cd3958a6`;
- candidate tree:
  `18eff900b903d7f3743aa88fa9390d3dbdebc477`;
- PR: `#13`;
- merge method: rebase;
- post-rebase implementation `main`:
  `4cc435893207cdd32216012ca887d338e1932250`;
- post-rebase implementation tree:
  `18eff900b903d7f3743aa88fa9390d3dbdebc477`.

The candidate remained frozen through final Gate 2, Static Human Diff Review,
Human Runtime Acceptance, PR creation and Human Merge Decision.

The only Gate-2-discovered candidate correction was the approved docs-only
`CURRENT_STATE.md` ledger fix in
`ac1cd40ae190577783453050f2cbc209cd3958a6`; no application code or test
change was introduced after the original implementation candidate.

### 13.3 Gate 2

Formal result:

**PASS under the Human-approved M4-specific External Infrastructure Exception**

Canonical GitHub Actions exact-candidate evidence:

- corrected candidate:
  `ac1cd40ae190577783453050f2cbc209cd3958a6`;
- run:
  #80 / `34245187052`;
- result:
  failure before workflow steps;
- verification job:
  present, but `steps=null` and no usable job logs.

This reproduced the established provider/pre-step `G2-X01` fingerprint. No
application, migration, test, build, or Playwright command executed there.

The Human separately approved an M4-specific exception that waived only
successful execution on a GitHub-hosted runner.

Accepted independent hosted proof:

- repository:
  `Pacchifans69/linguagraph-m4-proof`;
- proof commit:
  `c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f`;
- proof tree:
  `33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`;
- CircleCI build/pipeline:
  #1;
- status context:
  `ci/circleci: m4-exact-candidate-proof`;
- result:
  **SUCCESS**.

The proof enforced exact proof-source and application SHA/tree/frozen-base
guards and executed the full M4 release matrix: clean hosted Linux,
Python 3.13, Node 24, PostgreSQL 18, `uv sync --frozen`, Alembic
empty → `0005` / current / check, full real-PostgreSQL pytest with zero skips,
`npm ci`, lint, typecheck, Vitest, production build, golden/Unicode/M2/M3/M4
Playwright paths, disposable-database cleanup, dependency-hash checks and final
remote/local provenance/tree integrity.

`G2-X01` remains `OPEN / EXTERNAL`.

### 13.4 Human review and runtime acceptance

Static Human Diff Review:

**PASS.**

No blocking correctness, architecture, migration, concurrency, scope or known
M4 product defect remained at the reviewed candidate.

Human Runtime Acceptance:

**PASS.**

Accepted runtime behavior covered:

- eligible saved word-like token targets only;
- lemma create → authoritative reload;
- edit → authoritative reload;
- explicit delete;
- case/value preservation;
- token replacement/deletion blocked while lemma dependents exist;
- delete lemma → retokenization unblocked;
- Unicode occurrence handling;
- Alignment independence;
- canonical text DOM/UI separation;
- visible pending/error behavior.

The initial HRA view lacked the Lemma panel because the browser was connected
to stale Windows-side FastAPI/Vite services from a separate checkout at
`C:/Users/ZJX/Desktop/LinguaGraph`, while the exact candidate lived in the WSL
checkout. This was diagnosed as a runtime-environment mismatch, not an M4
candidate defect. The exact candidate subsequently passed the Human lemma
workflow.

`HRA-F09` connector-routing debt remains inherited and explicitly deferred.

### 13.5 Merge and Gate 3

PR #13 — `M4 — Human-Reviewed Lemma Annotation Foundation` — was created with:

```text
base
main@4e12a11e266367e0a368c6128f722a620ce47ed3

head
m4-human-reviewed-lemma-annotation-foundation
@ac1cd40ae190577783453050f2cbc209cd3958a6
```

After explicit Human merge authorization, GitHub merged PR #13 by rebase.

Post-rebase implementation `main`:

`4cc435893207cdd32216012ca887d338e1932250`

Its tree:

`18eff900b903d7f3743aa88fa9390d3dbdebc477`

Reviewed candidate tree:

`18eff900b903d7f3743aa88fa9390d3dbdebc477`

Therefore:

**M4 Gate 3 candidate → post-rebase main tree identity: PASS / EXACT.**

Rebase changed commit identities but preserved the reviewed application tree
exactly.

### 13.6 Delivered durable outcome

M4 durably establishes:

- additive Alembic `0005`;
- sparse `token_lemma_annotations`;
- one optional Human-reviewed lemma per saved eligible token occurrence;
- direct persisted `Segment.id` occurrence identity;
- no Lexeme or generic annotation/EAV layer;
- NFC and bounded Unicode value semantics without automatic normalization
  beyond the frozen contract;
- explicit PUT create/update/no-op semantics;
- explicit DELETE semantics;
- no-op PUT preserving `updated_at`;
- token retokenization/deletion fail-closed while lemma dependents exist;
- shared TextVersion-root serialization for competing token/lemma mutations;
- forced TextVersion cascade through the existing segmentation ownership
  graph;
- flat workspace `token_lemma_annotations` read authority;
- frontend lemma normalization and `LemmaAnnotationPanel`;
- saved token authority only — never unsaved `TokenDraft`;
- Alignment independence;
- M4 backend/frontend/E2E verification coverage;
- ADR-012.

`pyproject.toml`, `uv.lock`, `package.json`, `package-lock.json`, the Python
3.13 / Node 24 / PostgreSQL 18 baseline, and migrations `0001`–`0004` remain
unchanged by M4.

### 13.7 Cleanup and retention boundary

Post-merge durable-state closure:

- commit:
  `d90b0f52f96869d2710aa4b592514f34b7e2dd99`;
- tree:
  `a77ef2dc34ca80083195c476aeef1591d9c95f16`.

Implementation-branch cleanup is **PASS**.

Human-authorized deletion guard:

- required durable `main`:
  `d90b0f52f96869d2710aa4b592514f34b7e2dd99`;
- required implementation branch:
  `m4-human-reviewed-lemma-annotation-foundation`;
- required branch SHA:
  `ac1cd40ae190577783453050f2cbc209cd3958a6`.

The Human-run guard verified both exact SHAs, deleted only the M4
implementation branch, pruned the remote-tracking ref, removed the local
implementation branch, rechecked that `main` remained unchanged, and reported:

`PASS: exact-guarded M4 implementation branch cleanup complete`

GitHub independently verifies the deleted branch with both:

- branch endpoint: `404 Branch not found`;
- branch search: empty result.

The reviewed candidate commit remains addressable by SHA, PR #13 remains
merged, and `Pacchifans69/linguagraph-m4-proof` remains at
`c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f` with proof tree
`33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`.

All proof repositories, CircleCI records/artifacts, GitHub Actions diagnostics,
PR history, and reviewed candidate history remain retained. `G2-X01` remains
`OPEN / EXTERNAL`.

M4 is **COMPLETE / MERGED / CLOSED**.

## 14. M5 durable closure

### 14.1 Final status

**M5 — Human-Reviewed POS Annotation Foundation: COMPLETE / MERGED / CLOSED.**

Completed lifecycle:

- repository reality reconstruction / Gate 1: PASS;
- Human contract freeze: PASS;
- bounded implementation: PASS;
- exact corrected candidate freeze: PASS;
- Gate 2: PASS WITH M5-SPECIFIC EXTERNAL INFRASTRUCTURE EXCEPTION;
- Human Static Diff Review: PASS;
- Human Runtime Acceptance: PASS WITH HUMAN-APPROVED UX DEFERRAL;
- PR #14: merged by rebase after explicit Human Merge Decision;
- Gate 3: PASS / EXACT TREE IDENTITY;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS / EXACT-GUARDED.

At M5 close `G2-X01` remained **OPEN / EXTERNAL**.

`HRA-F01` remained open at M5 close, was not resolved by M5, and became the
active M6 Human acceptance target. It is now **CLOSED / HUMAN ACCEPTED** by the
M6 Human Runtime Acceptance for `a5a981...` (section 15).

### 14.2 Provenance

- approved pre-freeze durable base:
  `68fedc4c8cba80201333e6550231b805e0f0853c`;
- approved pre-freeze tree:
  `3bea6efd9662fe746328d2a7814fa65e1efb917f`;
- docs-only contract-freeze / frozen implementation base:
  `11176df91dd9dc3d1169e4bef41808b0abfa8656`;
- frozen base tree:
  `03b1d0746bb89c5e57fe27e63e417ea274447287`;
- historical implementation branch:
  `m5-human-reviewed-pos-annotation-foundation`;
- final corrected, reviewed and independently proven candidate:
  `139f3349b8556f5dd13d5c2d8808fda4a79dc819`;
- candidate tree:
  `179aba060d5e798ace46ea6bed0a7c496a50e9ad`;
- governing contract:
  `docs/development/M5_CONTRACT.md`;
- decision record:
  `docs/adr/ADR-013-token-occurrence-coarse-pos-annotations.md`;
- PR:
  `#14 — M5 — Human-Reviewed POS Annotation Foundation`;
- merge method:
  rebase;
- post-rebase implementation `main`:
  `49163ee407c0dae7d9e20cc647cabc8ae98f75de`;
- post-rebase implementation tree:
  `179aba060d5e798ace46ea6bed0a7c496a50e9ad`;
- post-merge durable-state closure:
  `3c02f5fd087edce0f12692f901a697667ecfd31a`;
- durable closure tree:
  `40b497d3459113ad66a5fe0800adec95a1bf3479`.

The corrected candidate remained frozen through re-established Gate 2, Human
Static Diff Review, Human Runtime Acceptance, PR creation and Human Merge
Decision.

### 14.3 Gate 2

Formal result:

**PASS WITH M5-SPECIFIC EXTERNAL INFRASTRUCTURE EXCEPTION**

Canonical GitHub Actions exact-candidate evidence:

- corrected candidate:
  `139f3349b8556f5dd13d5c2d8808fda4a79dc819`;
- run:
  `34564666636`;
- result:
  failure before repository-defined workflow steps;
- verification job:
  `steps=[]`, logs unavailable / `BlobNotFound`.

The Human explicitly re-approved the M5-specific exception for the corrected
exact candidate. It waived only successful GitHub-hosted-runner executability.

Accepted independent hosted proof:

- repository:
  `Pacchifans69/linguagraph-m5-proof`;
- proof commit:
  `4cf38bc3dee0c312d072ef2cc47ebdb821b32465`;
- proof tree:
  `a59a66ec392f418bf7e23d1cab67eae61f4810a4`;
- CircleCI build/pipeline:
  #2;
- status context:
  `ci/circleci: m5-exact-candidate-proof`;
- result:
  **SUCCESS**.

The proof enforced exact proof-source and application SHA/tree/frozen-base
guards and executed clean hosted Linux, Python 3.13, Node 24, PostgreSQL 18,
`uv sync --frozen`, Alembic empty → `0006` / current / check, full
real-PostgreSQL pytest with zero skips, `npm ci`, lint, typecheck, Vitest,
production build, golden/Unicode/M2/M3/M4/M5 Playwright paths,
disposable-database cleanup, dependency-hash equality and final remote/local
provenance/tree integrity.

Hosted artifact audit:

- command stages: 23/23 exit 0;
- backend: `587 passed`, zero skipped;
- frontend: `31 files / 441 passed`;
- Playwright: `12 passed`;
- dependency hashes: before == after;
- final candidate/proof identities: exact;
- `G2-N02`: retained non-blocking CircleCI bulk-download packaging note for
  omitted zero-byte artifacts.

PR-event run `34586589640`, post-merge `main` run `34587072906`, and durable
closure run `34588391377` reproduced the same `G2-X01` pre-step fingerprint
(`steps=[]`, no runner execution). They do not constitute application failure
evidence.

`G2-X01` remains **OPEN / EXTERNAL**.

### 14.4 Human review and runtime acceptance

Human Static Diff Review:

**PASS.**

Closed review findings:

- `HSDR-F01`: CLOSED — cross-operation token dependency guidance now reflects
  the latest backend response rather than retaining stale sibling guidance;
- `HSDR-F02`: CLOSED — contradictory pre-merge M5 documentation was repaired
  without modifying the frozen M5 contract.

Human Runtime Acceptance:

**PASS WITH HUMAN-APPROVED UX DEFERRAL.**

Accepted runtime behavior covered:

- saved-token prerequisite and word-like-only POS targets;
- exact fifteen-tag selector;
- POS create → reload → edit → reload → delete lifecycle;
- lemma-only / POS-only / lemma+POS sibling independence;
- multi-dependent token-mutation blocking and recovery;
- real-browser HSDR-F01 regression: PUT reports lemma+POS, deleting lemma then
  switching to token-layer DELETE reports POS only with no stale prior guidance;
- Unicode/multilingual token identity and persisted POS binding (`Straße`,
  `schön`);
- native selection and Add to Alignment;
- Alignment create/reload/activate/connector behavior;
- Delete POS preserves Alignment;
- Delete Alignment preserves POS;
- inherited sentence/token/lemma workflows.

`HRA-F01` was **OPEN / ACTIVE M6 TARGET** at M5 close: the Human judged the
vertically stacked sentence/token/lemma/POS workspace information architecture
and panel density NOT ACCEPTABLE. Its root cause spans the overall frontend
composition rather than M5 POS domain correctness. The Human approved deferral
only on the condition that it becomes the first contract input of the next
Workbench Information Architecture checkpoint. It was frozen as the first M6
input and has since been **CLOSED / HUMAN ACCEPTED** by the M6 Human Runtime
Acceptance for `a5a981...` (section 15).

### 14.5 Merge and Gate 3

PR #14 was created against exact base:

`main@11176df91dd9dc3d1169e4bef41808b0abfa8656`

with exact head:

`m5-human-reviewed-pos-annotation-foundation@139f3349b8556f5dd13d5c2d8808fda4a79dc819`

After explicit Human merge authorization, GitHub merged PR #14 by rebase.

Post-rebase implementation `main`:

`49163ee407c0dae7d9e20cc647cabc8ae98f75de`

Post-rebase implementation tree:

`179aba060d5e798ace46ea6bed0a7c496a50e9ad`

Reviewed candidate tree:

`179aba060d5e798ace46ea6bed0a7c496a50e9ad`

Therefore:

**M5 Gate 3 candidate → post-rebase main tree identity: PASS / EXACT.**

The rebase changed commit identities while preserving the reviewed application
tree exactly. Post-rebase `main` is 10 commits ahead of the frozen
implementation base and 0 behind, with merge base exactly
`11176df91dd9dc3d1169e4bef41808b0abfa8656`.

### 14.6 Delivered durable outcome

M5 durably establishes:

- additive Alembic `0006_human_reviewed_pos_annotations.py`; revisions
  `0001`–`0005` unchanged;
- sparse `token_pos_annotations` with one optional POS per saved eligible token
  occurrence;
- direct persisted `Segment.id` occurrence identity;
- exact closed fifteen-value coarse POS vocabulary;
- explicit PUT create/update/no-op and DELETE semantics;
- `INVALID_POS_TARGET` / `INVALID_POS_VALUE` distinctions;
- lemma/POS sibling independence;
- complete-set retokenization dependency blocking;
- shared TextVersion-root serialization for token/lemma/POS mutation;
- workspace `token_pos_annotations` read authority;
- frontend POS normalization and `PosAnnotationPanel` outside
  `[data-text-content-root]`;
- authoritative reload after persisted mutation;
- Alignment independence;
- M5 backend/frontend/E2E verification coverage;
- ADR-013;
- no dependency, lockfile or runtime-baseline change;
- no Alignment service or `text_version_service.py` change.

### 14.7 Cleanup and retention boundary

Post-merge durable-state closure:

- commit:
  `3c02f5fd087edce0f12692f901a697667ecfd31a`;
- tree:
  `40b497d3459113ad66a5fe0800adec95a1bf3479`.

Implementation-branch cleanup is **PASS / EXACT-GUARDED**.

Human-authorized deletion guard:

- required durable `main`:
  `3c02f5fd087edce0f12692f901a697667ecfd31a`;
- required historical implementation branch:
  `m5-human-reviewed-pos-annotation-foundation`;
- required branch SHA:
  `139f3349b8556f5dd13d5c2d8808fda4a79dc819`.

The Human-run guard verified both exact SHAs, deleted only the remote M5
implementation branch, fetched/pruned, rechecked that remote `main` remained
unchanged, and reported:

`PASS: exact-guarded M5 remote implementation-branch cleanup complete.`

GitHub independently verifies the deleted branch with both:

- branch endpoint: `404 Branch not found`;
- branch search: empty result.

The reviewed candidate commit remains addressable by SHA, PR #14 remains
merged, and `Pacchifans69/linguagraph-m5-proof` remains at
`4cf38bc3dee0c312d072ef2cc47ebdb821b32465` with proof tree
`a59a66ec392f418bf7e23d1cab67eae61f4810a4`.

All proof repositories, CircleCI records/artifacts, GitHub Actions diagnostics,
PR history, and reviewed candidate history remain retained.

`G2-X01` remained **OPEN / EXTERNAL** at M5 close. It is **CLOSED / PASS** for
final exact M6 candidate `6af2c25e172d81725b97037945e38c047fba9941`,
established by C5 proof `274aae9f86fb8da9571edf1e197696035d6fb4a3`
(section 15).

`HRA-F01` was **OPEN / ACTIVE M6 TARGET** at M5 close and was frozen as the
first M6 contract input. It has since been **CLOSED / HUMAN ACCEPTED** by the M6
Human Runtime Acceptance for that exact epoch (section 15).

M5 is **COMPLETE / MERGED / CLOSED**.

M6 is **COMPLETE / MERGED / CLOSED**. PR #15 merged by rebase, Gate 3 exact
tree identity passed, the post-merge durable-state closure completed, and the
implementation branch cleanup passed under exact guards; the historical M6
implementation branch is absent from GitHub.

## 15. M6 durable post-merge closure

### 15.1 Lifecycle status

**M6 — Mode-Oriented Workbench Information Architecture: COMPLETE / MERGED /
CLOSED.**

Completed lifecycle through this closure:

- repository reality reconstruction / Gate 1: PASS;
- Human contract freeze: PASS;
- bounded implementation and corrective successors: PASS;
- Gate 2 for final exact candidate: **PASS / ESTABLISHED**;
- Static Human Diff Review, including bounded PR-review corrective review:
  **PASS**;
- Fresh Human Runtime Acceptance on the accepted application epoch:
  **PASS / COMPLETE**;
- `HRA-F01`: **CLOSED / HUMAN ACCEPTED**;
- PR #15: **MERGED BY REBASE** after explicit Human Merge Decision;
- Gate 3: **PASS / EXACT TREE IDENTITY**;
- durable-state closure:
  **PASS** at `f66b6e51e0925d635a0c512969d60de497ed01d2` / tree `7aeaf56384ddd04ed14a29c64ae215b71eff70f4`;
- implementation-branch cleanup:
  **PASS / EXACT-GUARDED**.

`HRA-F09` remains **OPEN / DEFERRED / NON-BLOCKING**.

### 15.2 Frozen baseline, final candidate, merge, and Gate 3

- frozen Product `main`:
  `cb61725fe9f05c704a6f80b67c6343f49ade9234`;
- frozen tree:
  `839705a3577652d1f9127a737a9535fe7f025d60`;
- final reviewed / independently proven candidate:
  `6af2c25e172d81725b97037945e38c047fba9941`;
- candidate tree:
  `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`;
- candidate unique parent:
  `773aae151766038a451ee5b18f5923467b8a3e56`;
- candidate subject:
  `fix(M6): close PR review findings`;
- implementation branch:
  `m6-mode-oriented-workbench-information-architecture`;
- PR:
  `#15 — M6 — Mode-Oriented Workbench Information Architecture`;
- merge method:
  rebase;
- post-rebase implementation `main`:
  `afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7`;
- post-rebase implementation tree:
  `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`.

Reviewed/proven candidate tree:

`7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`

Post-rebase durable implementation tree:

`7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`

Therefore:

**M6 Gate 3 candidate → post-rebase main tree identity: PASS / EXACT.**

Rebase rewrote commit identities while preserving the complete reviewed/proven
file tree. Git graph comparison between the historical candidate branch and
post-rebase main is expected to diverge; tree identity is the evidence bridge.

### 15.3 Final C5 exact-candidate hosted proof

Accepted proof source:

- repository:
  `Pacchifans69/linguagraph-m6-proof`;
- proof SHA:
  `274aae9f86fb8da9571edf1e197696035d6fb4a3`;
- proof tree:
  `b331cd16642ba2c293bb6b83d2310f85b2af35e6`;
- proof parent:
  `1c05663a2e90918e5de98631a9209a7f76822cdc`;
- provider:
  Alibaba ECS;
- instance:
  `i-j6c13vpnkuq6xbbhyxzw`;
- exact candidate:
  `6af2c25e172d81725b97037945e38c047fba9941`;
- exact candidate tree:
  `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`;
- exact candidate parent:
  `773aae151766038a451ee5b18f5923467b8a3e56`;
- frozen `main`:
  `cb61725fe9f05c704a6f80b67c6343f49ade9234`;
- Alembic head:
  `0006`;
- adapter invocation count:
  `1`;
- adapter rc:
  `0`;
- formal outcome:
  **PASS**;
- authorization SHA-256:
  `5c0acedd8308bddf8d6fdd6f1486aac7660fd209b9160a05c3d648d9eb965609`;
- authorization:
  **SPENT / MUST NOT REUSE**.

All required stages completed with exit 0:

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

Retained semantic/integrity evidence:

- Python 3.13.15;
- Node v24.17.0;
- uv 0.12.10;
- PostgreSQL 18.6;
- Alembic empty → `0006` / current / check: PASS;
- backend pytest: **587 passed**, zero skipped;
- Vitest: **35 files / 519 passed**;
- Playwright: **32 passed / retries=0**;
- dependency hash equality: PASS;
- candidate final worktree: CLEAN;
- disposable-database residual: EMPTY;
- proof-owned PostgreSQL container after cleanup: ABSENT;
- final remote guard: PASS / refs unchanged;
- artifact manifest: **45 / 45 PASS**.

Deterministic archive:

`m6-proof-artifacts-274aae9f86fb8da9571edf1e197696035d6fb4a3.tar.gz`

Archive SHA-256:

`7a7a555167e9f8d0957baffc14ff4058e0cd939117d5774ebb3fa881b0f8c403`

Off-host archive SHA-256 and extracted manifest verification:
**PASS / exact / 45 of 45**.

`G2-X01` is therefore **CLOSED / PASS** and M6 Gate 2 is
**PASS / ESTABLISHED** for exact candidate `6af2c25e172d81725b97037945e38c047fba9941`.

### 15.4 Human review and accepted application epoch

Fresh Human Runtime Acceptance completed on application epoch
`a5a981db77e33905f2c71c234616c6779e3ebc6c`, closing `HRA-F01`. Two
docs-only pre-PR successors followed, then bounded PR review produced the final
application/test corrective successor `6af2c25e172d81725b97037945e38c047fba9941`.

That final corrective successor received bounded corrective Static Human Diff
Review with zero blocking findings and fresh exact-candidate hosted proof.
No later Product change occurred before merge. `HRA-F09` remains separately
governed and deferred.

### 15.5 GitHub-provider diagnostic state

Automatic GitHub Actions did not execute repository-defined semantic steps for
the final candidate or post-merge main.

Final-candidate PR-era run:

- run #114 / `35343563836`;
- result: failure before repository-defined steps;
- verification job: `steps=[]`;
- logs unavailable / `BlobNotFound`.

Post-merge `main@afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7` push run:

- run #115 / `35363051019`;
- job `105658759117`;
- result: failure before repository-defined steps;
- verification job: `steps=[]`;
- logs unavailable / `BlobNotFound`.

These are provider/pre-step diagnostics. They are not application, test, lint,
typecheck, build, or Playwright failure evidence and do not supersede the
accepted exact-candidate C5 hosted proof.

### 15.6 C5-P01 procedural deviation

`C5-P01` is retained without concealment.

During C5 orchestration, the raw one-shot authorization token was briefly
written to a root-only `0600` temporary file before process-environment
injection and was removed before adapter execution. This deviated from the
stricter instruction that the raw token not be written to a file.

Classification:

- procedural;
- non-semantic;
- non-blocking for proof validity;
- raw token absent from retained proof archive;
- authorization spent / must not reuse;
- rerun neither required nor authorized.

### 15.7 Post-proof ECS state

After successful C5 execution and off-host evidence verification, the Human
authorized economical stop of the proof host.

Recorded state:

- instance:
  `i-j6c13vpnkuq6xbbhyxzw`;
- region / zone:
  `cn-hongkong / cn-hongkong-d`;
- private IPv4 retained:
  `172.23.68.215`;
- SSH ED25519 host fingerprint retained off-host:
  `SHA256:nfDqp5sIJgJL8O0Mi+QSpWYhcLGGw39DCwyCtL0P+mk`;
- state:
  **STOPPED / ECONOMICAL MODE**;
- former system-assigned public IPv4:
  released;
- C5 archive:
  retained off-host with exact SHA-256 `7a7a555167e9f8d0957baffc14ff4058e0cd939117d5774ebb3fa881b0f8c403`.

This provider state is operational retention information, not Product
correctness evidence.

### 15.8 Durable closure and exact-guarded cleanup

The M6 post-merge durable-state closure is:

- commit:
  `f66b6e51e0925d635a0c512969d60de497ed01d2`;
- tree:
  `7aeaf56384ddd04ed14a29c64ae215b71eff70f4`;
- scope:
  exactly `AGENTS.md`, `README.md`,
  `docs/development/CURRENT_STATE.md`, and
  `docs/testing/testing-strategy.md`.

It changed no application code, tests, workflow, contract, ADR, architecture,
dependency, lockfile, runtime, proof repository, or provider configuration.

C8-R2 implementation-branch cleanup is **PASS / EXACT-GUARDED**.

The Human-authorized deletion guard required:

- durable `main@f66b6e51e0925d635a0c512969d60de497ed01d2`;
- branch `m6-mode-oriented-workbench-information-architecture`;
- exact branch SHA `6af2c25e172d81725b97037945e38c047fba9941`.

Both exact SHA guards matched before deletion. Only that remote branch was
deleted. Post-delete verification showed:

- remote `main` remained exactly `f66b6e51e0925d635a0c512969d60de497ed01d2`;
- the branch ref was absent;
- GitHub branch endpoint returned `404 Branch not found`;
- GitHub branch search returned an empty result;
- final candidate `6af2c25e172d81725b97037945e38c047fba9941` remained addressable by SHA;
- PR #15 remained merged;
- proof repository `main@274aae9f86fb8da9571edf1e197696035d6fb4a3` remained unchanged.

The current four-file docs-only record repairs formatting defects introduced
by the prior closure patch and records successful cleanup. Its own exact
commit/tree should be resolved from Git history rather than embedded
self-referentially.

M6 is **COMPLETE / MERGED / CLOSED**.

### 15.9 Retention

Retain PR #15, final candidate `6af2c25e172d81725b97037945e38c047fba9941`, proof repository
`274aae9f86fb8da9571edf1e197696035d6fb4a3`, deterministic archive/checksum, GitHub Actions provider
diagnostics, C5-P01 record, and historical review/proof chronology. M0–M5
historical sections retain the evidence status applicable to their own epochs.

