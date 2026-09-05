"""Domain schema inspection against real PostgreSQL (M0.2 acceptance).

Verifies the migrated schema directly through PostgreSQL catalogs:
tables, column types (uuid / timestamptz / char(64) / varchar / text /
integer), primary keys, unique constraints, CHECK constraints, FK ON DELETE
behavior, and indexes — per M0_PREIMPLEMENTATION_REPORT.md sections 4-5.
"""

import pytest
from sqlalchemy import text

from app.db.session import create_bounded_engine

pytestmark = pytest.mark.integration


@pytest.fixture()
def conn(disposable_db_url: str):
    # HRA-F05 (R2): bounded connect timeout via the shared helper — a
    # pre-existing .env may still resolve `localhost` to ::1 first on
    # Windows (R3 forbids rewriting it), and this schema-inspection
    # connection must never hang indefinitely like the rest of the
    # verification paths.
    engine = create_bounded_engine(disposable_db_url)
    try:
        with engine.connect() as connection:
            yield connection
    finally:
        engine.dispose()


def column_type(conn, table: str, column: str) -> str:
    return conn.execute(
        text(
            "SELECT data_type FROM information_schema.columns"
            " WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar_one()


def column_is_nullable(conn, table: str, column: str) -> bool:
    return conn.execute(
        text(
            "SELECT is_nullable FROM information_schema.columns"
            " WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar_one() == "YES"


def unique_constraints(conn, table: str) -> list[list[str]]:
    rows = conn.execute(
        text(
            "SELECT conname, "
            " array_agg(attname ORDER BY attposition) AS cols"
            " FROM pg_constraint"
            " JOIN pg_class ON pg_class.oid = conrelid"
            " JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace"
            " LEFT JOIN LATERAL unnest(conkey) WITH ORDINALITY AS k(attnum, attposition)"
            "   ON TRUE"
            " LEFT JOIN pg_attribute ON pg_attribute.attrelid = conrelid"
            "   AND pg_attribute.attnum = k.attnum"
            " WHERE contype = 'u' AND relname = :t AND nspname = 'public'"
            " GROUP BY conname"
        ),
        {"t": table},
    ).all()
    return [list(row.cols) for row in rows]


def test_all_domain_tables_exist(conn) -> None:
    tables = sorted(
        conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
    )
    assert tables == [
        "alembic_version",
        "alignment_groups",
        "alignment_members",
        "parallel_documents",
        "projects",
        "segmentation_layers",
        "segments",
        "spans",
        "text_versions",
    ]


def test_alembic_version_is_head(conn) -> None:
    assert (
        conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        == "0003"
    )


# --- column types / nullability ---------------------------------------------

TYPE_EXPECTATIONS: list[tuple[str, str, str, bool]] = [
    # (table, column, data_type, nullable)
    ("projects", "id", "uuid", False),
    ("projects", "name", "character varying", False),
    ("projects", "description", "character varying", True),
    ("projects", "created_at", "timestamp with time zone", False),
    ("projects", "updated_at", "timestamp with time zone", False),
    ("parallel_documents", "id", "uuid", False),
    ("parallel_documents", "project_id", "uuid", False),
    ("parallel_documents", "title", "character varying", False),
    ("parallel_documents", "description", "character varying", True),
    ("text_versions", "id", "uuid", False),
    ("text_versions", "document_id", "uuid", False),
    ("text_versions", "language_tag", "character varying", False),
    ("text_versions", "label", "character varying", False),
    ("text_versions", "content", "text", False),
    ("text_versions", "content_hash", "character", False),
    ("text_versions", "sort_order", "integer", False),
    ("text_versions", "created_at", "timestamp with time zone", False),
    ("text_versions", "updated_at", "timestamp with time zone", False),
    ("spans", "id", "uuid", False),
    ("spans", "text_version_id", "uuid", False),
    ("spans", "start_offset", "integer", False),
    ("spans", "end_offset", "integer", False),
    ("spans", "exact_text", "text", False),
    ("spans", "prefix", "text", False),
    ("spans", "suffix", "text", False),
    ("spans", "created_at", "timestamp with time zone", False),
    ("alignment_groups", "id", "uuid", False),
    ("alignment_groups", "document_id", "uuid", False),
    ("alignment_groups", "note", "character varying", True),
    ("alignment_groups", "created_at", "timestamp with time zone", False),
    ("alignment_groups", "updated_at", "timestamp with time zone", False),
    ("alignment_members", "id", "uuid", False),
    ("alignment_members", "alignment_group_id", "uuid", False),
    ("alignment_members", "span_id", "uuid", False),
    ("alignment_members", "created_at", "timestamp with time zone", False),
]


@pytest.mark.parametrize(("table", "column", "data_type", "nullable"), TYPE_EXPECTATIONS)
def test_column_types_and_nullability(
    conn, table: str, column: str, data_type: str, nullable: bool
) -> None:
    assert column_type(conn, table, column) == data_type
    assert column_is_nullable(conn, table, column) is nullable


def test_varchar_lengths(conn) -> None:
    def varchar_len(table: str, column: str) -> int:
        return conn.execute(
            text(
                "SELECT character_maximum_length FROM information_schema.columns"
                " WHERE table_schema = 'public' AND table_name = :t"
                " AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).scalar_one()

    assert varchar_len("projects", "name") == 200
    assert varchar_len("projects", "description") == 2000
    assert varchar_len("parallel_documents", "title") == 300
    assert varchar_len("parallel_documents", "description") == 2000
    assert varchar_len("text_versions", "language_tag") == 100
    assert varchar_len("text_versions", "label") == 200
    assert varchar_len("alignment_groups", "note") == 4000


def test_content_hash_is_char_64(conn) -> None:
    row = conn.execute(
        text(
            "SELECT character_maximum_length FROM information_schema.columns"
            " WHERE table_schema = 'public' AND table_name = 'text_versions'"
            " AND column_name = 'content_hash'"
        )
    ).scalar_one()
    assert row == 64


# --- unique constraints -------------------------------------------------------

def test_unique_constraints(conn) -> None:
    assert unique_constraints(conn, "text_versions") == [
        ["document_id", "label"]
    ]
    assert unique_constraints(conn, "spans") == [
        ["text_version_id", "start_offset", "end_offset"]
    ]
    assert unique_constraints(conn, "alignment_members") == [
        ["alignment_group_id", "span_id"]
    ]
    assert unique_constraints(conn, "projects") == []
    assert unique_constraints(conn, "parallel_documents") == []
    assert unique_constraints(conn, "alignment_groups") == []


def test_no_unique_document_language(conn) -> None:
    # Multiple TextVersions with the same language_tag in one document are
    # allowed: there must be NO UNIQUE(document_id, language_tag).
    for cols in unique_constraints(conn, "text_versions"):
        assert cols != ["document_id", "language_tag"]


def test_no_unique_span_in_members(conn) -> None:
    # A Span may participate in many AlignmentGroups: there must be NO
    # UNIQUE(span_id) on alignment_members.
    for cols in unique_constraints(conn, "alignment_members"):
        assert cols != ["span_id"]


# --- CHECK constraints ----------------------------------------------------------

def test_span_check_constraints(conn) -> None:
    checks = sorted(
        conn.execute(
            text(
                "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint"
                " WHERE conrelid = 'spans'::regclass AND contype = 'c'"
            )
        ).all()
    )
    assert [name for name, _ in checks] == [
        "ck_spans_end_offset_after_start",
        "ck_spans_start_offset_non_negative",
    ]
    defs = dict(checks)
    assert "start_offset >= 0" in defs["ck_spans_start_offset_non_negative"]
    assert "end_offset > start_offset" in defs["ck_spans_end_offset_after_start"]


# --- foreign keys / ON DELETE behavior ------------------------------------------

def test_all_foreign_keys_cascade(conn) -> None:
    rows = conn.execute(
        text(
            "SELECT conrelid::regclass::text, conname, confrelid::regclass::text,"
            " confdeltype"
            " FROM pg_constraint"
            " WHERE contype = 'f' AND connamespace = 'public'::regnamespace"
            " ORDER BY conrelid::regclass::text, conname"
        )
    ).all()
    expected = [
        ("alignment_groups", "fk_alignment_groups_document_id_parallel_documents", "parallel_documents", "c"),
        ("alignment_members", "fk_alignment_members_alignment_group_id_alignment_groups", "alignment_groups", "c"),
        ("alignment_members", "fk_alignment_members_span_id_spans", "spans", "c"),
        ("parallel_documents", "fk_parallel_documents_project_id_projects", "projects", "c"),
        ("spans", "fk_spans_text_version_id_text_versions", "text_versions", "c"),
        ("text_versions", "fk_text_versions_document_id_parallel_documents", "parallel_documents", "c"),
    ]
    assert [(r[0], r[1], r[2], r[3]) for r in rows] == expected


# --- indexes ---------------------------------------------------------------------

def test_expected_indexes(conn) -> None:
    indexes = sorted(
        conn.execute(
            text(
                "SELECT indexname FROM pg_indexes"
                " WHERE schemaname = 'public' AND tablename IN"
                " ('projects','parallel_documents','text_versions','spans',"
                "  'alignment_groups','alignment_members')"
            )
        ).scalars()
    )
    for expected in (
        "ix_parallel_documents_project_id",
        "ix_text_versions_document_sort_order",
        "ix_spans_text_version_id",
        "ix_alignment_groups_document_id",
        "ix_alignment_members_span_id",
        # unique-constraint backing indexes
        "uq_text_versions_document_label",
        "uq_spans_text_version_start_end",
        "uq_alignment_members_group_span",
        "alignment_groups_pkey",
        "alignment_members_pkey",
        "parallel_documents_pkey",
        "projects_pkey",
        "spans_pkey",
        "text_versions_pkey",
    ):
        assert expected in indexes, f"missing index {expected}"
