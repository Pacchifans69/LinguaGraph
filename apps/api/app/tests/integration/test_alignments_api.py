"""Alignment mutation HTTP endpoint tests against REAL PostgreSQL (M0.5).

Proves the frozen HTTP surface: POST 201 / PATCH 200 / DELETE 204, the
stable error envelope with exact status mappings, request-boundary
validation, no exception leakage, and that the workspace snapshot reflects
persisted alignments after mutation.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.tests.integration.test_persistence import make_version

pytestmark = pytest.mark.integration

EN = "I look forward to seeing you tomorrow."
DE = "Ich freue mich darauf, dich morgen zu sehen."
FR = "J’ai hâte de te voir demain."


def _make_document(api_client) -> str:
    project = api_client.post("/api/v1/projects", json={"name": "Corpus"}).json()
    return api_client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Chapter 1"},
    ).json()["id"]


def _make_versions(api_client, document_id: str) -> dict[str, str]:
    ids = {}
    for tag, label, content in [
        ("en", "EN", EN),
        ("de", "DE", DE),
        ("fr", "FR", FR),
    ]:
        version = api_client.post(
            f"/api/v1/documents/{document_id}/text-versions",
            json={"language_tag": tag, "label": label, "content": content},
        )
        assert version.status_code == 201
        ids[tag] = version.json()["id"]
    return ids


def _member(version_id: str, start: int, end: int) -> dict:
    return {"text_version_id": version_id, "start": start, "end": end}


def _create_alignment(api_client, document_id: str, versions: dict[str, str], **body):
    payload = {
        "members": [
            _member(versions["en"], 2, 17),
            _member(versions["de"], 4, 22),
        ]
    }
    payload.update(body)
    return api_client.post(
        f"/api/v1/documents/{document_id}/alignments", json=payload
    )


# --- POST ----------------------------------------------------------------------


def test_post_creates_alignment_201(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = _create_alignment(
        api_client, document_id, versions, note="Phrase-level correspondence"
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {
        "id", "document_id", "note", "created_at", "updated_at", "members",
    }
    assert body["document_id"] == document_id
    assert body["note"] == "Phrase-level correspondence"
    assert len(body["members"]) == 2
    member = next(m for m in body["members"] if m["text_version_id"] == versions["en"])
    assert set(member.keys()) == {
        "id", "span_id", "text_version_id", "start", "end", "exact_text",
    }
    assert member["start"] == 2
    assert member["end"] == 17
    assert member["exact_text"] == "look forward to"  # server-derived

    # The workspace snapshot now exposes the persisted alignment.
    snapshot = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert len(snapshot["spans"]) == 2
    assert len(snapshot["alignment_groups"]) == 1
    assert len(snapshot["alignment_members"]) == 2


def test_post_201_n_to_m_same_version_multi_span(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                _member(versions["en"], 2, 17),
                _member(versions["en"], 18, 28),
                _member(versions["de"], 4, 22),
                _member(versions["de"], 32, 36),
                _member(versions["fr"], 0, 13),
            ]
        },
    )
    assert response.status_code == 201
    assert len(response.json()["members"]) == 5


def test_post_document_not_found(api_client) -> None:
    response = api_client.post(
        f"/api/v1/documents/{uuid.uuid4()}/alignments",
        json={"members": [_member(str(uuid.uuid4()), 0, 1), _member(str(uuid.uuid4()), 0, 1)]},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_post_version_not_found(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                _member(str(uuid.uuid4()), 0, 5),
                _member(str(uuid.uuid4()), 0, 5),
            ]
        },
    )
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_post_cross_document_422(api_client) -> None:
    document_a = _make_document(api_client)
    document_b = _make_document(api_client)
    versions_a = _make_versions(api_client, document_a)
    versions_b = _make_versions(api_client, document_b)

    response = api_client.post(
        f"/api/v1/documents/{document_a}/alignments",
        json={
            "members": [
                _member(versions_a["en"], 2, 17),
                _member(versions_b["de"], 4, 22),
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "CROSS_DOCUMENT_ALIGNMENT"


def test_post_out_of_range_422(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={"members": [_member(versions["en"], 2, 17), _member(versions["de"], 0, 500)]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "SPAN_OUT_OF_RANGE"


def test_post_insufficient_members_422(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={"members": [_member(versions["en"], 2, 17)]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INSUFFICIENT_ALIGNMENT_MEMBERS"

    # Two spans of the same version only: insufficient distinct versions.
    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                _member(versions["en"], 2, 17),
                _member(versions["en"], 18, 28),
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INSUFFICIENT_ALIGNMENT_MEMBERS"


def test_post_duplicate_member_409(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                _member(versions["en"], 2, 17),
                _member(versions["en"], 2, 17),
                _member(versions["de"], 4, 22),
            ]
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "DUPLICATE_ALIGNMENT_MEMBER"


def test_post_same_version_overlap_422(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                _member(versions["en"], 2, 17),
                _member(versions["en"], 10, 20),
                _member(versions["de"], 4, 22),
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_post_request_validation_422(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    # Missing members field.
    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments", json={"note": "x"}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"

    # note over 4000 code points.
    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "note": "x" * 4001,
            "members": [_member(versions["en"], 2, 17), _member(versions["de"], 4, 22)],
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"

    # quote/contentHash are not accepted at the boundary.
    response = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={
            "members": [
                {"text_version_id": versions["en"], "start": 2, "end": 17, "quote": "x"},
                _member(versions["de"], 4, 22),
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_error_envelope_never_leaks_internals(api_client) -> None:
    """Every expected failure returns exactly the stable envelope."""
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)

    cases = [
        ("/api/v1/documents/not-a-uuid/alignments", "POST", None),
        (f"/api/v1/documents/{document_id}/alignments", "POST",
         {"members": [_member(versions["en"], 2, 17), _member(versions["de"], -1, 5)]}),
        (f"/api/v1/alignments/{uuid.uuid4()}", "PATCH", {"note": "x"}),
        (f"/api/v1/alignments/{uuid.uuid4()}", "DELETE", None),
    ]
    for path, method, body in cases:
        response = api_client.request(method, path, json=body)
        assert set(response.json().keys()) == {"code", "message", "details"}


# --- PATCH ---------------------------------------------------------------------


def _create(api_client, document_id: str, versions: dict[str, str]) -> dict:
    response = _create_alignment(api_client, document_id, versions, note="original")
    assert response.status_code == 201
    return response.json()


def test_patch_note_update_200(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}", json={"note": "Updated note"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["note"] == "Updated note"
    assert body["updated_at"] >= created["updated_at"]
    assert len(body["members"]) == 2


def test_patch_note_null_clears_note_200(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}", json={"note": None}
    )

    assert response.status_code == 200
    assert response.json()["note"] is None


def test_patch_members_full_replacement_200(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}",
        json={"members": [_member(versions["en"], 2, 17), _member(versions["fr"], 0, 13)]},
    )

    assert response.status_code == 200
    body = response.json()
    assert {m["text_version_id"] for m in body["members"]} == {
        versions["en"], versions["fr"],
    }
    # The replaced DE span became an orphan and was cleaned up.
    snapshot = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert len(snapshot["spans"]) == 2


def test_patch_note_and_members_combined_200(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}",
        json={
            "note": "combined",
            "members": [_member(versions["en"], 2, 17), _member(versions["fr"], 0, 13)],
        },
    )

    assert response.status_code == 200
    assert response.json()["note"] == "combined"
    assert {m["text_version_id"] for m in response.json()["members"]} == {
        versions["en"], versions["fr"],
    }


def test_patch_empty_body_is_noop_200(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(f"/api/v1/alignments/{created['id']}", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["note"] == "original"
    assert body["updated_at"] == created["updated_at"]
    assert len(body["members"]) == 2


def test_patch_invalid_replacement_422_old_unchanged(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}",
        json={"members": [_member(versions["en"], 2, 17)]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INSUFFICIENT_ALIGNMENT_MEMBERS"

    # Old alignment completely intact.
    snapshot = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert len(snapshot["alignment_groups"]) == 1
    assert len(snapshot["alignment_members"]) == 2
    assert len(snapshot["spans"]) == 2
    group = snapshot["alignment_groups"][0]
    assert group["note"] == "original"


def test_patch_explicit_null_members_422(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}", json={"members": None}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_patch_missing_group_404(api_client) -> None:
    response = api_client.patch(
        f"/api/v1/alignments/{uuid.uuid4()}", json={"note": "x"}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


# --- DELETE --------------------------------------------------------------------


def test_delete_204_and_orphan_cleanup(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    response = api_client.delete(f"/api/v1/alignments/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    snapshot = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert snapshot["spans"] == []
    assert snapshot["alignment_groups"] == []
    assert snapshot["alignment_members"] == []


def test_delete_preserves_shared_span_and_unrelated_group(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)
    other = api_client.post(
        f"/api/v1/documents/{document_id}/alignments",
        json={"members": [_member(versions["de"], 4, 22), _member(versions["fr"], 0, 13)]},
    )
    assert other.status_code == 201
    other_id = other.json()["id"]

    response = api_client.delete(f"/api/v1/alignments/{created['id']}")

    assert response.status_code == 204
    snapshot = api_client.get(f"/api/v1/documents/{document_id}/workspace").json()
    assert [g["id"] for g in snapshot["alignment_groups"]] == [other_id]
    assert len(snapshot["spans"]) == 2  # de (shared) + fr survive; en cleaned
    assert len(snapshot["alignment_members"]) == 2


def test_delete_missing_group_404(api_client) -> None:
    response = api_client.delete(f"/api/v1/alignments/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_delete_then_patch_missing_404(api_client) -> None:
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    created = _create(api_client, document_id, versions)

    assert api_client.delete(f"/api/v1/alignments/{created['id']}").status_code == 204
    response = api_client.patch(
        f"/api/v1/alignments/{created['id']}", json={"note": "x"}
    )
    assert response.status_code == 404


# --- SESSION / SERIALIZATION DISCIPLINE ------------------------------------------


def test_http_serialization_triggers_no_lazy_load(db_session) -> None:
    """Building the alignment response from the service view must not touch
    ORM relationships or autobegin a transaction."""
    from app.api.routes.alignments import _to_response
    from app.services import alignment_service
    from app.services.alignment_service import MemberInput
    from app.tests.integration.test_persistence import make_document, make_project

    project = make_project(db_session)
    document = make_document(db_session, project.id)
    en = make_version(db_session, document.id, language_tag="en", label="EN", content=EN)
    de = make_version(db_session, document.id, language_tag="de", label="DE", content=DE)

    view = alignment_service.create_alignment(
        db_session,
        document_id=document.id,
        members=[
            MemberInput(text_version_id=en.id, start_offset=2, end_offset=17),
            MemberInput(text_version_id=de.id, start_offset=4, end_offset=22),
        ],
    )
    assert db_session.in_transaction() is False

    payload = _to_response(view)
    assert db_session.in_transaction() is False
    assert len(payload.members) == 2
    assert payload.members[0].exact_text in ("look forward to", "freue mich darauf")
    assert len(db_session.new) == 0
    assert len(db_session.dirty) == 0
    assert len(db_session.deleted) == 0


def test_post_route_leaves_request_session_clean(api_client, db_session) -> None:
    """After an HTTP mutation the request session is closed; the shared
    fixture session is unaffected and the DB holds exactly the persisted
    rows (no lazy autobegin artifacts)."""
    document_id = _make_document(api_client)
    versions = _make_versions(api_client, document_id)
    assert _create_alignment(api_client, document_id, versions).status_code == 201

    assert db_session.in_transaction() is False
    engine = db_session.get_bind()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM alignment_groups")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM alignment_members")).scalar() == 2
        assert conn.execute(text("SELECT count(*) FROM spans")).scalar() == 2
