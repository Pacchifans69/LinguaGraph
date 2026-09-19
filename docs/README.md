# LinguaGraph — Engineering Documentation Index

This directory is the durable navigation index for LinguaGraph engineering
documentation. It is intended to let a new human, ChatGPT conversation, or
coding Agent reconstruct the project without relying on chat history.

## Authority hierarchy

When sources appear to disagree, consult them in this order:

1. accepted ADRs (`docs/adr/`) — frozen architecture decisions;
2. authoritative pre-implementation documents (`docs/preimplementation/`) —
   frozen M0 principles, invariants, non-goals and Definition of Done;
3. `docs/development/CURRENT_STATE.md` — durable engineering handoff;
4. the repository itself: current `main`, Alembic history, executable tests,
   merged PR/Git history and retained CI evidence.

Chat transcripts and agent exit reports are supporting context only and are
not authoritative engineering state.

## Current milestone state

**M7 — Alignment Mutation Concurrency Hardening: COMPLETE / MERGED / CLOSED.**

PR #16 merged by rebase. The terminal reviewed PR-head tree
`d28126bca178db8ee9d17c737b820eacf6403d34` is exactly identical to
post-rebase implementation `main@f56b413f97742946b51e00a24b55f806cc5452f8`,
so M7 Gate 3 is **PASS / EXACT**. Post-merge durable-state closure is
`2e69f354c1134acbf9e2beb0c647f39a84499325` (tree
`fbc57302af2de73bbaa18edc276829d3c86d0dd6`). Exact-guarded cleanup deleted
only historical branch
`m7-alignment-mutation-concurrency-hardening@d769e018064dd1d6a529f7e043c7163b7e92c3ed`;
the remote branch is absent and durable `main` / proof `main` remained
unchanged.

See `docs/development/CURRENT_STATE.md` for Gate 2 proof provenance and full
lifecycle details.

M0.7's historical External Infrastructure Exception remains recorded in its
own closeout documents. Historical evidence classifications are not rewritten
by later milestone success.

## Document map

| Document | Purpose |
|---|---|
| `docs/development/CURRENT_STATE.md` | Current durable engineering handoff, lifecycle/provenance, schema baseline, known limitations and next-work rule |
| `docs/development/M0_7_CLOSEOUT.md` | M0.7 Gate 2 exception, Human Review/HRA, rebase-merge provenance and Gate 3 closeout ledger |
| `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` | Authoritative frozen M0 specification and Definition of Done |
| `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` | Accepted pre-implementation engineering report |
| `docs/adr/ADR-001…ADR-015` | Accepted architecture decisions through M7 |
| `docs/architecture/ARCHITECTURE.md` | As-built architecture through M7 |
| `docs/api/api-contract.md` | As-built HTTP API surface through M7 |
| `docs/testing/testing-strategy.md` | Test architecture plus local/GitHub/external evidence semantics |
| `docs/testing/manual-acceptance.md` | Human-executable M0 walkthrough used for M0.7 HRA |
| `AGENTS.md` (repository root) | Agent working rules and current phase |
| `README.md` (repository root) | Project overview, setup, run and verification entry points |

## Quick start

Run on PowerShell 7+:

```powershell
.\scripts\dev.ps1
```

Windows PowerShell 5.1 fallback when `.ps1` execution is blocked:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Local verification:

```powershell
.\scripts\verify.ps1
```

The canonical release-baseline workflow configuration is
`.github/workflows/ci.yml`, but workflow configuration is not execution
proof. At M0.7 closeout GitHub-hosted-runner execution remains externally
blocked; the accepted hosted proof is the exact-SHA CircleCI run documented in
`docs/development/M0_7_CLOSEOUT.md` and
`docs/testing/testing-strategy.md`.

## Post-M0

There is no authorized M0.8 checkpoint. Future-stage ideas in the M0
specification are architectural direction, not an implementation contract.
Any post-M0 work must start from current `main` under a new bounded,
human-approved checkpoint contract.
