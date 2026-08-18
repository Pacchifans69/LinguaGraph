# LinguaGraph M0 Pre-Implementation Report

Status: **ARCHITECTURE READY FOR BASELINE CLOSURE** (environment provisioning is a separate track)

This document is the authoritative pre-implementation deliverable for LinguaGraph M0. It was produced from `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` and `AGENTS.md` without beginning M0.1 implementation.

---

## 1. Executive Assessment

LinguaGraph M0 (Manual Alignment Workbench) is **architecturally implementable**. The frozen principles are coherent: language-neutral relational schema, Unicode code-point offsets, N:M alignment hyperedges, immutable annotated text, atomic alignment creation, and a modular monolith are sufficient to support the M0 Definition of Done and do not conflict with future linguistic layers.

The most important engineering risks are:

1. **Unicode offset correctness across the JS/Python boundary.** JavaScript DOM offsets are UTF-16 code units; the database/API must use Unicode code-point offsets. Any missing conversion in selection, rendering, or API serialization will corrupt annotations.
2. **NFC canonicalization changing offsets.** Text must be canonicalized before any offset is computed; frontend must render and select only the server-returned canonical text.
3. **Overlapping annotation rendering + native DOM selection.** Boundary segmentation must keep DOM text identical to canonical text while allowing multiple annotation memberships per run.
4. **Atomic alignment creation with Span reuse.** A single transaction must derive quotes, reuse or create spans, create the group/members, and roll back on any failure to avoid orphan objects.
5. **Same-TextVersion multi-span invariants.** The rules for duplicate/overlap/separated/adjacent spans inside one AlignmentGroup must be explicit and service-enforced.
6. **Deletion semantics for annotated TextVersions.** Accidental deletion can silently destroy alignments; a clear destructive-reset policy is required before coding.
7. **Connector geometry under independent scrolling/panel reorder.** Geometry is event-driven; without a simple state model it can become a source of visual drift.
8. **Environment baseline mismatch.** The current environment does not match the frozen baseline exactly (Python 3.12 vs 3.13, no uv, no PostgreSQL/Docker; Node 24 exists but is shadowed by Node 22 on PATH). This must be resolved before M0.1 execution.
9. **Test isolation with real PostgreSQL.** Integration tests must not silently fall back to SQLite; the environment must provide PostgreSQL for M0.2+.
10. **Grapheme vs code-point boundary policy.** M0 must explicitly state that only code-point boundaries are enforced; full grapheme-aware editing is deferred, avoiding a false promise of grapheme-safe selections.

No architectural **BLOCKING** problem was found. The only blockers are environment/setup decisions and a small set of explicit open decisions that must be resolved before M0.1 (see Decision Register and Exit Checklist).

---

## 2. Repository Assessment

### CURRENT REPOSITORY STATE

| Item | Status |
|---|---|
| Directory tree | `AGENTS.md`, `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md` only |
| Existing source | None |
| Package manifests | None |
| Lockfiles | None |
| Runtime versions | Python 3.12.3; Node 22.22.3 on PATH (Node 24.19.0 available at `/usr/bin/node`); npm 10.9.8 on PATH (npm 11.17.0 at `/usr/bin/npm`) |
| Git | **Not a Git repository** (`/mnt/c/Users/ZJX/Desktop/LinguaGraph` has no `.git`) |
| Existing configuration | None |
| Docker / Compose | Not available (`docker` not found; no Windows Docker directory) |
| Migrations | None |
| Tests | None |
| CI | None |
| Documentation | AGENTS.md + this pre-implementation spec |

### Assessment

- **What already exists:** only the two required instruction/spec documents.
- **What can be retained:** both documents remain authoritative.
- **What conflicts with M0:** environment version mismatch (Python 3.12.3 vs baseline 3.13.x; no uv; no PostgreSQL/Docker; Node PATH shadowing Node 24 by Node 22).
- **What needs migration:** nothing; this is a greenfield repository.
- **Technical debt:** none inherited; the only debt risk is starting without Git initialization, which should be corrected in M0.1.

**Conclusion: Greenfield repository.**

---

## 3. Architecture Review

Legend: `CONFIRMED` = frozen decision is sound as written; `NEEDS REFINEMENT` = sound but needs concrete decisions; `BLOCKING` = must be changed before M0.

| Area | Verdict | Notes / refinement |
|---|---|---|
| Language-neutral model | CONFIRMED | No language-specific columns/tables; BCP-47 `language_tag` as data. |
| TextVersion abstraction | CONFIRMED | Multiple versions per language allowed; no `UNIQUE(document_id, language_tag)`. |
| Span abstraction | CONFIRMED | `[start, end)` code-point offsets, zero-based, end-exclusive; server derives `exact_text/prefix/suffix`. |
| N:M AlignmentGroup hyperedge | CONFIRMED | `AlignmentMember` join table; no source/target pair fields. |
| AlignmentMember | CONFIRMED | `(alignment_group_id, span_id)` unique; supports same-version multi-span and N:M. |
| Unicode normalization (NFC) | CONFIRMED | Backend canonicalizes before persist; offsets refer to canonical string. |
| Code-point offsets | CONFIRMED | Database/API use Unicode code points; one canonical JS↔Python conversion utility. |
| Immutable annotated text | CONFIRMED | No general content PATCH; explicit destructive reset only. |
| Atomic alignment transaction | CONFIRMED | Single request/transaction creates spans/group/members; rollback on failure. |
| Overlapping span rendering | CONFIRMED | Boundary segmentation into minimal runs; no one-char DOM elements. |
| Frontend/backend state boundaries | CONFIRMED | TanStack Query for server state; local reducer/Context for ephemeral UI. |
| Same-version multi-span overlap rule | CONFIRMED | Duplicate and overlap prohibited inside one group/version; separated and adjacent allowed; service-enforced. |
| Span reuse | CONFIRMED | Unique index on `(text_version_id, start_offset, end_offset)`; concurrency-safe get-or-create via PostgreSQL `ON CONFLICT` or SAVEPOINT inside the single alignment transaction. |
| Deletion semantics | CONFIRMED | Defined: force-delete revalidates all affected AlignmentGroups against all M0 invariants and deletes invalid groups atomically. |
| Grapheme cluster policy | CONFIRMED | M0 enforces code-point boundaries only; grapheme-aware editing deferred; documented explicitly. |
| Content hash timing | CONFIRMED | Hash after canonicalization (canonical content), not raw input. |
| Text size limits | CONFIRMED | Max 1,000,000 code points and 4,000,000 request body bytes. |
| Connector geometry | CONFIRMED | `RenderedSpanRegistry` + recompute triggers, hidden/offscreen handling defined. |
| API error contract | CONFIRMED | Standard `code/message/details` envelope; domain error codes enumerated. |
| Environment versions | CONFIRMED | ADR-009 fixes the baseline (Python 3.13, uv, Node 24, PostgreSQL 18); provisioning is a separate execution track, not an architecture blocker. |

No `BLOCKING` architecture problems were found.

---

## 4. Final Domain Model

### Naming and ID policy

- All entity primary keys are `UUID` (v4), generated by the application (`uuid.uuid4()` in Python) and stored as PostgreSQL `UUID`.
- Rationale: stable across future import/merge, avoids enumeration, and matches future linguistic graph identity needs without introducing infrastructure.
- Timestamps are timezone-aware `timestamptz` (`DateTime(timezone=True)` in SQLAlchemy), set by the application to `datetime.now(timezone.utc)`.
- `created_at` is immutable after insert; `updated_at` is updated on every metadata change.

### Entities

#### Project

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | str | not null | `min_length=1`, `max_length=200` |
| description | str | nullable | `max_length=2000` |
| created_at | timestamptz | not null | |
| updated_at | timestamptz | not null | |

#### ParallelDocument

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| project_id | UUID | not null, FK → projects.id | ON DELETE CASCADE |
| title | str | not null | `min_length=1`, `max_length=300` |
| description | str | nullable | `max_length=2000` |
| created_at | timestamptz | not null | |
| updated_at | timestamptz | not null | |

#### TextVersion

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| document_id | UUID | not null, FK → parallel_documents.id | ON DELETE CASCADE |
| language_tag | str | not null | BCP-47/RFC 5646; validated by backend |
| label | str | not null | human-readable version label, `max_length=200` |
| content | text | not null | canonical text (NFC, LF, no BOM) |
| content_hash | char(64) | not null | SHA-256 hex of canonical content UTF-8 |
| sort_order | int | not null, default 0 | stable ordering within document |
| created_at | timestamptz | not null | |
| updated_at | timestamptz | not null | |

Notes:
- `UNIQUE(document_id, label)` is kept: it prevents ambiguous user-facing version labels within the same document. If a user needs two identical labels, they must disambiguate them.
- `UNIQUE(document_id, sort_order)` is **not** used; reordering would require updating many rows. `sort_order` is a non-unique server-side stable ordering integer; document-level ordering uses `(sort_order, created_at, id)`.
- `sort_order` is **not** the workspace panel order. Workspace panel order is an ephemeral, per-document frontend preference stored in `localStorage` (see Frontend Architecture). Server `sort_order` may be updated through metadata `PATCH`, but it is not intended to track frequent UI drag-reorder operations.
- There is **no** unique constraint on `(document_id, language_tag)`; multiple versions of the same language are allowed.

#### Span

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| text_version_id | UUID | not null, FK → text_versions.id | ON DELETE CASCADE (see deletion semantics) |
| start_offset | int | not null | zero-based, inclusive, Unicode code-point offset |
| end_offset | int | not null | zero-based, exclusive, Unicode code-point offset |
| exact_text | text | not null | `content[start_offset:end_offset]` |
| prefix | text | not null | preceding 32 code points of canonical content |
| suffix | text | not null | following 32 code points of canonical content |
| created_at | timestamptz | not null | |

