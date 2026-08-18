# ADR-007: Pending selections remain client-side

## Status
Accepted (frozen for M0)

## Context
Users assemble selections from multiple panels before creating an alignment. If each selection were persisted immediately, cancel/clear would leave orphan Spans or half-built AlignmentGroups.

## Decision
Pending selections are ephemeral frontend state in an Alignment Tray. Nothing is persisted until the user clicks "Create Alignment", which sends one atomic request containing all member spans. Cancel/clear has no database side effects.

## Alternatives Considered
- Persist each selected Span immediately: rejected because it creates orphan spans and makes cancel non-trivial.
- Persist a draft AlignmentGroup and update it: rejected because it exposes half-built domain objects and complicates transactions.

## Consequences
- Frontend tray reducer must manage pending members and duplicate prevention.
- Backend create-alignment endpoint owns a single atomic transaction with span get-or-create.
