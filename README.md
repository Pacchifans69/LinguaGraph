# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a desktop-grade
workbench for reading parallel texts side by side, selecting text spans, and
building multilingual alignment groups by hand.

Primary target languages: English, German, French, Spanish (the model is
language-neutral via BCP-47 `language_tag`).

## Current milestone

**M0 — Manual Alignment Workbench**. The latest completed checkpoint is
**M0.4 — Selection Engine** (**COMPLETE / MERGED**). M0.1 — Repository
Foundation, M0.2 — Persistence Model, M0.3 — Document Workspace, and
M0.4 — Selection Engine were human-approved and merged into `main` (PR #1,
PR #2, PR #5, and PR #6). M0.4 merged as
`b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad` from final feature head
`2d0d4bcf6dd562e3cab003aa615049628c173999`.

The next checkpoint is **M0.5 — Alignment Persistence** (**NOT STARTED**).
M0.5 must not begin from this closeout task: it requires a fresh checkpoint
conversation, repository-reality reconstruction from current merged `main`,
Gate 1, contract reconstruction from the authoritative sources, and human
contract review/freeze before any implementation branch is created.

M0 proves the closed loop: *create project → create parallel document → add
arbitrary-language text versions → select spans → create alignment group →
persist → reload → highlight counterparts*. M0.3 delivered project/document
navigation, TextVersion creation/import, side-by-side TextVersion panels and
the workspace read model. M0.4 delivered the frontend selection engine:
UTF-16 ↔ code-point conversion, native Selection/Range canonicalization,
flat boundary-segmented runs, current-selection capture, the client-side
PendingSpan Alignment Tray (explicit Add/remove/clear, duplicate/overlap
staging rules, lifecycle/Escape behavior, frontend-only state) and Unicode
browser coverage — with NO alignment persistence. M0.5 remains responsible
for the complete atomic Alignment create/update/delete service and its
persistence endpoints, concurrency-safe Span get-or-create, and the
persistence lifecycle/orphan cleanup as already frozen.

Authoritative documents:

- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md`
- `docs/development/CURRENT_STATE.md` — durable engineering handoff
- `docs/adr/` — accepted architecture decisions (ADR-001 … ADR-009)

## Repository layout

```text
apps/api/            FastAPI backend (Python 3.13, uv)
apps/web/            React + TypeScript + Vite frontend (Node 24)
docs/                Pre-implementation records, ADRs
infra/postgres/      PostgreSQL bootstrap scripts
compose.yml          PostgreSQL 18 local development service
```

## Prerequisites (ADR-009 environment baseline)

| Component | Version | Notes |
|---|---|---|
| Python | 3.13.x | managed by uv (`uv python install 3.13`) |
| uv | latest | https://docs.astral.sh/uv/ |
| Node.js | 24 LTS | adjust PATH/version manager so `node --version` reports 24 |
| PostgreSQL | 18 | Docker Compose preferred; native fallback allowed |
| Git | any | repository is initialized; remote `origin` configured |

Verify with:

```bash
uv --version
node --version            # must be v24.x (see .nvmrc)
uv run python --version   # prints the pinned 3.13.x, independent of system python3
```

## Setup from a clean checkout

### 1. Backend

Create `apps/api/.env` from the example (never commit `.env`; adjust
`DATABASE_URL` if needed):

```bash
# POSIX / WSL / Git Bash
cd apps/api
cp .env.example .env

# Windows CMD
cd apps/api
copy .env.example .env

# Windows PowerShell
cd apps/api
Copy-Item .env.example .env
```

Then synchronize dependencies (creates `.venv`, installs the pinned Python
3.13 and dependencies from the committed `uv.lock`):

```bash
uv sync
```

### 2. Frontend

```bash
cd apps/web
npm ci                    # exact install from the committed package-lock.json
```

`npm ci` is preferred when the lockfile exists (it installs the exact
committed tree and never rewrites the lockfile). Use `npm install` only when
you intentionally change `package.json` dependencies. Dependencies are
resolved from the official npm registry (see `apps/web/.npmrc`).

### 3. PostgreSQL 18

Preferred — Docker Compose:

```bash
docker compose up -d postgres
docker compose ps         # wait until healthy
```

The container creates the `linguagraph` development database and the
disposable `linguagraph_test` integration-test database on first init
(`infra/postgres/init.sql`).

Native fallback (no Docker): install PostgreSQL 18, start the cluster, then:

```bash
sudo -u postgres psql -c "CREATE ROLE linguagraph LOGIN CREATEDB PASSWORD 'linguagraph'"
sudo -u postgres psql -c "CREATE DATABASE linguagraph OWNER linguagraph"
sudo -u postgres psql -c "CREATE DATABASE linguagraph_test OWNER linguagraph"
```

`CREATEDB` is required so integration tests can create and drop their own
disposable databases (with Docker Compose the `POSTGRES_USER` is the
container superuser, so no extra step is needed there).

## Database migrations (Alembic)

Migrations live in `apps/api/alembic/`; run them from `apps/api`:

```bash
uv run alembic upgrade head    # migrate to the latest revision
uv run alembic current         # show applied revision
uv run alembic history         # show the chain
```

`DATABASE_URL` (env) overrides the default in `alembic.ini`. Migration tests
and all destructive checks run only against disposable databases
(`linguagraph_test` server), never the development database.

## Running

### Backend (port 8000)

```bash
cd apps/api
uv run uvicorn app.main:app --reload
```

Health endpoint:

```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok"}
```

Interactive API docs: <http://localhost:8000/docs>.

### Frontend (port 5173)

```bash
cd apps/web
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to
`http://localhost:8000`, so the app reaches the backend without CORS issues
(`CORS_ORIGINS` in `apps/api/.env` is the allow-list for direct calls).

## Verification commands

Backend (from `apps/api`):

```bash
uv sync --frozen                         # dependency synchronization (lockfile must be current)
uv run pytest                            # unit + integration tests
uv run alembic upgrade head              # migrate (against configured DB)
```

Frontend (from `apps/web`):

```bash
npm ci                                   # exact install from the committed lockfile
npm run lint                             # ESLint
npm run typecheck                        # tsc -b (strict, noEmit)
npm run test                             # Vitest + React Testing Library
npm run build                            # production build (typecheck + vite build)
```

Integration tests are skipped with an explicit message when no PostgreSQL
server is configured (`TEST_DATABASE_URL`, falling back to `DATABASE_URL`;
both may come from `apps/api/.env`); they always operate on disposable
databases.

## Configuration

Environment-driven via `apps/api/app/core/config.py` (pydantic-settings):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph` | PostgreSQL connection |
| `TEST_DATABASE_URL` | unset (falls back to `DATABASE_URL`) | server for disposable test databases |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated allow-list |
| `MAX_TEXT_VERSION_CODEPOINTS` | `1000000` | max canonical text length |
| `MAX_REQUEST_BODY_BYTES` | `4000000` | max request body size |
| `LOG_LEVEL` | `INFO` | logging level |

`.env.example` files contain non-secret development defaults only; never
commit `.env`.

## M0.3 scope and non-goals

M0.3 implements the document workspace on top of the M0.2 persistence model:

- **Projects** — HTTP CRUD (`apps/api/app/api/routes/projects.py`) and the
  frontend Projects page (`/projects`);
- **ParallelDocuments** — HTTP CRUD (`routes/documents.py`) and the Documents
  page (`/projects/:projectId/documents`);
- **TextVersions** — HTTP create (JSON plain-text paste and strict UTF-8
  `.txt` multipart import), get, metadata-only `PATCH` (`label`,
  `sort_order`), delete and `DELETE ?force=true` (ADR-005 destructive reset)
  in `routes/text_versions.py`; canonical server responses (NFC, LF, BOM-strip,
  hash of canonical content);
- **Workspace read model** — `GET /api/v1/documents/{id}/workspace` with flat
  `document / text_versions / spans / alignment_groups / alignment_members`
  collections, served by `services/workspace_service.py` inside one owned
  read transaction (no lazy-load after return);
- **Frontend workspace** — `/documents/:documentId/workspace` with
  independent TextPanels (language tag, label, hide control, exact canonical
  content as plain pre-wrap text), panel open/hide/reorder, per-document
  preferences (`linguagraph.workspace.preferences.v1.<documentId>`), paste +
  `.txt` import, and a force-delete confirmation warning;
- **Shared API client/error boundary** consuming the stable
  `{code, message, details}` envelope;
- **Request-body size enforcement** — the raw HTTP body limit
  (`MAX_REQUEST_BODY_BYTES`, default 4,000,000) is enforced by
  `app/api/middleware.py` on the ACTUAL received byte count for both the
  JSON paste and the multipart upload paths (413 `TEXT_TOO_LARGE`),
  independent of the canonical-text code-point limit
  (`MAX_TEXT_VERSION_CODEPOINTS`);
- **Stable conflict classification** — only the PostgreSQL
  `uq_text_versions_document_label` unique violation is translated into the
  duplicate-label `CONFLICT` (driver constraint-name based, never
  exception-text parsing); unexpected integrity errors propagate;
  explicit `null` for PATCH `label`/`sort_order` is rejected at the
  Pydantic boundary (422 `VALIDATION_ERROR`; omission still means "leave
  unchanged").

Deliberately NOT implemented in M0.3 (later checkpoints): browser
Selection/Range handling and UTF-16 ↔ code-point frontend conversion (M0.4),
boundary segmentation/annotation runs/PendingSpan/Alignment Tray (M0.4), the
complete atomic Alignment create/update/delete service and its HTTP endpoints
(M0.5), alignment persistence UI/hover/connectors/Inspector (M0.5/M0.6), and
all NLP/LLM/auth/Redis/Neo4j/Elasticsearch/microservices infrastructure.

No Alembic migration was required for M0.3 (the M0.2 schema is unchanged).

## M0.4 scope and non-goals

M0.4 implements the frontend Selection Engine on top of the M0.3 workspace:

- **Shared text utilities** (`apps/web/src/shared/text/`) — the single
  UTF-16 ↔ Unicode code-point conversion strategy (`codePointLength`,
  `sliceByCodePoints`, `utf16OffsetToCodePointOffset`,
  `codePointOffsetToUtf16Offset`; ADR-001), with surrogate-pair split
  rejection, integer/range validation and the mandatory Unicode regression
  vectors (`A🙂B` = 3, `für größere Häuser` = 18,
  `Café 🙂 mañana für français` = 26);
- **Selection engine** (`shared/text/selection.ts`) — native browser
  Selection/Range → canonical code-point range, fail-closed result codes
  (`EMPTY_SELECTION`, `MULTI_RANGE_SELECTION`, `OUTSIDE_TEXT_CONTENT`,
  `CROSS_VERSION_SELECTION`, `UNSUPPORTED_SELECTION_BOUNDARY`,
  `INVALID_SELECTION_BOUNDARY`, `SELECTION_TEXT_MISMATCH`,
  `STALE_TEXT_VERSION`, `DOM_INTEGRITY_ERROR`), forward/backward
  normalization, canonical-quote integrity and the DOM text witness; plus
  the reverse locator (canonical code-point range → native DOM Range);
- **Boundary segmentation** (`shared/text/segmentation.ts`) — canonical
  content + persisted Spans + alignment memberships → flat minimal runs with
  span/alignment-group membership sets (overlap supported), sweep-set
  implementation, concatenated run text equals canonical content exactly;
- **TextPanel** — an explicit canonical content root
  (`[data-text-content-root]` with `data-text-version-id` /
  `data-content-hash`) rendering flat `<span data-run data-start data-end>`
  elements; `contentRoot.textContent === TextVersion.content`; the
  Add-to-Alignment action bar lives OUTSIDE the content root;
- **Pending selection state** (`WorkspaceProvider` / `workspaceReducer`) —
  `currentSelection` (last captured selection) and `pendingMembers`
  (Alignment Tray, ADR-007), frontend-only and never persisted to
  localStorage; explicit Add to Alignment staging with exact-duplicate and
  same-version overlap rejection (adjacent/separated allowed), remove-one,
  clear-tray, Escape (clears current selection only), panel-hide lifecycle,
  and stale TextVersion / content-hash reconciliation on refetch;
- **AlignmentTray** — pending-only tray showing language tag, label and
  quote per member with remove/clear actions; NO persistence-capable Create
  Alignment action (M0.5).

Deliberately NOT implemented in M0.4: the complete atomic Alignment
create/update/delete service and its HTTP endpoints, concurrency-safe Span
get-or-create, server persistence of PendingSpan, Create Alignment
persistence workflow, orphan-Span cleanup (all M0.5), hover/active
counterpart visualization, Alignment Inspector, SVG connectors,
RenderedSpanRegistry, connector geometry (M0.6), and all
NLP/LLM/auth/Redis/Neo4j/Elasticsearch/microservices infrastructure.

No Alembic migration was required for M0.4 (the M0.2 schema is unchanged;
Alembic remains at `0002 (head)`).

## E2E

```bash
cd apps/web
npx playwright install chromium      # one-time browser download
npx playwright test e2e/golden-path.spec.ts
```

### E2E database isolation (mandatory)

The E2E backend never touches the normal development database:

- `playwright.config.ts` starts the API through `app.e2e.server` (see
  `apps/api/app/e2e/server.py`), which creates a uniquely-named disposable
  PostgreSQL database (`linguagraph_e2e_<uuid>`), migrates it to Alembic
  HEAD, serves uvicorn with `DATABASE_URL` pointing ONLY at that database,
  and drops it when the run ends;
- the API webServer uses `reuseExistingServer: false`: an already-running
  backend whose `DATABASE_URL` cannot be proven to be the E2E database is
  never reused;
- the Vite instance Playwright starts is also never reused
  (`reuseExistingServer: false`) and runs with `--strictPort` (an occupied
  port fails the run instead of silently moving). Its `/api` proxy target is
  set via `VITE_API_PROXY_TARGET` to exactly the same port the isolated API
  binds (`playwright.config.ts` derives one `API_PORT` and passes it to both
  `app.e2e.server` and the Vite env), so the browser can never reach a
  development backend on another port. Plain `npm run dev` keeps the ordinary
  development backend default (`http://localhost:8000`) via
  `vite.config.ts`;
- `app.db.disposable.assert_disposable_db_url` fails closed on any database
  name outside the EXACT `linguagraph_e2e_<12 hex>` namespace (names merely
  beginning with `linguagraph_e2e` are refused) — the same shared
  lifecycle the pytest integration fixtures use (`app/db/disposable.py`),
  with no duplicated unsafe DB logic;
- the golden-path spec performs no cleanup of pre-existing data (the
  disposable database disappears with the run); PostgreSQL is mandatory,
  there is no SQLite fallback.

These properties are mechanically guarded by
`apps/web/src/test/playwrightConfig.test.ts` (config assertions, including
the proxy-target derivation from the same API port) and
`apps/api/app/tests/unit/test_disposable_db.py` /
`apps/api/app/tests/integration/test_disposable_db_integration.py`
(fail-closed guard + real create/migrate/drop cycle).

Non-default ports are supported and safe:
`PLAYWRIGHT_API_PORT=8011 PLAYWRIGHT_PORT=5199 npx playwright test
e2e/golden-path.spec.ts` — the golden path is verified to reach the isolated
backend on 8011 (a decoy backend on 8000 receives zero requests).

The Playwright run executes the M0 golden path: create project → create
document → add EN/DE/FR/ES TextVersions → open the four panels → verify
hide/show/reorder and reload preference → add a Unicode TextVersion
(`Café 🙂 mañana für français`) → native Range selections in EN/DE/Unicode
panels verified as exact code-point offsets → explicit Add to Alignment →
pending tray add/remove/re-add/duplicate/overlap/clear → reload (panels
persist, tray does not) → snapshot assertions that M0.4 staging persisted
NOTHING (`spans == []`, `alignment_groups == []`, `alignment_members ==
[]`). It stops before any alignment persistence (M0.5).

## Known limitations

- Docker is not available in every development environment; `compose.yml` is
  the preferred path, native PostgreSQL 18 is the documented fallback.
- The Alembic chain is the M0 domain schema (revision `0002` on top of the
  no-op foundation revision `0001`); M0.3 and M0.4 add no migration.
- The complete atomic Alignment create/update/delete workflow, including
  concurrency-safe Span get-or-create, is deferred to M0.5; the workspace
  endpoint only reads spans/alignments, and the M0.4 tray is client-only.
- M0.4 enforces code-point boundaries only: combining sequences are
  preserved but never moved or merged (no grapheme-cluster editing), and
  `Intl.Segmenter` is not a coordinate authority.
- M0.4 renders flat runs and stageable selections; hover/active counterpart
  highlighting, the Inspector and SVG connectors are deferred to M0.6.
