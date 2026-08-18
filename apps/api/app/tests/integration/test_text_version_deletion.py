"""TextVersion deletion policy against real PostgreSQL (ADR-005).

Verifies the accepted deletion semantics table
(M0_PREIMPLEMENTATION_REPORT.md section 4):

- no spans                  -> delete the version;
- spans, no memberships     -> delete version + spans (orphan cleanup);
- spans with memberships    -> blocked (TEXT_HAS_ANNOTATIONS) unless
                               force=True, which runs the destructive reset:
                               delete version/spans/memberships, revalidate
                               every affected AlignmentGroup against ALL M0
                               invariants, delete invalid groups and their
                               orphaned spans, all in one transaction.
"""

import uuid

import pytest
from sqlalchemy import select

from app.api.errors import DomainError
from app.db.models import (
    AlignmentGroup,
    AlignmentMember,
    Span,
    TextVersion,
)
from app.services import span_service, text_version_service
from app.tests.integration.test_persistence import (
    add_member,
    count,
    make_document,
    make_group,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration


def _three_version_document(db):
    """A document with en/de/fr versions and one span each."""
    project = make_project(db)
    document = make_document(db, project.id)
    en = make_version(db, document.id, language_tag="en", label="EN", content="english text here")
    de = make_version(db, document.id, language_tag="de", label="DE", content="deutscher text hier")
    fr = make_version(db, document.id, language_tag="fr", label="FR", content="texte français ici")
    spans = {
        "en": span_service.create_span(db, text_version_id=en.id, start_offset=0, end_offset=7),
        "de": span_service.create_span(db, text_version_id=de.id, start_offset=0, end_offset=8),
        "fr": span_service.create_span(db, text_version_id=fr.id, start_offset=0, end_offset=7),
    }
    return project, document, {"en": en, "de": de, "fr": fr}, spans


def test_delete_version_without_spans(db_session) -> None:
    _, document, versions, _ = _three_version_document(db_session)
    text_version_service.delete_text_version(db_session, versions["en"].id)
    remaining = list(db_session.scalars(select(TextVersion)).all())
    assert [v.label for v in remaining] == ["DE", "FR"]


def test_delete_version_with_bare_spans_is_allowed(db_session) -> None:
    # Spans without alignment memberships do not block deletion; they are
    # removed as orphan cleanup together with the version.
    _, document, versions, spans = _three_version_document(db_session)
    assert count(db_session, Span) == 3
    text_version_service.delete_text_version(db_session, versions["en"].id)
    assert count(db_session, TextVersion) == 2
    assert count(db_session, Span) == 2
    remaining_span_ids = {s.id for s in db_session.scalars(select(Span)).all()}
    assert spans["en"].id not in remaining_span_ids


def test_delete_annotated_version_blocked_without_force(db_session) -> None:
    _, document, versions, spans = _three_version_document(db_session)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, spans["en"].id)
    add_member(db_session, group.id, spans["de"].id)

    with pytest.raises(DomainError) as excinfo:
        text_version_service.delete_text_version(db_session, versions["en"].id)
    assert excinfo.value.code == "TEXT_HAS_ANNOTATIONS"

    # Nothing was deleted by the blocked attempt.
    assert count(db_session, TextVersion) == 3
    assert count(db_session, AlignmentGroup) == 1
    assert count(db_session, AlignmentMember) == 2


def test_force_delete_removes_version_spans_and_memberships(db_session) -> None:
    _, document, versions, spans = _three_version_document(db_session)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, spans["en"].id)
    add_member(db_session, group.id, spans["de"].id)

    text_version_service.delete_text_version(db_session, versions["en"].id, force=True)

    assert count(db_session, TextVersion) == 2
    assert count(db_session, Span) == 1  # only FR's unrelated bare span survives
    assert count(db_session, AlignmentMember) == 0


def test_force_delete_removes_group_that_loses_validity(db_session) -> None:
    # Group {EN, DE}: after EN is destroyed, only one member from one version
    # remains -> group violates the invariants -> deleted with the reset.
    # DE's span loses its only membership -> orphaned -> cleaned. FR's bare
    # span (never in a group) is unrelated and survives.
    _, document, versions, spans = _three_version_document(db_session)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, spans["en"].id)
    add_member(db_session, group.id, spans["de"].id)

    text_version_service.delete_text_version(db_session, versions["en"].id, force=True)

    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    remaining = list(db_session.scalars(select(Span)).all())
    assert [s.id for s in remaining] == [spans["fr"].id]


def test_force_delete_keeps_group_that_remains_valid(db_session) -> None:
    # Group {EN, DE, FR}: after EN is destroyed, DE+FR (two versions) remain
    # -> group survives with its two memberships.
    _, document, versions, spans = _three_version_document(db_session)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, spans["en"].id)
    add_member(db_session, group.id, spans["de"].id)
    add_member(db_session, group.id, spans["fr"].id)

    text_version_service.delete_text_version(db_session, versions["en"].id, force=True)

    assert count(db_session, AlignmentGroup) == 1
    members = list(db_session.scalars(select(AlignmentMember)).all())
    assert {m.span_id for m in members} == {spans["de"].id, spans["fr"].id}


