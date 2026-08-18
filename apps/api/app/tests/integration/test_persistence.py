"""Persistence behavior against REAL PostgreSQL (M0.2 acceptance).

Covers services and ORM foundations: CRUD for Project/ParallelDocument/
TextVersion, canonical ingestion, Span quote derivation, AlignmentGroup/
AlignmentMember persistence, uniqueness and CHECK constraints, FK ON DELETE
cascades, transaction rollback, same-language multiplicity, span reuse across
groups, text immutability and the ADR-005 destructive-reset policy.

No mocks, no SQLite: every test runs against a disposable PostgreSQL 18
database migrated to Alembic HEAD.
"""

import hashlib
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.api.errors import DomainError
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    ParallelDocument,
    Project,
    Span,
    TextVersion,
)
from app.services import document_service, project_service, span_service, text_version_service

pytestmark = pytest.mark.integration


# --- helpers -----------------------------------------------------------------


def make_project(db, name: str = "Corpus") -> Project:
    return project_service.create_project(db, name=name)


def make_document(db, project_id: uuid.UUID, title: str = "Chapter 1") -> ParallelDocument:
    return document_service.create_document(db, project_id=project_id, title=title)


def make_version(
    db,
    document_id: uuid.UUID,
    *,
    language_tag: str = "en",
    label: str = "English",
    content: str = "I look forward to seeing you tomorrow.",
    sort_order: int = 0,
) -> TextVersion:
    return text_version_service.create_text_version(
        db,
        document_id=document_id,
        language_tag=language_tag,
        label=label,
        content=content,
        sort_order=sort_order,
    )


def make_group(db, document_id: uuid.UUID, note: str | None = None) -> AlignmentGroup:
    group = AlignmentGroup(document_id=document_id, note=note)
    db.add(group)
    db.commit()
    return group


def add_member(db, group_id: uuid.UUID, span_id: uuid.UUID) -> AlignmentMember:
    member = AlignmentMember(alignment_group_id=group_id, span_id=span_id)
    db.add(member)
    db.commit()
    return member


def count(db, model) -> int:
    """Count rows of ``model``, leaving the Session transaction-clean.

    Callers must not hold an open transaction between service calls, so this
    helper closes the read-only transaction its own SELECT autobegins with a
    no-op commit (unlike rollback, commit does not expire loaded instances
    under ``expire_on_commit=False``).
    """
    n = len(db.scalars(select(model)).all())
    if db.in_transaction():
        db.commit()
    return n


# --- Project -------------------------------------------------------------------


def test_project_create_get_list_update_delete(db_session) -> None:
    project = project_service.create_project(
        db_session, name="My Corpus", description="Optional description"
    )
    assert isinstance(project.id, uuid.UUID)
    assert project.name == "My Corpus"
    assert project.description == "Optional description"
    assert project.created_at.tzinfo is not None
    assert project.updated_at.tzinfo is not None

    fetched = project_service.get_project(db_session, project.id)
    assert fetched.id == project.id

    listed = project_service.list_projects(db_session)
    assert [p.id for p in listed] == [project.id]

    updated = project_service.update_project(
        db_session, project.id, name="Renamed", description=None
    )
    assert updated.name == "Renamed"
    assert updated.description is None
    assert updated.created_at == project.created_at  # immutable
    assert updated.updated_at >= project.updated_at  # refreshed

    project_service.delete_project(db_session, project.id)
    with pytest.raises(DomainError) as excinfo:
        project_service.get_project(db_session, project.id)
    assert excinfo.value.code == "NOT_FOUND"


