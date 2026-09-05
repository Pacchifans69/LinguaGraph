"""Workspace read model against real PostgreSQL (M0.3).

Covers the complete snapshot shape, empty workspace, NOT_FOUND, deterministic
TextVersion ordering, pre-seeded spans/alignment groups/members as read-only
data, a transaction-clean Session after the workspace service, and the
no-lazy-load/no-autobegin guarantee during HTTP serialization.
"""

import uuid

import pytest
from sqlalchemy import text

from app.schemas.workspace import WorkspaceResponse
from app.services import workspace_service

pytestmark = pytest.mark.integration

WORKSPACE_KEYS = {
    "document",
    "text_versions",
    "segmentation_layers",
    "segments",
    "spans",
    "alignment_groups",
    "alignment_members",
}


def _make_document(api_client) -> str:
    project = api_client.post("/api/v1/projects", json={"name": "Corpus"}).json()
    return api_client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Chapter 1"},
    ).json()["id"]


def _parse_api_timestamp(value) -> "datetime":
    """Parse the wire-rendered timestamp (``...Z``) into a tz-aware instant.

    PostgreSQL returns ``timestamptz`` on the UTC session path and Pydantic v2
    renders a UTC aware datetime as ``...Z``; parse it back so exact comparisons
    against ORM datetimes are robust.
    """
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_empty_workspace_snapshot_shape(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.get(f"/api/v1/documents/{document_id}/workspace")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == WORKSPACE_KEYS
    assert body["document"]["id"] == document_id
    assert body["document"]["title"] == "Chapter 1"
    assert body["text_versions"] == []
    assert body["segmentation_layers"] == []
    assert body["segments"] == []
    assert body["spans"] == []
    assert body["alignment_groups"] == []
    assert body["alignment_members"] == []


def test_workspace_not_found(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.get(f"/api/v1/documents/{missing}/workspace")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["details"] == {"document_id": str(missing)}


def test_workspace_returns_full_snapshot(api_client) -> None:
    document_id = _make_document(api_client)
    for tag, label, content in [
        ("en", "English", "I look forward to seeing you tomorrow."),
        ("de", "German", "Ich freue mich darauf, dich morgen zu sehen."),
        ("fr", "French", "J’ai hâte de te voir demain."),
    ]:
        created = api_client.post(
            f"/api/v1/documents/{document_id}/text-versions",
            json={"language_tag": tag, "label": label, "content": content},
        )
        assert created.status_code == 201

    body = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert body["document"]["id"] == document_id
    assert [v["label"] for v in body["text_versions"]] == [
        "English",
        "German",
        "French",
    ]
    # Version objects carry the canonical content for the panels.
    assert body["text_versions"][0]["content"] == "I look forward to seeing you tomorrow."
    assert all(v["content_hash"] for v in body["text_versions"])


def test_workspace_text_version_ordering_is_deterministic(api_client, db_session) -> None:
    from app.tests.integration.test_persistence import make_project

    project = make_project(db_session)
    doc = api_client.post(
        f"/api/v1/projects/{project.id}/documents", json={"title": "Doc"}
    ).json()
    document_id = doc["id"]

    # Ordering is (sort_order, created_at, id) per the accepted semantics:
    # - "Zero" has sort_order 0 -> first;
    # - "First" (sort_order 2) was created before "Second" (sort_order 2),
    #   so created_at breaks that tie deterministically.
    api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "First", "content": "a", "sort_order": 2},
    )
    api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "fr", "label": "Second", "content": "b", "sort_order": 2},
    )
    api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "de", "label": "Zero", "content": "c", "sort_order": 0},
    )

    body = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    labels = [v["label"] for v in body["text_versions"]]
    assert labels == ["Zero", "First", "Second"]
    orders = [v["sort_order"] for v in body["text_versions"]]
    assert orders == [0, 2, 2]

    # The same request again yields the identical order (deterministic, not
    # dependent on panel drag order or request timing).
    body2 = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert [v["label"] for v in body2["text_versions"]] == labels


