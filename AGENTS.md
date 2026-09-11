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

The completed frozen M5 execution contract is:

`docs/development/M5_CONTRACT.md`

The active frozen M6 execution contract is:

`docs/development/M6_CONTRACT.md`

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

M6 — Mode-Oriented Workbench Information Architecture — has a Human-approved
frozen execution contract in `docs/development/M6_CONTRACT.md`. The Human
subsequently authorized bounded implementation from the exact frozen main.

**M6 IMPLEMENTATION CANDIDATE IN PROGRESS / NOT MERGED.** Work is confined to
`m6-mode-oriented-workbench-information-architecture`. Gate 2, Human Static
Diff Review, Human Runtime Acceptance, PR creation, and merge remain separate
future decisions.

M6 contract-freeze coordinates:

- approved pre-freeze durable base:
  `6adcf78b18349621bb80d6ea35f93308c2f1d42a`;
- approved pre-freeze durable tree:
  `cf32f682539b8bf58f35660809e5f0c120720426`;
- governing contract: `docs/development/M6_CONTRACT.md`;
- planned implementation branch:
  `m6-mode-oriented-workbench-information-architecture`;
- implementation authorization: **GRANTED / BOUNDED**.

M6 is governed by the Human-approved A+ composition, mount-preserved editor
sessions, and mode-independent connector decision. It must keep the canonical
Text Canvas persistent, expose exactly one bounded task surface, retain compact
Alignment Tray status in every mode, and preserve all M0–M5 domain and
canonical-text invariants.

The M5 External Infrastructure Exception does not carry forward to M6. Any M6
exception requires new exact-candidate evidence and explicit Human approval at
M6 Gate 2.

M5 — Human-Reviewed POS Annotation Foundation — has completed its bounded
implementation, exact-candidate Gate 2, Human Static Diff Review, Human Runtime
Acceptance, PR #14, explicit Human Merge Decision, rebase merge, Gate 3 exact
tree verification, post-merge durable-state closure, and exact-guarded
implementation-branch cleanup. M5 is therefore **COMPLETE / MERGED / CLOSED**.

M5 durable implementation provenance:

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
- PR #14 — `M5 — Human-Reviewed POS Annotation Foundation`;
- merge method: rebase;
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
- governing contract: `docs/development/M5_CONTRACT.md`;
- decision record:
  `docs/adr/ADR-013-token-occurrence-coarse-pos-annotations.md`.

M5 implementation-branch cleanup is **PASS / EXACT-GUARDED**. The Human guard
required durable `main@3c02f5fd087edce0f12692f901a697667ecfd31a`
and exact branch
`m5-human-reviewed-pos-annotation-foundation@139f3349b8556f5dd13d5c2d8808fda4a79dc819`.
Both matched before deletion; the remote branch was deleted; the post-delete
remote `main` remained exactly `3c02f5fd087edce0f12692f901a697667ecfd31a`.
GitHub independently returned `404 Branch not found` for the branch endpoint
and an empty branch-search result. The reviewed candidate commit remains
addressable by SHA and PR #14 remains retained as merged provenance.

M5 Gate 2 passed under the Human-approved M5-specific External Infrastructure
Exception. The exception waived only successful execution specifically on a
GitHub-hosted runner; it did not waive exact candidate/tree/base provenance,
hosted Linux, Python 3.13, Node 24, PostgreSQL 18, frozen dependency
installation, migration integrity, full PostgreSQL tests with zero skips,
frontend verification, Playwright coverage, cleanup, dependency integrity, or
tracked-tree integrity.

Accepted independent hosted proof:

- repository: `Pacchifans69/linguagraph-m5-proof`;
- proof commit: `4cf38bc3dee0c312d072ef2cc47ebdb821b32465`;
- proof tree: `a59a66ec392f418bf7e23d1cab67eae61f4810a4`;
- CircleCI build/pipeline: `#2`;
- status context: `ci/circleci: m5-exact-candidate-proof`;
- result: **SUCCESS**.