def test_project_validation_errors(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        project_service.create_project(db_session, name="   ")
    assert excinfo.value.code == "VALIDATION_ERROR"

    with pytest.raises(DomainError) as excinfo:
        project_service.create_project(db_session, name="x" * 201)
    assert excinfo.value.code == "VALIDATION_ERROR"

    with pytest.raises(DomainError) as excinfo:
        project_service.create_project(db_session, name="ok", description="x" * 2001)
    assert excinfo.value.code == "VALIDATION_ERROR"

    with pytest.raises(DomainError) as excinfo:
        project_service.get_project(db_session, uuid.uuid4())
    assert excinfo.value.code == "NOT_FOUND"


# --- ParallelDocument ------------------------------------------------------------


def test_document_create_get_list_update_delete(db_session) -> None:
    project = make_project(db_session)
    document = document_service.create_document(
        db_session,
        project_id=project.id,
        title="Le Petit Prince — Chapter 1",
        description="",
    )
    assert document.project_id == project.id

    assert document_service.get_document(db_session, document.id).id == document.id
    assert [d.id for d in document_service.list_documents(db_session, project.id)] == [
        document.id
    ]

    updated = document_service.update_document(
        db_session, document.id, title="Chapter 2"
    )
    assert updated.title == "Chapter 2"
    assert updated.created_at == document.created_at
    assert updated.updated_at >= document.updated_at

    document_service.delete_document(db_session, document.id)
    with pytest.raises(DomainError) as excinfo:
        document_service.get_document(db_session, document.id)
    assert excinfo.value.code == "NOT_FOUND"


def test_document_requires_existing_project(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        document_service.create_document(
            db_session, project_id=uuid.uuid4(), title="Ghost"
        )
    assert excinfo.value.code == "NOT_FOUND"


# --- TextVersion ------------------------------------------------------------------


def test_text_version_canonical_ingestion(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)

    version = make_version(
        db_session,
        document.id,
        language_tag="de",
        label="German",
        content="Zeile1\r\nZeile2\rZeile3",
    )
    assert version.content == "Zeile1\nZeile2\nZeile3"  # CRLF/CR -> LF
    expected_hash = hashlib.sha256(version.content.encode("utf-8")).hexdigest()
    assert version.content_hash == expected_hash
    assert len(version.content_hash) == 64
    assert version.sort_order == 0  # default


def test_text_version_nfc_and_hash(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session,
        document.id,
        label="French",
        content="Cafe\u0301 🙂",  # decomposed
    )
    assert version.content == "Café 🙂"  # NFC
    assert version.content_hash == hashlib.sha256("Café 🙂".encode("utf-8")).hexdigest()


def test_text_version_bcp47_rejection(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    with pytest.raises(DomainError) as excinfo:
        make_version(db_session, document.id, language_tag="not a tag", label="X")
    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.details["field"] == "language_tag"


def test_same_language_multiplicity_allowed(db_session) -> None:
    # Multiple TextVersions with the SAME language_tag in one document are
    # allowed: UNIQUE(document_id, language_tag) must NOT exist.
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    v1 = make_version(db_session, document.id, language_tag="de", label="Version A")
    v2 = make_version(db_session, document.id, language_tag="de", label="Version B")
    assert v1.id != v2.id
    assert len(db_session.scalars(select(TextVersion)).all()) == 2


def test_duplicate_label_within_document_rejected(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    make_version(db_session, document.id, language_tag="en", label="Same")
    with pytest.raises(IntegrityError):
        make_version(db_session, document.id, language_tag="de", label="Same")


def test_same_label_allowed_in_different_documents(db_session) -> None:
    project = make_project(db_session)
    doc_a = make_document(db_session, project.id, title="A")
    doc_b = make_document(db_session, project.id, title="B")
    make_version(db_session, doc_a.id, label="Same")
    make_version(db_session, doc_b.id, label="Same")  # must not raise


def test_text_version_metadata_update(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, label="Old", content="unchanged")
    updated = text_version_service.update_text_version_metadata(
        db_session, version.id, label="New", sort_order=7
    )
    assert updated.label == "New"
    assert updated.sort_order == 7
    assert updated.content == "unchanged"  # metadata update never touches content
    assert updated.updated_at >= version.updated_at
    assert updated.created_at == version.created_at


def test_replace_content_policy(db_session) -> None:
    # ADR-005: unannotated text can be replaced...
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content="old text")
    replaced = text_version_service.replace_content(
        db_session, version.id, content="new\r\ntext"
    )
    assert replaced.content == "new\ntext"  # canonicalized again
    assert replaced.content_hash == hashlib.sha256("new\ntext".encode("utf-8")).hexdigest()

    # ...but once the version owns ANY span, replacement is blocked.
    span = span_service.create_span(
        db_session, text_version_id=version.id, start_offset=0, end_offset=3
    )
    assert span.exact_text == "new"
    with pytest.raises(DomainError) as excinfo:
        text_version_service.replace_content(db_session, version.id, content="hijacked")
    assert excinfo.value.code == "TEXT_HAS_ANNOTATIONS"


# --- Span ----------------------------------------------------------------------------


def test_span_quote_derivation(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session, document.id, content="I look forward to seeing you tomorrow."
    )
    span = span_service.create_span(
        db_session, text_version_id=version.id, start_offset=2, end_offset=17
    )
    assert span.exact_text == "look forward to"
    assert span.prefix == "I "  # preceding 32 code points, clamped
    assert span.suffix == " seeing you tomorrow."
    assert span.text_version_id == version.id


def test_span_emoji_code_point_offsets(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content="A🙂B")
    span = span_service.create_span(
        db_session, text_version_id=version.id, start_offset=1, end_offset=2
    )
    assert span.exact_text == "🙂"  # code-point slice, not UTF-16
    assert span.prefix == "A"
    assert span.suffix == "B"


def test_span_out_of_range_rejected(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content="short")
    # Capture the id while the instance is fresh: after the first rejected
    # span attempt the instance is expired by the transaction rollback, and
    # reading its attributes would auto-begin a new transaction.
    version_id = version.id
    for start, end in [(-1, 2), (2, 2), (3, 1), (0, 99)]:
        with pytest.raises(DomainError) as excinfo:
            span_service.create_span(
                db_session, text_version_id=version_id, start_offset=start, end_offset=end
            )
        assert excinfo.value.code == "SPAN_OUT_OF_RANGE"


def test_span_requires_existing_version(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        span_service.create_span(
            db_session, text_version_id=uuid.uuid4(), start_offset=0, end_offset=1
        )
    assert excinfo.value.code == "NOT_FOUND"


def test_duplicate_span_rejected_by_unique_constraint(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content="same text")
    span_service.create_span(
        db_session, text_version_id=version.id, start_offset=0, end_offset=4
    )
    with pytest.raises(IntegrityError):
        span_service.create_span(
            db_session, text_version_id=version.id, start_offset=0, end_offset=4
        )


def test_span_check_constraints_at_database_level(db_session, db_engine) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content="check me")

    def raw_insert(start: int, end: int) -> None:
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO spans (id, text_version_id, start_offset,"
                    " end_offset, exact_text, prefix, suffix, created_at)"
                    " VALUES (:id, :tv, :s, :e, 'x', '', '', now())"
                ),
                {
                    "id": uuid.uuid4(),
                    "tv": version.id,
                    "s": start,
                    "e": end,
                },
            )

    with pytest.raises(IntegrityError):
        raw_insert(-1, 2)  # ck_spans_start_offset_non_negative
    with pytest.raises(IntegrityError):
        raw_insert(2, 2)  # ck_spans_end_offset_after_start
    with pytest.raises(IntegrityError):
        raw_insert(3, 1)  # ck_spans_end_offset_after_start


# --- AlignmentGroup / AlignmentMember ---------------------------------------------------


def test_group_and_members_persistence(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="look forward to")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="freue mich darauf")
    fr = make_version(db_session, document.id, language_tag="fr", label="FR", content="ai hâte de")

    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=15)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=17)
    span_fr = span_service.create_span(db_session, text_version_id=fr.id, start_offset=0, end_offset=10)

    group = make_group(db_session, document.id, note="Phrase-level correspondence")
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)
    add_member(db_session, group.id, span_fr.id)

    stored = db_session.get(AlignmentGroup, group.id)
    assert stored.note == "Phrase-level correspondence"
    member_span_ids = {
        m.span_id for m in db_session.scalars(select(AlignmentMember)).all()
    }
    assert member_span_ids == {span_en.id, span_de.id, span_fr.id}


