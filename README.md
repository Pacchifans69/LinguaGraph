# LinguaGraph

**Interactive Multilingual Contrastive Linguistics Environment** — a desktop-grade
workbench for reading parallel texts side by side, selecting text spans, and
building multilingual alignment groups by hand.

Primary target languages: English, German, French, Spanish (the model is
language-neutral via BCP-47 `language_tag`).

## Current milestone

**M0 — Manual Alignment Workbench**, checkpoint **M0.1 — Repository Foundation**
(implemented; **under human review** — M0.2 must not begin until M0.1 is
human-approved and merged into `main`).

M0 proves the closed loop: *create project → create parallel document → add
arbitrary-language text versions → select spans → create alignment group →
persist → reload → highlight counterparts*.

Authoritative documents:

- `docs/preimplementation/M0_PREIMPLEMENTATION_SPEC.md`
- `docs/preimplementation/M0_PREIMPLEMENTATION_REPORT.md`
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

## M0.1 scope and non-goals

M0.1 establishes engineering infrastructure only: monorepo layout, backend
skeleton with `GET /api/v1/health`, SQLAlchemy/Alembic wiring with an empty
foundation migration chain, pytest, frontend skeleton with TanStack Query,
lint/typecheck/Vitest, PostgreSQL 18 compose service, and developer setup.

Deliberately NOT implemented in M0.1 (later checkpoints): domain models
(Project, ParallelDocument, TextVersion, Span, AlignmentGroup,
AlignmentMember), CRUD/workspace APIs, text import, selection engine, manual
alignment, visualization/connectors, NLP/LLM, authentication, Redis/Neo4j/
Elasticsearch, microservices.

## Known limitations

- Docker is not available in every development environment; `compose.yml` is
  the preferred path, native PostgreSQL 18 is the documented fallback.
- The M0.1 Alembic chain is a no-op foundation revision; the domain schema
  arrives in M0.2.
