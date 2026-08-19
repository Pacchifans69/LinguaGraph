# LinguaGraph — Current Engineering State

This file is a durable engineering handoff and navigation index.

It summarizes where the repository currently stands so that a new human,
ChatGPT conversation, or coding Agent can reconstruct the project state
without relying on chat history.

It is NOT a replacement for the accepted ADRs, the authoritative
pre-implementation specification/report, the repository implementation,
Alembic migration history, or merged GitHub PR history.

---

## 1. Repository checkpoint

Last completed implementation checkpoint:

**M0.2 — Persistence Model**

M0.2 has been human-reviewed, approved, and merged into `main`.

The next implementation checkpoint is:

**M0.3 — Document Workspace**

M0.3 implementation has NOT begun yet.

Do not begin M0.4 until M0.3 has been implemented, human-reviewed,
approved, and merged into `main`.

---

## 2. Completed checkpoints

### M0.1 — Repository Foundation

Status:

**COMPLETE / MERGED**

GitHub:

- PR #1 — `M0.1 — Repository Foundation`
- merge commit: `5bfdb9b`

Established:

- monorepo foundation;
- FastAPI backend skeleton;
- `/api/v1/health`;
- SQLAlchemy / Alembic foundation;
- PostgreSQL 18 development/test foundation;
- React + TypeScript + Vite frontend;
- TanStack Query provider;
- pytest / Vitest / React Testing Library;
- runtime and package-manager baselines;
- developer setup documentation.

### M0.2 — Persistence Model

Status:

**COMPLETE / MERGED**

GitHub:

- PR #2 — `M0.2 — Persistence Model`
- final implementation head: `71ab918`
- merge commit: `c92204f`

Implemented:

- six language-neutral SQLAlchemy domain models;
- Alembic revision `0002` for the M0 domain schema;
- PostgreSQL constraints, indexes, FKs and cascade behavior;
- canonical-text utilities;
- Unicode code-point offset utilities;
- BCP-47 syntactic validation;
- Project / ParallelDocument / TextVersion persistence services;
- Span persistence foundation and server-derived quote/context metadata;
- alignment invariant predicates;
- ADR-005 destructive TextVersion reset behavior;
- mechanically safe service-owned transaction boundaries;
- real PostgreSQL integration-test foundation.

M0.2 deliberately did NOT implement:

- HTTP CRUD/workspace routes and schemas;
- Document Workspace UI;
- text import UI;
- frontend selection engine;
- complete AlignmentService;
- alignment mutation HTTP endpoints;
- concurrency-safe alignment Span get-or-create;
- visualization/connectors;
- later NLP/linguistic layers.

Those remain assigned to their later checkpoints.

---

## 3. Frozen architecture baseline

The M0 pre-implementation architecture is closed.

Accepted ADRs:

- ADR-001 — Unicode code-point offsets
- ADR-002 — NFC canonical text
- ADR-003 — Alignment vs linguistic relations
- ADR-004 — PostgreSQL relational persistence
- ADR-005 — Annotated text immutability in M0
- ADR-006 — AlignmentGroup as N:M hyperedge
- ADR-007 — Pending selections remain client-side
- ADR-008 — Modular monolith
- ADR-009 — M0 environment baseline

Coding Agents must not reopen these decisions without an explicit
architecture review.

Important frozen properties include:

- language is data, represented by BCP-47 `language_tag`;
- no language-specific core schema;
- multiple TextVersions with the same language tag are allowed;
- persisted/API offsets are Unicode code-point offsets;
- canonical text uses NFC and LF normalization;
- canonicalization does not trim, collapse whitespace, lowercase, use NFKC,
  or normalize punctuation;
- AlignmentGroup is a symmetric N:M hyperedge;
- Alignment is separate from future linguistic relations;
- Spans can be reused across AlignmentGroups;
- annotated text follows ADR-005 immutability/destructive-reset rules;
- PostgreSQL is the M0 persistence engine;
- SQLite is not an acceptable integration-test substitute;
- backend architecture is a modular monolith:
  route -> service -> SQLAlchemy persistence.

---

## 4. Persistence schema state

Alembic history currently contains:

- `0001` — no-op M0.1 foundation revision;
- `0002` — M0.2 domain schema.

Revision `0001` remained unchanged during M0.2.

