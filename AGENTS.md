# LinguaGraph Agent Instructions

## Authoritative specifications

For all work that inherits the M0 product and architecture baseline, the
authoritative frozen specification is:

`docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`

The completed M1 execution contract is:

`docs/development/M1_CONTRACT.md`

The completed M2 execution contract is:

`docs/development/M2_CONTRACT.md`

The completed frozen M3 execution contract is:

`docs/development/M3_CONTRACT.md`

The completed frozen M4 execution contract is:

`docs/development/M4_CONTRACT.md`

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

M4 — Human-Reviewed Lemma Annotation Foundation — has completed bounded
implementation, Gate 2, Static Human Diff Review, Human Runtime Acceptance,
PR #13, Human Merge Decision, rebase merge, Gate 3 exact-tree verification,
and this docs-only durable-state closure.

Exact-guarded implementation-branch cleanup remains a separate final M4
closeout step. Do not claim full M4 checkpoint closure until that cleanup has
passed.

M4 durable implementation provenance:

- approved pre-freeze durable base:
  `3cada0d2dcdcf349152aacc53992b15190271a75`;
- frozen implementation base:
  `4e12a11e266367e0a368c6128f722a620ce47ed3`;
- frozen base tree:
  `f3b09f9d9934686a07bdbbe7944f22d2df76f6e2`;
- implementation branch:
  `m4-human-reviewed-lemma-annotation-foundation`;
- final reviewed and independently proven candidate:
  `ac1cd40ae190577783453050f2cbc209cd3958a6`;
- candidate tree:
  `18eff900b903d7f3743aa88fa9390d3dbdebc477`;
- PR #13 — `M4 — Human-Reviewed Lemma Annotation Foundation`;
- merge method: rebase;
- post-rebase implementation `main`:
  `4cc435893207cdd32216012ca887d338e1932250`;
- post-rebase implementation tree:
  `18eff900b903d7f3743aa88fa9390d3dbdebc477`;
- candidate → post-rebase `main` tree identity:
  **PASS / EXACT**.

M4 Gate 2 passed under the Human-approved M4-specific External Infrastructure
Exception. The exception waived only successful execution specifically on a
GitHub-hosted runner; it did not waive exact candidate identity, hosted Linux,
Python 3.13, Node 24, PostgreSQL 18, frozen dependency installation,
migration integrity, full PostgreSQL tests with zero skips, frontend
verification, Playwright coverage, cleanup, or tree integrity.

Accepted independent hosted proof:

- repository: `Pacchifans69/linguagraph-m4-proof`;
- proof commit: `c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f`;
- proof tree: `33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`;
- CircleCI build/pipeline: `#1`;
- status context: `ci/circleci: m4-exact-candidate-proof`;
- result: **SUCCESS**.

Canonical GitHub Actions run #80 / `34245187052` targeted the exact corrected
candidate and reproduced `G2-X01`: the verification job failed before any
workflow step began, with no usable job logs. `G2-X01` therefore remains
`OPEN / EXTERNAL`.

Static Human Diff Review passed with no blocking M4 finding. Human Runtime
Acceptance passed the lemma create/reload/edit/delete lifecycle, dependency
blocking, Unicode behavior, Alignment independence, and canonical-DOM/UI
boundary. The initial missing-panel observation was traced to stale Windows
services from a separate local checkout at
`C:/Users/ZJX/Desktop/LinguaGraph`, not to the exact WSL candidate.

No unresolved M4 product defect is known. `HRA-F09` remains inherited,
explicitly deferred visual debt.

No M5 or later implementation checkpoint is authorized by M4 completion.

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

## Post-M4 boundary

M4 implementation is merged and durably recorded. The retained implementation
branch
`m4-human-reviewed-lemma-annotation-foundation@ac1cd40ae190577783453050f2cbc209cd3958a6`
exists only for the separately authorized exact-guarded branch-cleanup stage.

Branch deletion must not occur merely because PR #13 is merged. Before
deletion, the Human must separately authorize cleanup and the guard must prove
both the then-current durable `main` closure coordinate and the exact retained
candidate SHA.

All proof repositories, successful CircleCI evidence, GitHub Actions
diagnostics, PR history, and reviewed candidate history remain retained.
`G2-X01` remains `OPEN / EXTERNAL`.

No M5 or later checkpoint has been reconstructed, frozen, or authorized.

## Scope discipline

Do not introduce speculative NLP/LLM automation, automatic lemmatization,
Lexeme/shared-vocabulary identity, generic annotation ontology, translation,
authentication, collaboration, graph/vector infrastructure, advanced
workspace geometry, connector-routing redesign, or other later-stage
functionality without a separately reconstructed and Human-frozen later
checkpoint.

Detailed M0 constraints remain defined by the frozen M0 specification; the
completed M1 interaction boundary remains defined by `M1_CONTRACT.md`;
completed M2/M3 segmentation boundaries remain defined by their contracts; and
the completed M4 occurrence-level lemma boundary remains defined by
`M4_CONTRACT.md` and ADR-012.

This file records workflow state and does not replace those authorities.
