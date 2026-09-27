# LinguaGraph — Architecture (M9 implementation candidate)

This document describes the durable M8 architecture plus the bounded M9
implementation candidate on `m9-grapheme-safe-native-selection-capture`.
M9 Gate 2, Human Runtime Acceptance, PR and merge are not yet established. It
is a description, not a new authority: the accepted ADRs
(`docs/adr/ADR-001…ADR-017`) and the authoritative
pre-implementation documents
(`docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`,
`M0_PREIMPLEMENTATION_REPORT.md`) remain authoritative. Where this document
and an ADR disagree, the ADR wins.

## 1. System overview

LinguaGraph is a local, single-user **manual alignment workbench**: users
create projects and parallel documents, add arbitrary-language text
versions, select text spans with the native browser selection, and build
multilingual alignment groups by hand. M0 deliberately implements no
authentication, no collaboration, no NLP/LLM features, no machine
translation, and no distributed infrastructure.

The end-to-end request/rendering path:

```text
browser
  → React / TanStack Query (apps/web)
  → /api/v1 (Vite dev-server proxy in development)
  → FastAPI route (apps/api/app/api/routes)
  → application/domain service (apps/api/app/services)
  → SQLAlchemy 2.0 ORM (apps/api/app/db)
  → PostgreSQL 18
```

The workspace snapshot read model flows back through the same layers and is
normalized into lookup maps by the frontend; the frontend renders canonical
text as flat boundary-segmented runs and never persists any domain state
optimistically.

## 2. Modules and layers

### 2.1 Frontend (`apps/web` — React 19 + TypeScript + Vite)

- **Route tree**: `/` → `/projects` → `/projects/:projectId/documents` →
  `/documents/:documentId/workspace`.
- **Server state**: TanStack Query owns everything fetched from `/api/v1`
  (projects, documents, workspace snapshot, alignment mutations). Query
  keys follow the report: `['projects']`, `['project', id]`,
  `['documents', projectId]`, `['document', id]`, `['workspace',
  documentId]`, plus document-scoped mutation keys.
- **Ephemeral UI state**: a `WorkspaceProvider` (React Context + reducer)
  scoped to the workspace route owns `currentSelection`, `pendingMembers`
  (the Alignment Tray, ADR-007), `hoveredAlignmentId`,
  `activeAlignmentId`, and the inspector mutation-freeze flag. Nothing
  ephemeral is persisted to `localStorage`; only per-document panel
  preferences are (`linguagraph.workspace.preferences.v1.<documentId>`).
  M6 mode and active linguistic TextVersion are document-scoped component
  state: they are deterministic on mount and are not persisted.
- **Shared text engine** (`src/shared/text/`, framework-light, unit-tested
  without React):
  - `offset.ts` — the single UTF-16 ↔ Unicode code-point conversion
    strategy (ADR-001): `codePointLength`, `sliceByCodePoints`,
    `utf16OffsetToCodePointOffset`, `codePointOffsetToUtf16Offset`;
  - `grapheme.ts` — M9 frontend-only complete-content grapheme boundary
    derivation using platform `Intl.Segmenter`; UTF-16 Segmenter indices
    convert through `offset.ts` before authoring validation;
  - `selection.ts` — native `Selection`/`Range` → canonical code-point
    `PendingSpan`, fail-closed structural/grapheme result codes,
    canonical-quote integrity, code-point-based reverse locator;
  - `segmentation.ts` — canonical content + persisted Spans + alignment
    memberships → flat minimal runs (overlap supported; concatenated run
    text equals canonical content exactly);
  - `types.ts` — shared types.
- **Rendering** (`src/shared/rendering/`): `RenderedSpanRegistry`
  (`Map<spanId, HTMLElement[]>` — the canonical span→DOM bridge, never
  selector-discovered), run visual-state classification (never color-only),
  connector geometry helpers. M8 adds `connectorRouting.ts` for pure,
  deterministic panel-obstacle routing without another Span→DOM lookup.
