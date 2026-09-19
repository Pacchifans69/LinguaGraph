# ADR-015: Document-Root Serialization for Alignment Mutations

## Status

Accepted for the M7 implementation candidate

## Context

The M0 Alignment model is a symmetric N:M hyperedge within one
ParallelDocument. Before M7, individual Alignment writes were atomic and Span
get-or-create was concurrency-safe, but concurrent PATCHes to one
AlignmentGroup had no backend serialization contract. Alignment writes also
did not share a lock order with destructive TextVersion deletion or
unannotated content replacement.

M4/M5 established a separate TextVersion-root mutation discipline for
segmentation and token-occurrence annotations. M7 closes the Alignment debt
without creating a repository-wide lock framework or changing API/schema
semantics.

## Decision

Alignment topology mutation is serialized at ParallelDocument scope.

The canonical lock order is:

```text
ParallelDocument FOR UPDATE
→ participating TextVersion rows FOR UPDATE
  in deterministic UUID order
→ re-resolve authoritative state
→ validate
→ mutate
```

Pre-lock reads are locator-only. State used for member replacement, Span
creation/cleanup, invariant validation, destructive reset, or canonical text
slicing is re-resolved after the canonical locks are held.

Malformed cross-document Alignment input is rejected after the document root
is locked but before any foreign TextVersion row is locked.

TextVersion destructive deletion and `replace_content()` join the same
document→TextVersion order. Existing segmentation/lemma/POS paths continue to
lock only their TextVersion and never acquire ParallelDocument afterward, so
M7 introduces no TextVersion→ParallelDocument inversion.

Concurrent same-group PATCHes use serial-equivalent server-authoritative
semantics. M7 adds no ETag, version column, `If-Match`, or new concurrency
domain error.

A Span is deleted as an orphan only when the serialized authoritative state
has zero surviving AlignmentMember references.

ParallelDocument and Project deletion remain unchanged production paths. M7
audits them against real PostgreSQL; evidence requiring a production redesign
is a STOP condition requiring Human scope review.

## Alternatives considered

- AlignmentGroup-only locking: rejected because CREATE has no group row yet
  and it does not coordinate TextVersion destruction/content replacement.
- TextVersion-only locking: rejected because Alignment spans multiple versions
  and same-document topology needs one canonical first lock.
- Optimistic version/ETag semantics: rejected because it would broaden API,
  persistence, and frontend contracts for a local single-user workbench.
- Generic repository lock manager: rejected as unnecessary abstraction and
  outside M7.
- Locking foreign submitted TextVersions before ownership validation: rejected
  because malformed cross-document requests could create a cross-document
  lock graph.

## Consequences

- Alignment mutations within one ParallelDocument are deliberately serialized.
- Different ParallelDocuments remain independently mutable.
- Participating TextVersion locks bridge Alignment writes to existing
  TextVersion-root mutation paths.
- PATCH results correspond to a legal serial execution and do not use an
  optimistic conflict protocol.
- The M0 Span uniqueness/get-or-create algorithm and persistence schema remain
  unchanged.
- Real PostgreSQL concurrency tests are required evidence for the lock
  contract and retained Project/ParallelDocument deletion audit boundary.
