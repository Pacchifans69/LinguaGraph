"""Health endpoint contract tests."""

from fastapi.testclient import TestClient


def test_health_returns_200_with_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_under_api_v1_prefix(client: TestClient) -> None:
    # The endpoint must live under the unified /api/v1 namespace.
    assert client.get("/health").status_code == 404
    assert client.get("/api/v2/health").status_code == 404
