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

The project is currently in:

**M0.1 — Repository Foundation (implementation in progress)**

The pre-implementation baseline is closed: `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md`
ends with `ARCHITECTURE READY FOR BASELINE CLOSURE`, and ADR-001…ADR-009 are
accepted and frozen.

Do not begin M0.2 before the M0.1 checkpoint ends with:

`M0.1 READY FOR HUMAN REVIEW`

Do not reopen frozen architecture decisions; if repository reality conflicts
with the specification, stop the affected implementation and report the
conflict.

## Scope discipline

Do not introduce speculative infrastructure or later-stage NLP/LLM functionality during M0.

Detailed constraints are defined by the authoritative M0 specification and must not be duplicated or paraphrased here.