Notes:
- `UNIQUE(text_version_id, start_offset, end_offset)` enables Span reuse and prevents logical duplicates.
- `CHECK (start_offset >= 0)`, `CHECK (end_offset > start_offset)`.
- `prefix`/`suffix` are anchoring metadata only; they are never used as source of truth for text.

#### AlignmentGroup

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| document_id | UUID | not null, FK → parallel_documents.id | ON DELETE CASCADE |
| note | text | nullable | `max_length=4000` |
| created_at | timestamptz | not null | |
| updated_at | timestamptz | not null | |

#### AlignmentMember

| Field | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | PK | |
| alignment_group_id | UUID | not null, FK → alignment_groups.id | ON DELETE CASCADE |
| span_id | UUID | not null, FK → spans.id | ON DELETE CASCADE |
| created_at | timestamptz | not null | |

Notes:
- `UNIQUE(alignment_group_id, span_id)` prevents duplicate members in the same group.
- `UNIQUE(span_id)` is **not** used: a Span may belong to many different AlignmentGroups.
- Index on `span_id` and on `alignment_group_id` for reverse lookups.

### Relationships and Cardinalities

```text
Project 1 ──── * ParallelDocument
ParallelDocument 1 ──── * TextVersion
TextVersion 1 ──── * Span
ParallelDocument 1 ──── * AlignmentGroup
AlignmentGroup 1 ──── * AlignmentMember
Span 1 ──── * AlignmentMember
AlignmentGroup * ──── * Span  (through AlignmentMember)
```

### Invariants

Database-enforced:

1. `Span.start_offset >= 0`
2. `Span.end_offset > Span.start_offset`
3. `UNIQUE(TextVersion.document_id, TextVersion.label)`
4. `UNIQUE(Span.text_version_id, Span.start_offset, Span.end_offset)`
5. `UNIQUE(AlignmentMember.alignment_group_id, AlignmentMember.span_id)`
6. All FKs are `ON DELETE CASCADE` at the raw table level, but application service enforces higher-level deletion policy before issuing deletes (see Deletion Semantics).

Service/application-enforced:

1. `0 <= start_offset < end_offset <= code_point_length(TextVersion.content)`
2. `TextVersion.content[start_offset:end_offset] == exact_text`
3. `AlignmentGroup` has at least 2 members.
4. Members come from at least 2 distinct TextVersions.
5. All member TextVersions belong to the same ParallelDocument as the AlignmentGroup.
6. No duplicate Span in the same AlignmentGroup.
7. Within one AlignmentGroup, two members from the **same TextVersion** must not overlap and must not be identical; separated or adjacent spans are allowed.
8. Different AlignmentGroups may share Spans and may overlap freely.
9. `language_tag` is a syntactically valid BCP-47 tag.
10. `content_hash == sha256_hex(utf8(canonical_content))`.

### Deletion Semantics

| Operation | Behavior |
|---|---|
| DELETE Project | Cascade delete all documents, text versions, spans, alignment groups/members. Explicit destructive operation. |
| DELETE ParallelDocument | Cascade delete all text versions, spans, alignment groups/members. Explicit destructive operation. |
| DELETE TextVersion (no spans) | Allowed; deletes the version. |
| DELETE TextVersion (has spans, no alignment memberships) | Allowed; deletes all its spans and the version (orphan cleanup). |
| DELETE TextVersion (has spans with alignment memberships) | Blocked by default with `TEXT_HAS_ANNOTATIONS`. Allowed only with `?force=true`; force deletes all spans and affected AlignmentMembers, then **revalidates every affected AlignmentGroup against all M0 alignment invariants**, deleting any group that no longer satisfies them (fewer than 2 members, fewer than 2 distinct TextVersions, or any other required invariant), then deletes the version, all in one transaction. |
| DELETE AlignmentGroup | Deletes members; then deletes Spans that no longer have any AlignmentMember (orphan cleanup) in the same transaction. |
| DELETE Span | No public API in M0. Spans are managed through alignment operations. |

Rationale: default block prevents accidental alignment loss; `force=true` is the explicit destructive reset flow required by the spec.

### Span Reuse and Transaction Behavior

- Creating an alignment uses concurrency-safe `get-or-create` for each member span:
  1. Look up `Span` by `(text_version_id, start_offset, end_offset)`.
  2. If found, reuse it.
  3. If not found, insert it using PostgreSQL `INSERT ... ON CONFLICT (text_version_id, start_offset, end_offset) DO NOTHING RETURNING id`; if no row is returned because a concurrent transaction inserted first, select the existing row.
- This strategy keeps the operation inside the **same outer Alignment transaction** without aborting it. It does **not** use a bare `IntegrityError` rollback followed by continuation in the same outer transaction.
- If the implementation prefers SQLAlchemy ORM over Core insert, use a **SAVEPOINT/nested transaction** around each insert: attempt insert, on unique violation roll back only to the savepoint, then select the existing row. The outer Alignment transaction remains atomic.
- All span creation, group creation, member creation, and validation occur in one database transaction. Any failure rolls back the whole operation.

---

## 5. ER Diagram

```mermaid
erDiagram
    PROJECT ||--o{ PARALLEL_DOCUMENT : contains
    PARALLEL_DOCUMENT ||--o{ TEXT_VERSION : has
    PARALLEL_DOCUMENT ||--o{ ALIGNMENT_GROUP : has
    TEXT_VERSION ||--o{ SPAN : contains
    ALIGNMENT_GROUP ||--o{ ALIGNMENT_MEMBER : has
    SPAN ||--o{ ALIGNMENT_MEMBER : participates_in

    PROJECT {
        uuid id PK
        text name
        text description
        timestamptz created_at
        timestamptz updated_at
    }
    PARALLEL_DOCUMENT {
        uuid id PK
        uuid project_id FK
        text title
        text description
        timestamptz created_at
        timestamptz updated_at
    }
    TEXT_VERSION {
        uuid id PK
        uuid document_id FK
        text language_tag
        text label
        text content
        char content_hash
        int sort_order
        timestamptz created_at
        timestamptz updated_at
    }
    SPAN {
        uuid id PK
        uuid text_version_id FK
        int start_offset
        int end_offset
        text exact_text
        text prefix
        text suffix
        timestamptz created_at
    }
    ALIGNMENT_GROUP {
        uuid id PK
        uuid document_id FK
        text note
        timestamptz created_at
        timestamptz updated_at
    }
    ALIGNMENT_MEMBER {
        uuid id PK
        uuid alignment_group_id FK
        uuid span_id FK
        timestamptz created_at
    }
```

### Database vs Service Constraints

| Constraint | Level |
|---|---|
| FK integrity, PK uniqueness | Database |
| Span coordinate uniqueness | Database |
| AlignmentMember uniqueness | Database |
| Non-negative / ordered offsets | Database (CHECK) |
| Canonical text content/hash consistency | Service |
| BCP-47 tag validity | Service (can use `language_tags` library or regex; full registry validation optional) |
| AlignmentGroup minimum members / cross-document / same-version overlap | Service |
| Atomic create/reuse/cleanup | Service + transaction |

---

## 6. Canonical Text & Unicode Specification

### Canonicalization Pipeline

```text
Input bytes / string
  -> decode UTF-8 (strict) [for file import]
  -> strip one leading U+FEFF (BOM) if present
  -> CRLF -> LF
  -> CR -> LF
  -> reject U+0000 and unpaired surrogates
  -> Unicode NFC normalize
  -> enforce max length
  -> canonical TextVersion.content
  -> content_hash = SHA-256(UTF-8(canonical content))
```

### Decisions

| Question | Decision |
|---|---|
| Where does normalization execute? | Backend service at the ingestion boundary, before persistence. |
| Does frontend display canonicalized result? | Yes. After create/import, the frontend replaces its local view with the server-returned canonical `content`. |
| `.txt` import normalization location | Backend file upload endpoint decodes and canonicalizes bytes. |
| `content_hash` basis | Normalized canonical content, not raw input. |
| BOM | A single leading U+FEFF is stripped. Interior U+FEFF is preserved. |
| Invalid UTF-8 | Reject with `VALIDATION_ERROR` / `INVALID_UTF8`. |
| NUL | Reject with `VALIDATION_ERROR` / `INVALID_NULL_CHARACTER`. |
| Unpaired surrogate code points | Reject with `VALIDATION_ERROR` / `INVALID_SURROGATE`. |
| Empty text | Allowed. |
| Whitespace-only text | Allowed. |
| Max content | `MAX_TEXT_VERSION_CODEPOINTS = 1_000_000`; max request body `MAX_REQUEST_BODY_BYTES = 4_000_000`. |
| Newline handling | CRLF and CR become LF; LF preserved. |
| Whitespace | Preserved exactly; no collapse, no trim. |
| Case/punctuation | Preserved. |
| NFKC | Not used. |

### Test Vectors

| Input | Expected canonical content | Expected code-point length |
|---|---|---|
| `hello world` | `hello world` | 11 |
| `café français` | `café français` | 13 |
| `mañana` | `mañana` | 6 |
| `für größere Häuser` | `für größere Häuser` | 18 |
| `Cafe\u0301` (decomposed) | `Café` | 4 |
| `A🙂B` | `A🙂B` | 3 |
| `Café 🙂 mañana für français` | `Café 🙂 mañana für français` | 26 |
| `line1\r\nline2\rline3` | `line1\nline2\nline3` | 17 |
| `\uFEFFBOM text` | `BOM text` | 8 |
| `a\x00b` | reject | — |
| invalid UTF-8 bytes | reject | — |