Revision `0002` creates:

- `projects`
- `parallel_documents`
- `text_versions`
- `spans`
- `alignment_groups`
- `alignment_members`

Important schema properties:

- UUID primary keys;
- timezone-aware timestamps;
- `ON DELETE CASCADE` FK behavior at the database layer;
- `UNIQUE(document_id, label)` for TextVersion labels;
- NO `UNIQUE(document_id, language_tag)`;
- `UNIQUE(text_version_id, start_offset, end_offset)` for Span reuse;
- Span CHECK constraints:
  - `start_offset >= 0`
  - `end_offset > start_offset`
- `UNIQUE(alignment_group_id, span_id)`;
- NO `UNIQUE(span_id)` on AlignmentMember.

Cross-row/cross-table alignment invariants remain service responsibilities,
not database-trigger responsibilities.

---

## 5. Canonical text and offset contract

Backend canonicalization is authoritative.

Pipeline:

1. strict UTF-8 decode for byte input;
2. remove one leading U+FEFF;
3. CRLF -> LF;
4. remaining CR -> LF;
5. reject U+0000;
6. reject surrogate code points;
7. normalize NFC;
8. enforce maximum canonical code-point length;
9. compute SHA-256 over UTF-8 canonical content.

Persisted Span offsets are:

- zero-based;
- start-inclusive;
- end-exclusive;
- Unicode code-point offsets.

Authoritative regression values:

- `für größere Häuser` = 18 code points;
- `Café 🙂 mañana für français` = 26 code points;
- `A🙂B` = 3 code points.

The frontend M0.4 selection engine must convert DOM / JavaScript UTF-16
positions to this code-point coordinate system. JavaScript UTF-16 offsets
must never be persisted directly.

---

## 6. BCP-47 contract

`language_tag` validation is syntactic RFC 5646 / BCP-47 validation only.

There is:

- no fixed language allow-list;
- no IANA registry lookup;
- no claim of semantic registry validation.

Duplicate variant subtags are rejected case-insensitively.

Examples rejected:

- `de-DE-1901-1901`
- `sl-rozaj-ROZAJ`

Syntactically valid but unregistered tags may still be accepted by design.

---

## 7. Alignment persistence foundation

M0.2 provides only the persistence model and invariant foundations.

AlignmentGroup:

- belongs to one ParallelDocument;
- has no source/target fields;
- is symmetric;
- represents correspondence only.

Alignment invariant foundations require:

- at least 2 members;
- at least 2 distinct TextVersions;
- all member TextVersions belong to the group's document;
- no duplicate Span within a group;
- same-version spans within one group must not overlap;
- same-version adjacent or separated spans are allowed;
- Spans may be reused across different AlignmentGroups;
- different AlignmentGroups may overlap.

The full atomic Alignment create/update/delete service remains **M0.5**.

Concurrency-safe Span get-or-create using PostgreSQL `ON CONFLICT` or a
SAVEPOINT remains **M0.5**.

---

## 8. ADR-005 destructive-reset behavior

Annotated TextVersion content is immutable.

Unannotated content may be replaced through the explicit service path.

Deleting a TextVersion that participates in alignments is blocked unless
the destructive force path is explicitly requested.

Force deletion runs atomically in one transaction.

For each affected AlignmentGroup:

- remove members belonging to the deleted TextVersion;
- revalidate the remaining group against ALL M0 alignment invariants;
- delete the group if it becomes invalid.

Important M0.2 human-review regression:

If deleting EN destroys:

- G1 = {EN_span, DE_span}

while the same DE_span also participates in an unaffected group:

- G2 = {DE_span, FR_span}

then DE_span MUST survive because G2 still references it.

Candidate orphan Spans are deleted only when they will have zero surviving
AlignmentMembers outside groups scheduled for deletion.

Unrelated groups and memberships must remain untouched.

---

## 9. Service transaction ownership contract

This contract was strengthened during M0.2 human review.

The SQLAlchemy Session must be transaction-clean between public service calls.

### Write services

`write_transaction`:

- requires no pre-existing transaction;
- requires no caller-owned pending ORM mutation;
- otherwise raises `SessionNotCleanError` before service work begins;
- creates its own transaction with `Session.begin()`;
- commits only its own transaction on success;
- rolls back only its own transaction on failure;
- never silently commits or rolls back caller-owned transactional state.

