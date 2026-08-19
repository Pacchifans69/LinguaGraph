"""HTTP request-body size enforcement against real PostgreSQL (M0.3 review B).

``MAX_REQUEST_BODY_BYTES`` is enforced on the ACTUAL received byte count
(not only Content-Length, not only canonical code-point length) for BOTH
ingestion paths:

- oversized ``application/json`` paste -> 413 TEXT_TOO_LARGE;
- oversized ``multipart/form-data`` .txt upload -> 413 TEXT_TOO_LARGE;
- requests just below the configured test limit still succeed.

``MAX_TEXT_VERSION_CODEPOINTS`` stays the separate canonical-text limit
(covered by test_content_size_limit_is_enforced).
"""

import json

import pytest

pytestmark = pytest.mark.integration

LIMIT = 1024


@pytest.fixture()
def strict_client(api_client_factory):
    """TestClient with a small configured request-body limit."""
    return api_client_factory(max_request_body_bytes=LIMIT)


def _make_document(client) -> str:
    project = client.post("/api/v1/projects", json={"name": "Corpus"}).json()
    return client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Chapter 1"},
    ).json()["id"]


def test_oversized_json_request_is_rejected_413(strict_client) -> None:
    document_id = _make_document(strict_client)
    payload = {
        "language_tag": "en",
        "label": "Big",
        "content": "x" * (LIMIT * 3),
    }
    response = strict_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    body = response.json()
    assert body["code"] == "TEXT_TOO_LARGE"
    assert body["message"]
    assert body["details"]["max_body_bytes"] == LIMIT


def test_oversized_multipart_request_is_rejected_413(strict_client) -> None:
    document_id = _make_document(strict_client)
    big_file = b"a" * (LIMIT * 3)
    response = strict_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        files={"file": ("big.txt", big_file, "text/plain")},
        data={"language_tag": "de", "label": "Big import"},
    )
    assert response.status_code == 413
    body = response.json()
    assert body["code"] == "TEXT_TOO_LARGE"
    assert body["details"]["max_body_bytes"] == LIMIT


def test_body_just_below_the_limit_still_works(strict_client) -> None:
    document_id = _make_document(strict_client)
    # ~500 bytes of paste text, comfortably below the 1024-byte test limit.
    content = "line one\nline two\n" + ("café mañana 🙂 " * 20)
    assert len(content.encode("utf-8")) < LIMIT
    response = strict_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "Fits", "content": content},
    )
    assert response.status_code == 201
    assert response.json()["content"] == content


def test_multipart_just_below_the_limit_still_works(strict_client) -> None:
    document_id = _make_document(strict_client)
    small_file = "Hello world\n" * 30  # ~360 bytes
    response = strict_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        files={"file": ("small.txt", small_file.encode("utf-8"), "text/plain")},
        data={"language_tag": "es", "label": "Small import"},
    )
    assert response.status_code == 201


def test_default_limit_accepts_larger_than_test_limit(api_client) -> None:
    """The default (4,000,000-byte) app still accepts bodies that the strict
    test client rejects — the limit is configuration-driven."""
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={
            "language_tag": "en",
            "label": "Bigger than test limit",
            "content": "y" * (LIMIT * 3),
        },
    )
    assert response.status_code == 201