Note: these expected code-point lengths are exact and **must** be asserted verbatim by backend/frontend regression tests. They are not approximate.

### Offset Semantics

- All persisted/API offsets are **Unicode code-point offsets** into `TextVersion.content`.
- JavaScript UTF-16 code-unit offsets are converted by the frontend utility layer only; they are never sent to the API.
- Python `len(str)` counts code points, matching the database semantics.
- Frontend code must use `codePointLength`/`sliceByCodePoints` when working with code-point offsets; it must not pass code-point offsets to `String.length`, `String.slice`, or similar UTF-16-based APIs.

---

## 7. Selection Engine Specification

### Goal

Convert a native browser `Selection`/`Range` inside one `TextPanel` into a canonical `PendingSpan`:

```text
native Selection / Range
  -> TextPanel root
  -> rendered runs
  -> UTF-16 positions
  -> Unicode code-point offsets
  -> PendingSpan
```

### DOM Structure Assumptions

- Each `TextPanel` has a root element with `data-text-version-id`.
- Inside the root, the canonical text is rendered as a sequence of inline `<span data-run>` elements (boundary-segmented runs).
- Each run element contains exactly one text node whose `data` is the run's canonical substring.
- Runs are contiguous and cover the entire canonical content with no inserted whitespace, no separators, and no nested text nodes.
- The rendered DOM text is exactly `TextVersion.content`; therefore `textContent` of the panel equals canonical content.
- The TextPanel root uses `white-space: pre-wrap` so whitespace and newlines in canonical content are preserved visually.

### Core Mapping Algorithm

Given a DOM `Range` whose start and end are both inside the same TextPanel root:

1. For each endpoint (`startContainer`/`startOffset`, `endContainer`/`endOffset`), resolve it to a canonical code-point offset using `resolveEndpoint(container, offset)`:
   - **Text node container:** the parent element must be a run element.
     - Let `runStartCP` be the run's `data-start` attribute (canonical code-point start).
     - Let `nodeText` be `textNode.data` (UTF-16 string).
     - Convert `utf16Offset` to a code-point offset using `utf16OffsetToCodePointOffset(nodeText, offset)`.
     - If `utf16Offset` splits a surrogate pair (i.e., `utf16Offset > 0 && utf16Offset < nodeText.length` and the code unit at `utf16Offset - 1` is a high surrogate while the code unit at `utf16Offset` is a low surrogate), reject with `INVALID_SELECTION_BOUNDARY`.
     - `canonicalOffset = runStartCP + convertedOffset`.
   - **Element container at a child boundary:**
     - If the element is the TextPanel root:
       - offset `0` maps to canonical `0`.
       - offset equal to the number of child nodes maps to `codePointLength(canonicalContent)`.
       - any other offset is unsupported; reject with `UNSUPPORTED_SELECTION_BOUNDARY`.
     - If the element is a run element:
       - offset `0` maps to the run's `data-start` (code-point offset).
       - offset `1` maps to the run's `data-end` (code-point offset), because each run element has exactly one child text node.
       - any other offset is unsupported; reject with `UNSUPPORTED_SELECTION_BOUNDARY`.
     - Any other element container is unsupported; reject with `UNSUPPORTED_SELECTION_BOUNDARY`.
   - **Any other container type** (e.g., `DocumentFragment`, `Document`, non-run element with nested children): reject with `UNSUPPORTED_SELECTION_BOUNDARY`.
2. Normalize the two canonical offsets into `start = min(...)`, `end = max(...)`.
3. Validate:
   - `0 <= start < end <= codePointLength(canonicalContent)`
   - Both endpoints belong to the same TextVersion root.
4. Return `PendingSpan { textVersionId, start, end, direction }`.

This explicitly supports Range endpoints whose container is a Text node, a run element at a child boundary, or the TextPanel root at a child boundary. All unsupported boundary shapes are rejected rather than guessed.

For selection direction:

- Use `window.getSelection().anchorNode` / `focusNode` and `anchorOffset` / `focusOffset`.
- If the anchor is document-order before the focus, direction is `forward`; otherwise `backward`.
- Direction is informational only; the canonical `PendingSpan` always has normalized `start <= end`.

### Cross-Node and Multi-Line Selection

- If start and end are in different text nodes/runs, the algorithm still works because each endpoint maps through its own run.
- Multi-line selections are handled the same way; newline characters are ordinary code points in the canonical string.
- The engine must not attempt to reconstruct text by walking DOM text; it only maps endpoint offsets.

### Selection Crossing Panels

- If `range.startContainer` and `range.endContainer` are not within the same `[data-text-version-id]` root, reject with `CROSS_VERSION_SELECTION`.
- The `TextPanel` root should use `onMouseUp`/`onKeyUp` (or a document-level selection listener) to capture selection only when the selection is entirely inside one panel.

### Edge Cases

| Case | Behavior |
|---|---|
| Empty selection | Reject with `EMPTY_SELECTION`. |
| Backward selection | Normalize offsets; keep `direction` for UI affordance. |
| Selection ending at run boundary | If the endpoint container is a run element with offset `0`/`1`, map to `data-start`/`data-end`; if it is a text node ending at the last code point, map through text-node conversion. |
| Endpoint exactly between rendered runs | Supported: container is the following run element at offset `0`, or the preceding run element at offset `1`, or the panel root at a child boundary. |
| Element container with unsupported offset | Reject with `UNSUPPORTED_SELECTION_BOUNDARY`. |
| Non-text/non-run/non-panel container | Reject with `UNSUPPORTED_SELECTION_BOUNDARY`. |
| Surrogate pair split | Reject with `INVALID_SELECTION_BOUNDARY` (do not guess). |
| Combining mark boundary | Allowed; M0 enforces code-point boundaries only. |
| Selection across nested rendered spans | Not possible in M0 DOM model: runs are flat inline spans; no nested span wrappers inside a run. |
| Overlapping annotation runs | Overlap is represented by membership sets on runs, not by duplicate DOM text; mapping remains per-run. |
| Panel boundary | Reject if endpoints cross panels. |
| Composed/decomposed text | Canonical text is NFC; DOM text is canonical; no decomposed text is rendered. |

### Unit-Test Cases for Boundary-Point Handling

- `A🙂B` with a run boundary between `A` and `🙂`: a Range whose `startContainer` is the second run element at offset `0` must resolve to canonical `start = 1`.
- `A🙂B` with a run boundary between `🙂` and `B`: a Range whose `endContainer` is the third run element at offset `0` must resolve to canonical `end = 2`.
- A Range whose `startContainer` is the TextPanel root at offset `0` must resolve to canonical `start = 0`.
- A Range whose `endContainer` is the TextPanel root at offset equal to child count must resolve to canonical `end = codePointLength(content)`.
- A Range whose endpoint container is an unknown element or a run element at an offset other than `0`/`1` must be rejected with `UNSUPPORTED_SELECTION_BOUNDARY`.
- Mixed BMP/non-BMP content (`Café 🙂 mañana für français`) must produce exact code-point offsets at boundaries around the emoji and accented characters.

### TypeScript-Level Interfaces

```ts
export type CodePointOffset = number;

export interface PendingSpan {
  textVersionId: string;
  start: CodePointOffset;
  end: CodePointOffset;
  direction: 'forward' | 'backward';
}

export interface RunDescriptor {
  id: string;
  start: CodePointOffset;
  end: CodePointOffset;
  text: string;
  spanIds: string[];
  alignmentGroupIds: string[];
}

export interface SelectionEngine {
  rangeToPendingSpan(range: Range, root: HTMLElement): PendingSpan | null;
  selectionToPendingSpan(selection: Selection, root: HTMLElement): PendingSpan | null;
}

export interface OffsetConverter {
  utf16OffsetToCodePointOffset(text: string, utf16Offset: number): CodePointOffset;
  codePointOffsetToUtf16Offset(text: string, codePointOffset: number): number;
}

export interface CodePointStringUtils {
  codePointLength(text: string): number;
  sliceByCodePoints(text: string, start: CodePointOffset, end: CodePointOffset): string;
}
```

### Utility Placement

All conversion logic lives in `apps/web/src/shared/text/`; React components must not reimplement offset conversion.

---

## 8. Rendering & Connector Specification

### Boundary Segmentation Algorithm

Inputs:
- Canonical `content` (immutable string).
- Persisted `Span[]` for the TextVersion.
- `AlignmentMember`/`AlignmentGroup` memberships.

Algorithm:

1. Collect all boundaries from spans: for each span add `start` and `end`. All persisted/run boundaries are **Unicode code-point offsets**.
2. Add `0` and `codePointLength(content)`.
3. Sort unique boundaries.
4. For each adjacent pair `(b[i], b[i+1])`, create a run:
   - `start = b[i]` (code-point offset)
   - `end = b[i+1]` (code-point offset)
   - `text = sliceByCodePoints(content, start, end)` — never `String.prototype.slice(start, end)`, because JS slice indices are UTF-16 code units.
   - `spanIds = [span.id for each span where span.start <= start && span.end >= end]`
   - `alignmentGroupIds = unique group ids from those spans' memberships`
5. Output an ordered array of runs.

Canonical utility contract:

```ts
// apps/web/src/shared/text/offset.ts
export function codePointLength(s: string): number {
  return Array.from(s).length;
}

export function sliceByCodePoints(s: string, start: number, end: number): string {
  return Array.from(s).slice(start, end).join('');
}

export function utf16OffsetToCodePointOffset(s: string, utf16Offset: number): number {
  return Array.from(s.slice(0, utf16Offset)).length;
}

export function codePointOffsetToUtf16Offset(s: string, codePointOffset: number): number {
  return Array.from(s).slice(0, codePointOffset).join('').length;
}
```

