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

The completed frozen M6 execution contract is:

`docs/development/M6_CONTRACT.md`

The active frozen M7 execution contract is:

`docs/development/M7_CONTRACT.md`

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

M7 — Alignment Mutation Concurrency Hardening — is **FROZEN / HUMAN APPROVED /
IMPLEMENTATION NOT YET AUTHORIZED**.

The frozen M7 execution contract is
`docs/development/M7_CONTRACT.md`. Approved pre-freeze durable base:

`e0b50eb647ae8901a8ff574e7b4d1aa2d6c41107`

Approved pre-freeze durable tree:

`5b659f23f21d4fd96e4b5cb87f970b575b975ccf`

Planned implementation branch:

`m7-alignment-mutation-concurrency-hardening`

The freeze does not authorize branch creation, application/test changes,
ADR-015, proof execution, or provider mutation. M7 freezes
`ParallelDocument → sorted participating TextVersion` as the canonical
serialization order for scoped Alignment/TextVersion concurrency, with
pre-lock reads limited to root locators and authoritative state re-resolved
under locks. Project/ParallelDocument deletion remains audit-only unless
evidence is returned for separate Human scope review.

The latest completed implementation checkpoint remains M6 — Mode-Oriented
Workbench Information Architecture — **COMPLETE / MERGED / CLOSED**. Gate 2,
Human review, PR #15 rebase merge, Gate 3 exact tree identity, durable-state
closure, and exact-guarded implementation-branch cleanup have all completed.

Durable M6 implementation provenance:

- frozen Product `main`:
  `cb61725fe9f05c704a6f80b67c6343f49ade9234` (tree
  `839705a3577652d1f9127a737a9535fe7f025d60`);
- final reviewed / independently proven candidate:
  `6af2c25e172d81725b97037945e38c047fba9941`;
- candidate tree:
  `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`;
- candidate unique parent:
  `773aae151766038a451ee5b18f5923467b8a3e56`;
- PR #15 — `M6 — Mode-Oriented Workbench Information Architecture`:
  **MERGED BY REBASE** after explicit Human Merge Decision;
- post-rebase implementation `main`:
  `afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7`;
- post-rebase implementation tree:
  `7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`;
- candidate → post-rebase `main` tree identity:
  **PASS / EXACT**;
- post-merge durable-state closure:
  `f66b6e51e0925d635a0c512969d60de497ed01d2` (tree `7aeaf56384ddd04ed14a29c64ae215b71eff70f4`);
- implementation-branch cleanup:
  **PASS / EXACT-GUARDED**; the historical branch
  `m6-mode-oriented-workbench-information-architecture@6af2c25e172d81725b97037945e38c047fba9941` was deleted only after exact main/branch guards passed;
  post-delete `main` remained exactly `f66b6e51e0925d635a0c512969d60de497ed01d2`; GitHub independently
  returned `404 Branch not found` and an empty branch-search result; the
  candidate commit remains addressable by SHA and PR #15 remains merged.

Final exact-candidate Gate 2 evidence:

- proof repository:
  `Pacchifans69/linguagraph-m6-proof`;
- proof source:
  `274aae9f86fb8da9571edf1e197696035d6fb4a3` (tree `b331cd16642ba2c293bb6b83d2310f85b2af35e6`, parent `1c05663a2e90918e5de98631a9209a7f76822cdc`);
- provider:
  Alibaba ECS, instance `i-j6c13vpnkuq6xbbhyxzw`;
- C5 exact-candidate hosted execution:
  **PASS / COMPLETE / independently verified off-host**;
- backend pytest:
  **587 passed**;
- Vitest:
  **35 files / 519 passed**;
- Playwright:
  **32 passed / retries=0**;
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

The current candidate is the bounded PR-review corrective successor of the
earlier HRA-approved application epoch `a5a981db77e33905f2c71c234616c6779e3ebc6c`.
Fresh Human Runtime Acceptance completed on that application epoch; the later
bounded corrective successor received corrective Static Human Diff Review and
fresh exact-candidate hosted proof. `HRA-F01` remains **CLOSED / HUMAN
ACCEPTED**. `HRA-F09` remains **OPEN / DEFERRED / NON-BLOCKING**.

`C5-P01` is retained as a procedural deviation: during C5 orchestration the
raw one-shot authorization token was briefly staged in a root-only `0600`
temporary file before process-environment injection, then removed before
adapter execution. It is **non-semantic / non-blocking for proof validity**;
the raw token is absent from the retained proof archive, no rerun is authorized,
and the spent authorization must not be reused.

Automatic GitHub Actions did not supply semantic execution evidence for the
final candidate or post-merge main. Candidate run #114 and post-merge main push
run #115 / `35363051019` both failed before any repository-defined step
(`steps=[]`, logs unavailable / `BlobNotFound`). These are retained
provider/pre-step diagnostics, not application/test failures.

After proof completion and off-host archive verification, the proof ECS was
normally stopped in **economical mode**. Instance identity
`i-j6c13vpnkuq6xbbhyxzw` and private IPv4 `172.23.68.215` are retained; the
former system-assigned public IPv4 was released. This is post-proof operational
state, not Product correctness evidence.

Do not rerun the spent C5 authorization. The proof repository and provider
remain retained evidence and were not modified by M6 branch cleanup.

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

`HRA-F01` — Workbench information architecture / panel density — was **OPEN /
ACTIVE M6 TARGET** at M5 close. It is a real Human finding, was not resolved by
M5, and became the first contract input and required Human Runtime Acceptance
closure target of M6. It has since been **CLOSED / HUMAN ACCEPTED** by the M6
Human Runtime Acceptance for application epoch
`a5a981db77e33905f2c71c234616c6779e3ebc6c`.

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
`G2-X01` remained `OPEN / EXTERNAL` for the M4 epoch and through M5; it is
**CLOSED / PASS** for final exact M6 candidate
`6af2c25e172d81725b97037945e38c047fba9941`, established by C5 proof
`274aae9f86fb8da9571edf1e197696035d6fb4a3`.

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

## Post-M6 boundary

M6 implementation was merged by rebase through PR #15. The reviewed/proven
candidate `6af2c25e172d81725b97037945e38c047fba9941` and post-rebase implementation
`main@afdb7f903db36de9a5ee2ea4cb41cba88ac23cc7` share the exact tree
`7211a28ca5c4bcd708e92e88223cdb2b5d98dd4c`, so Gate 3 is **PASS / EXACT**.

The post-merge durable-state closure is `f66b6e51e0925d635a0c512969d60de497ed01d2` with tree
`7aeaf56384ddd04ed14a29c64ae215b71eff70f4`. Exact-guarded cleanup then deleted only the historical
`m6-mode-oriented-workbench-information-architecture` ref after verifying durable `main@f66b6e51e0925d635a0c512969d60de497ed01d2` and exact
branch head `6af2c25e172d81725b97037945e38c047fba9941`. Post-delete `main` remained unchanged; GitHub
independently returned `404 Branch not found` and an empty branch-search
result. The candidate commit, PR #15, proof repository, off-host archive, and
provider diagnostics remain retained provenance.

M6 is therefore **COMPLETE / MERGED / CLOSED**.

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
defined by `M5_CONTRACT.md` and ADR-013. The completed M6 information-
architecture boundary is defined by `M6_CONTRACT.md`; ADR-014 records the
accepted mode-oriented implementation decision without broadening that
contract.

This file records workflow state and does not replace those authorities.