- **Workspace components** (`src/features/workspace/`): `TextPanel`
  (canonical content root with flat `<span data-run data-start data-end>`
  runs, `white-space: pre-wrap`, no `dangerouslySetInnerHTML`),
  `AlignmentTray`, `ConnectorOverlay` (SVG, `pointer-events: none`,
  rAF-coalesced recomputation), `WorkbenchTaskNavigation`, mount-preserved
  task sessions, and on-demand mount-preserved `ImportPanel`. The persistent
  canonical canvas and connector overlay retain their common coordinate
  container; exactly one of Alignment/Sentence/Token/Lemma/POS is visible in
  the bounded task deck.
- **Alignments** (`src/features/alignments/`): `SavedAlignments` (read-only
  persisted representation + keyboard-accessible activation index),
  `AlignmentInspector` (note editing, member removal, delete — all driven
  by the authoritative workspace snapshot, no optimistic persisted state).
- **Sentence segmentation** (`src/features/segmentation/`):
  `sentenceSuggestion.ts` converts optional `Intl.Segmenter` UTF-16
  boundaries through the shared code-point utility and validates a complete
  partition; `SegmentationPanel` owns only an unsaved preview and exposes
  manual initialization, split, merge, discard, save and confirmed delete.
  Sentence, Token, Lemma, and POS editors are keyed by TextVersion and remain
  mounted in the task deck; inactive sessions use `hidden`, remain outside
  `[data-text-content-root]`, and report dirty/pending/error/conflict/dialog
  status to the Workbench shell.
- **Shared UI**: `ErrorMessage` (`role="alert"`), `LoadingMessage`
  (`role="status"`), `EmptyState`, `ConfirmDialog` (accessible destructive
  confirmation with focus lifecycle, M0.7).

### 2.2 Backend (`apps/api` — FastAPI modular monolith, ADR-008)

Strict layering:

```text
HTTP route (parse/validate HTTP, map responses)
    → application/domain service (business rules, transaction ownership)
    → SQLAlchemy 2.0 persistence (models in app/db/models)
```

- **Routes** (`app/api/routes/`): health, projects, documents,
  text_versions, workspace, alignments, sentence/token segmentations and
  token-segment lemma and coarse POS annotations. Routes
  never commit/rollback.
- **Services** (`app/services/`): `ProjectService`, `DocumentService`,
  `TextVersionService`, `AlignmentService`, segmentation service, lemma
  annotation service, POS annotation service and
  `WorkspaceService`. Write
  services own exactly one `write_transaction`; read services own one
  `read_transaction`; the Session is transaction-clean between public
  service calls (a caller-owned pending transaction/mutation raises
  `SessionNotCleanError`).
- **Domain errors** (`app/api/errors.py`): every expected failure is a
  `DomainError` with a stable `{code, message, details}` envelope; HTTP and
  Pydantic validation failures are converted to the same envelope. Database
  exception strings never leak to clients.
- **Text utilities** (`app/text/`): `canonical.py` (the authoritative
  canonicalization pipeline, ADR-002), `offsets.py` (code-point offsets),
  `bcp47.py` (syntactic RFC 5646 validation).
- **Configuration** (`app/core/config.py`): pydantic-settings, environment
  driven (`DATABASE_URL`, `TEST_DATABASE_URL`, `CORS_ORIGINS`,
  `MAX_TEXT_VERSION_CODEPOINTS`, `MAX_REQUEST_BODY_BYTES`, `LOG_LEVEL`).
- **Middleware** (`app/api/middleware.py`): raw request-body size limit
  (413 `TEXT_TOO_LARGE` before unbounded buffering).
- **Disposable-database machinery** (`app/db/disposable.py`): the shared,
  fail-closed lifecycle used by both the pytest integration fixtures and
  the Playwright E2E backend; never targets the development database.

### 2.3 Database (PostgreSQL 18, ADR-004)