These utilities are the single conversion strategy for code-point-safe slicing and length in the frontend.

Complexity: `O(S log S + T + N)` where `S` is the number of spans, `T` is the number of resulting runs (`T <= 2S + 1`), and `N` is the canonical text length (run extraction via `sliceByCodePoints` touches the text once overall when implemented efficiently; a naive `Array.from` per run can be optimized in M0.4).

### React Representation

```tsx
// Pseudo-code
function TextPanel({ version, runs, onSelect, spanRegistry }) {
  return (
    <div
      data-text-version-id={version.id}
      className="text-panel"
      style={{ whiteSpace: 'pre-wrap' }}
    >
      {runs.map(run => (
        <span
          key={`${run.start}-${run.end}`}
          ref={el => spanRegistry.setRunElements(run.spanIds, el)}
          data-run-id={run.id}
          data-start={run.start}
          data-end={run.end}
          data-alignment-group-ids={run.alignmentGroupIds.join(',')}
          className={runClasses(run)}
        >
          {run.text}
        </span>
      ))}
    </div>
  );
}
```

- Stable keys: `"${run.start}-${run.end}"` is stable because canonical text is immutable and run boundaries are derived from spans.
- No `dangerouslySetInnerHTML`; text is rendered as React text nodes.
- Highlighting uses CSS classes/`data-*` attributes; active/hover state is not color-only (also uses outline/underline and text labels).
- **Canonical span-to-DOM contract:** `spanRegistry` is an explicit `RenderedSpanRegistry` (`Map<spanId, HTMLElement[]>`). Each run element registers itself for every `spanId` in `run.spanIds`. Connector geometry reads this registry; it must **not** parse `data-span-ids` or query `data-span-id`. `data-span-ids` is intentionally not used as a canonical mechanism.
- The panel root must preserve whitespace and newlines with `white-space: pre-wrap` so canonical content is rendered faithfully.

### Selection Compatibility

- Runs are inline elements; they do not alter the underlying text.
- Native selection can start/end inside any run or at run boundaries.
- The Selection Engine maps endpoints using `data-start`/`data-end`, text node content, and the explicit element child-boundary rules for run/panel roots.

### Hover / Active / Render Invalidation

- `hoveredAlignmentId` and `activeAlignmentId` are ephemeral UI state.
- When either changes, only class names on runs change; the segmentation result is memoized.
- Segmentation is recomputed only when spans/alignments change (server data invalidation), not on hover/scroll.

### Connector Geometry

#### RenderedSpanRegistry

```ts
class RenderedSpanRegistry {
  private elements = new Map<string, HTMLElement[]>();

  setRunElements(spanIds: string[], el: HTMLElement | null): void {
    // Called from each run element ref callback.
    // On mount, append el to each spanId bucket.
    // On unmount/null, remove el from each bucket.
  }

  getElements(spanId: string): HTMLElement[] {
    return this.elements.get(spanId) ?? [];
  }
}
```

This registry is the canonical bridge from persisted `spanId` to rendered DOM elements. It avoids selector parsing and stays correct when one run element belongs to multiple spans.

#### State Model

```ts
interface ConnectorState {
  alignmentId: string | null;
  members: Array<{
    spanId: string;
    textVersionId: string;
    panelId: string;
    rects: DOMRect[]; // client rects, panel-relative converted to overlay-relative
  }>;
  visible: boolean;
}
```

#### Anchor Model

- For each member, obtain all run elements for that span from `RenderedSpanRegistry.getElements(spanId)`; then read their `getClientRects()`. No `data-span-id` selectors are used.
- Convert each rect to overlay coordinates: `left = rect.left - overlayRect.left`, `top = rect.top - overlayRect.top`.
- Use the member's first/last visible rect to compute an anchor point (e.g., middle of the rect edge closest to the group hub).
- Draw a simple straight/quadratic connector from each member anchor to a single group hub (centroid of visible member anchors). No complex edge routing.

#### Recompute Triggers

- `scroll` events on panels/workspace (throttled via `requestAnimationFrame`).
- `resize` events on panels/workspace and `ResizeObserver` on the overlay container.
- Panel reorder/hide/show changes.
- Active/hovered alignment changes.
- Font/load changes can trigger a delayed recompute.

#### Event Strategy

- Register listeners only while an alignment is active/hovered.
- Use `requestAnimationFrame` coalescing; no continuous polling.
- Clean up listeners when the active/hovered alignment is cleared.

#### Edge Cases

| Case | Behavior |
|---|---|
| Span wraps multiple lines | Use all `getClientRects()`; draw connector from the nearest rect (or from the first/last visible rect). |
| Hidden panel | Skip that member; if fewer than 2 visible members, do not draw connectors. |
| Member offscreen | Skip offscreen rects; no virtual scrolling in M0. |
| Panel reorder | Overlay recomputes from current DOM rects after reorder. |
| Scroll drift | Recompute on scroll; overlay coordinates are viewport-relative, so no stale scroll offsets. |
| Same-language multiple fragments | Each fragment is a separate member span; each gets an anchor. |

---

## 9. API Contract

### Base

- All endpoints are under `/api/v1`.
- Content-Type: `application/json` (except `.txt` upload).
- All offsets are Unicode code-point offsets.
- Error envelope:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Human-readable message",
  "details": {}
}
```

HTTP status mapping:

| Code | HTTP status |
|---|---|
| `VALIDATION_ERROR` | 422 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `SPAN_OUT_OF_RANGE` | 422 |
| `CROSS_DOCUMENT_ALIGNMENT` | 422 |
| `INSUFFICIENT_ALIGNMENT_MEMBERS` | 422 |
| `TEXT_HAS_ANNOTATIONS` | 409 |
| `DUPLICATE_ALIGNMENT_MEMBER` | 409 |
| `INVALID_UTF8` | 422 |
| `INVALID_NULL_CHARACTER` | 422 |
| `INVALID_SURROGATE` | 422 |
| `INVALID_SELECTION_BOUNDARY` | 422 |
| `TEXT_TOO_LARGE` | 413 |

### Endpoints

#### Infrastructure

`GET /api/v1/health`

Response 200:

```json
{ "status": "ok" }
```

#### Projects

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/projects` | Create project |
| GET | `/api/v1/projects` | List projects |
| GET | `/api/v1/projects/{project_id}` | Get project |
| PATCH | `/api/v1/projects/{project_id}` | Update metadata |
| DELETE | `/api/v1/projects/{project_id}` | Delete project (cascade) |

Example POST request:

```json
{ "name": "My Corpus", "description": "Optional description" }
```

Response 201:

```json
{
  "id": "3f2b...",
  "name": "My Corpus",
  "description": "Optional description",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

#### Documents

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/projects/{project_id}/documents` | Create document |
| GET | `/api/v1/projects/{project_id}/documents` | List documents |
| GET | `/api/v1/documents/{document_id}` | Get document |
| PATCH | `/api/v1/documents/{document_id}` | Update metadata |
| DELETE | `/api/v1/documents/{document_id}` | Delete document (cascade) |

Example POST:

```json
{ "title": "Le Petit Prince — Chapter 1", "description": "" }
```

#### TextVersions

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/documents/{document_id}/text-versions` | Create/import text version |
| GET | `/api/v1/text-versions/{text_version_id}` | Get text version |
| PATCH | `/api/v1/text-versions/{text_version_id}` | Update **metadata only** (`label`, `sort_order`) |
| DELETE | `/api/v1/text-versions/{text_version_id}` | Delete version; `?force=true` for destructive reset when annotated; revalidates affected AlignmentGroups against all M0 invariants |

Example POST (paste):

```json
{
  "language_tag": "fr",
  "label": "French original",
  "content": "J’ai hâte de te voir demain."
}
```

Example POST (`.txt` upload): `multipart/form-data` with file field `file`, plus form fields `language_tag`, `label`.

Response 201 includes canonical content:

```json
{
  "id": "8f...",
  "document_id": "3f...",
  "language_tag": "fr",
  "label": "French original",
  "content": "J’ai hâte de te voir demain.",
  "content_hash": "abc123...",
  "sort_order": 0,
  "created_at": "...",
  "updated_at": "..."
}
```

#### Alignments

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/documents/{document_id}/alignments` | List alignments |
| POST | `/api/v1/documents/{document_id}/alignments` | Create alignment |
| GET | `/api/v1/alignments/{alignment_id}` | Get alignment |
| PATCH | `/api/v1/alignments/{alignment_id}` | Update note and/or replace members |
| DELETE | `/api/v1/alignments/{alignment_id}` | Delete alignment |

##### POST /api/v1/documents/{document_id}/alignments

Request:

```json
{
  "note": "Phrase-level correspondence",
  "members": [
    { "text_version_id": "tv-en", "start": 2, "end": 17 },
    { "text_version_id": "tv-de", "start": 4, "end": 22 },
    { "text_version_id": "tv-fr", "start": 0, "end": 13 },
    { "text_version_id": "tv-es", "start": 0, "end": 15 }
  ]
}
```

Response 201:

```json
{
  "id": "al-1",
  "document_id": "doc-1",
  "note": "Phrase-level correspondence",
  "created_at": "...",
  "updated_at": "...",
  "members": [
    {
      "id": "am-1",
      "span_id": "sp-1",
      "text_version_id": "tv-en",
      "start": 2,
      "end": 17,
      "exact_text": "look forward to"
    }
  ]
}
```

Transaction boundary: one transaction; any validation failure returns 4xx and rolls back all Span/Group/Member creation.

