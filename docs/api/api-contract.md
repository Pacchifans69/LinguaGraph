# LinguaGraph — API Contract (as built, active M2 branch)

This document describes the API surface as actually implemented. It is a
description, not a new authority: the authoritative contract is
`docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md` section 9 and the
accepted ADRs and frozen milestone contracts. It documents the endpoints
implemented on the active M2 branch.

## 1. Base and conventions

- All endpoints live under `/api/v1`; JSON bodies (except `.txt` upload).
- All text offsets are **Unicode code-point offsets**: zero-based,
  start-inclusive, end-exclusive (ADR-001). The API never accepts or
  returns JavaScript UTF-16 offsets.
- Timestamps are timezone-aware ISO-8601 (`timestamptz`, UTC-normalized).
- Error envelope (stable, never leaks database internals):

```json
{ "code": "DOMAIN_CODE", "message": "Human-readable message", "details": {} }
```

HTTP status mapping:

| Code | HTTP status |
|---|---|
| `VALIDATION_ERROR` (incl. `INVALID_UTF8`, `INVALID_NULL_CHARACTER`, `INVALID_SURROGATE`, `SPAN_OUT_OF_RANGE`, `CROSS_DOCUMENT_ALIGNMENT`, `INSUFFICIENT_ALIGNMENT_MEMBERS`) | 422 |
| `INVALID_SEGMENTATION_PARTITION`, `SEGMENT_OUT_OF_RANGE`, `INVALID_SEGMENTATION_LOCALE`, `INVALID_SEGMENTATION_ORIGIN`, `UNSUPPORTED_SEGMENTATION_GRANULARITY` | 422 |
| `NOT_FOUND` | 404 |
| `CONFLICT`, `TEXT_HAS_ANNOTATIONS`, `DUPLICATE_ALIGNMENT_MEMBER`, `STALE_SEGMENTATION_CONTENT` | 409 |
| `TEXT_TOO_LARGE` | 413 |
| `UNAUTHORIZED` / `FORBIDDEN` / `METHOD_NOT_ALLOWED` / `HTTP_ERROR` | matching status |
| `INTERNAL_ERROR` | 500 (generic message; real error logged server-side only) |

Unmatched routes/methods return the same envelope (`NOT_FOUND` /
`METHOD_NOT_ALLOWED`).

## 2. Infrastructure

`GET /api/v1/health` → 200 `{"status": "ok"}`.

## 3. Projects

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/projects` | Create (201) |
| GET | `/api/v1/projects` | List |
| GET | `/api/v1/projects/{project_id}` | Get |
| PATCH | `/api/v1/projects/{project_id}` | Update metadata |
| DELETE | `/api/v1/projects/{project_id}` | Delete (cascade) |

Project fields: `id`, `name` (1–200), `description` (nullable, ≤2000),
`created_at`, `updated_at`. PATCH accepts `name`/`description`; omission =
unchanged, explicit `null` for `description` clears.

## 4. ParallelDocuments

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/projects/{project_id}/documents` | Create (201) |
| GET | `/api/v1/projects/{project_id}/documents` | List |
| GET | `/api/v1/documents/{document_id}` | Get |
| PATCH | `/api/v1/documents/{document_id}` | Update metadata |
| DELETE | `/api/v1/documents/{document_id}` | Delete (cascade) |

Document fields: `id`, `project_id`, `title` (1–300), `description`
(nullable, ≤2000), `created_at`, `updated_at`.

