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

**M0.5 — Alignment Persistence (COMPLETE / MERGED)**

M0.1, M0.2, M0.3, M0.4, and M0.5 have been human-reviewed, approved, and
merged into `main` (PR #1, PR #2, PR #5, PR #6, and PR #7 respectively).
M0.5 merged as commit `8d1a57b41f2fb717faca02f3162b4770e62ffbff` from final
reviewed implementation head `b6714d6454063b6c656631fe63fc23e6813d28f4`, on
the approved base `0f8bccd721e9659f1f75074a2e9638d05f27800f`.

The pre-implementation baseline remains closed:
`docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` ends with
`ARCHITECTURE READY FOR BASELINE CLOSURE`, and ADR-001…ADR-009 are accepted
and frozen.

M0.5 closed the core persistence loop — native selection → PendingSpan →
Alignment Tray → Create Alignment → atomic backend persistence →
workspace refetch → reload-verified persistence. The backend delivers the
complete atomic Alignment create/update/delete service with
concurrency-safe Span get-or-create (PostgreSQL `ON CONFLICT`),
server-derived exact_text/prefix/suffix from canonical content,
coordinate-only member input, all frozen alignment invariants, PATCH
note/full-member-replacement semantics with explicit `updated_at`
advancement, orphan-Span cleanup compatible with the ADR-005 destructive
reset, and the transaction-clean Session contract. The HTTP surface is
`POST /api/v1/documents/{document_id}/alignments`, `PATCH`/`DELETE
/api/v1/alignments/{alignment_id}` with the stable `{code, message,
details}` envelope. The frontend adds the Create Alignment action
(validity: >=2 members from >=2 distinct TextVersions; backend remains
authoritative), in-flight tray/staging freeze, document-scoped
create-mutation isolation, stable error display with the tray retained on
failure, a minimal read-only persisted-alignment representation driven by
the authoritative workspace refetch, and reload-surviving persistence.

M0.5 did NOT implement M0.6 work: hover/active counterpart visualization,
SVG connectors, connector geometry, RenderedSpanRegistry, and the
Alignment Inspector remain assigned to M0.6.

The next implementation checkpoint is:

**M0.6 — Alignment Visualization (NOT STARTED)**

M0.6 must NOT begin from this closeout task. Before any M0.6 implementation:

- start a fresh checkpoint conversation;
- reconstruct repository reality from current merged `main`;
- perform Gate 1;
- reconstruct the M0.6 checkpoint contract from the authoritative sources;
- obtain human contract review/freeze;
- only then create/use the bounded M0.6 implementation branch.

Do not pull M0.6/M0.7 work into M0.5.

Do not reopen frozen architecture decisions; if repository reality conflicts
with the specification, stop the affected implementation and report the
conflict.

## Scope discipline

Do not introduce speculative infrastructure or later-stage NLP/LLM functionality during M0.

Detailed constraints are defined by the authoritative M0 specification and must not be duplicated or paraphrased here.
