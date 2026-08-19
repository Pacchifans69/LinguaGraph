"""Project HTTP endpoints against real PostgreSQL (M0.3).

Covers create/list/get/update/delete, the standard error envelope, domain
validation failures and NOT_FOUND — all via the real HTTP boundary with a
disposable PostgreSQL database (no mocks, no SQLite).
"""

import uuid

import pytest

pytestmark = pytest.mark.integration


def test_project_crud_flow(api_client) -> None:
    # create
    created = api_client.post(
        "/api/v1/projects",
        json={"name": "My Corpus", "description": "Optional description"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "My Corpus"
    assert body["description"] == "Optional description"
    assert body["id"]
    assert body["created_at"] and body["updated_at"]
    project_id = body["id"]

    # get
    fetched = api_client.get(f"/api/v1/projects/{project_id}")
    assert fetched.status_code == 200
    assert fetched.json() == body

    # list
    listed = api_client.get("/api/v1/projects")
    assert listed.status_code == 200
    assert [p["id"] for p in listed.json()] == [project_id]

    # update metadata
    updated = api_client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Renamed", "description": None},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"
    assert updated.json()["description"] is None

    # delete
    deleted = api_client.delete(f"/api/v1/projects/{project_id}")
    assert deleted.status_code == 204
    assert api_client.get(f"/api/v1/projects/{project_id}").status_code == 404


def test_project_list_is_empty(api_client) -> None:
    assert api_client.get("/api/v1/projects").json() == []


def test_get_missing_project_returns_envelope(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.get(f"/api/v1/projects/{missing}")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["message"]
    assert body["details"] == {"project_id": str(missing)}


def test_create_project_requires_name(api_client) -> None:
    response = api_client.post("/api/v1/projects", json={"name": "  "})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["message"] and isinstance(body["details"], dict)


def test_create_project_name_too_long(api_client) -> None:
    response = api_client.post(
        "/api/v1/projects", json={"name": "x" * 201}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_update_project_requires_valid_field_values(api_client) -> None:
    project = api_client.post(
        "/api/v1/projects", json={"name": "P"}
    ).json()
    response = api_client.patch(
        f"/api/v1/projects/{project['id']}", json={"name": ""}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_project_route_not_found_envelope(api_client) -> None:
    response = api_client.get("/api/v1/projects/not-a-uuid")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["errors"][0]["location"] == ["path", "project_id"]


def test_unmatched_route_returns_envelope(api_client) -> None:
    response = api_client.get("/api/v1/definitely-not-a-route")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"