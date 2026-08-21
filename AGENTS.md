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

**M0.6 — Alignment Visualization (COMPLETE / MERGED)**

M0.1, M0.2, M0.3, M0.4, M0.5, and M0.6 have been human-reviewed, approved,
and merged into `main` (PR #1, PR #2, PR #5, PR #6, PR #7, and PR #8
respectively). M0.6 merged as commit
`55442d4ce7f71bd28c3368de641802f942e57055` from final reviewed
implementation head `f86d6429d41e76d4093e08898a9e7879e3774c49`, on the
approved base `aea0a45e740bb9400c7e6dc25fcc88e956a25ee0` (reviewed lineage:
`f8d53d7` foundation → `fa44a76` Round 1 fixes → `e343379` Inspector →
`f86d642` Round 2 fixes). The merge commit has no file-tree difference from
the reviewed head.

The pre-implementation baseline remains closed:
`docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` ends with
`ARCHITECTURE READY FOR BASELINE CLOSURE`, and ADR-001…ADR-009 are accepted
and frozen.

M0.6 delivered, frontend-only, the complete visualization/edit/delete loop
of the M0 golden path: persisted-alignment annotation indicators and
document-scoped `hoveredAlignmentId`/`activeAlignmentId` ephemeral state
with `active ?? hover` connector precedence; the `RenderedSpanRegistry`
(`Map<spanId, HTMLElement[]>` — the canonical span→DOM bridge, never
selector-discovered) plus the SVG `ConnectorOverlay` with viewport-clipped
multi-ClientRect geometry, deterministic nearest-hub anchors,
rAF-coalesced recomputation, explicit panel-layout invalidation and
stale-geometry provenance; the deterministic overlap ambiguity chooser;
keyboard-accessible persisted-alignment activation; and the Alignment
Inspector (note editing with `note: null` semantics, member removal via
backend PATCH full-replacement, delete with target-scoped destructive
confirmation, same-group mutation freeze extending through the
authoritative workspace refetch, stable mutation errors, no optimistic
persisted-domain state — the authoritative workspace snapshot remains the
read authority). The golden-path E2E now proves the four-language
EN/DE/FR/ES visualization, note persistence, reorder/hide-show connector
recomputation, member removal, reload persistence, deletion and orphan Span
cleanup, with the M0.3–M0.5 historical proof preserved.

The next implementation checkpoint is:

**M0.7 — Hardening (NOT STARTED)**

M0.7 must NOT begin from this closeout task. Before any M0.7 implementation:

- start a fresh checkpoint conversation;
- reconstruct repository reality from current merged `main`;
- perform Gate 1;
- reconstruct the M0.7 checkpoint contract from the authoritative sources;
- obtain human contract review/freeze;
- only then create/use the bounded M0.7 implementation branch.

Do not pull M0.7 work into M0.6. Do not reuse
`m0.6-alignment-visualization` as the M0.7 base.

Do not reopen frozen architecture decisions; if repository reality conflicts
with the specification, stop the affected implementation and report the
conflict.

## Scope discipline

Do not introduce speculative infrastructure or later-stage NLP/LLM functionality during M0.

Detailed constraints are defined by the authoritative M0 specification and must not be duplicated or paraphrased here.
