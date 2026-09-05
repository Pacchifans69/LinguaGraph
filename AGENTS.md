# LinguaGraph Agent Instructions

## Authoritative specifications

For all work that inherits the M0 product and architecture baseline, the
authoritative frozen specification is:

`docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`

The completed M1 execution contract is:

`docs/development/M1_CONTRACT.md`

The active frozen M2 execution contract is:

`docs/development/M2_CONTRACT.md`

Before planning, modifying files, installing dependencies, or writing
implementation code:

1. Read this `AGENTS.md`.
2. Read the frozen specification and the contract governing the active
   checkpoint.
3. Treat frozen principles, invariants, explicit non-goals, and Definitions of
   Done as binding.
4. Do not silently override an architectural decision.
5. If repository reality conflicts with an authoritative document, report the
   conflict and proposed minimal resolution before changing the affected
   architecture.
6. Do not broaden the active milestone.
7. Run and report every verification command required by the active execution
   contract.

## Current phase

The active architecture checkpoint is:

**M2 — Linguistic Segmentation Foundation
(BOUNDED IMPLEMENTATION IN PROGRESS)**

M2 Gate 1 passed against durable pre-freeze base
`8ad87aaa789d86535adf3aed34035317c515b6e6` / tree `f9a75c9c7c02dd4ca7c3b0cbcac8ca1f10d9897b`. Human approved and froze
`docs/development/M2_CONTRACT.md` on 2026-09-05. The docs-only commit
containing that contract becomes the sole authorized implementation base after
its provenance and scope are verified.

The verified docs-only freeze / implementation base is
`59e39ac436d8b1e3b4a29992b80fe72f3be2b13f` with tree
`3564dbcdb5e897db9d07dfc67b9d705eab14e056`. Under explicit Human
authorization, `m2-linguistic-segmentation-foundation` was created at that
exact commit and bounded M2 implementation is active there. No M2
implementation, migration or code change may occur on `main`.

The last completed implementation checkpoint remains:

**M1 — Workbench Interaction & UI Foundation
(COMPLETE / MERGED / CLOSED)**

M0.1 through M0.7 and M1 have been human-reviewed, merged, durably recorded,
and closed. The historical M1 implementation branch was removed after the
durable-state closure.

### M1 durable provenance

- approved pre-freeze durable base:
  `f77ad4d94a309d47507b4fe7297f0ccf436144a6`;
- docs-only M1 contract-freeze / implementation base:
  `41c299d9e4984d0fa2620e0990207cdc715ca0d1`;
- implementation branch:
  `m1-workbench-ui-foundation`;
- final reviewed and independently proven candidate:
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7`;
- candidate tree:
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`;
- PR #10 — `M1 — Workbench Interaction & UI Foundation`;
- repository policy permitted rebase merge only;
- durable implementation `main` tip immediately after merge:
  `3a3361aebdb7c9c8d3a1b850c5b30dc9f5a5b6ea`;
- durable implementation tree:
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`;
- candidate → durable implementation tree identity:
  **PASS / EXACT**.

### M1 lifecycle

- repository reconstruction / Gate 1: PASS;
- contract reconstruction and Human freeze: PASS;
- bounded implementation and candidate freeze: PASS;
- Gate 2: **PASS under the approved M1 External Infrastructure Exception**;
- Static Human Diff Review: PASS;
- Human Runtime Acceptance: PASS;
- Human Merge Decision: APPROVED;
- PR #10: MERGED by rebase;
- Gate 3 post-merge integrity: PASS;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS.

Cleanup evidence:

- the remote branch was checked at exact
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7` before deletion;
- the Human-executed guarded cleanup deleted the remote branch and pruned the
  local remote-tracking ref;
- the Human-reported terminal guard ended with
  `PASS: exact-guarded M1 implementation branch cleanup complete.`;
- GitHub independently returns HTTP 404 for
  `m1-workbench-ui-foundation`;
- retained M0.7/M1 proof repositories, diagnostic refs, workflow history, and
  CircleCI evidence remain preserved.

The M1 exception waived only successful proof specifically on a GitHub-hosted
runner. It did not waive semantic gates, runtime baselines, hosted Linux,
provenance, cleanup, or tree integrity.

Accepted M1 independent proof:

- repository:
  `Pacchifans69/-linguagraph-m1-proof`;
- executable proof commit:
  `81b35eb3191b1d449eb74934553d547fb9f7221d`;
- CircleCI pipeline #3:
  `ci/circleci: m1-exact-candidate-proof` — PASS;
- exact application candidate/tree:
  `bdd32cbaed63966c346caaf44f1fd3a0197750a7` /
  `c52c9ae027d231ca6a36ccb0001e8ce18c29d4fe`.

The proof repository README still describes the initial pre-fix candidate. The
executable config at `81b35eb…` and its successful run are the accepted
provenance authority.

GitHub Actions exact-candidate push run #34, PR run #35, and post-merge `main`
run #36 all failed before any workflow step began. Their jobs expose zero
steps and no usable logs. GitHub Actions provider proof therefore remains
**BLOCKED / EXTERNAL**, and `G2-X01` remains **OPEN / EXTERNAL**. No provider
internal root cause is asserted.

See `docs/development/CURRENT_STATE.md` for the durable M1 evidence ledger and
`docs/development/M1_CONTRACT.md` for the frozen contract.

## Historical M0 state

M0 — Manual Alignment Workbench remains complete. Its last checkpoint was:

**M0.7 — Hardening (COMPLETE / MERGED / CLOSED)**

M0.7 durable provenance:

- PR #9;
- final reviewed / externally proven candidate:
  `580e27cbea09e50f40782a92da426e7332e8a54d`;
- candidate and post-rebase implementation tree:
  `16c2bd3f5a8c5cb4960e193896547093fe091c87`;
- durable implementation `main` tip immediately after merge:
  `697b019dc2820c67dacbc0b58a718e198ab655be`;
- historical branch `m0.7-hardening`: deleted after closeout;
- Gate 2: PASS under its checkpoint-specific External Infrastructure
  Exception;
- `G2-X01`: retained OPEN / EXTERNAL.

The M0.7 exception and proof do not serve as M1 evidence. Retained M0.7
diagnostic/support refs and repositories remain protected evidence while
`G2-X01` is open.

See `docs/development/M0_7_CLOSEOUT.md` for the full historical ledger.

## Active M2 boundary

M2 Gate 1 and Human Contract Review are complete. The frozen contract permits
one sentence-segmentation foundation:

- independent persisted `SegmentationLayer` / `Segment` entities;
- Unicode code-point coordinates over canonical TextVersion content;
- Human-reviewed sentence suggestions;
- complete partition, atomic replacement and stale-content guards;
- Alembic `0003`;
- a bounded Segmentation panel outside the canonical content root;
- full M0/M1 regression and fresh M2 Gate 2/Human acceptance.

Word/token segmentation, direct segment-to-tray behavior, linguistic
annotations, candidate/automatic alignment, NLP/LLM providers and layout or
connector-routing redesign remain outside M2.

Continue only on `m2-linguistic-segmentation-foundation`. Candidate freeze,
Gate 2, Human review, PR creation and merge remain separate later boundaries.
Do not recreate or reuse `m1-workbench-ui-foundation` or `m0.7-hardening`.

## Scope discipline

Do not introduce speculative NLP/LLM, translation, authentication,
collaboration, graph/vector infrastructure, advanced workspace geometry, or
other later-stage functionality without a separately approved contract.

Detailed M0 constraints remain defined by the frozen M0 specification; the
completed M1 presentation/interaction boundary remains defined by the frozen
M1 contract. This file records workflow state and does not replace either.