def test_duplicate_member_in_same_group_rejected(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="abc")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="xyz")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)
    with pytest.raises(IntegrityError):
        add_member(db_session, group.id, span_en.id)  # uq_alignment_members_group_span


def test_span_reusable_across_multiple_groups(db_session) -> None:
    # A Span may participate in many AlignmentGroups (NO UNIQUE(span_id)).
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="hello world")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="hallo welt")
    fr = make_version(db_session, document.id, language_tag="fr", label="FR", content="bonjour monde")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=5)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=5)
    span_fr = span_service.create_span(db_session, text_version_id=fr.id, start_offset=0, end_offset=7)

    group_one = make_group(db_session, document.id)
    group_two = make_group(db_session, document.id)
    add_member(db_session, group_one.id, span_en.id)
    add_member(db_session, group_one.id, span_de.id)
    add_member(db_session, group_two.id, span_en.id)  # same span, other group
    add_member(db_session, group_two.id, span_fr.id)

    memberships = db_session.scalars(select(AlignmentMember)).all()
    assert len(memberships) == 4
    assert sum(1 for m in memberships if m.span_id == span_en.id) == 2


def test_cross_document_membership_is_service_enforced_not_db(db_session) -> None:
    # Documents the boundary: the DB cannot (and must not) enforce
    # "all members belong to the group's document" — that requires joining
    # spans -> text_versions -> documents. The invariant is enforced by the
    # service predicates (alignment_invariants.py), which reject it.
    project = make_project(db_session)
    doc_a = make_document(db_session, project.id, title="A")
    doc_b = make_document(db_session, project.id, title="B")
    en = make_version(db_session, doc_a.id, label="EN", content="abc")
    de = make_version(db_session, doc_b.id, language_tag="de", label="DE", content="xyz")
    span_a = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_b = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, doc_a.id)
    add_member(db_session, group.id, span_a.id)
    add_member(db_session, group.id, span_b.id)  # DB allows; service must reject