## 5. TextVersions

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/documents/{document_id}/text-versions` | Create/import (201) |
| GET | `/api/v1/text-versions/{text_version_id}` | Get |
| PATCH | `/api/v1/text-versions/{text_version_id}` | Metadata only (`label`, `sort_order`) |
| DELETE | `/api/v1/text-versions/{text_version_id}` | Delete; `?force=true` = ADR-005 destructive reset |

### 5.1 Create / import

Two paths, selected by `Content-Type`:

- **JSON paste**: `{"language_tag": "fr", "label": "French original",
  "content": "J’ai hâte de te voir demain."}`
- **`.txt` upload** (`multipart/form-data`): file field `file` (strict
  UTF-8 `.txt`), plus form fields `language_tag`, `label`.

The backend canonicalizes at the ingestion boundary (ADR-002): strict
UTF-8 decode → strip one leading BOM → CRLF/CR → LF → reject NUL and
surrogates → NFC → enforce `MAX_TEXT_VERSION_CODEPOINTS` (1,000,000).
`content_hash` = SHA-256 of canonical content. The response returns the
**canonical** content. Raw HTTP body size is capped by
`MAX_REQUEST_BODY_BYTES` (4,000,000) in middleware (413 `TEXT_TOO_LARGE`).

Response 201 fields: `id`, `document_id`, `language_tag`, `label`,
`content`, `content_hash`, `sort_order`, `created_at`, `updated_at`.

### 5.2 Metadata PATCH

Accepts `label` and/or `sort_order` only — **content is never accepted**.
Omission = unchanged; explicit `null` for `label`/`sort_order` is rejected
at the Pydantic boundary (422). Duplicate labels within one document are
`409 CONFLICT` (only the `uq_text_versions_document_label` violation is
classified; unexpected integrity errors propagate as `INTERNAL_ERROR`).

### 5.3 Delete / force delete (ADR-005)

- Unannotated version → plain DELETE allowed.
- Annotated version (alignment membership or a persisted segmentation layer)
  → blocked with `409 TEXT_HAS_ANNOTATIONS` unless `?force=true`.
- `?force=true` runs one atomic transaction: deletes the version's spans
  and memberships plus its segmentation layer/segments, then **revalidates every affected AlignmentGroup
  against ALL M0 invariants** and deletes any group that no longer
  satisfies them (e.g. fewer than 2 members or fewer than 2 distinct
  TextVersions). Shared spans with surviving memberships are preserved.

## 6. Alignments

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/documents/{document_id}/alignments` | Create atomically (201) |
| PATCH | `/api/v1/alignments/{alignment_id}` | Note update and/or full member replacement (200) |
| DELETE | `/api/v1/alignments/{alignment_id}` | Delete + orphan cleanup (204) |

### 6.1 Member input boundary

Members are **coordinate-only**:

```json
{ "text_version_id": "…", "start": 2, "end": 17 }
```

`quote`, `direction`, `content_hash` are never accepted. The server derives
`exact_text`, `prefix` (32 preceding code points) and `suffix` (32
following code points) from the canonical content. `exact_text` must equal
`content[start:end]` (invariant, server-verified).

### 6.2 POST create

```json
{ "note": "Phrase-level correspondence", "members": [ … ≥2 members … ] }
```

One transaction: load document/versions → verify ownership → validate
offset ranges → derive quotes/context → concurrency-safe Span get-or-create
(`INSERT … ON CONFLICT (text_version_id, start_offset, end_offset) DO
NOTHING RETURNING`, inside the same transaction) → create group/members →
validate final cardinality → commit. Any failure rolls back everything.

Enforced invariants: ≥2 members; ≥2 distinct TextVersions; all versions in
the group's document; no duplicate Span in a group; same-version spans in
one group must not overlap (adjacent/separated allowed); spans may be
reused across groups; different groups may overlap.

Response 201: `{id, document_id, note, created_at, updated_at, members:
[{id, span_id, text_version_id, start, end, exact_text}]}`.

### 6.3 PATCH update

Two independent modes, omission = unchanged:

- note only: `{"note": "Updated note"}` — `"note": null` clears;
- full member replacement: `{"members": [ … complete new set … ]}` —
  validates the new set, reuses/creates spans, deletes old members, creates
  new members, cleans orphan spans, all in one transaction. Minimum 2
  members from ≥2 distinct TextVersions enforced.
- note length ≤ 4000 at both the service and HTTP boundaries.

`updated_at` advances only on a logical change (a no-op PATCH leaves it
unchanged). Known limitation (unchanged, deferred beyond M0): concurrent
PATCHes to the same group have no general backend concurrency-control
protocol.

### 6.4 DELETE

204; deletes members, then deletes Spans that no longer have any
AlignmentMember (orphan cleanup) in the same transaction.

## 7. Sentence segmentation (M2 / ADR-010)

| Method | Path | Purpose |
|---|---|---|
| PUT | `/api/v1/text-versions/{text_version_id}/segmentations/sentence` | Atomically create or fully replace the one sentence layer |
| DELETE | `/api/v1/text-versions/{text_version_id}/segmentations/sentence` | Explicitly delete the sentence layer (204) |

