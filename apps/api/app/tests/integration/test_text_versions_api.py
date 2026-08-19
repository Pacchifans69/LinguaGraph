"""TextVersion HTTP endpoints against real PostgreSQL (M0.3).

Covers the two ingestion paths (JSON paste and multipart UTF-8 ``.txt``
import), canonical server responses, metadata-only PATCH, delete /
force-delete route behavior (ADR-005), invalid UTF-8, invalid BCP-47,
duplicate-label CONFLICT without database-exception leakage, same-language
multiplicity and the standard error envelope.
"""

import hashlib
import uuid

import pytest

pytestmark = pytest.mark.integration


def _make_document(api_client) -> str:
    project = api_client.post(
        "/api/v1/projects", json={"name": "Corpus"}
    ).json()
    return api_client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Chapter 1"},
    ).json()["id"]


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# --- JSON paste path --------------------------------------------------------


def test_create_text_version_via_json_paste(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={
            "language_tag": "fr",
            "label": "French original",
            "content": "J’ai hâte de te voir demain.",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["document_id"] == document_id
    assert body["language_tag"] == "fr"
    assert body["label"] == "French original"
    assert body["content"] == "J’ai hâte de te voir demain."
    assert body["content_hash"] == _sha256(body["content"])
    assert body["sort_order"] == 0
    assert body["created_at"] and body["updated_at"]


def test_pasted_content_is_canonicalized_on_server(api_client) -> None:
    document_id = _make_document(api_client)
    # CRLF/CR -> LF, decomposed e-acute -> NFC, leading BOM stripped.
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={
            "language_tag": "de",
            "label": "DE canonical",
            "content": "\ufeffline1\r\nline2\rCafe\u0301",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["content"] == "line1\nline2\nCafé"
    assert body["content_hash"] == _sha256("line1\nline2\nCafé")
    # The server-returned canonical content is authoritative; the client must
    # display/refetch it rather than its own input.
    assert body["content"] != "\ufeffline1\r\nline2\rCafe\u0301"


def test_paste_rejects_nul_character(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "Evil", "content": "a\x00b"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_NULL_CHARACTER"
    assert body["message"] and isinstance(body["details"], dict)


def test_paste_rejects_invalid_bcp47(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "de-DE-1901-1901", "label": "Bad tag", "content": "x"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["field"] == "language_tag"


def test_arbitrary_languages_and_same_language_multiplicity(api_client) -> None:
    document_id = _make_document(api_client)
    for tag, label in [
        ("en", "English A"),
        ("en", "English B"),
        ("de", "German"),
        ("fr-CA", "French CA"),
        ("x-private", "Private use"),
    ]:
        response = api_client.post(
            f"/api/v1/documents/{document_id}/text-versions",
            json={"language_tag": tag, "label": label, "content": "text"},
        )
        assert response.status_code == 201, (tag, label, response.text)

    # Multiple versions with the same language tag are allowed by design.
    versions = {
        v["label"]
        for v in api_client.get(
            f"/api/v1/documents/{document_id}/workspace"
        ).json()["text_versions"]
    }
    assert {"English A", "English B"} <= versions


def test_duplicate_label_is_stable_conflict(api_client) -> None:
    document_id = _make_document(api_client)
    first = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "Same", "content": "one"},
    )
    assert first.status_code == 201

    second = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "de", "label": "Same", "content": "zwei"},
    )
    assert second.status_code == 409
    body = second.json()
    assert body["code"] == "CONFLICT"
    assert body["message"]
    # No SQLAlchemy/PostgreSQL exception string may leak to the client.
    assert "SQLAlchemy" not in body["message"]
    assert "IntegrityError" not in body["message"]
    assert "duplicate key" not in body["message"].lower()
    assert body["details"] == {"document_id": document_id}

    # The Session stays usable after the conflict: a different label works.
    third = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "fr", "label": "Different", "content": "trois"},
    )
    assert third.status_code == 201


