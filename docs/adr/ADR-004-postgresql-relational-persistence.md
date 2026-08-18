# ADR-004: PostgreSQL relational persistence

## Status
Accepted (frozen for M0)

## Context
The domain is naturally relational: projects, documents, versions, spans, alignment groups/members. The spec requires a language-neutral, normalized model that can support overlapping annotations and future linguistic layers. SQLite is not an acceptable substitute for verifying database behavior.

## Decision
Use PostgreSQL as the M0 database, with SQLAlchemy 2.0 ORM and Alembic migrations. Core domain data is stored in normal relational tables, not JSONB. No graph database, Redis, vector store, or Elasticsearch in M0.

## Alternatives Considered
- SQLite for M0: rejected because integration tests would not verify PostgreSQL-specific constraints/behavior and the spec explicitly forbids substituting SQLite.
- JSONB document store: rejected because core relations (uniqueness, FKs, joins) are clearer relationally.
- Neo4j/graph DB: rejected for M0; future milestone can evaluate if query needs justify it.

## Consequences
- M0 requires a local PostgreSQL instance (Docker/Compose or native).
- Migrations are version-controlled from day one.
- Integration tests must run against real PostgreSQL.