##### PATCH /api/v1/alignments/{alignment_id}

Two mutation modes:

- Update note only:

```json
{ "note": "Updated note" }
```

- Replace members (full set):

```json
{
  "note": "Updated note",
  "members": [
    { "text_version_id": "tv-en", "start": 2, "end": 17 },
    { "text_version_id": "tv-de", "start": 4, "end": 22 },
    { "text_version_id": "tv-es", "start": 0, "end": 15 }
  ]
}
```

Replacing members is atomic: the service validates the new full set, creates/reuses spans, deletes old members, creates new members, and cleans orphan spans, all in one transaction. Minimum two members from at least two TextVersions is enforced.

##### DELETE /api/v1/alignments/{alignment_id}

Response 204. Deletes members and orphan spans in one transaction.

#### Workspace Read Model

`GET /api/v1/documents/{document_id}/workspace`

Response 200:

```json
{
  "document": {
    "id": "doc-1",
    "project_id": "proj-1",
    "title": "Le Petit Prince — Chapter 1",
    "description": "",
    "created_at": "...",
    "updated_at": "..."
  },
  "text_versions": [
    {
      "id": "tv-en",
      "document_id": "doc-1",
      "language_tag": "en",
      "label": "English A",
      "content": "I look forward to seeing you tomorrow.",
      "content_hash": "...",
      "sort_order": 0
    }
  ],
  "spans": [
    {
      "id": "sp-1",
      "text_version_id": "tv-en",
      "start": 2,
      "end": 17,
      "exact_text": "look forward to",
      "prefix": "I ",
      "suffix": " seeing you tomorrow."
    }
  ],
  "alignment_groups": [
    {
      "id": "al-1",
      "document_id": "doc-1",
      "note": "Phrase-level correspondence",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "alignment_members": [
    {
      "id": "am-1",
      "alignment_group_id": "al-1",
      "span_id": "sp-1"
    }
  ]
}
```

Design notes:

- The response is a document-level snapshot; no pagination in M0.
- Spans and members are returned as flat arrays; the frontend normalizes them into lookup maps by id.
- Payload duplication is accepted in M0 for simplicity and reliability; if documents grow beyond hundreds of alignments, revisit.

---

## 10. Frontend Architecture

### Stack

- React 19 (or current stable compatible with Vite 7) + TypeScript + Vite.
- TanStack Query for server state.
- React local state / `useReducer` / narrowly-scoped Context for ephemeral UI.
- Vitest + React Testing Library for unit/component tests.
- Playwright for E2E.

### Route Tree

```text
/ -> redirect to /projects
/projects
/projects/:projectId/documents
/documents/:documentId/workspace
```

### Feature Modules

```text
src/
  app/          # router, providers, layout
  features/
    projects/   # project list/create/edit/delete
    documents/  # document list/create/edit/delete
    workspace/  # TextPanels, tray, inspector, connectors
    alignments/ # alignment API hooks and components
  shared/
    api/        # API client, error types
    text/       # offset conversion, selection engine, boundary segmentation
    ui/         # reusable presentational components
```

### Query Keys

```ts
['projects']
['project', projectId]
['documents', projectId]
['document', documentId]
['workspace', documentId]
['alignments', documentId]
```

### Server State Ownership

- TanStack Query owns all data fetched from `/api/v1`.
- Mutations use `useMutation` and invalidate relevant keys on success:
  - create/update/delete project → `['projects']`, `['project', id]`
  - create/update/delete document → `['documents', projectId]`, `['document', id]`
  - create/update/delete text version → `['workspace', documentId]`, `['document', id]`
  - create/update/delete alignment → `['workspace', documentId]`, `['alignments', documentId]`

### Ephemeral UI State

A single `WorkspaceProvider` (scoped to the workspace route) owns:

- `visiblePanels: TextVersionId[]`
- `panelOrder: TextVersionId[]`
- `pendingMembers: PendingSpan[]`
- `hoveredAlignmentId: string | null`
- `activeAlignmentId: string | null`

State is managed with `useReducer`; actions are explicit (`ADD_PENDING_MEMBER`, `REMOVE_PENDING_MEMBER`, `CLEAR_TRAY`, `SET_HOVER`, `SET_ACTIVE`, etc.).

### localStorage

Persist only local preferences, namespaced by `documentId` so different documents do not share panel state:

```ts
interface WorkspacePreferences {
  panelOrder: string[];
  visiblePanels: string[];
  density: 'comfortable' | 'compact';
}

function preferenceKey(documentId: string): string {
  return `linguagraph.workspace.preferences.v1.${documentId}`;
}
```

Key format: `linguagraph.workspace.preferences.v1.<documentId>`.

### Shared Text Utilities

- `shared/text/offset.ts` — UTF-16 ↔ code-point conversion plus `codePointLength`/`sliceByCodePoints`.
- `shared/text/selection.ts` — DOM Range/Selection → PendingSpan.
- `shared/text/segmentation.ts` — canonical text + spans → runs.
- `shared/rendering/spanRegistry.ts` — `RenderedSpanRegistry` for connector geometry.
- `shared/text/types.ts` — shared types.

These are framework-light and unit-tested independently of React.

### Accessibility Baseline

- TextPanel headers use `<header>` with visible language/label.
- Icon buttons have `aria-label`.
- Active/focus states have visible outlines.
- Alignment state is communicated with text/aria in addition to color.
- Escape clears pending interaction.
- Inspector is keyboard accessible.

---

## 11. Backend Architecture

### Stack

- Python 3.13.x (baseline; see ADR-009 for environment provisioning).
- FastAPI + Pydantic v2.
- SQLAlchemy 2.0 (typed ORM).
- Alembic for migrations.
- PostgreSQL.
- pytest for tests.

### Package Tree

```text
apps/api/
  app/
    main.py
    api/
      deps.py
      errors.py
      routes/
        health.py
        projects.py
        documents.py
        text_versions.py
        alignments.py
        workspace.py
    core/
      config.py
    db/
      base.py
      session.py
      models/
        project.py
        document.py
        text_version.py
        span.py
        alignment.py
    schemas/
      project.py
      document.py
      text_version.py
      span.py
      alignment.py
      workspace.py
      common.py
    services/
      project_service.py
      document_service.py
      text_version_service.py
      alignment_service.py
    text/
      canonical.py
      offsets.py
      bcp47.py
    tests/
      unit/
      integration/
  alembic/
  pyproject.toml
  .env.example
```

### Configuration

- `core/config.py` uses `pydantic-settings` with environment variables:
  - `DATABASE_URL` (default `postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph`)
  - `CORS_ORIGINS` (comma-separated; default `http://localhost:5173`)
  - `MAX_TEXT_VERSION_CODEPOINTS` (default `1000000`)
  - `MAX_REQUEST_BODY_BYTES` (default `4000000`)
  - `LOG_LEVEL` (default `INFO`)

### DB Session Lifecycle

- A `get_db` FastAPI dependency creates a `SessionLocal` per request and closes it after the response.
- Services receive the session and own transaction boundaries.
- For write operations, service uses `with db.begin():` (or explicit `commit`/`rollback`) so all changes in that service call are atomic.
- Routes never call `db.commit()` directly.

### Transaction Ownership

- `AlignmentService.create` is the canonical example: load document, load versions, validate, derive quotes, get-or-create spans (PostgreSQL `ON CONFLICT` or SAVEPOINT), create group/members, validate final state, commit. Any exception triggers rollback.
- `AlignmentService.update_members` and `AlignmentService.delete` similarly own atomic transactions.
- `TextVersionService.delete(force=True)` owns the destructive-reset transaction.

### Service Boundaries

- `ProjectService`, `DocumentService`, `TextVersionService`, `AlignmentService`.
- No generic repository/base manager; services use SQLAlchemy models directly.

### Domain Exception Mapping

- Services raise domain exceptions defined in `api/errors.py` (e.g., `DomainError(code=..., message=..., details=...)`).
- FastAPI exception handlers convert them to the JSON error envelope.
- Database exceptions are never leaked to clients.

### Pydantic Schemas

- Separate request and response schemas.
- ORM models never used directly as API response models.
- `from_attributes=True` on response schemas where convenient.

### Logging

- Standard `logging`; request logs at INFO, domain errors at WARNING, unexpected errors at ERROR.
- No sensitive content logging.

### Testing Seams

- Services accept a `Session` argument, making them testable with a real PostgreSQL test database.
- Canonical text/offset utilities are pure functions and unit-tested without DB.
- Migration/destructive migration tests must run against a **disposable test PostgreSQL database**, never the normal development database.

---

## 12. Repository Blueprint

### Final Monorepo Tree (M0 target)