Ten domain tables, all language-neutral: `projects`,
`parallel_documents`, `text_versions`, `spans`, `alignment_groups`,
`alignment_members`, `segmentation_layers`, `segments`,
`token_lemma_annotations`, `token_pos_annotations`. Schema is
managed exclusively by Alembic (revision `0006` is the M5 implementation
candidate head;
`0001` is the no-op foundation and `0002`–`0005` remain unchanged). Constraints
and indexes live in migrations; cross-table and complete-partition invariants
are service responsibilities. See `docs/api/api-contract.md` for the offset
contract and `docs/development/CURRENT_STATE.md` for the schema summary.

## 3. Important boundaries

- **Unicode coordinate system (ADR-001)**: persisted/API offsets are
  zero-based, start-inclusive, end-exclusive Unicode **code-point**
  offsets. JavaScript UTF-16 offsets are converted by the single frontend
  utility layer and are never sent to the API. React components never
  implement offset conversion themselves.
- **Canonical text (ADR-002)**: the backend is the authority; the frontend
  renders and selects only server-returned canonical content. The pipeline:
  strict UTF-8 decode → strip one leading BOM → CRLF/CR → LF → reject
  NUL/surrogates → NFC → size limit → hash of canonical content.
- **Alignment semantics (ADR-003, ADR-006)**: `AlignmentGroup` is a
  symmetric N:M hyperedge ("these text occurrences correspond in this
  ParallelDocument"). No source/target fields, no relation types, no
  language-specific schema.
- **Linguistic segmentation (ADR-010)**: `SegmentationLayer` and `Segment`
  are independent persisted linguistic structure. A sentence layer is one
  ordered complete partition of one canonical TextVersion; it is never an
  alignment Span, render run, tray item or candidate alignment. Replacement
  locks the TextVersion, checks its content hash, validates the full partition
  and commits atomically.
- **Sentence-bound tokens (ADR-011)**: a token layer binds by
  `basis_layer_id` to one exact sentence layer, refines every sentence
  boundary, completely partitions canonical text, and carries required
  Human-reviewed `is_word_like` classification. Ordinary sentence mutation is
  blocked while the token dependent exists; token deletion remains explicit.
- **Token-occurrence lemma annotation (ADR-012)**: `TokenLemmaAnnotation` is a
  sparse occurrence-level record bound directly to one saved token
  `Segment.id`, with `UNIQUE(token_segment_id)` and an `ON DELETE CASCADE` FK.
  It stores no `text_version_id`, layer id, language tag, coordinates,
  `exact_text`, `is_word_like` or sentence basis id — those stay owned by the
  token hierarchy. There is no Lexeme, no lemma layer and no generic
  annotation/EAV framework. Lemma mutation and token replacement/deletion
  serialize on the same `TextVersion` `SELECT ... FOR UPDATE` root lock; while
  a lemma dependent exists, ordinary token replacement/deletion fails with
  `409 SEGMENTATION_HAS_DEPENDENTS` and M4 never re-anchors annotations.
  `force=true` TextVersion destruction removes the whole
  TextVersion → layer → segment → lemma chain atomically.
- **Token-occurrence coarse POS annotation (ADR-013)**: `TokenPosAnnotation` is
  a second sparse occurrence-level record bound directly to one saved token
  `Segment.id`, with `UNIQUE(token_segment_id)` and an `ON DELETE CASCADE` FK.
  It is the SIBLING of the lemma annotation: no FK, no derivation, no shared
  lifecycle — neither, lemma only, POS only and lemma + POS are all valid. The
  accepted value set is the closed, case-sensitive fifteen-value LinguaGraph
  coarse-POS vocabulary (`PUNCT`/`SYM` deliberately excluded), aligned with UD
  v2 UPOS as design provenance without any complete-conformance claim. It
  stores no `text_version_id`, layer id, language tag, coordinates,
  `exact_text`, `is_word_like`, sentence basis id or lemma. There is no Lexeme
  and no generic annotation/EAV framework. POS mutation and token
  replacement/deletion serialize on the same `TextVersion` root lock; while a
  lemma and/or POS dependent exists, ordinary token replacement/deletion fails
  with `409 SEGMENTATION_HAS_DEPENDENTS` reporting the complete
  `dependency_types` set, and M5 never re-anchors annotations.
- **Text immutability (ADR-005 / ADR-010)**: annotated `TextVersion.content` is
  immutable; deletion of an annotated version requires the explicit
  `DELETE ?force=true` destructive-reset flow, which revalidates affected
  groups against all invariants and deletes invalid groups atomically.
  Persisted segmentation also counts as annotation; force deletion cascades
  its layer and segments.
- **Pending selections (ADR-007)**: the tray is ephemeral frontend state;
  nothing persists until one atomic Create-Alignment request.
- **Mode-oriented Workbench (ADR-014)**: the canonical Text Canvas is
  persistent; one bounded task destination is visible; editor sessions are
  mount-preserved; compact Tray status is mode-independent; authoritative
  basis changes make dirty linguistic drafts conflict and fail closed.
- **State ownership (report section 10)**: TanStack Query = server state;
  reducer/Context = ephemeral UI; localStorage = per-document panel
  preferences only. No Redux/Zustand.
- **Transaction ownership (report section 11)**: services own transaction
  boundaries; routes never commit/rollback; integration tests assert the
  session is transaction-clean after service calls.
- **Server-derived annotation metadata (report section 4)**: the client
  sends coordinates only; `exact_text`/`prefix`/`suffix` are derived from
  canonical content by the server.
- **Test/database isolation (M0.3 review hardening)**: integration and E2E
  flows run on uniquely named disposable databases
  (`linguagraph_*` / `linguagraph_e2e_<12 hex>`); `assert_disposable_db_url`
  fails closed; the E2E frontend proxy is pinned to the isolated E2E API.

## 4. M7 Alignment concurrency (as built)

M7 closes the retained Alignment concurrency debt without changing schema or
HTTP contracts. Scoped Alignment CREATE/PATCH/DELETE operations acquire the
owning ParallelDocument row first, then participating TextVersion rows in
deterministic UUID order. Destructive TextVersion deletion and unannotated
content replacement join the same document→TextVersion order.

Pre-lock reads are locator-only. Mutation-authoritative Alignment/member/Span
and canonical-text state is re-resolved under locks. Same-group PATCHes are
serial-equivalent, and Span orphan cleanup is evaluated against serialized
surviving memberships.

Project and ParallelDocument production deletion remain unchanged; M7 retains
them as mandatory real-PostgreSQL concurrency audit surfaces. ADR-015 records
the decision.

## 5. M8 connector routing (exact candidate as built)

The exact M8 candidate is `2441f9cf60b7cc9402c5b257be010b559b39b717`
(tree `5d1b7c7cc104cd365b0ea629d9ead7677d17f2be`). Its connector
identity remains `AlignmentMember.span_id → RenderedSpanRegistry → visible
clipped member rects`; the chosen anchor is projected to the owning
`.panel-slot` perimeter. Every visible slot is an obstacle. The existing
`.panels-container` has an 8px internal reserve, and the route search expands
obstacles by 4px. A pure TypeScript orthogonal visibility graph selects one
complete route per visible member and one deterministic shared free-space
hub for the N:M Alignment. If a complete set cannot be found, it renders
no connector route for that frame; no straight-through fallback exists.

`ConnectorOverlay` renders SVG polylines. Its ephemeral geometry is bound to
`alignmentId + layoutKey` and recomputed through the existing rAF-coalesced
scroll/resize/ResizeObserver lifecycle. No route coordinates enter backend,
API, PostgreSQL, TanStack Query domain data, or localStorage. The canonical
text DOM, native Selection/Range, backend schema, Alembic `0006`, dependencies,
and responsive track-count rules remain unchanged. ADR-016 records this
implementation decision; the frozen `M8_CONTRACT.md` governs its scope.

C16 formal hosted Gate 2 is established for that exact candidate. Targeted
Human Runtime Acceptance also passed on that exact application epoch: Human
`ZJX` recorded `PASS` at `2026-09-27T16:12:00+08:00`, so `HRA-F09` is
**CLOSED / HUMAN ACCEPTED**. Final Static Human Diff Review is **PASS /
M8-SHDR-F01 HUMAN APPROVED** for landed docs-only successor
`a112bb9af08624e12bb0323ba283daf22edacccd` (tree
`c221e92c7778429d9e29f5adf7c612d1b938bf53`). PR #17 subsequently merged
terminal reviewed head `8fee64449f8b80b228d804c7fa7b6671a4ef0211` by rebase
after explicit Human Merge Decision. Its tree
`a6abdd4cedb9311586d3c25c6a9b48ad4d25c9cd` is exactly identical to
post-rebase `main@4d9cc80b7c6b89b9990c37a2ec41e69e690852d3`; M8 Gate 3 is
**PASS / EXACT**. Gate 2 and targeted Human Runtime Acceptance authority remain
bound to exact semantic candidate
`2441f9cf60b7cc9402c5b257be010b559b39b717`. The Human-authorized
exact-guarded cleanup deleted historical implementation branch
`m8-alignment-connector-obstacle-avoiding-routing@8fee64449f8b80b228d804c7fa7b6671a4ef0211`;
post-delete verification and independent GitHub readback confirmed it absent
while durable `main@2a2dbcc4892d2fb75af36f7fb3903461f2dad75d`, proof
`main@6ac44484aebc58aac866bfb69f05960189b0aefc`, and PR #17 merge state
remained unchanged.

## 6. M9 grapheme-safe native selection capture (implementation candidate)

M9 narrows one authoring boundary without changing the persisted coordinate
system. For a **new native TextPanel selection**, the existing DOM endpoint
resolution first produces canonical Unicode code-point offsets. A new
frontend-only helper then segments the complete canonical
`TextVersion.content` with platform `Intl.Segmenter` at
`granularity: "grapheme"`; every Segmenter UTF-16 index passes through the
shared `utf16OffsetToCodePointOffset` utility before comparison.

Both canonical endpoints must be members of that complete-content grapheme
boundary set. A legal code-point endpoint inside one extended grapheme returns
`INVALID_GRAPHEME_BOUNDARY`; no snapping or native Range rewrite occurs.
Missing, throwing, malformed, non-tiling, or otherwise unusable Segmenter
capability returns `GRAPHEME_SEGMENTER_UNAVAILABLE` and fails closed rather
than falling back to code-point-only authoring.

`TextPanel` clears stale `currentSelection` after every failed recapture.
Only the two M9 errors receive new bounded user feedback; already-staged tray
members are not cleared. A later valid capture recovers normally.

The restriction is forward-authoring-only. Persisted/API Span offsets remain
Unicode code points under ADR-001, and `canonicalRangeToDomRange` remains
code-point based. Historical code-point-valid ranges that bisect a grapheme
therefore remain readable/renderable and are not migrated. Rendered
`[data-run]` boundaries are not grapheme authority, and `language_tag` is
not a boundary input.

M9 adds no backend/API/schema/Alembic/dependency/runtime/workflow change.
Sentence/Token manual split and full grapheme-aware editing remain deferred.
ADR-017 records this decision; `M9_CONTRACT.md` remains the frozen execution
authority.

## 7. Known limitations

- The PostgreSQL Span get-or-create implementation remains concurrency-safe,
  but same-document Alignment CREATEs are now serialized at the document root;
  the retained direct get-or-create test therefore does not force every
  uncommitted unique-conflict interleaving.
- New native TextPanel selection capture is grapheme-safe under M9, but
  Sentence/Token manual split and full grapheme-cluster editing remain deferred.

## 8. Environment and operations

- ADR-009 baseline: Python 3.13 (uv), Node 24, PostgreSQL 18. CI uses a
  GitHub Actions PostgreSQL 18 service container (`.github/workflows/ci.yml`).
- `.\scripts\dev.ps1` (Windows): safe one-command launcher — Docker Compose
  PostgreSQL 18 only, FastAPI and Vite run locally.
- `.\scripts\verify.ps1` (Windows): thin orchestration over the
  authoritative verification commands; never destructive to development
  data.