def test_force_delete_cleans_orphaned_spans_of_other_versions(db_session) -> None:
    # Group {EN, DE1, DE2} where DE1/DE2 are two spans of the SAME version:
    # after EN is destroyed the remaining members come from one version ->
    # group invalid -> deleted -> DE1/DE2 lose their only membership ->
    # orphaned -> cleaned too.
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="english text here")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="deutscher text hier")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=7)
    span_de1 = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=4)
    span_de2 = span_service.create_span(db_session, text_version_id=de.id, start_offset=5, end_offset=9)

    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de1.id)
    add_member(db_session, group.id, span_de2.id)

    text_version_service.delete_text_version(db_session, en.id, force=True)

    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, AlignmentMember) == 0
    assert count(db_session, Span) == 0  # DE's orphaned spans cleaned


def test_force_delete_preserves_unrelated_bare_spans(db_session) -> None:
    # A bare span in another version that never joined a group is NOT an
    # orphan of this operation and must survive.
    _, document, versions, spans = _three_version_document(db_session)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, spans["en"].id)
    add_member(db_session, group.id, spans["de"].id)
    # FR's span is bare (never a member).

    text_version_service.delete_text_version(db_session, versions["en"].id, force=True)

    assert count(db_session, AlignmentGroup) == 0
    assert count(db_session, Span) == 1
    assert db_session.get(Span, spans["fr"].id) is not None


def test_force_delete_does_not_touch_other_documents(db_session) -> None:
    project = make_project(db_session)
    doc_a = make_document(db_session, project.id, title="A")
    doc_b = make_document(db_session, project.id, title="B")
    en_a = make_version(db_session, doc_a.id, language_tag="en", label="EN A", content="aaa")
    de_a = make_version(db_session, doc_a.id, language_tag="de", label="DE A", content="bbb")
    en_b = make_version(db_session, doc_b.id, language_tag="en", label="EN B", content="ccc")
    de_b = make_version(db_session, doc_b.id, language_tag="de", label="DE B", content="ddd")

    span_a1 = span_service.create_span(db_session, text_version_id=en_a.id, start_offset=0, end_offset=3)
    span_a2 = span_service.create_span(db_session, text_version_id=de_a.id, start_offset=0, end_offset=3)
    span_b1 = span_service.create_span(db_session, text_version_id=en_b.id, start_offset=0, end_offset=3)
    span_b2 = span_service.create_span(db_session, text_version_id=de_b.id, start_offset=0, end_offset=3)

    group_a = make_group(db_session, doc_a.id)
    group_b = make_group(db_session, doc_b.id)
    add_member(db_session, group_a.id, span_a1.id)
    add_member(db_session, group_a.id, span_a2.id)
    add_member(db_session, group_b.id, span_b1.id)
    add_member(db_session, group_b.id, span_b2.id)

    text_version_service.delete_text_version(db_session, en_a.id, force=True)

    # Document B is untouched: version, spans, group, members all survive.
    assert count(db_session, TextVersion) == 3
    assert count(db_session, AlignmentGroup) == 1
    assert db_session.get(AlignmentGroup, group_b.id) is not None
    assert count(db_session, AlignmentMember) == 2


def test_force_delete_multiple_affected_groups(db_session) -> None:
    # Two groups are affected by one forced deletion: one dies, one survives.
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="english text here")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="deutscher text hier")
    fr = make_version(db_session, document.id, language_tag="fr", label="FR", content="texte français ici")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=7)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=8)
    span_fr = span_service.create_span(db_session, text_version_id=fr.id, start_offset=0, end_offset=7)

    doomed = make_group(db_session, document.id)  # {EN, DE} -> dies
    survivor = make_group(db_session, document.id)  # {EN, DE, FR} -> survives
    add_member(db_session, doomed.id, span_en.id)
    add_member(db_session, doomed.id, span_de.id)
    add_member(db_session, survivor.id, span_en.id)
    add_member(db_session, survivor.id, span_de.id)
    add_member(db_session, survivor.id, span_fr.id)

    text_version_service.delete_text_version(db_session, en.id, force=True)

    groups = list(db_session.scalars(select(AlignmentGroup)).all())
    assert [g.id for g in groups] == [survivor.id]
    members = list(db_session.scalars(select(AlignmentMember)).all())
    assert {m.span_id for m in members} == {span_de.id, span_fr.id}
    # DE's span kept its membership in the survivor; FR's span was bare-safe.
    assert {s.id for s in db_session.scalars(select(Span)).all()} == {
        span_de.id,
        span_fr.id,
    }