```text
LinguaGraph/
├── AGENTS.md
├── README.md
├── .gitignore
├── .env.example
├── compose.yml
├── docs/
│   ├── README.md
│   ├── adr/
│   │   ├── ADR-001-unicode-code-point-offsets.md
│   │   ├── ADR-002-nfc-canonical-text.md
│   │   ├── ADR-003-alignment-vs-linguistic-relations.md
│   │   ├── ADR-004-postgresql-relational-persistence.md
│   │   ├── ADR-005-annotated-text-immutability.md
│   │   ├── ADR-006-alignment-group-nm-hyperedge.md
│   │   ├── ADR-007-pending-selections-client-side.md
│   │   ├── ADR-008-modular-monolith.md
│   │   └── ADR-009-m0-environment-baseline.md
│   ├── api/
│   │   └── api-contract.md
│   ├── architecture/
│   │   └── ARCHITECTURE.md
│   ├── preimplementation/
│   │   ├── M0_PREIMPLEMENTATION_SPEC.md
│   │   └── M0_PREIMPLEMENTATION_REPORT.md
│   └── testing/
│       └── testing-strategy.md
├── infra/
│   └── postgres/
│       └── init.sql
├── apps/
│   ├── api/
│   │   ├── app/
│   │   │   ├── __init__.py
│   │   │   ├── main.py
│   │   │   ├── api/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── deps.py
│   │   │   │   ├── errors.py
│   │   │   │   └── routes/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── health.py
│   │   │   │       ├── projects.py
│   │   │   │       ├── documents.py
│   │   │   │       ├── text_versions.py
│   │   │   │       ├── alignments.py
│   │   │   │       └── workspace.py
│   │   │   ├── core/
│   │   │   │   ├── __init__.py
│   │   │   │   └── config.py
│   │   │   ├── db/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py
│   │   │   │   ├── session.py
│   │   │   │   └── models/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── project.py
│   │   │   │       ├── document.py
│   │   │   │       ├── text_version.py
│   │   │   │       ├── span.py
│   │   │   │       └── alignment.py
│   │   │   ├── schemas/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── common.py
│   │   │   │   ├── project.py
│   │   │   │   ├── document.py
│   │   │   │   ├── text_version.py
│   │   │   │   ├── span.py
│   │   │   │   ├── alignment.py
│   │   │   │   └── workspace.py
│   │   │   ├── services/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── project_service.py
│   │   │   │   ├── document_service.py
│   │   │   │   ├── text_version_service.py
│   │   │   │   └── alignment_service.py
│   │   │   ├── text/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── bcp47.py
│   │   │   │   ├── canonical.py
│   │   │   │   └── offsets.py
│   │   │   └── tests/
│   │   │       ├── __init__.py
│   │   │       ├── conftest.py
│   │   │       ├── unit/
│   │   │       └── integration/
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   ├── script.py.mako
│   │   │   └── versions/
│   │   ├── pyproject.toml
│   │   └── .env.example
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── e2e/
│       │   ├── golden-path.spec.ts
│       │   └── unicode.spec.ts
│       └── src/
│           ├── main.tsx
│           ├── app/
│           │   ├── App.tsx
│           │   ├── router.tsx
│           │   └── providers.tsx
│           ├── features/
│           │   ├── projects/
│           │   │   ├── api.ts
│           │   │   ├── components/
│           │   │   └── routes/
│           │   ├── documents/
│           │   │   ├── api.ts
│           │   │   ├── components/
│           │   │   └── routes/
│           │   ├── workspace/
│           │   │   ├── state/
│           │   │   │   ├── workspaceReducer.ts
│           │   │   │   ├── WorkspaceProvider.tsx
│           │   │   │   └── preferences.ts
│           │   │   ├── components/
│           │   │   │   ├── TextPanel.tsx
│           │   │   │   ├── AlignmentTray.tsx
│           │   │   │   ├── AlignmentInspector.tsx
│           │   │   │   ├── ConnectorOverlay.tsx
│           │   │   │   └── WorkspaceToolbar.tsx
│           │   │   └── routes/
│           │   │       └── WorkspacePage.tsx
│           │   └── alignments/
│           │       ├── api.ts
│           │       └── types.ts
│           └── shared/
│               ├── api/
│               │   ├── client.ts
│               │   └── errors.ts
│               ├── rendering/
│               │   └── spanRegistry.ts
│               ├── text/
│               │   ├── offset.ts
│               │   ├── selection.ts
│               │   ├── segmentation.ts
│               │   └── types.ts
│               └── ui/
```

### Directory Responsibilities

| Path | Responsibility |
|---|---|
| `apps/api` | FastAPI backend, domain services, SQLAlchemy models, Alembic migrations |
| `apps/web` | React frontend, selection engine, rendering, connectors |
| `docs` | Architecture, ADRs, API contract, testing strategy, pre-implementation records |
| `infra` | PostgreSQL init/container support files |
| `apps/web/e2e` | Single Playwright E2E test location for the web app |
| `apps/web/src/shared/rendering` | RenderedSpanRegistry and rendering support utilities |
| `compose.yml` | Local PostgreSQL service for development/integration tests |

---

## 13. Testing Strategy

### Test Levels

- **Backend unit tests**: canonicalization, offsets, BCP-47 validation, alignment invariants, span reuse, deletion policy helpers.
- **Backend integration tests**: real PostgreSQL through API → service → ORM; migrations; transaction rollback; FK/cascade; uniqueness; all migration/destructive tests use a disposable test PostgreSQL database, never the normal development DB.
- **Frontend unit tests**: offset conversion, `codePointLength`/`sliceByCodePoints`, DOM selection mapping including exact run-boundary endpoints, boundary segmentation, tray reducer, hover/active state, invalid selection rejection, `RenderedSpanRegistry`.
- **Component tests**: TextPanel rendering (including `white-space: pre-wrap`), AlignmentTray, Inspector, ConnectorOverlay geometry helpers.
- **E2E**: Playwright golden path and Unicode scenario against the full stack, located in `apps/web/e2e`.

### Requirements → Tests Traceability Matrix

| Requirement | Unit | Integration | E2E |
|---|---|---|---|
| UTF-8 decode / BOM strip | yes | yes | no |
| CRLF/CR → LF | yes | yes | no |
| NFC normalization | yes | yes | yes |
| Code-point offsets | yes | yes | yes |
| Code-point slicing utilities (`codePointLength`/`sliceByCodePoints`) | yes | no | yes |
| Run-boundary endpoint handling | yes | no | yes |
| Surrogate pair safety | yes | optional | yes |
| Span exact_text invariant | yes | yes | yes |
| Prefix/suffix derivation | yes | yes | no |
| N:M alignment | yes | yes | yes |
| Same-version multiple spans | yes | yes | yes |
| Same-version overlap prohibited | yes | yes | no |
| Duplicate span reuse | yes | yes | optional |
| Atomic rollback | no | yes | no |
| Cross-document rejection | yes | yes | no |
| Text immutability / destructive reset | yes | yes | no |
| Workspace snapshot | no | yes | yes |
| Pending tray behavior | yes | no | yes |
| Hover/active propagation | yes | no | yes |
| Connector geometry | yes | no | yes |
| Unicode E2E (emoji) | no | no | yes |
| Migration from zero | no | yes | no |

### Test Ownership

Every key invariant has at least one owner above. M0.7 is the hardening checkpoint where the full matrix is executed.

---

## 14. Failure Mode Analysis

| Failure | Impact | Detection | Prevention | Recovery | Test |
|---|---|---|---|---|---|
| Emoji offset corruption (UTF-16 written to DB) | Wrong spans/highlights; data corruption | Unicode E2E; unit tests | Single conversion utility; API only code points | Delete corrupted spans/alignments; re-enter | Unicode E2E, frontend unit |
| Stale selection after panel re-render | PendingSpan points at wrong text | User sees wrong highlight | Derive selection only from current DOM; clear pending on text/panel change | Re-select | Frontend unit |
| Overlapping spans render wrong | Duplicate/omitted text; selection broken | Visual inspection; component tests | Boundary segmentation; no per-char DOM | Fix segmentation | Frontend unit |
| Deleting version with alignments | Lost alignments | API error `TEXT_HAS_ANNOTATIONS` | Default block; force requires explicit param | Use force only intentionally | Backend integration |
| Duplicate spans | Logical duplicates; ambiguous reuse | Unique index; service lookup | Unique constraint + get-or-create | Merge duplicates manually | Backend integration |
| Failed transaction | Orphan spans/groups | DB count checks | Single atomic transaction; rollback | None needed if rolled back | Backend integration |
| Stale frontend cache | UI shows deleted/old alignments | TanStack Query invalidation | Invalidate after mutations; refetch workspace | Refetch/manual refresh | E2E |
| Panel reorder breaks connectors | Connectors point to old positions | Visual inspection | Recompute from DOM rects after reorder | Reorder triggers recompute | E2E/component |
| Scroll geometry drift | Connectors detached from text | Visual inspection | rAF recompute on scroll | Scroll triggers recompute | E2E/component |
| Browser selection crosses panels | Invalid pending span | Engine rejects | Check same TextPanel root | Ignore/reject selection | Frontend unit |
| NFC changes length | Offsets based on pre-NFC text wrong | Canonical content returned to client | Canonicalize before offsets; client uses canonical content | Re-import/annotate | Backend unit, Unicode E2E |
| Copied CRLF text | Extra `\r` in content/offsets | Canonicalization tests | Backend CRLF→LF | Re-import | Backend unit |
| Huge pasted text | Request too large; UI jank | 413 error; performance test | Enforce limits; no virtualization target 100k cp | Split document | Backend integration, optional perf |
| XSS-like text | Script execution | Security tests; no dangerouslySetInnerHTML | Plain-text rendering | — | Frontend component |
| Malformed BCP-47 tag | Wrong language grouping | Validation | Backend BCP-47 validation | Correct tag | Backend unit |
| Backend restart | In-flight transaction incomplete | DB transaction rollback | Use short transactions; no long-lived sessions | Retry request | Integration |
| Database unavailable | API 5xx | Health check | Fail fast; clear error | Restore DB | Integration |

---

## 15. ADR Drafts

The following ADR files are provided under `docs/adr/`:

- **ADR-001** Unicode code-point offsets
- **ADR-002** NFC canonical text
- **ADR-003** Alignment vs linguistic relations
- **ADR-004** PostgreSQL relational persistence
- **ADR-005** Annotated text immutability in M0
- **ADR-006** AlignmentGroup as N:M hyperedge
- **ADR-007** Pending selections remain client-side
- **ADR-008** Modular monolith
- **ADR-009** M0 environment baseline (Accepted)