Canonical GitHub Actions run `34564666636` targeted the corrected exact
candidate and reproduced `G2-X01`: the verification job failed before any
repository-defined workflow step, with `steps=[]` and unavailable/empty logs.
PR-event run `34586589640`, post-merge `main` run `34587072906`, and durable
closure run `34588391377` reproduced the same pre-step fingerprint. `G2-X01`
therefore remains **OPEN / EXTERNAL**; none of these runs constitutes
application failure evidence.

Human Static Diff Review: **PASS**.

Human Runtime Acceptance: **PASS WITH HUMAN-APPROVED UX DEFERRAL**.

`HRA-F01` — Workbench information architecture / panel density — remains
**OPEN / ACTIVE M6 TARGET**. It is a real Human finding, was not resolved by
M5, and is the first contract input and required Human Runtime Acceptance
closure target of M6. Contract freeze alone does not resolve it.

M4 — Human-Reviewed Lemma Annotation Foundation — is
**COMPLETE / MERGED / CLOSED**.

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
Exception. Accepted proof remains retained at
`Pacchifans69/linguagraph-m4-proof@c66de6b0bf2ef7ae30644cea29ef6a8beaf45b4f`
(tree `33c101ceb1cf6449f8e5f23d0592a0a320bb1d03`), CircleCI build #1 SUCCESS.
`G2-X01` remained `OPEN / EXTERNAL` and continues to remain open after M5.

No unresolved M4 product defect is known. `HRA-F09` remains inherited,
explicitly deferred visual debt.

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

The M0.7 exception and proof do not serve as later-checkpoint evidence.
Retained diagnostic/support refs and repositories remain protected evidence
while `G2-X01` is open.

See `docs/development/M0_7_CLOSEOUT.md` for the full historical ledger.

## Post-M5 / M6 boundary

M5 is complete, merged, durably recorded, and closed. The exact reviewed
candidate and the post-rebase implementation `main` share tree
`179aba060d5e798ace46ea6bed0a7c496a50e9ad`, so Gate 3 is **PASS / EXACT**.
The Human-authorized exact-guarded deletion of the historical implementation
branch is independently verified by GitHub endpoint 404 plus an empty branch
search, with durable `main@3c02f5fd087edce0f12692f901a697667ecfd31a`
unchanged after deletion.

All proof repositories, successful CircleCI evidence, GitHub Actions
diagnostics, PR history, and reviewed candidate history remain retained.
`G2-X01` remains `OPEN / EXTERNAL`; `HRA-F01` remains open as the active M6
Human acceptance target.

M6 — Mode-Oriented Workbench Information Architecture — is now the active
frozen normative checkpoint. Bounded candidate implementation is authorized
only on `m6-mode-oriented-workbench-information-architecture`. Do not create a
PR or merge without separate Human authorization.

## Scope discipline

The completed M5 occurrence-level coarse-POS boundary remains governed by
`M5_CONTRACT.md` and ADR-013. Do not retroactively broaden it by introducing
`PUNCT`/`SYM` tagging, XPOS, morphology, syntax, automatic POS tagging,
speculative NLP/LLM automation, Lexeme/shared-vocabulary identity, generic
annotation ontology, translation, authentication, collaboration, graph/vector
infrastructure, Alignment concurrency redesign, or unrelated backend changes
without a separately governed checkpoint.

Detailed M0 constraints remain defined by the frozen M0 specification; the
completed M1 interaction boundary remains defined by `M1_CONTRACT.md`;
completed M2/M3 segmentation boundaries remain defined by their contracts; the
completed M4 occurrence-level lemma boundary remains defined by
`M4_CONTRACT.md` and ADR-012; and the completed M5 coarse-POS boundary remains
defined by `M5_CONTRACT.md` and ADR-013. The active M6 information-architecture
boundary is defined by `M6_CONTRACT.md`; ADR-014 records the candidate's
mode-oriented implementation decision without broadening that contract.

This file records workflow state and does not replace those authorities.
