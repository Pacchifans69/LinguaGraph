# ADR-006: AlignmentGroup as N:M hyperedge

## Status
Accepted (frozen for M0)

## Context
Manual alignment can connect 1:1, 1:N, N:1, N:M, and multiple spans from the same TextVersion (future discontinuous correspondence). A pairwise `source_span_id`/`target_span_id` model cannot represent these.

## Decision
AlignmentGroup is a hyperedge represented by an `alignment_members` join table. Each member references one Span. An AlignmentGroup can have any number of members (minimum 2, from at least 2 distinct TextVersions, all in the same document). A Span can participate in many AlignmentGroups.

## Alternatives Considered
- Pairwise translation tables: rejected (cannot model N:M/hyperedge).
- JSON array of span IDs on group: rejected (loses relational integrity, uniqueness, and queryability).

## Consequences
- Schema is language-neutral and future-proof for discontinuous members.
- Service must enforce cardinality/cross-document invariants not expressible as simple DB constraints.
