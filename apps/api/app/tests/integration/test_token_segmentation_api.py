"""M3 token segmentation API/service integration coverage."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.models import Segment, SegmentationLayer
from app.db.session import read_transaction
from app.services import segmentation_service
from app.services.segmentation_service import SegmentRange, TokenSegmentRange
from app.tests.integration.test_persistence import make_document, make_project, make_version

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
    assert missing.json()["code"] == "INVALID_TOKEN_CLASSIFICATION"
    wrong_type = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19, "is_word_like": 1}],
    )
    assert wrong_type.status_code == 422
    assert wrong_type.json()["code"] == "INVALID_TOKEN_CLASSIFICATION"


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


def test_token_replacement_rolls_back_completely_on_child_insert_failure(db_session, monkeypatch) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, language_tag="en", label="English", content="One.")
    sentence = segmentation_service.replace_sentence_segmentation(
        db_session,
        version.id,
        content_hash=version.content_hash,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        ranges=[SegmentRange(start=0, end=4)],
    )
    first = segmentation_service.replace_token_segmentation(
        db_session,
        version.id,
        content_hash=version.content_hash,
        basis_sentence_layer_id=sentence.layer.id,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        ranges=[TokenSegmentRange(start=0, end=4, is_word_like=True)],
    )

    def fail_add_all(_instances) -> None:
        raise RuntimeError("simulated token child insert failure")

    monkeypatch.setattr(db_session, "add_all", fail_add_all)
    with pytest.raises(RuntimeError, match="simulated token child insert failure"):
        segmentation_service.replace_token_segmentation(
            db_session,
            version.id,
            content_hash=version.content_hash,
            basis_sentence_layer_id=sentence.layer.id,
            requested_locale="en",
            resolved_locale="en",
            origin="manual",
            ranges=[
                TokenSegmentRange(start=0, end=3, is_word_like=True),
                TokenSegmentRange(start=3, end=4, is_word_like=False),
            ],
        )
    assert db_session.in_transaction() is False
    with read_transaction(db_session):
        token_layers = list(db_session.scalars(select(SegmentationLayer).where(SegmentationLayer.granularity == "token")).all())
        token_segments = list(db_session.scalars(select(Segment).where(Segment.segmentation_layer_id == first.layer.id)).all())
    assert [layer.id for layer in token_layers] == [first.layer.id]
    assert [(item.start_offset, item.end_offset, item.is_word_like) for item in token_segments] == [(0, 4, True)]


def test_force_text_version_delete_cascades_sentence_and_token_layers(api_client) -> None:
    document, version = _version(api_client)
    sentence = _sentences(api_client, version, [{"start": 0, "end": 19}]).json()
    assert _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19, "is_word_like": True}],
    ).status_code == 200
    blocked = api_client.delete(f"/api/v1/text-versions/{version['id']}")
    assert blocked.status_code == 409
    assert api_client.delete(
        f"/api/v1/text-versions/{version['id']}?force=true"
    ).status_code == 204
    workspace = api_client.get(
        f"/api/v1/documents/{document['id']}/workspace"
    ).json()
    assert workspace["segmentation_layers"] == []
    assert workspace["segments"] == []

def test_token_empty_content_uses_empty_sentence_basis_and_empty_partition(api_client) -> None:
    document, version = _version(api_client, content="")
    sentence_response = _sentences(api_client, version, [])
    assert sentence_response.status_code == 200
    sentence = sentence_response.json()

    token_response = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [],
        origin="manual",
    )
    assert token_response.status_code == 200
    body = token_response.json()
    assert body["layer"]["basis_layer_id"] == sentence["layer"]["id"]
    assert body["segments"] == []

    workspace = api_client.get(
        f"/api/v1/documents/{document['id']}/workspace"
    ).json()
    assert {layer["granularity"] for layer in workspace["segmentation_layers"]} == {
        "sentence",
        "token",
    }
    assert workspace["segments"] == []


def test_token_combining_marks_use_code_point_offsets_and_exact_text(api_client) -> None:
    _document, version = _version(api_client, content="x\u0301 🙂")
    sentence_response = _sentences(
        api_client,
        version,
        [{"start": 0, "end": 4}],
    )
    assert sentence_response.status_code == 200
    sentence = sentence_response.json()

    response = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [
            {"start": 0, "end": 2, "is_word_like": True},
            {"start": 2, "end": 3, "is_word_like": False},
            {"start": 3, "end": 4, "is_word_like": False},
        ],
    )
    assert response.status_code == 200
    assert [
        (item["start_offset"], item["end_offset"], item["exact_text"])
        for item in response.json()["segments"]
    ] == [(0, 2, "x\u0301"), (2, 3, " "), (3, 4, "🙂")]


def test_token_rejects_stale_content_and_cross_text_version_or_token_basis(api_client) -> None:
    _document, version = _version(api_client)
    sentence = _sentences(
        api_client,
        version,
        [{"start": 0, "end": 19}],
    ).json()

    stale_content = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19, "is_word_like": True}],
        content_hash="0" * 64,
    )
    assert stale_content.status_code == 409
    assert stale_content.json()["code"] == "STALE_SEGMENTATION_CONTENT"

    valid_token = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 19, "is_word_like": True}],
    )
    assert valid_token.status_code == 200
    token_layer_id = valid_token.json()["layer"]["id"]

    wrong_granularity = _tokens(
        api_client,
        version,
        token_layer_id,
        [{"start": 0, "end": 19, "is_word_like": True}],
    )
    assert wrong_granularity.status_code == 409
    assert wrong_granularity.json()["code"] == "STALE_SEGMENTATION_BASIS"

    _other_document, other_version = _version(api_client, content="Other.")
    cross_version = _tokens(
        api_client,
        other_version,
        sentence["layer"]["id"],
        [{"start": 0, "end": 6, "is_word_like": True}],
    )
    assert cross_version.status_code == 409
    assert cross_version.json()["code"] == "STALE_SEGMENTATION_BASIS"


def test_workspace_exposes_ordered_token_read_model_with_classification(api_client) -> None:
    document, version = _version(api_client, content="Hi !")
    sentence = _sentences(
        api_client,
        version,
        [{"start": 0, "end": 4}],
    ).json()
    token = _tokens(
        api_client,
        version,
        sentence["layer"]["id"],
        [
            {"start": 0, "end": 2, "is_word_like": True},
            {"start": 2, "end": 3, "is_word_like": False},
            {"start": 3, "end": 4, "is_word_like": False},
        ],
    ).json()

    workspace = api_client.get(
        f"/api/v1/documents/{document['id']}/workspace"
    ).json()
    token_layer = next(
        layer
        for layer in workspace["segmentation_layers"]
        if layer["granularity"] == "token"
    )
    assert token_layer["id"] == token["layer"]["id"]
    assert token_layer["basis_layer_id"] == sentence["layer"]["id"]
    token_segments = sorted(
        (
            segment
            for segment in workspace["segments"]
            if segment["segmentation_layer_id"] == token_layer["id"]
        ),
        key=lambda segment: segment["ordinal"],
    )
    assert [
        (segment["ordinal"], segment["exact_text"], segment["is_word_like"])
        for segment in token_segments
    ] == [(0, "Hi", True), (1, " ", False), (2, "!", False)]

