# ADR-003: Alignment vs linguistic relations

## Status
Accepted (frozen for M0)

## Context
The long-term system will have translation alignments, cognates, borrowings, derivations, syntax relations, etc. Mixing these into one table would make M0 ambiguous and make future linguistic layers hard to add.

## Decision
M0's AlignmentGroup has exactly one meaning: "these text occurrences correspond in the current ParallelDocument." No source/target language fields, no cognate/relation type. A future linguistic annotation/knowledge layer will sit above the alignment layer. M0 implements only the alignment layer foundation.

## Alternatives Considered
- Single relation table with `relation_type`: rejected because it couples orthogonal layers and invites speculative ontology.
- Source-target pair tables: rejected because it cannot represent N:M hyperedges and language-neutral data.

## Consequences
- AlignmentGroup is a symmetric hyperedge.
- Future linguistic relations can be added as separate layers without schema rewrite of M0 core.