def test_workspace_includes_preseeded_alignment_data_readonly(api_client, db_session) -> None:
    """Pre-seeded spans/alignment groups/members appear as read-only data.

    Seeding uses the M0.2 persistence foundations (services + ORM) directly;
    the workspace endpoint exposes them without any mutation surface.
    """
    from app.db.models import AlignmentGroup, AlignmentMember
    from app.services import span_service
    from app.tests.integration.test_persistence import (
        add_member,
        make_project,
        make_version,
    )

    project = make_project(db_session)
    doc = api_client.post(
        f"/api/v1/projects/{project.id}/documents", json={"title": "Doc"}
    ).json()
    document_id = doc["id"]

    en = make_version(
        db_session,
        document_id,
        language_tag="en",
        label="EN",
        content="I look forward to seeing you.",
    )
    de = make_version(
        db_session,
        document_id,
        language_tag="de",
        label="DE",
        content="Ich freue mich darauf.",
    )
    en_span = span_service.create_span(
        db_session, text_version_id=en.id, start_offset=2, end_offset=17
    )
    de_span = span_service.create_span(
        db_session, text_version_id=de.id, start_offset=4, end_offset=22
    )
    group = AlignmentGroup(document_id=document_id, note="phrase level")
    db_session.add(group)
    db_session.commit()
    add_member(db_session, group.id, en_span.id)
    add_member(db_session, group.id, de_span.id)

    body = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()

    assert body["spans"] == [
        {
            "id": str(en_span.id),
            "text_version_id": str(en.id),
            "start_offset": 2,
            "end_offset": 17,
            "exact_text": "look forward to",
            "prefix": "I ",
            "suffix": " seeing you.",
            "created_at": body["spans"][0]["created_at"],
        },
        {
            "id": str(de_span.id),
            "text_version_id": str(de.id),
            "start_offset": 4,
            "end_offset": 22,
            "exact_text": "freue mich darauf.",
            "prefix": "Ich ",
            "suffix": "",
            "created_at": body["spans"][1]["created_at"],
        },
    ]
    # Exact timestamp instants match what the service derived/persisted.
    assert _parse_api_timestamp(body["spans"][0]["created_at"]) == en_span.created_at
    assert _parse_api_timestamp(body["spans"][1]["created_at"]) == de_span.created_at
    assert body["alignment_groups"] == [
        {
            "id": str(group.id),
            "document_id": document_id,
            "note": "phrase level",
            "created_at": body["alignment_groups"][0]["created_at"],
            "updated_at": body["alignment_groups"][0]["updated_at"],
        }
    ]
    assert _parse_api_timestamp(
        body["alignment_groups"][0]["created_at"]
    ) == group.created_at
    assert _parse_api_timestamp(
        body["alignment_groups"][0]["updated_at"]
    ) == group.updated_at
    member_ids = {m["span_id"] for m in body["alignment_members"]}
    assert member_ids == {str(en_span.id), str(de_span.id)}
    assert all(m["alignment_group_id"] == str(group.id) for m in body["alignment_members"])


def test_workspace_does_not_leak_other_documents(api_client, db_session) -> None:
    from app.tests.integration.test_persistence import make_project, make_version

    project = make_project(db_session)
    doc_a = api_client.post(
        f"/api/v1/projects/{project.id}/documents", json={"title": "A"}
    ).json()
    doc_b = api_client.post(
        f"/api/v1/projects/{project.id}/documents", json={"title": "B"}
    ).json()
    make_version(db_session, doc_a["id"], label="Only in A", content="x")

    body_b = api_client.get(f"/api/v1/documents/{doc_b['id']}/workspace").json()
    assert body_b["text_versions"] == []
    assert body_b["document"]["id"] == doc_b["id"]


def test_workspace_service_leaves_session_transaction_clean(db_session) -> None:
    """The workspace service closes its own read transaction before returning."""
    from app.tests.integration.test_persistence import (
        make_document,
        make_project,
        make_version,
    )

    project = make_project(db_session)
    document = make_document(db_session, project.id)
    make_version(
        db_session, document.id, label="EN", language_tag="en", content="x"
    )

    snapshot = workspace_service.get_workspace_snapshot(db_session, document.id)
    assert db_session.in_transaction() is False
    assert len(snapshot.text_versions) == 1

    # The Session is usable for the next service call (read -> write flow).
    from app.services import project_service
    project_service.update_project(db_session, project.id, name="Renamed")
    assert db_session.in_transaction() is False


def test_http_serialization_triggers_no_lazy_load(db_session) -> None:
    """Serializing the snapshot must not touch ORM relationships or autobegin.

    Lazy loading after a service return would autobegin a new SQLAlchemy
    transaction and violate the transaction-clean-between-service-calls
    contract (CURRENT_STATE.md section 9). Serializing the materialized
    snapshot through the response schema must leave the Session clean.
    """
    from app.services import span_service
    from app.tests.integration.test_persistence import (
        make_document,
        make_group,
        make_project,
        make_version,
    )

    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content="hello world")
    de = make_version(db_session, document.id, language_tag="de", label="DE", content="hallo welt")
    en_span = span_service.create_span(db_session, text_version_id=en.id, start_offset=0, end_offset=5)
    de_span = span_service.create_span(db_session, text_version_id=de.id, start_offset=0, end_offset=5)
    group = make_group(db_session, document.id)
    from app.tests.integration.test_persistence import add_member
    add_member(db_session, group.id, en_span.id)
    add_member(db_session, group.id, de_span.id)

    snapshot = workspace_service.get_workspace_snapshot(db_session, document.id)
    assert db_session.in_transaction() is False

    # Serialization must read scalar columns only; any relationship access
    # would autobegin a transaction (proving the no-lazy-load guarantee).
    payload = WorkspaceResponse.model_validate(snapshot)
    assert db_session.in_transaction() is False
    assert len(db_session.new) == 0
    assert len(db_session.dirty) == 0
    assert len(db_session.deleted) == 0

    # The serialized payload carries every collection as flat arrays.
    assert len(payload.text_versions) == 2
    assert len(payload.spans) == 2
    assert len(payload.alignment_groups) == 1
    assert len(payload.alignment_members) == 2


def test_workspace_route_is_read_only(api_client, db_session) -> None:
    """The workspace endpoint is read-only: no writes occur during the call."""
    document_id = _make_document(api_client)
    api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "V", "content": "x"},
    )
    response = api_client.get(f"/api/v1/documents/{document_id}/workspace")
    assert response.status_code == 200

    # No spans/groups were created by the endpoint itself — the snapshot only
    # read existing rows (span/alignment mutation belongs to M0.5).
    engine = db_session.get_bind()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM spans")).scalar() == 0
        assert conn.execute(text("SELECT count(*) FROM alignment_groups")).scalar() == 0