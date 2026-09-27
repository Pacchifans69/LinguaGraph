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

**M8 — Alignment Connector Obstacle-Avoiding Routing: COMPLETE / MERGED /
CLOSED.**

PR #17 merged by rebase. Terminal reviewed PR-head tree
`a6abdd4cedb9311586d3c25c6a9b48ad4d25c9cd` is exactly identical to
post-rebase implementation `main@4d9cc80b7c6b89b9990c37a2ec41e69e690852d3`,
so M8 Gate 3 is **PASS / EXACT**. Post-merge durable-state closure and
exact-guarded implementation-branch cleanup are complete. The final
branch-cleanup durable record is
`main@f5aead8ad2012bd558ae898d50f1e4317ad8629b` (tree
`6a65495fe6020d0773cef7a1e2ff64078db24a64`); historical branch
`m8-alignment-connector-obstacle-avoiding-routing` is absent and proof
`main@6ac44484aebc58aac866bfb69f05960189b0aefc` remains unchanged.

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
| `docs/adr/ADR-001…ADR-016` | Accepted architecture decisions through M8 |
| `docs/architecture/ARCHITECTURE.md` | As-built architecture through M8 |
| `docs/api/api-contract.md` | As-built HTTP API surface; unchanged by M8 |
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
