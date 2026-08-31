# LinguaGraph Agent Instructions

## Authoritative M0 specification

For all work related to LinguaGraph M0, the authoritative specification is:

`docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`

Before planning, modifying files, installing dependencies, or writing implementation code:

1. Read this `AGENTS.md`.
2. Read `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` in full.
3. Treat its frozen principles, invariants, explicit non-goals, and Definition of Done as binding.
4. Do not silently override an architectural decision.
5. If repository reality conflicts with the specification, report the conflict and proposed minimal resolution before changing the affected architecture.
6. Do not broaden the active milestone.
7. Run and report every verification command required by the active execution contract.

## Current phase

The last completed implementation checkpoint is:

**M0.7 — Hardening (COMPLETE / MERGED / CLOSED)**

M0.1 through M0.7 have been human-reviewed and merged. M0 — Manual Alignment
Workbench is complete.

M0.7 durable provenance:

- PR #9 — `M0.7 — Hardening`;
- approved base: `7b3e61c547a7831275ae5fb01458ed0bdd7c202c`;
- final reviewed / externally proven implementation candidate:
  `580e27cbea09e50f40782a92da426e7332e8a54d`;
- candidate tree: `16c2bd3f5a8c5cb4960e193896547093fe091c87`;
- PR #9 merged by **rebase merge** after GitHub rejected merge-commit semantics
  under repository policy;
- durable implementation `main` tip immediately after merge:
  `697b019dc2820c67dacbc0b58a718e198ab655be`;
- durable implementation main tree:
  `16c2bd3f5a8c5cb4960e193896547093fe091c87`;
- therefore candidate → durable-main file-tree identity: **PASS / EXACT**.

M0.7 lifecycle:

- repository reality reconstruction / Gate 1: PASS;
- contract reconstruction and human freeze: PASS;
- bounded implementation and candidate freeze: PASS;
- Gate 2: **PASS under approved External Infrastructure Exception**;
- Static Human Diff Review: PASS;
- Human Runtime Acceptance: PASS;
- human merge decision: APPROVED;
- PR #9: MERGED;
- Gate 3 post-merge integrity: PASS;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS.

The External Infrastructure Exception is part of the M0.7 evidence record, not
an ADR replacement:

- GitHub Actions provider proof: **BLOCKED / EXTERNAL**;
- `G2-X01`: **OPEN / EXTERNAL**;
- CircleCI independent proof: PASS on exact candidate `580e27c…`;
- accepted external config lineage:
  `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`;
- ADR-009: unchanged.

The post-merge GitHub Actions runs continued to reproduce the same pre-step
hosted-runner failure (no executed job steps), so provider recovery has NOT
occurred and `G2-X01` remains open. If GitHub-hosted runners later recover,
rerun the frozen workflow on the then-current durable release lineage before
closing `G2-X01`.

Cleanup status:

- historical implementation branch `m0.7-hardening` was deleted locally and
  remotely after durable-state closure; GitHub independently returned 404 for
  the remote branch after deletion;
- diagnostic/support refs, CircleCI proof metadata/artifacts, the external
  config repository, and the public runner-probe repository remain retained
  evidence while `G2-X01` is open.

See `docs/development/M0_7_CLOSEOUT.md` for the full Gate 2 / Human Review /
merge / Gate 3 / cleanup evidence ledger.

## Active post-M0 checkpoint

The active implementation checkpoint is:

**M1 — Workbench Interaction & UI Foundation (CONTRACT FROZEN / HUMAN APPROVED)**

The authoritative M1 execution contract is:

`docs/development/M1_CONTRACT.md`

The approved pre-freeze durable base is:

`f77ad4d94a309d47507b4fe7297f0ccf436144a6`

The implementation branch is:

`m1-workbench-ui-foundation`

That branch must be created from the docs-only contract-freeze commit that
contains this instruction update and `docs/development/M1_CONTRACT.md`.
Implementation work must never be committed directly to `main`.

Before M1 implementation:

1. read this file;
2. read `docs/development/M1_CONTRACT.md` in full;
3. read the frozen M0 specification and the M0 ADRs needed to preserve the
   inherited invariants;
4. verify that the implementation branch descends exactly from the recorded
   contract-freeze commit;
5. keep every change inside the frozen M1 scope;
6. stop for Human Review if any contract STOP condition is encountered.

M1 is frontend-presentation and frontend-interaction work only. In particular,
M1 does not authorize database/schema/API/backend-domain changes, dependency
or runtime-baseline changes, ADR changes, linguistic segmentation, candidate
alignment, connector-routing redesign, workspace docking/resizing, or cleanup
of retained M0.7 proof evidence.

The M0.7 External Infrastructure Exception is historical and checkpoint-
specific. It must not be reused automatically for M1 Gate 2.

## Post-M0 governance rule

There is no authorized M0.8 implementation checkpoint.

M1 is authorized only by its frozen bounded contract. Later post-M0 milestones
are not authorized by the M0 pre-implementation future-stage discussion or by
M1 itself.

Before any later post-M0 implementation milestone:

- start a fresh checkpoint conversation;
- reconstruct repository reality from current `main`;
- identify or create the authoritative bounded execution contract for the next
  milestone;
- perform integrity/architecture review before implementation;
- obtain explicit human contract approval/freeze;
- only then create/use a new implementation branch.

Do not recreate or reuse the deleted historical `m0.7-hardening` branch as a
post-M0 implementation branch.

Do not reopen frozen architecture decisions silently. ADR-001 … ADR-009 and
the frozen M0 invariants remain the baseline until an explicitly governed
later decision changes them.

## Scope discipline

Do not introduce speculative NLP/LLM, translation, authentication,
collaboration, graph/vector infrastructure, or other later-stage functionality
without a separately approved post-M0 contract.

Detailed M0 constraints remain defined by the authoritative M0 specification;
this file records workflow/state, not a second architecture specification.
