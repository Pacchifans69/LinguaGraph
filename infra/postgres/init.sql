-- LinguaGraph local PostgreSQL bootstrap.
-- Mounted into the PostgreSQL 18 container at /docker-entrypoint-initdb.d/init.sql.
-- Executed automatically ONLY on first initialization of an empty data volume.

-- Disposable database reserved for backend integration/migration tests.
-- These tests create and drop their own per-run databases on this server.
CREATE DATABASE linguagraph_test;