def test_get_text_version(api_client) -> None:
    document_id = _make_document(api_client)
    created = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "es", "label": "Spanish", "content": "mañana"},
    ).json()

    fetched = api_client.get(f"/api/v1/text-versions/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_get_missing_text_version(api_client) -> None:
    missing = uuid.uuid4()
    response = api_client.get(f"/api/v1/text-versions/{missing}")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_patch_updates_metadata_only(api_client) -> None:
    document_id = _make_document(api_client)
    created = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={
            "language_tag": "en",
            "label": "Original",
            "content": "content stays",
            "sort_order": 0,
        },
    ).json()

    updated = api_client.patch(
        f"/api/v1/text-versions/{created['id']}",
        json={"label": "Renamed", "sort_order": 5},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["label"] == "Renamed"
    assert body["sort_order"] == 5
    assert body["content"] == "content stays"
    assert body["content_hash"] == created["content_hash"]


def test_patch_does_not_accept_content(api_client) -> None:
    document_id = _make_document(api_client)
    created = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "V", "content": "original"},
    ).json()
    # Unknown/extra fields are rejected by the schema (content mutation is
    # governed by the immutability policy, never by the general PATCH).
    response = api_client.patch(
        f"/api/v1/text-versions/{created['id']}",
        json={"label": "V2", "content": "mutated"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_patch_label_conflict(api_client) -> None:
    document_id = _make_document(api_client)
    first = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "A", "content": "one"},
    ).json()
    api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "de", "label": "B", "content": "zwei"},
    )

    response = api_client.patch(
        f"/api/v1/text-versions/{first['id']}", json={"label": "B"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"

    # Renaming to its own unchanged label is not a conflict.
    ok = api_client.patch(
        f"/api/v1/text-versions/{first['id']}", json={"label": "A"}
    )
    assert ok.status_code == 200


# --- .txt upload path -------------------------------------------------------


def test_import_txt_utf8_file(api_client) -> None:
    document_id = _make_document(api_client)
    content = b"\xef\xbb\xbfline one\r\nline two\r\nCafe\xcc\x81\n"
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        files={"file": ("sample.txt", content, "text/plain")},
        data={"language_tag": "de", "label": "Imported DE"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    # BOM stripped, CRLF -> LF, decomposed -> NFC, canonical hash matches.
    assert body["content"] == "line one\nline two\nCafé\n"
    assert body["content_hash"] == _sha256("line one\nline two\nCafé\n")
    assert body["language_tag"] == "de"
    assert body["label"] == "Imported DE"


def test_import_rejects_invalid_utf8_without_db_leak(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        files={"file": ("bad.txt", b"abc\xff\xfebad", "text/plain")},
        data={"language_tag": "en", "label": "Bad bytes"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_UTF8"
    assert body["message"]
    assert "SQLAlchemy" not in body["message"]


def test_import_requires_file_field(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        data={"language_tag": "en", "label": "No file"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_import_validates_form_fields(api_client) -> None:
    document_id = _make_document(api_client)
    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        files={"file": ("x.txt", b"content", "text/plain")},
        data={"language_tag": "en", "label": ""},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


# --- delete / force-delete (ADR-005) ---------------------------------------


def test_delete_unannotated_version(api_client) -> None:
    document_id = _make_document(api_client)
    created = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "V", "content": "text"},
    ).json()
    assert (
        api_client.delete(f"/api/v1/text-versions/{created['id']}").status_code == 204
    )
    assert api_client.get(f"/api/v1/text-versions/{created['id']}").status_code == 404


def test_delete_annotated_version_blocked_without_force(api_client, db_session) -> None:
    from sqlalchemy import text

    from app.db.models import AlignmentGroup, AlignmentMember
    from app.services import span_service
    from app.tests.integration.test_persistence import make_project, make_version

    project = make_project(db_session)
    doc = api_client.post(
        f"/api/v1/projects/{project.id}/documents", json={"title": "Doc"}
    ).json()
    document_id = doc["id"]
    en = make_version(
        db_session, document_id, language_tag="en", label="EN", content="english text"
    )
    de = make_version(
        db_session, document_id, language_tag="de", label="DE", content="deutscher text"
    )
    en_span = span_service.create_span(
        db_session, text_version_id=en.id, start_offset=0, end_offset=7
    )
    de_span = span_service.create_span(
        db_session, text_version_id=de.id, start_offset=0, end_offset=8
    )
    group = AlignmentGroup(document_id=document_id)
    db_session.add(group)
    db_session.commit()
    db_session.add_all(
        [
            AlignmentMember(alignment_group_id=group.id, span_id=en_span.id),
            AlignmentMember(alignment_group_id=group.id, span_id=de_span.id),
        ]
    )
    db_session.commit()

    response = api_client.delete(f"/api/v1/text-versions/{en.id}")
    assert response.status_code == 409
    assert response.json()["code"] == "TEXT_HAS_ANNOTATIONS"

    upgraded = api_client.delete(f"/api/v1/text-versions/{en.id}?force=true")
    assert upgraded.status_code == 204

    # Assert the committed database state through a raw connection (the test
    # session's identity map still holds stale pre-delete instances).
    with db_session.get_bind().connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM alignment_groups WHERE id = :gid"),
            {"gid": group.id},
        ).scalar_one() == 0
        assert conn.execute(
            text("SELECT count(*) FROM spans WHERE id = :sid"),
            {"sid": en_span.id},
        ).scalar_one() == 0
        assert conn.execute(
            text("SELECT count(*) FROM text_versions WHERE id = :vid"),
            {"vid": en.id},
        ).scalar_one() == 0

    assert api_client.get(f"/api/v1/text-versions/{en.id}").status_code == 404


def test_delete_force_requires_query_flag_not_body(api_client) -> None:
    document_id = _make_document(api_client)
    created = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "V", "content": "text"},
    ).json()
    # force must be an explicit query parameter; DELETE with a body is not
    # a supported destructive flow.
    response = api_client.request(
        "DELETE",
        f"/api/v1/text-versions/{created['id']}",
        json={"force": True},
    )
    assert response.status_code == 204


# --- configured size enforcement -------------------------------------------


def test_content_size_limit_is_enforced(api_client, monkeypatch) -> None:
    from app.core.config import Settings

    document_id = _make_document(api_client)

    def tiny_settings():
        return Settings(max_text_version_codepoints=5)

    import app.services.text_version_service as tvs
    import app.api.routes.text_versions as tvr

    monkeypatch.setattr(tvs, "get_settings", tiny_settings)
    monkeypatch.setattr(tvr, "get_settings", tiny_settings)

    response = api_client.post(
        f"/api/v1/documents/{document_id}/text-versions",
        json={"language_tag": "en", "label": "Big", "content": "abcdefgh"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "TEXT_TOO_LARGE"