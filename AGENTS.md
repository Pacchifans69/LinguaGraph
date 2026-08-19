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

**M0.3 — Document Workspace (COMPLETE / MERGED)**

The most recent implementation checkpoint is:

**M0.4 — Selection Engine (IMPLEMENTED — AWAITING HUMAN REVIEW)**

M0.1, M0.2, and M0.3 have been human-reviewed, approved, and merged into
`main` (PR #1, PR #2, and PR #5 respectively). M0.3 merged as commit
`1230ffe0282adac3a20c1aafac6c2271c788b198` from final implementation head
`33bfaef20c2e64bed92fe00aa147d74611ac41ad`.

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

M0.4 implements the frontend selection engine: shared UTF-16 ↔ code-point
offset utilities (`apps/web/src/shared/text/`), native Selection/Range →
canonical code-point range mapping with fail-closed boundary validation,
reverse canonical → DOM Range location, boundary segmentation of canonical
text into flat runs using persisted Span boundaries, the canonical
`[data-text-content-root]` panel structure, `PendingSpan` current-selection
state, the pending Alignment Tray with explicit Add/remove/clear staging and
client-side duplicate/overlap validation, Escape cancellation, stale
TextVersion/content-hash reconciliation, and the M0.4 unit/component/E2E
slice. The complete atomic Alignment create/update/delete service and its
HTTP endpoints belong to M0.5; the frontend selection engine is done.

M0.5 has NOT started.

Do not begin M0.5 until M0.4 has been human-reviewed, approved, and merged
into main.

Do not pull M0.5/M0.6 work into M0.4.

Do not reopen frozen architecture decisions; if repository reality conflicts
with the specification, stop the affected implementation and report the
conflict.

## Scope discipline

Do not introduce speculative infrastructure or later-stage NLP/LLM functionality during M0.

Detailed constraints are defined by the authoritative M0 specification and must not be duplicated or paraphrased here.
