# LinguaGraph — Current Engineering State

This file is the durable engineering handoff and navigation index for the
current repository state. It summarizes facts needed to reconstruct the
project without relying on chat history.

It does not replace accepted ADRs, frozen milestone contracts, executable
tests, Alembic history, merged PR/Git history, or retained provider evidence.

---

## 1. Repository checkpoint

Current completed implementation milestone:

**M1 — Workbench Interaction & UI Foundation:
COMPLETE / MERGED / CLOSED**

The implementation-branch cleanup is complete and independently verified.

Active architecture checkpoint:

**M2 — Linguistic Segmentation Foundation:
CONTRACT FROZEN / IMPLEMENTATION BRANCH NOT YET CREATED**

M2 Gate 1 passed against durable pre-freeze base
`8ad87aaa789d86535adf3aed34035317c515b6e6` / tree `f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`. Human approved and froze the bounded
M2 v1 contract on 2026-09-05.

Frozen M2 v1 outcome:

- persistent sentence-only `SegmentationLayer` / `Segment` domain;
- canonical Unicode code-point coordinates and backend-derived exact text;
- complete partitions, stale-content guard and atomic replacement;
- Human-reviewed manual/`Intl.Segmenter` suggestion workflow;
- Alembic `0003`;
- Segmentation controls outside the canonical content root;
- no word/token segmentation, direct segment-to-tray behavior, linguistic
  annotation, candidate/automatic alignment or NLP/LLM provider.

The implementation branch is not yet created. The docs-only commit containing
`docs/development/M2_CONTRACT.md` becomes the authorized implementation base
only after exact provenance and docs-only scope verification.

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

M0.5 and M0.6 merge commits were verified to contain the exact reviewed file
trees. M0.7 and M1 used repository-permitted rebase merge; their Gate 3
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

Accepted ADRs: **ADR-001 through ADR-009**, frozen until a later governed
decision changes them.

Runtime baseline:

| Component | Baseline |
|---|---|
| Python | 3.13 |
| Node.js | 24 |
| PostgreSQL | 18 |
| Alembic HEAD | `0002` |

Core language-neutral entities remain:

```text
Project
ParallelDocument
TextVersion
Span
AlignmentGroup
AlignmentMember
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

M1 adds a presentation/interaction substrate. It does not add segmentation,
linguistic annotations, candidate alignments, machine assistance, advanced
workspace geometry, or connector-routing redesign.

---

## 8. Verification entry points

Local Windows run:

```powershell
.scriptsdev.ps1
```

Windows PowerShell 5.1 execution-policy fallback:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .scriptsdev.ps1
```

Local verification:

```powershell
.scriptserify.ps1
```

or:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .scriptserify.ps1
```

Canonical GitHub Actions workflow:

`.github/workflows/ci.yml`

The workflow remains canonical despite current provider execution blockage.
See `docs/testing/testing-strategy.md` for evidence semantics.

---

## 9. Known retained limitations and evidence

Open/non-blocking items:

- `G2-X01` — GitHub-hosted-runner execution remains OPEN / EXTERNAL;
- HRA-F07 — a malformed local `node` command that resolves without version
  stdout can surface a low-level PowerShell/.NET diagnostic;
- HRA-F09 — connector lines can cross text glyphs under frozen routing;
- accepted concurrency behavior is not a collaborative locking protocol;
- M1 intentionally excludes segmentation, NLP/LLM alignment,
  authentication/collaboration, advanced layout, and sophisticated routing.

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

## 11. M2 activation rule

**M2 Gate 1: PASS**

**M2 contract v1: FROZEN — HUMAN APPROVED 2026-09-05**

Approved pre-freeze durable base:

`8ad87aaa789d86535adf3aed34035317c515b6e6`

Approved pre-freeze durable tree:

`f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`

The contract permits a sentence-only linguistic segmentation foundation and is
authoritative at `docs/development/M2_CONTRACT.md`.

The next safe action, after the docs-only freeze commit is independently
verified, is:

1. record the exact freeze commit SHA/tree;
2. confirm that only `AGENTS.md`, `README.md`,
   `docs/development/CURRENT_STATE.md` and
   `docs/development/M2_CONTRACT.md` changed;
3. create `m2-linguistic-segmentation-foundation` from that exact commit;
4. keep all implementation off `main`;
5. execute only the frozen M2 scope.

Do not reuse `m1-workbench-ui-foundation` or `m0.7-hardening`. Do not treat
M0.7/M1 exception or proof authority as M2 authority. Retained proof and
diagnostic evidence remains protected.
