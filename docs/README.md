# LinguaGraph — Engineering Documentation Index

This directory is the durable navigation index for LinguaGraph engineering
documentation. It helps a new human, ChatGPT conversation, or coding Agent
reconstruct the project without relying on chat history.

## Authority hierarchy

When sources appear to disagree, consult them in this order:

1. Accepted ADRs (`docs/adr/`) — frozen architecture decisions;
2. Authoritative pre-implementation documents
   (`docs/preimplementation/`) — frozen principles, invariants, Definition
   of Done;
3. `docs/development/CURRENT_STATE.md` — durable engineering handoff /
   navigation index (a summary, never a second architecture spec);
4. The repository itself: current `main`, Alembic migration history,
   executable tests, merged pull-request history.

Chat transcripts and agent exit reports are supporting context only and are
not authoritative engineering state.

## Document map

| Document | Purpose |
|---|---|
| `docs/development/CURRENT_STATE.md` | Durable engineering handoff: completed checkpoints, verification baselines, schema state, known limitations |
| `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` | Authoritative M0 specification (frozen) |
| `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` | Authoritative pre-implementation engineering report (frozen) |
| `docs/adr/ADR-001…ADR-009` | Accepted architecture decisions |
| `docs/architecture/ARCHITECTURE.md` | As-built architecture description (M0.7) |
| `docs/api/api-contract.md` | As-built HTTP API surface (M0.7) |
| `docs/testing/testing-strategy.md` | As-built testing architecture and evidence rules (M0.7) |
| `docs/testing/manual-acceptance.md` | Human-executable M0 walkthrough (M0.7) |
| `AGENTS.md` (repository root) | Agent working rules and current checkpoint phase |

## Quick start

- **Run the application** (Windows): `.\scripts\dev.ps1` from the repository
  root — see `docs/architecture/ARCHITECTURE.md` and the root `README.md`.
- **Prove the repository is green** (Windows): `.\scripts\verify.ps1` —
  see `docs/testing/testing-strategy.md`.
- **CI**: `.github/workflows/ci.yml` verifies the M0 release baseline on
  GitHub Actions (Python 3.13 / Node 24 / PostgreSQL 18 service container).
