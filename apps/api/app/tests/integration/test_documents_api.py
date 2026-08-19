"""ParallelDocument HTTP endpoints against real PostgreSQL (M0.3).

Covers create/list/get/update/delete under the project-scoped and
document-scoped paths, NOT_FOUND handling for both axes, and validation
failures via the standard envelope.
"""

import uuid

import pytest

pytestmark = pytest.mark.integration


def _make_project(api_client) -> str:
    return api_client.post(
        "/api/v1/projects", json={"name": "Corpus"}
    ).json()["id"]


def test_document_crud_flow(api_client) -> None:
    project_id = _make_project(api_client)

    created = api_client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "Le Petit Prince — Chapter 1", "description": ""},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["project_id"] == project_id
    assert body["title"] == "Le Petit Prince — Chapter 1"
    assert body["description"] == ""
    document_id = body["id"]

    # get via document-scoped path
    fetched = api_client.get(f"/api/v1/documents/{document_id}")
    assert fetched.status_code == 200
    assert fetched.json() == body

    # list via project-scoped path
    listed = api_client.get(f"/api/v1/projects/{project_id}/documents")
    assert listed.status_code == 200
    assert [d["id"] for d in listed.json()] == [document_id]

    # metadata update
    updated = api_client.patch(
        f"/api/v1/documents/{document_id}",
        json={"title": "Renamed chapter", "description": None},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed chapter"
    assert updated.json()["description"] is None

    # delete
    assert api_client.delete(f"/api/v1/documents/{document_id}").status_code == 204
    assert api_client.get(f"/api/v1/documents/{document_id}").status_code == 404


def test_create_document_requires_existing_project(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.post(
        f"/api/v1/projects/{missing}/documents",
        json={"title": "Orphan"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["details"] == {"project_id": str(missing)}


def test_list_documents_for_missing_project(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.get(f"/api/v1/projects/{missing}/documents")
    assert response.status_code == 200
    assert response.json() == []


def test_get_missing_document_returns_envelope(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.get(f"/api/v1/documents/{missing}")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["details"] == {"document_id": str(missing)}


def test_create_document_requires_title(api_client) -> None:
    project_id = _make_project(api_client)
    response = api_client.post(
        f"/api/v1/projects/{project_id}/documents", json={"title": ""}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_documents_are_scoped_to_their_project(api_client) -> None:
    project_a = _make_project(api_client)
    project_b = _make_project(api_client)
    doc = api_client.post(
        f"/api/v1/projects/{project_a}/documents",
        json={"title": "A's document"},
    ).json()

    assert api_client.get(f"/api/v1/projects/{project_b}/documents").json() == []
    assert [d["id"] for d in api_client.get(f"/api/v1/projects/{project_a}/documents").json()] == [doc["id"]]


def test_deleting_project_cascades_documents(api_client) -> None:
    project_id = _make_project(api_client)
    doc = api_client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "Will cascade"},
    ).json()
    assert api_client.delete(f"/api/v1/projects/{project_id}").status_code == 204
    assert api_client.get(f"/api/v1/documents/{doc['id']}").status_code == 404