PUT accepts a complete candidate partition:

```json
{
  "content_hash": "<64-char canonical text SHA-256>",
  "requested_locale": "de",
  "resolved_locale": "de",
  "origin": "manual",
  "segments": [
    { "start": 0, "end": 14 },
    { "start": 14, "end": 29 }
  ]
}
```

Coordinates are Unicode code-point `[start,end)` offsets. For non-empty
content, segments must be ordered, contiguous, non-overlapping, non-empty and
tile the canonical content from 0 to its code-point length. Empty canonical
content requires an empty segment list. The backend checks
`content_hash == TextVersion.content_hash`, validates both locale fields as
BCP-47 tags, derives every `exact_text`, assigns zero-based ordinals and
replaces the old layer/segments in one transaction.

There is at most one persisted layer per
`(text_version_id, granularity)`. M2 supports only `sentence`; origin is
`manual` or `intl_segmenter`. Suggested boundaries are never persisted
until the Human saves them. DELETE affects no AlignmentGroup, AlignmentMember
or Span.

Response:

```json
{
  "layer": {
    "id": "…",
    "text_version_id": "…",
    "granularity": "sentence",
    "requested_locale": "de",
    "resolved_locale": "de",
    "origin": "manual",
    "content_hash": "…",
    "created_at": "…",
    "updated_at": "…"
  },
  "segments": [
    {
      "id": "…",
      "segmentation_layer_id": "…",
      "ordinal": 0,
      "start_offset": 0,
      "end_offset": 14,
      "exact_text": "…",
      "created_at": "…"
    }
  ]
}
```

## 8. Workspace read model

`GET /api/v1/documents/{document_id}/workspace` → 200 document-level
snapshot (no pagination in M0):

```json
{
  "document": { "id", "project_id", "title", "description", "created_at", "updated_at" },
  "text_versions": [ { "id", "document_id", "language_tag", "label", "content", "content_hash", "sort_order", "created_at", "updated_at" } ],
  "spans": [ { "id", "text_version_id", "start_offset", "end_offset", "exact_text", "prefix", "suffix", "created_at" } ],
  "alignment_groups": [ { "id", "document_id", "note", "created_at", "updated_at" } ],
  "alignment_members": [ { "id", "alignment_group_id", "span_id", "created_at" } ],
  "segmentation_layers": [ { "id", "text_version_id", "granularity", "requested_locale", "resolved_locale", "origin", "content_hash", "created_at", "updated_at" } ],
  "segments": [ { "id", "segmentation_layer_id", "ordinal", "start_offset", "end_offset", "exact_text", "created_at" } ]
}
```

Deterministic TextVersion ordering `(sort_order, created_at, id)`; the
snapshot is fully materialized inside one owned read transaction (no lazy
loading after service return). The frontend normalizes the flat arrays into
lookup maps; the workspace snapshot is the authoritative persisted read
model for alignment rendering and saved segmentation state.

## 9. Unicode code-point offset semantics (summary)

- Persisted/API offsets are code-point offsets into the **canonical**
  `TextVersion.content` (NFC).
- Mandatory regression vectors: `A🙂B` = 3 code points; `für größere
  Häuser` = 18; `Café 🙂 mañana für français` = 26.
- The frontend converts native DOM/UTF-16 positions with the single shared
  utility layer (`apps/web/src/shared/text/offset.ts`); React components
  never reimplement conversion; surrogate-pair splits are rejected.

## 10. Error examples

```json
{ "code": "SPAN_OUT_OF_RANGE", "message": "span [0,999) exceeds canonical content length 26", "details": { "text_version_id": "…", "start": 0, "end": 999 } }
{ "code": "STALE_SEGMENTATION_CONTENT", "message": "TextVersion content changed before segmentation could be saved", "details": { "text_version_id": "…", "submitted_content_hash": "…", "current_content_hash": "…" } }
{ "code": "TEXT_HAS_ANNOTATIONS", "message": "text version is part of alignments; use ?force=true to destroy annotations", "details": {} }
{ "code": "VALIDATION_ERROR", "message": "request validation failed", "details": { "errors": [ { "location": ["body","label"], "type": "string_too_long", "message": "…", "input_type": "str" } ] } }
```