def test_force_delete_is_atomic(db_session, monkeypatch) -> None:
    # If any step of the destructive reset fails, the WHOLE operation rolls
    # back: no partial deletion of version/spans/groups.
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="aaa")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="bbb")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=3)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=3)
    group = make_group(db_session, document.id)
    add_member(db_session, group.id, span_en.id)
    add_member(db_session, group.id, span_de.id)

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated revalidation failure")

    monkeypatch.setattr(text_version_service, "alignment_group_is_valid", _boom)

    with pytest.raises(RuntimeError):
        text_version_service.delete_text_version(db_session, en.id, force=True)

    # The transaction rolled back: nothing was deleted.
    assert count(db_session, TextVersion) == 2
    assert count(db_session, Span) == 2
    assert count(db_session, AlignmentGroup) == 1
    assert count(db_session, AlignmentMember) == 2


def test_delete_missing_version_raises_not_found(db_session) -> None:
    with pytest.raises(DomainError) as excinfo:
        text_version_service.delete_text_version(db_session, uuid.uuid4())
    assert excinfo.value.code == "NOT_FOUND"


def test_force_delete_shared_span_survives_in_unaffected_group(db_session) -> None:
    """P0 regression (human review): orphan-span detection must consult the
    ENTIRE database, not only groups directly affected by the deleted version.

    G1 = {EN_span, DE_span}
    G2 = {DE_span, FR_span}   (unaffected by the EN deletion)

    Force-delete EN. Expected: G1 becomes invalid and is deleted; DE_span
    MUST survive because it is still a member of the untouched G2; G2 remains
    valid with DE + FR; only the EN version/span are removed.
    """
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="english text here")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="deutscher text hier")
    fr = make_version(db_session, document.id, language_tag="fr", label="FR", content="texte français ici")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=7)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=8)
    span_fr = span_service.create_span(db_session, text_version_id=fr.id, start_offset=0, end_offset=7)

    g1 = make_group(db_session, document.id)
    add_member(db_session, g1.id, span_en.id)
    add_member(db_session, g1.id, span_de.id)
    g2 = make_group(db_session, document.id)
    add_member(db_session, g2.id, span_de.id)
    add_member(db_session, g2.id, span_fr.id)

    text_version_service.delete_text_version(db_session, en.id, force=True)

    # Only EN was removed.
    assert count(db_session, TextVersion) == 2
    assert db_session.get(TextVersion, en.id) is None
    assert span_en.id not in {s.id for s in db_session.scalars(select(Span)).all()}

    # G1 died, G2 survived untouched.
    assert count(db_session, AlignmentGroup) == 1
    assert db_session.get(AlignmentGroup, g1.id) is None
    assert db_session.get(AlignmentGroup, g2.id) is not None

    # G2 still has exactly DE + FR memberships; both spans survive.
    members = list(db_session.scalars(select(AlignmentMember)).all())
    assert {m.alignment_group_id for m in members} == {g2.id}
    assert {m.span_id for m in members} == {span_de.id, span_fr.id}
    assert {s.id for s in db_session.scalars(select(Span)).all()} == {
        span_de.id,
        span_fr.id,
    }


def test_force_delete_shared_span_survives_in_multiple_unaffected_groups(
    db_session,
) -> None:
    """P0 regression, multiple unaffected groups: the shared DE_span belongs
    to G2 AND G3 (both unaffected). Force-delete EN: G1 dies; G2 and G3 both
    survive with their DE memberships intact.
    """
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="english text here")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="deutscher text hier")
    fr = make_version(db_session, document.id, language_tag="fr", label="FR", content="texte français ici")
    span_en = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=7)
    span_de = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=8)
    span_fr = span_service.create_span(db_session, text_version_id=fr.id, start_offset=0, end_offset=7)

    g1 = make_group(db_session, document.id)
    add_member(db_session, g1.id, span_en.id)
    add_member(db_session, g1.id, span_de.id)
    g2 = make_group(db_session, document.id)
    add_member(db_session, g2.id, span_de.id)
    add_member(db_session, g2.id, span_fr.id)
    g3 = make_group(db_session, document.id)
    add_member(db_session, g3.id, span_de.id)
    add_member(db_session, g3.id, span_fr.id)

    text_version_service.delete_text_version(db_session, en.id, force=True)

    assert count(db_session, AlignmentGroup) == 2
    assert {g.id for g in db_session.scalars(select(AlignmentGroup)).all()} == {
        g2.id,
        g3.id,
    }
    assert span_de.id in {s.id for s in db_session.scalars(select(Span)).all()}
    de_memberships = [
        m
        for m in db_session.scalars(select(AlignmentMember)).all()
        if m.span_id == span_de.id
    ]
    assert {m.alignment_group_id for m in de_memberships} == {g2.id, g3.id}
    assert count(db_session, TextVersion) == 2
