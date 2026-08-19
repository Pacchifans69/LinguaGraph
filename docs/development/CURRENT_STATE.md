# LinguaGraph Current State

## Stable baseline
- M0 pre-implementation architecture: frozen
- ADR-001 ... ADR-009: accepted

## Completed checkpoints
- M0.1 Repository Foundation
  - merged PR #1
  - merge commit: 5bfdb9b

- M0.2 Persistence Model
  - PR #2: ...
  - final implementation head: 71ab918
  - status: ...

## Current checkpoint
M0.3 — Document Workspace

## Frozen implementation constraints
- language is data / BCP-47
- Unicode code-point offsets
- NFC canonical text
- AlignmentGroup is symmetric N:M
- PostgreSQL only
- modular monolith
- ...

## Current transaction contract
- Session transaction-clean between service calls
- read services own and close read transaction
- write services reject pre-existing transactions
- ...

## Known non-blocking issues
- ...
    
## Next action
- ...

## Do not begin
- M0.4 until M0.3 human-approved and merged