# --- FK cascades (raw database layer) ------------------------------------------------


def test_project_delete_cascades_everything(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="abc")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="xyz")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)

    project_service.delete_project(db_session, project.id)

    assert count(db_session, Project) == 0
    assert count(db_session, ParallelDocument) == 0
    assert count(db_session, TextVersion) == 0
    assert count(db_session, Span) == 0
    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0


def test_document_delete_cascades_versions_spans_groups_members(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="abc")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="xyz")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)

    document_service.delete_document(db_session, document.id)

    assert count(db_session, ParallelDocument) == 0
    assert count(db_session, TextVersion) == 0
    assert count(db_session, Span) == 0
    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Project) == 1  # project survives


def test_group_delete_cascades_members(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="abc")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="xyz")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)

    db_session.delete(group)
    db_session.commit()

    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Span) == 2  # spans survive (no orphan cleanup here; M0.5)


def test_span_delete_cascades_memberships(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, label="EN", content="abc")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="xyz")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)

    db_session.delete(span_en)
    db_session.commit()

    assert count(db_session, Span) == 1
    assert count(db_session, AlignmentMember) == 1  # only span_de's membership


def test_foreign_key_enforcement(db_session, db_engine) -> None:
    # Inserting rows with dangling FKs must fail at the DATABASE level. The
    # services pre-check ownership (DomainError NOT_FOUND), so this test
    # bypasses them with raw SQL to prove the FK constraints themselves.
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO parallel_documents"
                    " (id, project_id, title, created_at, updated_at)"
                    " VALUES (:id, :pid, 'Ghost', now(), now())"
                ),
                {"id": uuid.uuid4(), "pid": uuid.uuid4()},
            )

    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO text_versions"
                    " (id, document_id, language_tag, label, content, content_hash,"
                    "  sort_order, created_at, updated_at)"
                    " VALUES (:id, :doc, 'en', 'Ghost', 'x', :h, 0, now(), now())"
                ),
                {"id": uuid.uuid4(), "doc": uuid.uuid4(), "h": "0" * 64},
            )

    with pytest.raises(IntegrityError):
        group = AlignmentGroup(document_id=uuid.uuid4())
        db_session.add(group)
        db_session.commit()


# --- transactions ----------------------------------------------------------------------


def test_rollback_leaves_no_rows(db_session) -> None:
    project = Project(name="Will Roll Back")
    db_session.add(project)
    db_session.flush()
    db_session.rollback()
    assert count(db_session, Project) == 0

    # A failed unique insert must not leave partial state.
    project_service.create_project(db_session, name="Real")
    project_service.create_project(db_session, name="Real")  # no unique rule, just two rows
    assert count(db_session, Project) == 2


def test_failed_transaction_rolls_back_whole_operation(db_session, db_engine) -> None:
    # A single transaction containing a valid insert followed by a
    # constraint-violating insert must roll back entirely. (Services commit
    # their own units of work, so atomicity across multiple statements inside
    # one service call is exercised at the raw transaction level here and in
    # test_text_version_deletion.py::test_force_delete_is_atomic.)
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    make_version(db_session, document.id, label="A", content="x")

    # Close the read-only transaction autobegun by the service calls, then
    # run one explicit transaction with a valid insert + a violating insert.
    db_session.rollback()
    with pytest.raises(IntegrityError):
        with db_session.begin():
            db_session.add(
                TextVersion(
                    document_id=document.id,
                    language_tag="en",
                    label="B",
                    content="y",
                    content_hash="0" * 64,
                    sort_order=0,
                )
            )
            db_session.flush()
            # second insert violates uq_text_versions_document_label
            db_session.execute(
                text(
                    "INSERT INTO text_versions (id, document_id, language_tag,"
                    " label, content, content_hash, sort_order, created_at,"
                    " updated_at)"
                    " VALUES (:id, :doc, 'en', 'A', 'z', :h, 0, now(), now())"
                ),
                {"id": uuid.uuid4(), "doc": document.id, "h": "0" * 64},
            )

    assert count(db_session, TextVersion) == 1  # label B rolled back with the failure