Each ADR contains Context, Decision, Alternatives Considered, Consequences.

---

## 16. Decision Register

### Frozen Decisions

These are settled and must not be re-litigated by coding agents:

1. Language is data: `language_tag` (BCP-47) on TextVersion; no language-specific columns/tables.
2. Alignment is a symmetric N:M hyperedge via AlignmentMember; no source/target pair fields.
3. Alignment and linguistic relations are separate layers; M0 implements only alignment.
4. Canonical text is NFC, LF, no BOM, no trim/collapse/lowercase/NFKC.
5. Offsets in DB/API are Unicode code-point offsets; JS conversion is centralized.
6. Annotated text is immutable; no general content PATCH; explicit destructive reset only.
7. Pending selections are ephemeral frontend state; alignment is created in one atomic request.
8. Backend is a modular monolith: route → service → SQLAlchemy.
9. PostgreSQL is the database; SQLite is not an acceptable substitute for integration tests.
10. State ownership: TanStack Query for server state; local reducer/Context for ephemeral UI; no Redux/Zustand.
11. Repository is a simple monorepo without Nx/Turborepo/Bazel.
12. M0 does not implement pagination, virtualization, NLP, LLM, auth, collaboration, or graph DB.
13. JavaScript must use `codePointLength`/`sliceByCodePoints` (or equivalent) for code-point offsets; `String.length`/`String.slice` must never receive code-point offsets directly.
14. Connector geometry uses an explicit `RenderedSpanRegistry`; `data-span-id` selector parsing is not used.
15. Force-deleting a TextVersion revalidates all affected AlignmentGroups against all M0 alignment invariants and deletes invalid groups.
16. Playwright E2E tests live in `apps/web/e2e`.

### Deferred Decisions

| Decision | Deferred to |
|---|---|
| Full grapheme-cluster editing | M1+ |
| Re-anchoring / document revisions | M1+ |
| Semantic synchronized scrolling | After sentence alignment |
| Graph database for linguistic knowledge | Future milestone |
| Machine alignment candidates | Future milestone |
| Multi-user/auth | Future milestone |
| Pagination/performance virtualization | When measured need arises |

### Resolved This Round

These were open design choices; this pre-implementation adopts the recommended answer and records it as a decision.

| Question | Decision | Reason |
|---|---|---|
| `UNIQUE(document_id, label)` | Keep the unique constraint | Prevents ambiguous user-facing labels within a document; duplicates can be disambiguated by the user |
| TextVersion `sort_order` semantics | Non-unique server-side stable ordering integer; ordering uses `(sort_order, created_at, id)` | Avoids reorder churn; does not conflate server ordering with UI panel order |
| Workspace panel order | Ephemeral per-document frontend preference in `localStorage` (`panelOrder`), separate from server `sort_order` | Panel arrangement is a UI concern, not domain data |
| Span orphan cleanup on alignment delete | Delete orphan spans in the same transaction | Keeps TextVersion deletable and avoids junk data |
| TextVersion delete force semantics | Block by default + explicit `?force=true`; revalidate all affected AlignmentGroups against all M0 invariants | Prevents accidental alignment loss and preserves invariants |

### Environment Provisioning (separate from architecture readiness)

These are provisioning tasks, not architectural open decisions. ADR-009 fixes the environment baseline; M0.1 must provision the environment accordingly.

| Task | Baseline requirement |
|---|---|
| Python | Use Python 3.13.x via `uv python install 3.13` / `uv python pin 3.13` |
| Python manager | Install `uv` |
| Node | Use Node 24 LTS; adjust PATH/version manager so Node 24 is active |
| PostgreSQL | Provision PostgreSQL 18 (Docker Compose preferred; native fallback allowed) |
| Test database | Use a disposable PostgreSQL test database for migration/destructive tests; never the normal development DB |
| Git | Initialize Git in M0.1 (deferred by this errata closure) |

---

## 16A. Agent Working Rules

The following rules bind every coding agent during M0.1–M0.7:

1. Read `AGENTS.md` and `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` at the start of each checkpoint.
2. Do not change frozen invariants without an approved ADR/decision.
3. Do not automatically start the next checkpoint after finishing one.
4. Do not expand scope beyond the checkpoint contract.
5. Understand existing code before making mutations.
6. Commit tests with the implementation that makes them pass.
7. Never bypass Alembic migrations with manual DDL or `create_all()` for production schema changes.
8. Do not disable or loosen the TypeScript type checker.
9. Do not use `any` to escape TypeScript contracts.
10. Do not swallow exceptions; map domain errors explicitly.
11. Do not replace a core invariant with a `TODO`.
12. Do not fake test success (no empty assertions, no skipping core tests).
13. Do not delete or disable a failing test to get green.
14. Do not add infrastructure "for the future" unless the current checkpoint requires it.
15. If a repository reality conflicts with the architecture, stop the local implementation and report the conflict.

## 16B. Git Strategy

- Initialize Git in M0.1 (deferred by this errata closure; do not initialize Git or create the baseline commit during pre-implementation).
- Use conventional, checkpoint-aligned commits. Avoid giant `initial implementation` commits.
- Suggested commit sequence:

```text
chore: initialize monorepo and tooling
feat(api): health endpoint and app skeleton
feat(db): initial alembic migration for core domain
feat(api): project/document/text-version services
feat(api): alignment service and workspace read model
feat(web): project/document navigation
feat(web): text panel workspace
feat(web): selection engine and pending tray
feat(web): alignment creation/editing
feat(web): alignment visualization
test: unicode regression and e2e hardening
docs: finalize M0 documentation
```

- Each commit should keep the repository green (lint/typecheck/tests/build pass where applicable).
- Do not split into meaningless micro-commits; group by cohesive checkpoint deliverable.
- Commit generated lockfiles (`uv.lock`, `package-lock.json`) as soon as dependencies are initialized.

## 17. Refined M0.1–M0.7 Execution Contracts

### M0.1 — Repository Foundation

**Scope:** Initialize monorepo, frontend/backend skeletons, database service, migrations harness, health endpoint, lint/typecheck/test/build commands, developer setup.

**Inputs:** This report; frozen decisions; approved environment baseline.

**Files/areas allowed to change:** Root config files, `apps/api`, `apps/web`, `compose.yml`, `README.md`, `.gitignore`, `.env.example`, `infra/`.

**Required implementation:**
- Git init (deferred until M0.1 starts; **do not initialize now**), `.gitignore`, README.
- `apps/api` FastAPI app with `/api/v1/health`, SQLAlchemy/Alembic wiring, empty migration chain, pytest setup.
- `apps/web` Vite React TS app with TanStack Query, Vitest, lint/typecheck.
- `compose.yml` PostgreSQL 18 service (or approved alternative).
- Env configuration.
- Generate dependency lockfiles (`uv.lock` for backend, `package-lock.json` for frontend) and commit them as part of M0.1.

**Required tests:**
- Backend health endpoint test.
- Frontend smoke/unit test (e.g., app renders).
- Migration from zero to HEAD against a **disposable test PostgreSQL database**, never the normal development DB.

**Commands:**
- From `apps/api`: `uv sync`, `uv run pytest`, `uv run alembic upgrade head`
- From `apps/web`: `npm install`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`

**Acceptance criteria:**
- `GET /api/v1/health` returns 200.
- `alembic upgrade head` succeeds on a disposable clean DB.
- Frontend production build succeeds.
- Lint/typecheck/unit tests pass.
- `uv.lock` and `package-lock.json` are generated and committed.

**Explicit non-goals:** No domain models/endpoints beyond health; no UI features.

**Exit report:** files changed, commands run, versions used, environment deviations, known limitations.

### M0.2 — Persistence Model

**Scope:** Own schema, constraints, canonicalization, domain validation, and persistence foundations. The complete atomic Alignment create/update/delete service and HTTP endpoints belong to M0.5.

**Inputs:** M0.1 foundation; Final Domain Model in this report.

**Files/areas allowed to change:** `apps/api/app/db/models`, `apps/api/alembic`, `apps/api/app/schemas`, `apps/api/app/services`, backend tests.

**Required implementation:**
- SQLAlchemy models: Project, ParallelDocument, TextVersion, Span, AlignmentGroup, AlignmentMember.
- Alembic migration with all constraints/indexes.
- Canonical text utility in `apps/api/app/text/canonical.py` (required now because TextVersion creation depends on it).
- Domain validation helpers for offset ranges, BCP-47 syntax, and alignment invariant predicates (pure functions).
- Basic persistence foundations for all entities, including direct ORM create/read/delete tests; this is **not** the full alignment service.
- Deletion semantics helpers for Project/Document/TextVersion, including the destructive-reset revalidation rule, implemented enough to test the policy; the HTTP endpoint may be completed in M0.3/M0.5.

**Required tests:**
- Backend unit: canonicalization vectors (including corrected `18` and `26` code-point lengths), offset validation, invariants, deletion-policy predicates.
- Backend integration: real PostgreSQL migrations, FK/cascade/uniqueness, and direct persistence of each entity.
- Migration downgrade/destructive migration tests must use a **disposable test PostgreSQL database**, never the normal development DB.

**Commands:**
- From `apps/api`: `uv run pytest`
- From `apps/api`: `uv run alembic upgrade head`
- From `apps/api`: `uv run alembic downgrade base` against the disposable test database only.

**Acceptance criteria:**
- All tables exist and constraints are verified.
- CRUD for Project/Document/TextVersion works.
- Canonicalization and domain validation tests pass.
- Span/AlignmentGroup/AlignmentMember ORM persistence foundations exist.
- Complete atomic Alignment create/update/delete service is **not** required in M0.2.

**Explicit non-goals:** Full AlignmentService transaction, alignment HTTP endpoints, selection/UI.

### M0.3 — Document Workspace

**Scope:** Project/document navigation, text version creation/import, open/hide/reorder panels, workspace query.

**Inputs:** M0.2 models; API contract.

**Files/areas allowed to change:** `apps/api/app/api/routes`, `apps/api/app/schemas`, `apps/web/src/features/projects`, `documents`, `workspace` partial.

**Required implementation:**
- API routes for projects/documents/text-versions/workspace.
- Frontend routes for projects/documents/workspace.
- Text panel list/open/hide/reorder.
- Workspace query normalization into lookup maps.

**Required tests:**
- Backend integration: workspace snapshot shape.
- Frontend component: panel reorder/hide, workspace query hook.
- E2E: create project/document/versions (no alignment yet).

**Commands:**
- From `apps/api`: `uv run pytest`
- From `apps/web`: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- From `apps/web`: `npx playwright test e2e/golden-path.spec.ts` (E2E location is `apps/web/e2e`)

**Acceptance criteria:** User can create project/doc/versions and open panels; workspace API returns complete snapshot.

**Explicit non-goals:** selection, alignment, connectors.

### M0.4 — Selection Engine

**Scope:** Native selection → canonical code-point offsets; boundary segmentation; pending selection UI.

**Inputs:** M0.3 workspace; Selection Engine Specification.

**Files/areas allowed to change:** `apps/web/src/shared/text`, `apps/web/src/features/workspace` (selection capture, pending tray), frontend tests.

**Required implementation:**
- `offset.ts`, `selection.ts`, `segmentation.ts`.
- TextPanel renders segmented runs.
- Selection capture and `Add to Alignment` action.
- AlignmentTray pending members (add/remove/clear).
- Escape/cancel behavior.

**Required tests:**
- Frontend unit: all Unicode vectors, surrogate split, backward selection, cross-panel rejection, segmentation overlap.
- Frontend unit: `codePointLength`/`sliceByCodePoints` on `A🙂B` and mixed BMP/non-BMP content (`Café 🙂 mañana für français`).
- Frontend unit: Range endpoints exactly between rendered runs and unsupported boundary shapes are rejected.
- Component: tray reducer, invalid selection rejection.

**Commands:**
- From `apps/web`: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`

