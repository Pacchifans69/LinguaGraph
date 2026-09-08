"""Migration chain tests against disposable PostgreSQL databases.

Covered here:

- migration from an EMPTY database to HEAD (via the shared session fixture,
  which starts from zero and runs ``alembic upgrade head``), with the
  resulting schema asserted;
- the full cycle on a dedicated disposable database: upgrade base -> head,
  downgrade head -> base, upgrade base -> head again (and a partial downgrade
  to 0001), proving both directions of the M0.2 revision.

Safety guarantees:

- only uniquely named disposable databases are ever created/migrated/dropped;
- the normal development database is never migrated or downgraded;
- PostgreSQL is mandatory; without a configured server the tests skip with an
  explicit reason (a reported environment limitation, not a pass).
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.db.session import create_bounded_engine

from app.db.disposable import (
    create_disposable_database,
    drop_disposable_database,
)

API_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = API_ROOT / "alembic.ini"

pytestmark = pytest.mark.integration

# Expected public schema at HEAD: the Alembic version table plus the nine domain tables (M0_PREIMPLEMENTATION_REPORT.md section 4; M4 adds token_lemma_annotations).
HEAD_TABLES = [
    "alembic_version",
    "alignment_groups",
    "alignment_members",
    "parallel_documents",
    "projects",
    "segmentation_layers",
    "segments",
    "spans",
    "text_versions",
    "token_lemma_annotations",
]


def _public_tables(url: str) -> list[str]:
    # HRA-F05 (R2): bounded connect timeout (shared helper) — migration
    # verification must never hang on an unreachable endpoint.
    engine = create_bounded_engine(url)
    try:
        with engine.connect() as conn:
            return sorted(
                conn.execute(
                    text(
                        "SELECT tablename FROM pg_tables"
                        " WHERE schemaname = 'public' ORDER BY tablename"
                    )
                )
                .scalars()
                .all()
            )
    finally:
        engine.dispose()


def _run_alembic(url: str, action: str, revision: str) -> None:
    """Run one Alembic action against ``url``, restoring the environment exactly.

    Alembic's ``env.py`` honors the ``DATABASE_URL`` environment variable, so
    the helper temporarily points it at the disposable database. On exit the
    ORIGINAL environment state is restored exactly (M0.7 W5 hardening):

    - if ``DATABASE_URL`` existed before the call, its exact previous value
      is reinstated — including an empty-string value — even when the Alembic
      run raises;
    - if ``DATABASE_URL`` did not exist before the call, it remains absent
      afterwards (the temporary disposable URL must never leak into the
      surrounding test process).

    The restoration runs in ``finally``, so it also covers failures inside
    the Alembic invocation.
    """
    had_database_url = "DATABASE_URL" in os.environ
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        cfg = Config(str(ALEMBIC_INI))
        if action == "upgrade":
            command.upgrade(cfg, revision)
        else:
            command.downgrade(cfg, revision)
    finally:
        if had_database_url:
            os.environ["DATABASE_URL"] = previous_database_url
        else:
            os.environ.pop("DATABASE_URL", None)


def test_migrate_from_zero_to_head(disposable_db_url: str) -> None:
    # The session fixture already migrated an empty database to HEAD; assert
    # the resulting schema and the recorded revision.
    assert _public_tables(disposable_db_url) == HEAD_TABLES

    # HRA-F05 (R2): bounded connect timeout (shared helper).
    engine = create_bounded_engine(disposable_db_url)
    try:
        with engine.connect() as conn:
            version_num = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            assert version_num == "0005"
    finally:
        engine.dispose()


def test_downgrade_to_base_then_upgrade_again() -> None:
    """Full upgrade/downgrade/upgrade cycle on a dedicated disposable DB."""
    admin_engine, target_url = create_disposable_database("linguagraph_cycle")
    url = target_url.render_as_string(hide_password=False)
    try:
        # empty database -> 0001 foundation -> 0002 domain schema -> 0003 segmentation
        _run_alembic(url, "upgrade", "head")
        assert _public_tables(url) == HEAD_TABLES

        # head -> base: the domain schema is fully removed; only the Alembic
        # version table remains (M0.1 foundation is a no-op revision).
        _run_alembic(url, "downgrade", "base")
        assert _public_tables(url) == ["alembic_version"]

        # base -> head again: the chain is re-applicable (idempotent forward).
        _run_alembic(url, "upgrade", "head")
        assert _public_tables(url) == HEAD_TABLES

        # Partial downgrade to the M0.1 revision removes only the M0.2 tables.
        _run_alembic(url, "downgrade", "0001")
        assert _public_tables(url) == ["alembic_version"]
    finally:
        drop_disposable_database(admin_engine, target_url)


def test_0003_to_0004_cycle_preserves_existing_sentence_rows() -> None:
    """M3 columns are additive and the M2 sentence authority survives a cycle."""
    admin_engine, target_url = create_disposable_database("linguagraph_m3_cycle")
    url = target_url.render_as_string(hide_password=False)
    project_id, document_id, version_id, layer_id, segment_id, token_layer_id, token_segment_id = [uuid.uuid4() for _ in range(7)]
    try:
        _run_alembic(url, "upgrade", "0003")
        engine = create_bounded_engine(url)
        try:
            with engine.begin() as conn:
                conn.execute(text("INSERT INTO projects (id, name, created_at, updated_at) VALUES (:id, 'M3', now(), now())"), {"id": project_id})
                conn.execute(text("INSERT INTO parallel_documents (id, project_id, title, created_at, updated_at) VALUES (:id, :project, 'Tokens', now(), now())"), {"id": document_id, "project": project_id})
                conn.execute(text("INSERT INTO text_versions (id, document_id, language_tag, label, content, content_hash, sort_order, created_at, updated_at) VALUES (:id, :document, 'en', 'English', 'Hi.', :hash, 0, now(), now())"), {"id": version_id, "document": document_id, "hash": "a" * 64})
                conn.execute(text("INSERT INTO segmentation_layers (id, text_version_id, granularity, requested_locale, resolved_locale, origin, content_hash, created_at, updated_at) VALUES (:id, :version, 'sentence', 'en', 'en', 'manual', :hash, now(), now())"), {"id": layer_id, "version": version_id, "hash": "a" * 64})
                conn.execute(text("INSERT INTO segments (id, segmentation_layer_id, ordinal, start_offset, end_offset, exact_text, created_at) VALUES (:id, :layer, 0, 0, 3, 'Hi.', now())"), {"id": segment_id, "layer": layer_id})
        finally:
            engine.dispose()

        _run_alembic(url, "upgrade", "0004")
        engine = create_bounded_engine(url)
        try:
            with engine.connect() as conn:
                assert conn.execute(text("SELECT basis_layer_id FROM segmentation_layers WHERE id=:id"), {"id": layer_id}).scalar_one() is None
                assert conn.execute(text("SELECT is_word_like FROM segments WHERE id=:id"), {"id": segment_id}).scalar_one() is None
            with engine.begin() as conn:
                conn.execute(text("INSERT INTO segmentation_layers (id, text_version_id, granularity, basis_layer_id, requested_locale, resolved_locale, origin, content_hash, created_at, updated_at) VALUES (:id, :version, 'token', :basis, 'en', 'en', 'manual', :hash, now(), now())"), {"id": token_layer_id, "version": version_id, "basis": layer_id, "hash": "a" * 64})
                conn.execute(text("INSERT INTO segments (id, segmentation_layer_id, ordinal, start_offset, end_offset, exact_text, is_word_like, created_at) VALUES (:id, :layer, 0, 0, 3, 'Hi.', true, now())"), {"id": token_segment_id, "layer": token_layer_id})
        finally:
            engine.dispose()
        _run_alembic(url, "downgrade", "0003")
        _run_alembic(url, "upgrade", "0004")
        engine = create_bounded_engine(url)
        try:
            with engine.connect() as conn:
                assert conn.execute(text("SELECT exact_text FROM segments WHERE id=:id"), {"id": segment_id}).scalar_one() == "Hi."
                assert conn.execute(text("SELECT count(*) FROM segmentation_layers WHERE granularity='token'")).scalar_one() == 0
        finally:
            engine.dispose()
    finally:
        drop_disposable_database(admin_engine, target_url)


def test_0004_to_0005_cycle_preserves_m0_to_m3_rows_and_removes_only_m4() -> None:
    """M4 is additive: the downgrade removes only M4-owned lemma schema/data.

    Every M0–M3 row (project, document, TextVersion, sentence layer/segments,
    token layer/segments, span, alignment group/member) must survive the
    ``0005 -> 0004`` downgrade, and the re-applied ``0004 -> 0005`` must
    restore an empty M4 table.
    """
    admin_engine, target_url = create_disposable_database("linguagraph_m4_cycle")
    url = target_url.render_as_string(hide_password=False)
    (
        project_id,
        document_id,
        version_id,
        sentence_layer_id,
        sentence_segment_id,
        token_layer_id,
        token_segment_id,
        span_id,
        group_id,
        member_id,
        annotation_id,
    ) = [uuid.uuid4() for _ in range(11)]
    try:
        _run_alembic(url, "upgrade", "0004")
        engine = create_bounded_engine(url)
        try:
            with engine.begin() as conn:
                conn.execute(text("INSERT INTO projects (id, name, created_at, updated_at) VALUES (:id, 'M4', now(), now())"), {"id": project_id})
                conn.execute(text("INSERT INTO parallel_documents (id, project_id, title, created_at, updated_at) VALUES (:id, :project, 'M4 doc', now(), now())"), {"id": document_id, "project": project_id})
                conn.execute(text("INSERT INTO text_versions (id, document_id, language_tag, label, content, content_hash, sort_order, created_at, updated_at) VALUES (:id, :document, 'en', 'English', 'Hi there.', :hash, 0, now(), now())"), {"id": version_id, "document": document_id, "hash": "b" * 64})
                conn.execute(text("INSERT INTO segmentation_layers (id, text_version_id, granularity, requested_locale, resolved_locale, origin, content_hash, created_at, updated_at) VALUES (:id, :version, 'sentence', 'en', 'en', 'manual', :hash, now(), now())"), {"id": sentence_layer_id, "version": version_id, "hash": "b" * 64})
                conn.execute(text("INSERT INTO segments (id, segmentation_layer_id, ordinal, start_offset, end_offset, exact_text, created_at) VALUES (:id, :layer, 0, 0, 9, 'Hi there.', now())"), {"id": sentence_segment_id, "layer": sentence_layer_id})
                conn.execute(text("INSERT INTO segmentation_layers (id, text_version_id, granularity, basis_layer_id, requested_locale, resolved_locale, origin, content_hash, created_at, updated_at) VALUES (:id, :version, 'token', :basis, 'en', 'en', 'manual', :hash, now(), now())"), {"id": token_layer_id, "version": version_id, "basis": sentence_layer_id, "hash": "b" * 64})
                conn.execute(text("INSERT INTO segments (id, segmentation_layer_id, ordinal, start_offset, end_offset, exact_text, is_word_like, created_at) VALUES (:id, :layer, 0, 0, 2, 'Hi', true, now())"), {"id": token_segment_id, "layer": token_layer_id})
                conn.execute(text("INSERT INTO spans (id, text_version_id, start_offset, end_offset, exact_text, prefix, suffix, created_at) VALUES (:id, :version, 0, 2, 'Hi', '', ' there.', now())"), {"id": span_id, "version": version_id})
                conn.execute(text("INSERT INTO alignment_groups (id, document_id, note, created_at, updated_at) VALUES (:id, :document, NULL, now(), now())"), {"id": group_id, "document": document_id})
                conn.execute(text("INSERT INTO alignment_members (id, alignment_group_id, span_id, created_at) VALUES (:id, :group, :span, now())"), {"id": member_id, "group": group_id, "span": span_id})
        finally:
            engine.dispose()

        _run_alembic(url, "upgrade", "0005")
        engine = create_bounded_engine(url)
        try:
            with engine.begin() as conn:
                conn.execute(text("INSERT INTO token_lemma_annotations (id, token_segment_id, lemma, created_at, updated_at) VALUES (:id, :token, 'Haus', now(), now())"), {"id": annotation_id, "token": token_segment_id})
            with engine.connect() as conn:
                assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0005"
                assert conn.execute(text("SELECT count(*) FROM token_lemma_annotations")).scalar_one() == 1
        finally:
            engine.dispose()

        _run_alembic(url, "downgrade", "0004")
        engine = create_bounded_engine(url)
        try:
            with engine.connect() as conn:
                assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0004"
                assert "token_lemma_annotations" not in _public_tables(url)
                # Every M0–M3 row survives the M4 downgrade.
                assert conn.execute(text("SELECT name FROM projects WHERE id=:id"), {"id": project_id}).scalar_one() == "M4"
                assert conn.execute(text("SELECT title FROM parallel_documents WHERE id=:id"), {"id": document_id}).scalar_one() == "M4 doc"
                assert conn.execute(text("SELECT content FROM text_versions WHERE id=:id"), {"id": version_id}).scalar_one() == "Hi there."
                assert conn.execute(text("SELECT granularity FROM segmentation_layers WHERE id=:id"), {"id": sentence_layer_id}).scalar_one() == "sentence"
                assert conn.execute(text("SELECT granularity FROM segmentation_layers WHERE id=:id"), {"id": token_layer_id}).scalar_one() == "token"
                assert conn.execute(text("SELECT exact_text FROM segments WHERE id=:id"), {"id": sentence_segment_id}).scalar_one() == "Hi there."
                assert conn.execute(text("SELECT is_word_like FROM segments WHERE id=:id"), {"id": token_segment_id}).scalar_one() is True
                assert conn.execute(text("SELECT exact_text FROM spans WHERE id=:id"), {"id": span_id}).scalar_one() == "Hi"
                assert conn.execute(text("SELECT count(*) FROM alignment_groups WHERE id=:id"), {"id": group_id}).scalar_one() == 1
                assert conn.execute(text("SELECT count(*) FROM alignment_members WHERE id=:id"), {"id": member_id}).scalar_one() == 1
        finally:
            engine.dispose()

        # Re-applying 0005 restores an EMPTY M4 table; no lemma data returns.
        _run_alembic(url, "upgrade", "0005")
        engine = create_bounded_engine(url)
        try:
            with engine.connect() as conn:
                assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0005"
                assert conn.execute(text("SELECT count(*) FROM token_lemma_annotations")).scalar_one() == 0
        finally:
            engine.dispose()
    finally:
        drop_disposable_database(admin_engine, target_url)


def test_revision_chain_0001_to_0005_integrity() -> None:
    """Historical revisions 0001–0004 stay intact and 0005 is the sole head."""
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    expected = {
        "0001": None,
        "0002": "0001",
        "0003": "0002",
        "0004": "0003",
        "0005": "0004",
    }
    for revision, down_revision in expected.items():
        rev = script.get_revision(revision)
        assert rev is not None, revision
        assert rev.down_revision == down_revision, revision
        assert rev.module.revision == revision
    heads = script.get_heads()
    assert list(heads) == ["0005"]


def test_alembic_check_reports_no_schema_drift(disposable_db_url: str) -> None:
    """``alembic check`` finds no drift between models and migration HEAD."""
    cfg = Config(str(ALEMBIC_INI))
    had_database_url = "DATABASE_URL" in os.environ
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = disposable_db_url
    try:
        command.check(cfg)
    finally:
        if had_database_url:
            os.environ["DATABASE_URL"] = previous_database_url
        else:
            os.environ.pop("DATABASE_URL", None)


def test_revision_0001_is_unchanged() -> None:
    """Guard: the M0.1 foundation revision must remain a no-op (its file is
    the repository's migration-history baseline and must not be edited)."""
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    rev = script.get_revision("0001")
    assert rev is not None
    assert rev.down_revision is None
    assert not rev.branch_labels
    assert rev.module.revision == "0001"


# ---------------------------------------------------------------------------
# M0.7 W5 hardening: the Alembic helper must restore the ORIGINAL environment
# exactly (a pre-existing DATABASE_URL is reinstated with its exact previous
# value; an absent DATABASE_URL stays absent). These regression tests
# monkeypatch the Alembic command functions, so they need no database server
# and never touch a real database — they verify the helper's environment
# contract only.
# ---------------------------------------------------------------------------


def test_run_alembic_restores_preexisting_database_url_exactly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A pre-existing DATABASE_URL is reinstated with its EXACT previous value
    (not merely 'some value'), on both success and failure paths."""
    previous_url = "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph"
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setenv("DATABASE_URL", previous_url)
    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore",
        "upgrade",
        "head",
    )
    # During the run the disposable URL was installed...
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore"
    ]
    # ...and afterwards the EXACT previous value is restored.
    assert os.environ["DATABASE_URL"] == previous_url

    # Failure path: an Alembic exception must not leak the disposable URL
    # either — the exact previous value is still restored.

    def failing_downgrade(cfg, revision):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")

    monkeypatch.setattr(command, "downgrade", failing_downgrade)
    with pytest.raises(RuntimeError, match="boom"):
        _run_alembic(
            "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_restore",
            "downgrade",
            "base",
        )
    assert os.environ["DATABASE_URL"] == previous_url


def test_run_alembic_restores_preexisting_empty_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """A pre-existing but EMPTY DATABASE_URL is restored as present-and-empty
    (presence is part of the original state, so the variable must not be
    popped)."""
    monkeypatch.setenv("DATABASE_URL", "")
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_empty",
        "upgrade",
        "head",
    )
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_empty"
    ]
    # Present before AND after, with the exact original (empty) value.
    assert "DATABASE_URL" in os.environ
    assert os.environ["DATABASE_URL"] == ""


def test_run_alembic_leaves_absent_database_url_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """When DATABASE_URL did not exist before the call, it remains absent
    afterwards (the temporary disposable URL never leaks into the process)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    observed: list[str | None] = []

    def fake_upgrade(cfg, revision):  # type: ignore[no-untyped-def]
        observed.append(os.environ.get("DATABASE_URL"))
        assert cfg is not None
        assert revision == "head"

    monkeypatch.setattr(command, "upgrade", fake_upgrade)
    _run_alembic(
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent",
        "upgrade",
        "head",
    )
    assert observed == [
        "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent"
    ]
    assert "DATABASE_URL" not in os.environ

    # Failure path as well: a raised Alembic error must not leave the
    # disposable URL installed.

    def failing_downgrade(cfg, revision):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")

    monkeypatch.setattr(command, "downgrade", failing_downgrade)
    with pytest.raises(RuntimeError, match="boom"):
        _run_alembic(
            "postgresql+psycopg://linguagraph:linguagraph@localhost:5432/linguagraph_w5_absent",
            "downgrade",
            "base",
        )
    assert "DATABASE_URL" not in os.environ
