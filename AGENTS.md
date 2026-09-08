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

M3 — Human-Reviewed Word/Token Segmentation Foundation — is complete.

Durable provenance:

- contract-freeze parent: `f0d205fea996a5027d469255987c63b7ade17b51`;
- contract-freeze commit: `fa861409947705f658209e53b8c507b535c5233a`;
- reviewed implementation candidate: `d4254c1239e649b17dc4ae6d6f995e52bd4635db`;
- reviewed/merged application tree: `bf59e847b8874c90b76032e92fb006343b4662d6`;
- PR: `#12`, merged by rebase;
- post-merge `main`: `fc607b597bee35aff31a06a3945fa7a256f6b5c8`.

Gate 2 passed under the M3 External Infrastructure Exception using independent
hosted Linux proof repository `Pacchifans69/linguagraph-m3-proof`, proof
commit `2e95d307374bc279f42d1048caf988d2b730169c`, and successful CircleCI
pipeline `#5`. GitHub-hosted runner execution remains blocked before any
step starts, so `G2-X01` remains `OPEN / EXTERNAL`.

Bounded Static Human Diff Review and Human Runtime Acceptance passed. Retain a
non-blocking comprehension note: Word-like classifies tokens; deleting tokens
removes the complete token layer.

M2 remains the previous completed architecture checkpoint.

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

## Post-M3 boundary

No checkpoint after M3 is authorized. M3 implementation is merged and closed.
The retained branch
`m3-word-token-segmentation-foundation@d4254c1239e649b17dc4ae6d6f995e52bd4635db`
may be deleted only under separately approved exact-SHA guard.

All proof and diagnostic evidence must remain retained. `G2-X01` remains
`OPEN / EXTERNAL`.

## Scope discipline

Do not introduce speculative NLP/LLM, translation, authentication,
collaboration, graph/vector infrastructure, advanced workspace geometry, or
other later-stage functionality without a separately approved contract.

Detailed M0 constraints remain defined by the frozen M0 specification; the
completed M1 presentation/interaction boundary remains defined by the frozen
M1 contract. This file records workflow state and does not replace either.
