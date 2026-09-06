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

The current completed architecture checkpoint is:

**M2 — Linguistic Segmentation Foundation
(COMPLETE / MERGED / CLOSED)**

M2 was implemented under the frozen `docs/development/M2_CONTRACT.md`
boundary and closed after Gate 2, bounded Static Human Diff Review, Human
Runtime Acceptance, explicit PR/merge authorization, rebase merge, and Gate 3
tree-identity verification.

### M2 durable provenance

- approved pre-freeze durable base:
  `8ad87aaa789d86535adf3aed34035317c515b6e6`;
- docs-only contract-freeze / implementation base:
  `59e39ac436d8b1e3b4a29992b80fe72f3be2b13f`;
- implementation branch:
  `m2-linguistic-segmentation-foundation`;
- final reviewed and independently proven candidate:
  `7cf756694e429abc50bf604ab2757fb3e44959c6`;
- candidate tree:
  `cbdd9e77407a6bd853a4856ca7a927da679d3ed3`;
- PR #11 — `M2 — Linguistic Sentence Segmentation Foundation`;
- repository policy permitted rebase merge only;
- durable implementation `main` tip immediately after merge:
  `8972609a86d15d411917aafe6cf02c4577b7176f`;
- durable implementation tree:
  `cbdd9e77407a6bd853a4856ca7a927da679d3ed3`;
- candidate → durable implementation tree identity:
  **PASS / EXACT**.

### M2 lifecycle

- repository reconstruction / Gate 1: PASS;
- contract reconstruction and Human freeze: PASS;
- bounded implementation and candidate freeze: PASS;
- Gate 2: **PASS under the approved M2 External Infrastructure Exception**;
- bounded Static Human Diff Review: PASS;
- Human Runtime Acceptance: PASS in Edge and Chrome at 1280 × 720 and
  1440 × 900;
- Human Merge Decision: APPROVED;
- PR #11: MERGED by rebase;
- Gate 3 post-merge integrity: PASS;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS under an exact-SHA guard.

The M2 exception waived only successful proof specifically on a GitHub-hosted
runner. It did not waive semantic gates, runtime baselines, hosted Linux,
provenance, cleanup, or tree integrity.

Accepted M2 independent proof:

- repository: `Pacchifans69/linguagraph-m2-proof`;
- executable proof commit:
  `bf1be70ad3115f4474fe432eef4db2c05394e128`;
- proof tree:
  `eec06a88e2682a436e24fbdd9bc0dcac58301e58`;
- CircleCI pipeline #6:
  `ci/circleci: m2-exact-candidate-proof` — PASS;
- exact application candidate/tree:
  `7cf756694e429abc50bf604ab2757fb3e44959c6` /
  `cbdd9e77407a6bd853a4856ca7a927da679d3ed3`;
- retained proof artifacts: 40.

GitHub Actions exact-candidate push run #53, PR run #54, and post-merge `main`
run #55 all failed before any workflow step began. Their jobs expose zero
steps and no usable logs. GitHub Actions provider proof remains
**BLOCKED / EXTERNAL**, and `G2-X01` remains **OPEN / EXTERNAL**. No provider
internal root cause is asserted.

The previous completed implementation checkpoint remains:

**M1 — Workbench Interaction & UI Foundation
(COMPLETE / MERGED / CLOSED)**

M0.1 through M0.7 and M1 remain human-reviewed, merged, durably recorded, and
closed. The historical M1 implementation branch was removed after its
durable-state closure. See `docs/development/CURRENT_STATE.md` for the durable
M1 evidence ledger and `docs/development/M1_CONTRACT.md` for its frozen
contract.

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

## Post-M2 boundary

M2 is complete, merged, and durably recorded. Its delivered boundary is:

- independent persisted `SegmentationLayer` / `Segment` entities;
- Unicode code-point coordinates over canonical TextVersion content;
- Human-reviewed sentence suggestions;
- complete partition, atomic replacement and stale-content guards;
- Alembic `0003`;
- a bounded Segmentation panel outside the canonical content root;
- preserved M0/M1 Alignment and canonical-DOM semantics.

Word/token segmentation, direct segment-to-tray behavior, linguistic
annotations, candidate/automatic alignment, NLP/LLM providers, and
connector-routing redesign remain outside the completed M2 scope.

No M3 or later implementation is authorized by M2 closure. Any next
architecture checkpoint requires repository-reality reconstruction, a bounded
contract, Human freeze, and explicit implementation authorization.

The historical M2 implementation branch was deleted only after the Human-run
guard verified `origin/main@557a31825accf2d7c789df4ca211d7cb1bfe723b`
and the branch at exact candidate
`7cf756694e429abc50bf604ab2757fb3e44959c6`. GitHub independently returns
HTTP 404 for that branch. Do not delete or rewrite M2, M1, or M0.7 proof
repositories, diagnostic refs, workflow history, or retained artifacts while
`G2-X01` remains open.

## Scope discipline

Do not introduce speculative NLP/LLM, translation, authentication,
collaboration, graph/vector infrastructure, advanced workspace geometry, or
other later-stage functionality without a separately approved contract.

Detailed M0 constraints remain defined by the frozen M0 specification; the
completed M1 presentation/interaction boundary remains defined by the frozen
M1 contract. This file records workflow state and does not replace either.
