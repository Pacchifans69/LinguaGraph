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

**M0.4 — Selection Engine (COMPLETE / MERGED)**

M0.1, M0.2, M0.3, and M0.4 have been human-reviewed, approved, and merged
into `main` (PR #1, PR #2, PR #5, and PR #6 respectively). M0.4 merged as
commit `b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad` from final implementation
head `2d0d4bcf6dd562e3cab003aa615049628c173999`, on the approved post-M0.3
base `46b255481518d079a5604a770b9d3036647f8a89`.

The pre-implementation baseline remains closed:
`docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` ends with
`ARCHITECTURE READY FOR BASELINE CLOSURE`, and ADR-001…ADR-009 are accepted
and frozen.

M0.3 delivered the document workspace: project/document HTTP CRUD,
TextVersion creation/import (JSON plain-text paste + strict UTF-8 `.txt`
multipart upload), metadata-only text-version PATCH and ADR-005
delete/force-delete, the workspace read model, the frontend
project/document/workspace route tree, TextVersion panels with
open/hide/reorder, per-document panel preferences, and the M0.3 test/E2E
slice.

M0.4 delivered the frontend selection engine: shared UTF-16 ↔ code-point
offset utilities (`apps/web/src/shared/text/`), native Selection/Range →
canonical code-point range mapping with fail-closed boundary validation,
reverse canonical → DOM Range location, boundary segmentation of canonical
text into flat runs using persisted Span boundaries, the canonical
`[data-text-content-root]` panel structure, `PendingSpan` current-selection
state, the pending Alignment Tray with explicit Add/remove/clear staging and
client-side duplicate/overlap validation, Escape cancellation, stale
TextVersion/content-hash reconciliation, and the M0.4 unit/component/E2E
slice. M0.4 did NOT implement alignment persistence — the complete atomic
Alignment create/update/delete service and its HTTP endpoints belong to
M0.5.

The next implementation checkpoint is:

**M0.5 — Alignment Persistence (NOT STARTED)**

M0.5 must NOT begin from this closeout task. Before any M0.5 implementation:

- start a fresh checkpoint conversation;
- reconstruct repository reality from current merged `main`;
- perform Gate 1;
- reconstruct the M0.5 checkpoint contract from the authoritative sources;
- obtain human contract review/freeze;
- only then create/use the bounded M0.5 implementation branch.

Do not pull M0.5/M0.6 work into M0.4.

Do not reopen frozen architecture decisions; if repository reality conflicts
with the specification, stop the affected implementation and report the
conflict.

## Scope discipline

Do not introduce speculative infrastructure or later-stage NLP/LLM functionality during M0.

Detailed constraints are defined by the authoritative M0 specification and must not be duplicated or paraphrased here.
