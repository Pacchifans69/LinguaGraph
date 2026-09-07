"""M3 token segmentation API/service integration coverage."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def _version(api_client, *, content: str = "Hello world. Bye 🙂!"):
    project = api_client.post("/api/v1/projects", json={"name": "M3"}).json()
    document = api_client.post(
        f"/api/v1/projects/{project['id']}/documents", json={"title": "Tokens"}
    ).json()
    version = api_client.post(
        f"/api/v1/documents/{document['id']}/text-versions",
        json={"language_tag": "en", "label": "English", "content": content},
    ).json()
    return document, version


def _sentences(api_client, version, segments):
    return api_client.put(
        f"/api/v1/text-versions/{version['id']}/segmentations/sentence",
        json={
            "content_hash": version["content_hash"],
            "requested_locale": "en",
            "resolved_locale": "en",
            "origin": "manual",
            "segments": segments,
        },
    )


def _tokens(api_client, version, basis_id, segments, **overrides):
    return api_client.put(
        f"/api/v1/text-versions/{version['id']}/segmentations/token",
        json={
            "content_hash": version["content_hash"],
            "basis_sentence_layer_id": basis_id,
            "requested_locale": "en",
            "resolved_locale": "en-US",
            "origin": "intl_segmenter",
            "segments": segments,
            **overrides,
        },
    )


def test_token_partition_persists_exact_text_classification_and_basis(api_client) -> None:
    document, version = _version(api_client)
    sentence = _sentences(
        api_client, version, [{"start": 0, "end": 13}, {"start": 13, "end": 19}]
    ).json()
    response = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [
            {"start": 0, "end": 5, "is_word_like": True},
            {"start": 5, "end": 6, "is_word_like": False},
            {"start": 6, "end": 11, "is_word_like": True},
            {"start": 11, "end": 13, "is_word_like": False},
            {"start": 13, "end": 16, "is_word_like": True},
            {"start": 16, "end": 17, "is_word_like": False},
            {"start": 17, "end": 18, "is_word_like": True},
            {"start": 18, "end": 19, "is_word_like": False},
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["layer"]["granularity"] == "token"
    assert body["layer"]["basis_layer_id"] == sentence["layer"]["id"]
    assert [item["exact_text"] for item in body["segments"]] == [
        "Hello", " ", "world", ". ", "Bye", " ", "🙂", "!"
    ]
    assert [item["is_word_like"] for item in body["segments"]] == [
        True, False, True, False, True, False, True, False
    ]
    workspace = api_client.get(
        f"/api/v1/documents/{document['id']}/workspace"
    ).json()
    assert {item["granularity"] for item in workspace["segmentation_layers"]} == {
        "sentence", "token"
    }


def test_token_rejects_cross_sentence_stale_basis_and_missing_classification(api_client) -> None:
    _document, version = _version(api_client)
    sentence = _sentences(
        api_client, version, [{"start": 0, "end": 13}, {"start": 13, "end": 19}]
    ).json()
    crossing = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [
            {"start": 0, "end": 12, "is_word_like": True},
            {"start": 12, "end": 14, "is_word_like": False},
            {"start": 14, "end": 19, "is_word_like": True},
        ],
    )
    assert crossing.status_code == 422
    assert crossing.json()["code"] == "TOKEN_CROSSES_SENTENCE_BOUNDARY"

    stale = _tokens(
        api_client,
        version,
        "00000000-0000-0000-0000-000000000001",
        [{"start": 0, "end": 19, "is_word_like": True}],
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "STALE_SEGMENTATION_BASIS"

    missing = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19}],
    )
    assert missing.status_code == 422
    assert missing.json()["code"] == "VALIDATION_ERROR"


def test_sentence_mutation_blocks_until_token_is_explicitly_deleted(api_client) -> None:
    _document, version = _version(api_client)
    sentence = _sentences(api_client, version, [{"start": 0, "end": 19}]).json()
    assert _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19, "is_word_like": True}],
    ).status_code == 200

    blocked_put = _sentences(api_client, version, [{"start": 0, "end": 19}])
    assert blocked_put.status_code == 409
    assert blocked_put.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    blocked_delete = api_client.delete(
        f"/api/v1/text-versions/{version['id']}/segmentations/sentence"
    )
    assert blocked_delete.status_code == 409

    deleted = api_client.delete(
        f"/api/v1/text-versions/{version['id']}/segmentations/token"
    )
    assert deleted.status_code == 204
    assert api_client.delete(
        f"/api/v1/text-versions/{version['id']}/segmentations/sentence"
    ).status_code == 204