**Acceptance criteria:** Pending spans use code-point offsets; no UTF-16 offsets leak to API; overlapping spans render correctly; boundary handling is fully specified and tested.

**Explicit non-goals:** persistence of alignments; connectors.

### M0.5 — Manual Alignment

**Scope:** Own the **complete atomic Alignment create/update/delete service and HTTP endpoints**, including concurrency-safe Span get-or-create and orphan cleanup.

**Inputs:** M0.4 selection; M0.2 persistence foundations; API contract.

**Files/areas allowed to change:** `apps/api/app/services/alignment_service.py`, alignment routes/schemas; `apps/web/src/features/alignments`, tray actions.

**Required implementation:**
- `AlignmentService.create/update/delete` implementing the full atomic transaction, Span get-or-create via PostgreSQL `ON CONFLICT` or SAVEPOINT, validation of all alignment invariants, and orphan cleanup.
- POST/PATCH/DELETE alignment HTTP endpoints.
- Frontend Create Alignment action and alignment list/inspector basics.

**Required tests:**
- Backend unit: alignment invariants, same-version multi-span, N:M, deletion revalidation.
- Backend integration against disposable PostgreSQL: atomic transaction, rollback, span reuse, concurrency-safe get-or-create, orphan cleanup, endpoint behavior.
- Frontend unit: mutation invalidation, duplicate prevention.
- E2E: create alignment, reload, verify persistence.

**Commands:**
- From `apps/api`: `uv run pytest`
- From `apps/web`: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`

**Acceptance criteria:**
- Golden path create/reload works for 1:1, 1:N, N:M, same-version multi-span.
- Atomic Alignment create/update/delete service and HTTP endpoints are complete and tested.

**Explicit non-goals:** hover connectors, full Inspector editing.

### M0.6 — Alignment Visualization

**Scope:** Hover/active highlighting, SVG connectors, Inspector.

**Inputs:** M0.5 alignments; Rendering & Connector Specification.

**Files/areas allowed to change:** `apps/web/src/features/workspace` (ConnectorOverlay, Inspector), `apps/web/src/shared/rendering/spanRegistry.ts`, `shared/text/segmentation` if needed.

**Required implementation:**
- Hover/active state propagation.
- Run highlighting with non-color cues.
- `RenderedSpanRegistry` and ConnectorOverlay using registry lookups (no `data-span-id` selectors).
- ConnectorOverlay with recompute on scroll/resize/reorder.
- Inspector shows members and note; edit note/remove member/delete alignment.

**Required tests:**
- Frontend unit: hover propagation, connector geometry helpers.
- Frontend unit: `RenderedSpanRegistry` registration/unregistration and `getElements(spanId)`.
- E2E from `apps/web/e2e`: hover/click highlights counterparts; remove member; delete alignment.

**Commands:**
- From `apps/web`: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`
- From `apps/web`: `npx playwright test e2e`

**Acceptance criteria:** M0 golden path complete through step 16; connectors use the explicit span registry.

**Explicit non-goals:** complex edge routing; synchronized scrolling.

### M0.7 — Hardening

**Scope:** Full test matrix, Unicode E2E, error handling, accessibility, empty/loading states, clean production build, docs.

**Inputs:** M0.1–M0.6.

**Files/areas allowed to change:** all docs/tests/error handlers/polish.

**Required implementation:**
- Complete backend/frontend tests per Testing Strategy.
- Unicode E2E with `Café 🙂 mañana für français`.
- Error handling polish.
- Accessibility pass.
- Migration-from-zero check.
- Documentation finalization.

**Required tests:**
- From `apps/api`: `uv run pytest` (unit + integration against disposable PostgreSQL)
- From `apps/api`: `uv run alembic upgrade head` and `uv run alembic downgrade base` against disposable test PostgreSQL only
- From `apps/web`: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- From `apps/web`: `npx playwright test e2e`

**Acceptance criteria:** All M0 Definition of Done items pass; migration/destructive tests never touch the normal development DB.

**Explicit non-goals:** new features beyond M0 scope.

---

## 18. Implementation Order

```text
M0.1 Repository Foundation
  → M0.2 Persistence Model
    → M0.3 Document Workspace
      → M0.4 Selection Engine
        → M0.5 Manual Alignment
          → M0.6 Alignment Visualization
            → M0.7 Hardening
```

Why this order:

- M0.1 provides the runnable skeleton and environment verification.
- M0.2 puts the data model and invariants in place before any UI depends on them.
- M0.3 gives the workspace to display canonical text, which is required before selection has a real target.
- M0.4 de-risks the highest technical risk (Unicode selection) in isolation, before alignment persistence is wired to UI.
- M0.5 connects selection to atomic persistence and proves the core M0 loop.
- M0.6 adds the visualization layer that makes the workbench usable.
- M0.7 hardens and proves the full Definition of Done.

---

## 19. Pre-Implementation Exit Checklist

- [x] Read `AGENTS.md`.
- [x] Read `M0_PREIMPLEMENTATION_SPEC.md` in full.
- [x] Inspected repository tree and environment.
- [x] Produced repository assessment.
- [x] Validated frozen architecture (no blocking architecture problems).
- [x] Produced final domain model and ER diagram.
- [x] Produced canonical text/Unicode specification with test vectors.
- [x] Produced selection engine specification.
- [x] Produced rendering and connector specification.
- [x] Produced API contract with JSON examples.
- [x] Produced frontend architecture.
- [x] Produced backend architecture.
- [x] Produced repository blueprint.
- [x] Produced testing strategy and traceability matrix.
- [x] Produced failure mode analysis.
- [x] Produced ADR drafts.
- [x] Produced decision register.
- [x] Refined M0.1–M0.7 execution contracts.
- [x] Produced implementation order.
- [x] No unresolved architecture blockers remain after errata closure.
- [ ] Provision environment baseline before M0.1 execution (Python 3.13, uv, Node 24, PostgreSQL 18, disposable test DB, Git init) — this is a separate environment track, not an architecture blocker.

---

## Appendix: Task A–T Coverage Map

| Spec task | Where covered |
|---|---|
| A — Repository Reconnaissance | Section 2 |
| B — Validate Frozen Architecture | Section 3 |
| C — Final Domain Specification | Section 4 |
| D — ER Model | Section 5 |
| E — Canonical Text Contract | Section 6 |
| F — Selection Engine | Section 7 |
| G — Rendering Model | Section 8 |
| H — Connector Geometry | Section 8 |
| I — API Contract | Section 9 |
| J — Frontend Architecture | Section 10 |
| K — Backend Architecture | Section 11 |
| L — Testing Matrix | Section 13 |
| M — Failure Mode Analysis | Section 14 |
| N — ADR Set | Section 15 + `docs/adr/` |
| O — File/Directory Blueprint | Section 12 |
| P — Refine M0.1–M0.7 | Section 17 |
| Q — Agent Working Rules | Section 16A |
| R — Git Strategy | Section 16B |
| S — Documentation Blueprint | Section 12 |
| T — Decision Register | Section 16 |

### Final Status

**ARCHITECTURE READY FOR BASELINE CLOSURE**

All architectural defects from the errata closure are resolved. Environment readiness is a separate track: before M0.1 execution, the environment must be provisioned to the ADR-009 baseline (Python 3.13, uv, Node 24, PostgreSQL 18, disposable test DB, Git init). That provisioning does not block architectural closure.