This rule covers caller-owned writes that have already been flushed:
after `flush()`, `db.new`, `db.dirty`, and `db.deleted` can all be empty
while an uncommitted database transaction still exists.

Therefore `db.in_transaction()` is part of the fail-fast boundary.

### Read services

`read_transaction` follows the same clean-entry rule.

A read service closes the read-only transaction that it itself autobegins
before returning, leaving the Session transaction-clean for the next service
call.

### M0.3 integration constraint

M0.3 routes/read models must not casually depend on ORM lazy relationship
loading after a service has returned.

Lazy loading can autobegin a new SQLAlchemy transaction and violate the
transaction-clean-between-service-calls contract.

Prefer explicit service queries/read models and deliberately loaded data at
the HTTP boundary.

Do not weaken this transaction contract merely to make route code convenient.

---

## 10. M0.2 verification baseline

Final locally reported verification:

- Python 3.13.15
- PostgreSQL 18.6
- SQLAlchemy 2.0.52
- `uv sync --frozen` — passed
- `uv run pytest` — 231 passed
- integration tests — 102 passed against real PostgreSQL 18
- non-integration tests — 129 passed
- `uv run alembic check` — no schema drift detected
- disposable database:
  - empty -> head — passed
  - head -> base — passed
  - base -> head — passed
- `git diff --check` — clean

No SQLite implementation was introduced.

PR #2 had no PR-triggered GitHub Actions runs/status checks available during
final pre-merge review, so GitHub CI must not be described as independently
green for that checkpoint. The verified M0.2 test evidence came from the
reported real-PostgreSQL local run.

---

## 11. Known non-blocking engineering notes

### Migration-test environment restoration

`test_migrations.py` currently has an internal Alembic helper that sets
`DATABASE_URL` for a disposable database and then removes the variable.

It does not currently cause the migration tests to target the development
database because every invocation explicitly installs the disposable URL.

However, the helper should eventually restore any pre-existing
`DATABASE_URL` value instead of unconditionally removing it.

This was reviewed as non-blocking for M0.2.

### Transaction-aware HTTP design

The M0.3 API layer must respect the clean-Session service boundary described
above. Do not solve route serialization problems by weakening transaction
ownership.

---

## 12. Explicitly deferred work

### M0.3 — Document Workspace

Owns the next document-management/workspace checkpoint.

### M0.4 — Selection Engine

Owns browser native Selection/Range conversion, UTF-16 <-> code-point
conversion, boundary segmentation and pending selection foundations.

### M0.5 — Manual Alignment

Owns:

- complete AlignmentService;
- atomic alignment create/update/delete;
- concurrency-safe Span reuse/get-or-create;
- alignment HTTP mutations;
- tray -> persistence workflow.

### M0.6 — Alignment Visualization

Owns hover/active propagation, Inspector and SVG connectors.

### M0.7 — Hardening

Owns final integration/E2E/Unicode/accessibility/error-handling/build
hardening.

NLP, LLM, machine translation, dictionary, linguistic knowledge graphs,
authentication, collaboration and distributed infrastructure remain outside
M0.

---

## 13. Next action

After this durable-state document is merged:

1. synchronize local `main`;
2. create the M0.3 implementation branch;
3. start a fresh M0.3 Agent/session;
4. have that Agent read this file, `AGENTS.md`, the authoritative
   pre-implementation documents and all accepted ADRs;
5. update checkpoint-state documentation for M0.3 implementation;
6. implement M0.3 only;
7. stop for human review before M0.4.

Do not begin M0.4 automatically.

---

## 14. Authority and reconstruction rules

Use this file as a navigation/handoff index, not as a second architecture
specification.

For architecture and invariant questions:

- accepted ADRs and the authoritative M0 pre-implementation documents govern.

For what code/schema actually exists:

- current `main`;
- Alembic migration history;
- executable tests

govern.

For review/merge history:

- merged GitHub pull requests and Git history govern.

`CURRENT_STATE.md` summarizes those sources and points a new Agent toward
them.

Chat transcripts and Agent exit reports are supporting context only and are
not authoritative engineering state.

If these sources appear to disagree, inspect the authoritative source instead
of silently reconciling the conflict from memory.
instead of silently reconciling the conflict from memory.