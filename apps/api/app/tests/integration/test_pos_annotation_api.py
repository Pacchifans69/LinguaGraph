"""M5 coarse POS annotation API/service integration coverage.

Covers the frozen M5 contract end to end against a disposable PostgreSQL 18
database:

- lifecycle: create, exact workspace reload, edit, logical no-op, delete;
- one authoritative POS annotation per token occurrence;
- the closed fifteen-value vocabulary and exact case-sensitive semantics
  (lowercase/mixed case, leading/trailing whitespace, ``PUNCT``/``SYM``,
  unknown strings, non-strings, extra fields);
- eligibility: sentence segments, non-word-like tokens, missing/stale targets;
- lemma/POS sibling independence in both directions;
- multi-dependent retokenization blocking with the canonical
  ``dependency_types`` payload and the legacy scalar compatibility rule;
- TextVersion destructive lifecycle cascade;
- Alignment independence in both directions;
- workspace read-model scoping, ordering and transaction cleanliness;
- write-failure rollback atomicity.

No mocks, no SQLite: every test runs against real PostgreSQL.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import DomainError
from app.db.models import (
    POS_TAG_VALUES,
    AlignmentGroup,
    Segment,
    SegmentationLayer,
    TextVersion,
    TokenLemmaAnnotation,
    TokenPosAnnotation,
)
from app.db.session import SessionNotCleanError
from app.services import (
    lemma_annotation_service,
    pos_annotation_service,
    segmentation_service,
    text_version_service,
)
from app.services.segmentation_service import SegmentRange, TokenSegmentRange
from app.tests.integration.test_persistence import (
    make_document,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration

CONTENT = "Hello world. Bye 🙂!"
SENTENCES = [{"start": 0, "end": 13}, {"start": 13, "end": 19}]
TOKENS = [
    {"start": 0, "end": 5, "is_word_like": True},
    {"start": 5, "end": 6, "is_word_like": False},
    {"start": 6, "end": 11, "is_word_like": True},
    {"start": 11, "end": 13, "is_word_like": False},
    {"start": 13, "end": 16, "is_word_like": True},
    {"start": 16, "end": 17, "is_word_like": False},
    {"start": 17, "end": 18, "is_word_like": True},
    {"start": 18, "end": 19, "is_word_like": False},
]
WORD_ORDINALS = [0, 2, 4, 6]
SEPARATOR_ORDINALS = [1, 3, 5, 7]


class Fixture:
    """A saved sentence + token layer with stable word-like/separator ids."""

    def __init__(self, document: dict, version: dict, sentence: dict, token: dict):
        self.document = document
        self.version = version
        self.sentence = sentence
        self.token = token
        self.words = {ordinal: token["segments"][ordinal] for ordinal in WORD_ORDINALS}
        self.separators = {
            ordinal: token["segments"][ordinal] for ordinal in SEPARATOR_ORDINALS
        }
        self.sentence_segment = sentence["segments"][0]

    @property
    def word_id(self) -> str:
        return self.words[0]["id"]

    @property
    def token_layer_id(self) -> str:
        return self.token["layer"]["id"]


def make_fixture(api_client, *, content: str = CONTENT, language_tag: str = "en") -> Fixture:
    project = api_client.post("/api/v1/projects", json={"name": "M5"}).json()
    document = api_client.post(
        f"/api/v1/projects/{project['id']}/documents", json={"title": "POS"}
    ).json()
    version = api_client.post(
        f"/api/v1/documents/{document['id']}/text-versions",
        json={"language_tag": language_tag, "label": "Text", "content": content},
    ).json()
    sentence = api_client.put(
        f"/api/v1/text-versions/{version['id']}/segmentations/sentence",
        json={
            "content_hash": version["content_hash"],
            "requested_locale": language_tag,
            "resolved_locale": language_tag,
            "origin": "manual",
            "segments": SENTENCES,
        },
    ).json()
    token = api_client.put(
        f"/api/v1/text-versions/{version['id']}/segmentations/token",
        json={
            "content_hash": version["content_hash"],
            "basis_sentence_layer_id": sentence["layer"]["id"],
            "requested_locale": language_tag,
            "resolved_locale": language_tag,
            "origin": "manual",
            "segments": TOKENS,
        },
    ).json()
    return Fixture(document, version, sentence, token)


def put_pos(api_client, token_segment_id: str, pos_tag):
    return api_client.put(
        f"/api/v1/token-segments/{token_segment_id}/pos", json={"pos_tag": pos_tag}
    )


def delete_pos(api_client, token_segment_id: str):
    return api_client.delete(f"/api/v1/token-segments/{token_segment_id}/pos")


def put_lemma(api_client, token_segment_id: str, lemma: str):
    return api_client.put(
        f"/api/v1/token-segments/{token_segment_id}/lemma", json={"lemma": lemma}
    )


def workspace(api_client, document_id: str) -> dict:
    return api_client.get(f"/api/v1/documents/{document_id}/workspace").json()


def pos_for(api_client, document_id: str) -> dict:
    return {
        item["token_segment_id"]: item
        for item in workspace(api_client, document_id)["token_pos_annotations"]
    }


def lemma_for(api_client, document_id: str) -> dict:
    return {
        item["token_segment_id"]: item
        for item in workspace(api_client, document_id)["token_lemma_annotations"]
    }


def _replace_tokens(api_client, fixture: Fixture, ranges=None):
    return api_client.put(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token",
        json={
            "content_hash": fixture.version["content_hash"],
            "basis_sentence_layer_id": fixture.sentence["layer"]["id"],
            "requested_locale": "en",
            "resolved_locale": "en",
            "origin": "manual",
            "segments": ranges
            or [
                {"start": 0, "end": 13, "is_word_like": True},
                {"start": 13, "end": 19, "is_word_like": True},
            ],
        },
    )


# --- lifecycle --------------------------------------------------------------


def test_pos_create_reload_edit_and_delete_round_trip(api_client) -> None:
    fixture = make_fixture(api_client)
    created = put_pos(api_client, fixture.word_id, "NOUN")
    assert created.status_code == 200
    body = created.json()
    assert body["token_segment_id"] == fixture.word_id
    assert body["pos_tag"] == "NOUN"
    # No redundant token context is persisted or returned.
    assert set(body) == {
        "id",
        "token_segment_id",
        "pos_tag",
        "created_at",
        "updated_at",
    }

    reloaded = pos_for(api_client, fixture.document["id"])
    assert reloaded[fixture.word_id]["pos_tag"] == "NOUN"

    edited = put_pos(api_client, fixture.word_id, "VERB")
    assert edited.status_code == 200
    assert edited.json()["id"] == body["id"]
    assert edited.json()["pos_tag"] == "VERB"
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "VERB"

    removed = delete_pos(api_client, fixture.word_id)
    assert removed.status_code == 204
    assert pos_for(api_client, fixture.document["id"]) == {}
    # Token and sentence segmentation survive the POS delete.
    after = workspace(api_client, fixture.document["id"])
    assert len(after["segmentation_layers"]) == 2
    assert len(after["segments"]) == len(TOKENS) + len(SENTENCES)


def test_logical_no_op_put_preserves_updated_at(api_client) -> None:
    fixture = make_fixture(api_client)
    first = put_pos(api_client, fixture.word_id, "NOUN").json()
    second = put_pos(api_client, fixture.word_id, "NOUN")
    assert second.status_code == 200
    assert second.json()["updated_at"] == first["updated_at"]
    assert second.json()["created_at"] == first["created_at"]
    assert second.json()["id"] == first["id"]


def test_put_creates_exactly_one_annotation_per_token(api_client, db_session) -> None:
    fixture = make_fixture(api_client)
    for value in ("NOUN", "VERB", "NOUN", "ADJ"):
        assert put_pos(api_client, fixture.word_id, value).status_code == 200
    count = db_session.scalar(
        select(func.count())
        .select_from(TokenPosAnnotation)
        .where(TokenPosAnnotation.token_segment_id == uuid.UUID(fixture.word_id))
    )
    assert count == 1
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "ADJ"


def test_delete_missing_annotation_is_not_found(api_client) -> None:
    fixture = make_fixture(api_client)
    response = delete_pos(api_client, fixture.word_id)
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_delete_missing_token_is_not_found(api_client) -> None:
    fixture = make_fixture(api_client)
    response = delete_pos(api_client, str(uuid.uuid4()))
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert fixture.version["id"]  # fixture used; silence unused warnings


def test_put_missing_token_is_not_found(api_client) -> None:
    response = put_pos(api_client, str(uuid.uuid4()), "NOUN")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


# --- frozen vocabulary ------------------------------------------------------


@pytest.mark.parametrize("tag", POS_TAG_VALUES)
def test_every_frozen_tag_is_accepted(api_client, tag: str) -> None:
    fixture = make_fixture(api_client)
    response = put_pos(api_client, fixture.word_id, tag)
    assert response.status_code == 200, tag
    assert response.json()["pos_tag"] == tag
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == tag


@pytest.mark.parametrize(
    "value",
    [
        "noun",
        "Noun",
        "nOUN",
        " NOUN",
        "NOUN ",
        "\tNOUN",
        "NOUN\n",
        "PUNCT",
        "SYM",
        "XPOS",
        "NN",
        "N",
        "CUSTOM",
        "PROJECT_NOUN",
        "NOUN|VERB",
        "",
        "NOUN NOUN",
        "NOUNX",
        "X ",
        "Ｘ",
        "NOUN\x00",
        "NOUN\u200b",
    ],
)
def test_non_frozen_strings_are_invalid_pos_value(api_client, value: str) -> None:
    fixture = make_fixture(api_client)
    response = put_pos(api_client, fixture.word_id, value)
    assert response.status_code == 422, value
    assert response.json()["code"] == "INVALID_POS_VALUE"
    # Nothing was persisted for a rejected value.
    assert pos_for(api_client, fixture.document["id"]) == {}


@pytest.mark.parametrize("value", [1, 1.5, True, None, ["NOUN"], {"tag": "NOUN"}])
def test_non_string_values_are_validation_errors(api_client, value) -> None:
    fixture = make_fixture(api_client)
    response = put_pos(api_client, fixture.word_id, value)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_missing_pos_tag_is_a_validation_error(api_client) -> None:
    fixture = make_fixture(api_client)
    response = api_client.put(f"/api/v1/token-segments/{fixture.word_id}/pos", json={})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "extra",
    [
        {"lemma": "house"},
        {"is_word_like": True},
        {"text_version_id": "00000000-0000-0000-0000-000000000000"},
        {"content_hash": "a" * 64},
        {"start": 0},
        {"exact_text": "Hello"},
        {"language_tag": "en"},
        {"token_layer_id": "00000000-0000-0000-0000-000000000000"},
        {"pos_tag": "NOUN", "note": "x"},
    ],
)
def test_extra_request_fields_are_validation_errors(api_client, extra: dict) -> None:
    fixture = make_fixture(api_client)
    payload = {"pos_tag": "NOUN", **extra}
    response = api_client.put(
        f"/api/v1/token-segments/{fixture.word_id}/pos", json=payload
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert pos_for(api_client, fixture.document["id"]) == {}


def test_invalid_value_error_does_not_leak_database_internals(api_client) -> None:
    fixture = make_fixture(api_client)
    body = put_pos(api_client, fixture.word_id, "PUNCT").json()
    serialized = str(body)
    for fragment in ("psycopg", "sqlalchemy", "token_pos_annotations", "SELECT"):
        assert fragment.lower() not in serialized.lower()


# --- eligibility ------------------------------------------------------------


def test_sentence_segment_is_an_invalid_pos_target(api_client) -> None:
    fixture = make_fixture(api_client)
    response = put_pos(api_client, fixture.sentence_segment["id"], "NOUN")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_POS_TARGET"
    assert body["details"]["reason"] == "not_a_token_segment"
    assert body["details"]["token_segment_id"] == fixture.sentence_segment["id"]


def test_non_word_like_token_is_an_invalid_pos_target(api_client) -> None:
    fixture = make_fixture(api_client)
    for ordinal in SEPARATOR_ORDINALS:
        response = put_pos(api_client, fixture.separators[ordinal]["id"], "NOUN")
        assert response.status_code == 422
        body = response.json()
        assert body["code"] == "INVALID_POS_TARGET"
        assert body["details"]["reason"] == "not_word_like"


def test_delete_on_an_ineligible_target_is_invalid_pos_target(api_client) -> None:
    fixture = make_fixture(api_client)
    assert delete_pos(api_client, fixture.sentence_segment["id"]).json()["code"] == (
        "INVALID_POS_TARGET"
    )
    assert delete_pos(
        api_client, fixture.separators[SEPARATOR_ORDINALS[0]]["id"]
    ).json()["code"] == "INVALID_POS_TARGET"


def test_stale_token_after_retokenization_is_not_found(api_client) -> None:
    fixture = make_fixture(api_client)
    assert _replace_tokens(api_client, fixture).status_code == 200
    response = put_pos(api_client, fixture.word_id, "NOUN")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


# --- lemma/POS sibling independence ----------------------------------------


def test_pos_without_lemma(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    assert lemma_for(api_client, fixture.document["id"]) == {}
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "NOUN"


def test_lemma_without_pos(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert pos_for(api_client, fixture.document["id"]) == {}
    assert lemma_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "house"


def test_lemma_and_pos_coexist_as_independent_rows(api_client, db_session) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    after = workspace(api_client, fixture.document["id"])
    assert [item["lemma"] for item in after["token_lemma_annotations"]] == ["house"]
    assert [item["pos_tag"] for item in after["token_pos_annotations"]] == ["NOUN"]
    assert db_session.scalar(
        select(func.count()).select_from(TokenLemmaAnnotation)
    ) == 1
    assert db_session.scalar(select(func.count()).select_from(TokenPosAnnotation)) == 1

    # Editing one sibling never rewrites the other.
    assert put_pos(api_client, fixture.word_id, "VERB").status_code == 200
    assert lemma_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "house"
    assert put_lemma(api_client, fixture.word_id, "houses").status_code == 200
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "VERB"


def test_delete_pos_preserves_lemma(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    assert delete_pos(api_client, fixture.word_id).status_code == 204

    assert pos_for(api_client, fixture.document["id"]) == {}
    assert lemma_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "house"


def test_delete_lemma_preserves_pos(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    assert api_client.delete(
        f"/api/v1/token-segments/{fixture.word_id}/lemma"
    ).status_code == 204

    assert lemma_for(api_client, fixture.document["id"]) == {}
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "NOUN"


def test_pos_annotations_are_independent_across_tokens(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.words[0]["id"], "NOUN").status_code == 200
    assert put_pos(api_client, fixture.words[2]["id"], "VERB").status_code == 200
    assert put_pos(api_client, fixture.words[4]["id"], "PROPN").status_code == 200
    stored = pos_for(api_client, fixture.document["id"])
    assert stored[fixture.words[0]["id"]]["pos_tag"] == "NOUN"
    assert stored[fixture.words[2]["id"]]["pos_tag"] == "VERB"
    assert stored[fixture.words[4]["id"]]["pos_tag"] == "PROPN"
    assert fixture.words[6]["id"] not in stored


# --- dependency / retokenization blocking -----------------------------------


def test_token_replacement_is_blocked_while_pos_depends(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    response = _replace_tokens(api_client, fixture)
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    assert body["details"]["dependency_types"] == ["pos_annotations"]
    assert body["details"]["dependency_type"] == "pos_annotations"
    assert body["details"]["token_layer_id"] == fixture.token_layer_id
    assert body["details"]["text_version_id"] == fixture.version["id"]
    # The saved layer and its annotation are untouched.
    assert pos_for(api_client, fixture.document["id"])[fixture.word_id][
        "pos_tag"
    ] == "NOUN"


def test_token_deletion_is_blocked_while_pos_depends(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    response = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
    )
    assert response.status_code == 409
    assert response.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    assert response.json()["details"]["dependency_types"] == ["pos_annotations"]
    assert len(workspace(api_client, fixture.document["id"])["segments"]) == (
        len(TOKENS) + len(SENTENCES)
    )


def test_lemma_only_dependency_details_keep_scalar_compatibility(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    body = _replace_tokens(api_client, fixture).json()
    assert body["details"]["dependency_types"] == ["lemma_annotations"]
    assert body["details"]["dependency_type"] == "lemma_annotations"


def test_multi_dependent_details_report_canonical_order_without_scalar(
    api_client,
) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    body = _replace_tokens(api_client, fixture).json()
    details = body["details"]
    assert details["dependency_types"] == ["lemma_annotations", "pos_annotations"]
    # No artificial "primary" dependency is implied for the multi-dependent case.
    assert "dependency_type" not in details
    assert details["token_layer_id"] == fixture.token_layer_id
    assert details["text_version_id"] == fixture.version["id"]

    delete_body = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
    ).json()
    assert delete_body["details"]["dependency_types"] == [
        "lemma_annotations",
        "pos_annotations",
    ]
    assert "dependency_type" not in delete_body["details"]


def test_multi_dependent_canonical_order_is_independent_of_write_order(
    api_client,
) -> None:
    fixture = make_fixture(api_client)
    # POS first, then lemma: the reported set order must not follow write order.
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    body = _replace_tokens(api_client, fixture).json()
    assert body["details"]["dependency_types"] == [
        "lemma_annotations",
        "pos_annotations",
    ]


def test_sentence_to_token_dependency_details_are_unchanged(api_client) -> None:
    fixture = make_fixture(api_client)
    blocked = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/sentence"
    )
    assert blocked.status_code == 409
    details = blocked.json()["details"]
    assert blocked.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    # The inherited M3 sentence->token case is NOT redefined by M5.
    assert set(details) == {"text_version_id", "sentence_layer_id"}

    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    still_blocked = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/sentence"
    )
    assert still_blocked.status_code == 409
    assert set(still_blocked.json()["details"]) == {
        "text_version_id",
        "sentence_layer_id",
    }


def test_removing_one_sibling_keeps_the_parent_blocked(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    # Delete the lemma; the POS dependent still blocks retokenization.
    assert api_client.delete(
        f"/api/v1/token-segments/{fixture.word_id}/lemma"
    ).status_code == 204
    blocked = _replace_tokens(api_client, fixture)
    assert blocked.status_code == 409
    assert blocked.json()["details"]["dependency_types"] == ["pos_annotations"]

    # Delete the remaining POS; retokenization is now permitted.
    assert delete_pos(api_client, fixture.word_id).status_code == 204
    replaced = _replace_tokens(api_client, fixture)
    assert replaced.status_code == 200
    assert len(replaced.json()["segments"]) == 2
    # No automatic re-anchoring: the new token layer has no dependents.
    assert pos_for(api_client, fixture.document["id"]) == {}
    assert lemma_for(api_client, fixture.document["id"]) == {}


def test_reverse_sibling_deletion_order_also_unblocks_only_after_both(
    api_client,
) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    # Delete the POS first; the lemma dependent still blocks.
    assert delete_pos(api_client, fixture.word_id).status_code == 204
    blocked = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
    )
    assert blocked.status_code == 409
    assert blocked.json()["details"]["dependency_types"] == ["lemma_annotations"]

    assert api_client.delete(
        f"/api/v1/token-segments/{fixture.word_id}/lemma"
    ).status_code == 204
    assert (
        api_client.delete(
            f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
        ).status_code
        == 204
    )


def test_dependents_on_other_tokens_in_the_layer_also_block(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.words[2]["id"], "VERB").status_code == 200
    assert put_pos(api_client, fixture.words[4]["id"], "PROPN").status_code == 200
    blocked = _replace_tokens(api_client, fixture)
    assert blocked.status_code == 409
    assert blocked.json()["details"]["dependency_types"] == ["pos_annotations"]


# --- TextVersion lifecycle --------------------------------------------------


def test_ordinary_text_version_delete_remains_blocked(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    response = api_client.delete(f"/api/v1/text-versions/{fixture.version['id']}")
    assert response.status_code == 409
    assert response.json()["code"] == "TEXT_HAS_ANNOTATIONS"


def test_force_text_version_delete_cascades_pos_and_lemma(api_client, db_session) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    version_id = uuid.UUID(fixture.version["id"])
    assert db_session.scalar(select(func.count()).select_from(TokenPosAnnotation)) == 1

    response = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}?force=true"
    )
    assert response.status_code == 204

    assert db_session.scalar(
        select(func.count()).select_from(TextVersion).where(TextVersion.id == version_id)
    ) == 0
    assert db_session.scalar(
        select(func.count())
        .select_from(SegmentationLayer)
        .where(SegmentationLayer.text_version_id == version_id)
    ) == 0
    assert db_session.scalar(
        select(func.count())
        .select_from(Segment)
        .where(Segment.segmentation_layer_id == uuid.UUID(fixture.token_layer_id))
    ) == 0
    assert db_session.scalar(select(func.count()).select_from(TokenPosAnnotation)) == 0
    assert db_session.scalar(select(func.count()).select_from(TokenLemmaAnnotation)) == 0


# --- Alignment independence -------------------------------------------------


def _alignment_setup(api_client):
    fixture = make_fixture(api_client)
    other = api_client.post(
        f"/api/v1/documents/{fixture.document['id']}/text-versions",
        json={
            "language_tag": "de",
            "label": "German",
            "content": "Ich freue mich.",
            "sort_order": 1,
        },
    ).json()
    group = api_client.post(
        f"/api/v1/documents/{fixture.document['id']}/alignments",
        json={
            "members": [
                {
                    "text_version_id": fixture.version["id"],
                    "start": 0,
                    "end": 5,
                },
                {"text_version_id": other["id"], "start": 0, "end": 3},
            ]
        },
    ).json()
    return fixture, group


def test_alignment_delete_preserves_pos_annotation(api_client) -> None:
    fixture, group = _alignment_setup(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    assert api_client.delete(f"/api/v1/alignments/{group['id']}").status_code == 204

    stored = pos_for(api_client, fixture.document["id"])
    assert stored[fixture.word_id]["pos_tag"] == "NOUN"
    assert workspace(api_client, fixture.document["id"])["alignment_groups"] == []


def test_pos_delete_preserves_alignment(api_client) -> None:
    fixture, group = _alignment_setup(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200

    assert delete_pos(api_client, fixture.word_id).status_code == 204

    after = workspace(api_client, fixture.document["id"])
    assert [item["id"] for item in after["alignment_groups"]] == [group["id"]]
    assert len(after["alignment_members"]) == 2
    assert after["token_pos_annotations"] == []


def test_pos_mutation_does_not_touch_alignment_rows(api_client, db_session) -> None:
    fixture, group = _alignment_setup(api_client)
    before = (
        db_session.scalar(select(func.count()).select_from(AlignmentGroup)),
        db_session.scalar(select(func.count()).select_from(Segment)),
    )

    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    assert put_pos(api_client, fixture.word_id, "VERB").status_code == 200
    assert delete_pos(api_client, fixture.word_id).status_code == 204

    after = (
        db_session.scalar(select(func.count()).select_from(AlignmentGroup)),
        db_session.scalar(select(func.count()).select_from(Segment)),
    )
    assert after == before
    assert db_session.scalar(
        select(func.count())
        .select_from(AlignmentGroup)
        .where(AlignmentGroup.id == uuid.UUID(group["id"]))
    ) == 1


# --- workspace read model ---------------------------------------------------


def test_workspace_scopes_pos_annotations_to_the_document(api_client) -> None:
    fixture = make_fixture(api_client)
    other_project = api_client.post("/api/v1/projects", json={"name": "Other"}).json()
    other_document = api_client.post(
        f"/api/v1/projects/{other_project['id']}/documents",
        json={"title": "Other document"},
    ).json()
    other_version = api_client.post(
        f"/api/v1/documents/{other_document['id']}/text-versions",
        json={"language_tag": "en", "label": "Other", "content": CONTENT},
    ).json()
    other_sentence = api_client.put(
        f"/api/v1/text-versions/{other_version['id']}/segmentations/sentence",
        json={
            "content_hash": other_version["content_hash"],
            "requested_locale": "en",
            "resolved_locale": "en",
            "origin": "manual",
            "segments": SENTENCES,
        },
    ).json()
    other_token = api_client.put(
        f"/api/v1/text-versions/{other_version['id']}/segmentations/token",
        json={
            "content_hash": other_version["content_hash"],
            "basis_sentence_layer_id": other_sentence["layer"]["id"],
            "requested_locale": "en",
            "resolved_locale": "en",
            "origin": "manual",
            "segments": TOKENS,
        },
    ).json()

    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    assert (
        put_pos(api_client, other_token["segments"][0]["id"], "PROPN").status_code == 200
    )

    mine = workspace(api_client, fixture.document["id"])["token_pos_annotations"]
    theirs = workspace(api_client, other_document["id"])["token_pos_annotations"]
    assert [item["token_segment_id"] for item in mine] == [fixture.word_id]
    assert [item["pos_tag"] for item in mine] == ["NOUN"]
    assert [item["pos_tag"] for item in theirs] == ["PROPN"]
    assert theirs[0]["token_segment_id"] == other_token["segments"][0]["id"]


def test_workspace_pos_order_is_deterministic(api_client) -> None:
    fixture = make_fixture(api_client)
    for ordinal in WORD_ORDINALS:
        assert put_pos(api_client, fixture.words[ordinal]["id"], "NOUN").status_code == 200
    first = [
        (item["created_at"], item["id"])
        for item in workspace(api_client, fixture.document["id"])[
            "token_pos_annotations"
        ]
    ]
    second = [
        (item["created_at"], item["id"])
        for item in workspace(api_client, fixture.document["id"])[
            "token_pos_annotations"
        ]
    ]
    assert first == second == sorted(first)
    assert len(first) == len(WORD_ORDINALS)


def test_workspace_serializes_only_persisted_pos_columns(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_pos(api_client, fixture.word_id, "NOUN").status_code == 200
    item = workspace(api_client, fixture.document["id"])["token_pos_annotations"][0]
    assert set(item) == {
        "id",
        "token_segment_id",
        "pos_tag",
        "created_at",
        "updated_at",
    }
    assert item["token_segment_id"] == fixture.word_id


def test_workspace_pos_collection_is_empty_without_annotations(api_client) -> None:
    fixture = make_fixture(api_client)
    assert workspace(api_client, fixture.document["id"])["token_pos_annotations"] == []


# --- service-level contract -------------------------------------------------


def _service_fixture(db_session: Session):
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content=CONTENT)
    sentence = segmentation_service.replace_sentence_segmentation(
        db_session,
        version.id,
        content_hash=version.content_hash,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        ranges=[SegmentRange(start=0, end=len(CONTENT))],
    )
    token = segmentation_service.replace_token_segmentation(
        db_session,
        version.id,
        content_hash=version.content_hash,
        basis_sentence_layer_id=sentence.layer.id,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        ranges=[
            TokenSegmentRange(start=0, end=5, is_word_like=True),
            TokenSegmentRange(start=5, end=len(CONTENT), is_word_like=False),
        ],
    )
    return version, sentence.layer, token.layer, token.segments[0]


def test_service_returns_transaction_clean_session(db_session: Session) -> None:
    _version, _sentence, _token, word = _service_fixture(db_session)
    annotation = pos_annotation_service.put_token_pos(db_session, word.id, pos_tag="NOUN")
    assert annotation.pos_tag == "NOUN"
    assert db_session.in_transaction() is False
    assert not db_session.new and not db_session.dirty and not db_session.deleted

    pos_annotation_service.delete_token_pos(db_session, word.id)
    assert db_session.in_transaction() is False


def test_service_rejects_a_non_clean_session(db_session: Session) -> None:
    _version, _sentence, _token, word = _service_fixture(db_session)
    db_session.begin()
    try:
        with pytest.raises(SessionNotCleanError):
            pos_annotation_service.put_token_pos(db_session, word.id, pos_tag="NOUN")
    finally:
        db_session.rollback()


def test_service_validates_the_frozen_vocabulary_directly(db_session: Session) -> None:
    _version, _sentence, _token, word = _service_fixture(db_session)
    with pytest.raises(DomainError) as info:
        pos_annotation_service.put_token_pos(db_session, word.id, pos_tag="noun")
    assert info.value.code == "INVALID_POS_VALUE"
    assert db_session.in_transaction() is False


def test_write_failure_rolls_back_atomically(db_session: Session, monkeypatch) -> None:
    """A failure inside the write leaves NO partial POS row."""
    _version, _sentence, _token, word = _service_fixture(db_session)

    def boom(*_args, **_kwargs):
        raise RuntimeError("flush failure")

    monkeypatch.setattr(db_session, "flush", boom)
    with pytest.raises(RuntimeError, match="flush failure"):
        pos_annotation_service.put_token_pos(db_session, word.id, pos_tag="NOUN")
    monkeypatch.undo()

    assert db_session.in_transaction() is False
    assert db_session.scalar(select(func.count()).select_from(TokenPosAnnotation)) == 0


def test_text_version_service_is_not_required_for_pos_lifecycle(db_session: Session) -> None:
    """POS never needs a new TextVersion parameter or a POS-specific force flag."""
    version, _sentence, _token, word = _service_fixture(db_session)
    pos_annotation_service.put_token_pos(db_session, word.id, pos_tag="NOUN")
    text_version_service.delete_text_version(db_session, version.id, force=True)
    assert db_session.scalar(select(func.count()).select_from(TokenPosAnnotation)) == 0
