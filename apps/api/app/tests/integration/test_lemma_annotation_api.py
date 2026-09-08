"""M4 lemma annotation API/service integration coverage.

Covers the frozen M4 contract end to end against a disposable PostgreSQL 18
database:

- lifecycle: create, exact workspace reload, edit, logical no-op, delete;
- one authoritative annotation per token occurrence;
- eligibility: sentence segments, non-word-like tokens, missing targets;
- the Unicode/value contract (NFC, astral, combining marks, NUL, surrogates,
  empty, leading/trailing whitespace, internal whitespace, case, 200/201);
- stable error envelopes;
- retokenization dependency blocking and the explicit recovery workflow;
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
    AlignmentGroup,
    Segment,
    SegmentationLayer,
    TextVersion,
    TokenLemmaAnnotation,
)
from app.db.session import SessionNotCleanError
from app.services import lemma_annotation_service, text_version_service
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
# Ordinals of the word-like tokens in TOKENS (Hello, world, Bye, 🙂).
WORD_ORDINALS = [0, 2, 4, 6]
# Ordinals of the separator tokens in TOKENS.
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
    project = api_client.post("/api/v1/projects", json={"name": "M4"}).json()
    document = api_client.post(
        f"/api/v1/projects/{project['id']}/documents", json={"title": "Lemmas"}
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


def put_lemma(api_client, token_segment_id: str, lemma: str):
    return api_client.put(
        f"/api/v1/token-segments/{token_segment_id}/lemma", json={"lemma": lemma}
    )


def delete_lemma(api_client, token_segment_id: str):
    return api_client.delete(f"/api/v1/token-segments/{token_segment_id}/lemma")


def workspace(api_client, document_id: str) -> dict:
    return api_client.get(f"/api/v1/documents/{document_id}/workspace").json()


def annotations_for(api_client, document_id: str) -> dict:
    return {
        item["token_segment_id"]: item
        for item in workspace(api_client, document_id)["token_lemma_annotations"]
    }


# --- lifecycle --------------------------------------------------------------


def test_lemma_create_reload_edit_and_delete_round_trip(api_client) -> None:
    fixture = make_fixture(api_client)
    created = put_lemma(api_client, fixture.word_id, "house")
    assert created.status_code == 200
    body = created.json()
    assert body["token_segment_id"] == fixture.word_id
    assert body["lemma"] == "house"
    # No redundant token context is persisted or returned.
    assert set(body) == {
        "id",
        "token_segment_id",
        "lemma",
        "created_at",
        "updated_at",
    }

    reloaded = annotations_for(api_client, fixture.document["id"])
    assert reloaded[fixture.word_id]["lemma"] == "house"

    edited = put_lemma(api_client, fixture.word_id, "houses")
    assert edited.status_code == 200
    assert edited.json()["id"] == body["id"]
    assert edited.json()["lemma"] == "houses"
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "houses"

    removed = delete_lemma(api_client, fixture.word_id)
    assert removed.status_code == 204
    assert annotations_for(api_client, fixture.document["id"]) == {}
    # Token and sentence segmentation survive the lemma delete.
    after = workspace(api_client, fixture.document["id"])
    assert len(after["segmentation_layers"]) == 2
    assert len(after["segments"]) == len(TOKENS) + len(SENTENCES)


def test_logical_no_op_put_preserves_updated_at(api_client) -> None:
    fixture = make_fixture(api_client)
    first = put_lemma(api_client, fixture.word_id, "house").json()
    second = put_lemma(api_client, fixture.word_id, "house")
    assert second.status_code == 200
    assert second.json()["updated_at"] == first["updated_at"]
    assert second.json()["created_at"] == first["created_at"]


def test_put_creates_exactly_one_annotation_per_token(api_client, db_session) -> None:
    fixture = make_fixture(api_client)
    for lemma in ("house", "houses", "house"):
        assert put_lemma(api_client, fixture.word_id, lemma).status_code == 200
    count = db_session.scalar(
        select(func.count())
        .select_from(TokenLemmaAnnotation)
        .where(TokenLemmaAnnotation.token_segment_id == uuid.UUID(fixture.word_id))
    )
    assert count == 1
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "house"


def test_two_tokens_may_share_a_lemma_string_without_shared_identity(api_client) -> None:
    fixture = make_fixture(api_client)
    first = fixture.words[0]
    second = fixture.words[2]
    assert put_lemma(api_client, first["id"], "same").status_code == 200
    assert put_lemma(api_client, second["id"], "same").status_code == 200
    stored = annotations_for(api_client, fixture.document["id"])
    assert stored[first["id"]]["id"] != stored[second["id"]]["id"]
    assert stored[first["id"]]["lemma"] == stored[second["id"]]["lemma"] == "same"
    # Deleting one occurrence's lemma leaves the other untouched.
    assert delete_lemma(api_client, first["id"]).status_code == 204
    remaining = annotations_for(api_client, fixture.document["id"])
    assert first["id"] not in remaining
    assert remaining[second["id"]]["lemma"] == "same"


def test_delete_missing_annotation_is_not_found(api_client) -> None:
    fixture = make_fixture(api_client)
    response = delete_lemma(api_client, fixture.word_id)
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


# --- eligibility ------------------------------------------------------------


def test_sentence_segment_is_not_a_lemma_target(api_client) -> None:
    fixture = make_fixture(api_client)
    response = put_lemma(api_client, fixture.sentence_segment["id"], "house")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_LEMMA_TARGET"
    assert body["details"]["reason"] == "not_a_token_segment"
    assert delete_lemma(api_client, fixture.sentence_segment["id"]).status_code == 422


def test_non_word_like_token_is_not_a_lemma_target(api_client) -> None:
    fixture = make_fixture(api_client)
    separator = fixture.separators[1]
    response = put_lemma(api_client, separator["id"], "house")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "INVALID_LEMMA_TARGET"
    assert body["details"]["reason"] == "not_word_like"
    assert annotations_for(api_client, fixture.document["id"]) == {}


def test_missing_token_is_not_found(api_client) -> None:
    response = put_lemma(api_client, str(uuid.uuid4()), "house")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert delete_lemma(api_client, str(uuid.uuid4())).status_code == 404


def test_request_rejects_competing_target_authority(api_client) -> None:
    fixture = make_fixture(api_client)
    response = api_client.put(
        f"/api/v1/token-segments/{fixture.word_id}/lemma",
        json={"lemma": "house", "text_version_id": fixture.version["id"]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_non_string_lemma_is_a_validation_error(api_client) -> None:
    fixture = make_fixture(api_client)
    response = api_client.put(
        f"/api/v1/token-segments/{fixture.word_id}/lemma", json={"lemma": 7}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


# --- Unicode / value contract ----------------------------------------------


@pytest.mark.parametrize(
    ("lemma", "expected"),
    [
        ("Haus", "Haus"),
        ("haus", "haus"),
        ("être", "être"),
        ("Über", "Über"),
        ("🙂", "🙂"),
        ("𠀀", "𠀀"),
        ("New York", "New York"),
        ("can't", "can't"),
    ],
)
def test_valid_lemma_values_are_preserved(api_client, lemma, expected) -> None:
    fixture = make_fixture(api_client)
    response = put_lemma(api_client, fixture.word_id, lemma)
    assert response.status_code == 200
    assert response.json()["lemma"] == expected


def test_combining_mark_input_is_nfc_normalized(api_client) -> None:
    fixture = make_fixture(api_client)
    decomposed = "e\u0301tat"  # e + combining acute + tat
    response = put_lemma(api_client, fixture.word_id, decomposed)
    assert response.status_code == 200
    assert response.json()["lemma"] == "\u00e9tat"
    assert response.json()["lemma"] != decomposed
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "\u00e9tat"


def test_code_point_boundary_is_200_inclusive(api_client) -> None:
    fixture = make_fixture(api_client)
    boundary = "a" * 200
    assert put_lemma(api_client, fixture.word_id, boundary).status_code == 200
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == boundary

    over = "b" * 201
    response = put_lemma(api_client, fixture.word_id, over)
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_LEMMA_VALUE"
    # The rejected write left the previous authoritative value intact.
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == boundary


@pytest.mark.parametrize(
    "lemma",
    [
        "",
        "\x00",
        "\x00Haus",
        " Haus",
        "Haus ",
        "\tHaus",
        "Haus\n",
        "\u00a0Haus",
        "Haus\u3000",
        "\u2003",
    ],
)
def test_invalid_lemma_values_fail_closed(api_client, lemma) -> None:
    fixture = make_fixture(api_client)
    response = put_lemma(api_client, fixture.word_id, lemma)
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_LEMMA_VALUE"
    assert annotations_for(api_client, fixture.document["id"]) == {}


@pytest.mark.parametrize("escape", ["\\ud800", "Haus\\udfff", "\\ud83d"])
def test_surrogate_lemma_values_are_rejected_at_the_http_boundary(
    api_client, escape
) -> None:
    """A lone surrogate reaches the server as a JSON escape sequence.

    The HTTP client cannot encode a lone surrogate as UTF-8, so the request is
    sent as a raw JSON document — exactly what a non-browser client could
    send. The service must reject it with the stable value error.
    """
    fixture = make_fixture(api_client)
    response = api_client.put(
        f"/api/v1/token-segments/{fixture.word_id}/lemma",
        content='{"lemma": "%s"}' % escape,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_LEMMA_VALUE"
    assert annotations_for(api_client, fixture.document["id"]) == {}


def test_normalize_lemma_value_rejects_nul_and_surrogates() -> None:
    with pytest.raises(DomainError) as nul:
        lemma_annotation_service.normalize_lemma_value("Haus\x00")
    assert nul.value.code == "INVALID_LEMMA_VALUE"
    with pytest.raises(DomainError) as surrogate:
        lemma_annotation_service.normalize_lemma_value("\ud800")
    assert surrogate.value.code == "INVALID_LEMMA_VALUE"
    assert lemma_annotation_service.normalize_lemma_value("e\u0301tat") == "\u00e9tat"


# --- dependencies -----------------------------------------------------------


def _replace_tokens(api_client, fixture: Fixture, *, ranges=None):
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


def test_token_replacement_is_blocked_while_a_lemma_depends(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    response = _replace_tokens(api_client, fixture)
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    assert body["details"]["dependency_type"] == "lemma_annotations"
    assert body["details"]["token_layer_id"] == fixture.token_layer_id
    assert body["details"]["text_version_id"] == fixture.version["id"]
    # The saved layer and its annotation are untouched.
    assert annotations_for(api_client, fixture.document["id"])[fixture.word_id][
        "lemma"
    ] == "house"


def test_token_deletion_is_blocked_while_a_lemma_depends(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    response = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
    )
    assert response.status_code == 409
    assert response.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    assert len(workspace(api_client, fixture.document["id"])["segments"]) == (
        len(TOKENS) + len(SENTENCES)
    )


def test_deleting_the_lemma_unblocks_retokenization(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert _replace_tokens(api_client, fixture).status_code == 409

    assert delete_lemma(api_client, fixture.word_id).status_code == 204

    replaced = _replace_tokens(api_client, fixture)
    assert replaced.status_code == 200
    assert len(replaced.json()["segments"]) == 2
    # No automatic re-anchoring: the new token layer has no lemma dependents.
    assert annotations_for(api_client, fixture.document["id"]) == {}

    # Token deletion is now permitted as well.
    assert (
        api_client.delete(
            f"/api/v1/text-versions/{fixture.version['id']}/segmentations/token"
        ).status_code
        == 204
    )


def test_sentence_to_token_dependency_is_unchanged(api_client) -> None:
    fixture = make_fixture(api_client)
    blocked = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/sentence"
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"

    # The lemma workflow does not change sentence->token dependency semantics.
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    still_blocked = api_client.delete(
        f"/api/v1/text-versions/{fixture.version['id']}/segmentations/sentence"
    )
    assert still_blocked.status_code == 409
    assert still_blocked.json()["code"] == "SEGMENTATION_HAS_DEPENDENTS"


# --- TextVersion lifecycle --------------------------------------------------


def test_ordinary_annotated_text_version_delete_remains_blocked(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    response = api_client.delete(f"/api/v1/text-versions/{fixture.version['id']}")
    assert response.status_code == 409
    assert response.json()["code"] == "TEXT_HAS_ANNOTATIONS"


def test_force_text_version_delete_cascades_lemma_hierarchy(api_client, db_session) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    version_id = uuid.UUID(fixture.version["id"])
    assert db_session.scalar(
        select(func.count())
        .select_from(TokenLemmaAnnotation)
        .where(TokenLemmaAnnotation.token_segment_id == uuid.UUID(fixture.word_id))
    ) == 1

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


def test_alignment_delete_preserves_lemma_annotation(api_client) -> None:
    fixture, group = _alignment_setup(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200

    assert api_client.delete(f"/api/v1/alignments/{group['id']}").status_code == 204

    stored = annotations_for(api_client, fixture.document["id"])
    assert stored[fixture.word_id]["lemma"] == "house"
    assert workspace(api_client, fixture.document["id"])["alignment_groups"] == []


def test_lemma_delete_preserves_alignment(api_client) -> None:
    fixture, group = _alignment_setup(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200

    assert delete_lemma(api_client, fixture.word_id).status_code == 204

    after = workspace(api_client, fixture.document["id"])
    assert [item["id"] for item in after["alignment_groups"]] == [group["id"]]
    assert len(after["alignment_members"]) == 2
    assert after["token_lemma_annotations"] == []


def test_lemma_mutation_does_not_touch_alignment_rows(api_client, db_session) -> None:
    fixture, group = _alignment_setup(api_client)
    before = db_session.scalar(
        select(func.count()).select_from(AlignmentGroup)
    ), db_session.scalar(select(func.count()).select_from(Segment))

    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_lemma(api_client, fixture.word_id, "houses").status_code == 200
    assert delete_lemma(api_client, fixture.word_id).status_code == 204

    after = db_session.scalar(
        select(func.count()).select_from(AlignmentGroup)
    ), db_session.scalar(select(func.count()).select_from(Segment))
    assert after == before
    assert db_session.scalar(
        select(func.count()).select_from(AlignmentGroup).where(
            AlignmentGroup.id == uuid.UUID(group["id"])
        )
    ) == 1


# --- workspace read model ---------------------------------------------------


def test_workspace_scopes_annotations_to_the_document(api_client) -> None:
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

    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    assert put_lemma(api_client, other_token["segments"][0]["id"], "Haus").status_code == 200

    mine = workspace(api_client, fixture.document["id"])["token_lemma_annotations"]
    theirs = workspace(api_client, other_document["id"])["token_lemma_annotations"]
    assert [item["token_segment_id"] for item in mine] == [fixture.word_id]
    assert [item["lemma"] for item in mine] == ["house"]
    assert [item["lemma"] for item in theirs] == ["Haus"]
    assert theirs[0]["token_segment_id"] == other_token["segments"][0]["id"]


def test_workspace_annotation_order_is_deterministic(api_client) -> None:
    fixture = make_fixture(api_client)
    for ordinal in WORD_ORDINALS:
        assert (
            put_lemma(api_client, fixture.words[ordinal]["id"], f"lemma-{ordinal}")
            .status_code
            == 200
        )
    first = [
        (item["created_at"], item["id"])
        for item in workspace(api_client, fixture.document["id"])[
            "token_lemma_annotations"
        ]
    ]
    second = [
        (item["created_at"], item["id"])
        for item in workspace(api_client, fixture.document["id"])[
            "token_lemma_annotations"
        ]
    ]
    assert first == second == sorted(first)
    assert len(first) == len(WORD_ORDINALS)


def test_workspace_serializes_only_persisted_annotation_columns(api_client) -> None:
    fixture = make_fixture(api_client)
    assert put_lemma(api_client, fixture.word_id, "house").status_code == 200
    item = workspace(api_client, fixture.document["id"])["token_lemma_annotations"][0]
    assert set(item) == {
        "id",
        "token_segment_id",
        "lemma",
        "created_at",
        "updated_at",
    }
    assert item["token_segment_id"] == fixture.word_id


# --- service-level contract -------------------------------------------------


def _service_fixture(db_session: Session):
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(db_session, document.id, content=CONTENT)
    sentence_layer = SegmentationLayer(
        text_version_id=version.id,
        granularity="sentence",
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        content_hash=version.content_hash,
    )
    db_session.add(sentence_layer)
    db_session.flush()
    sentence_segment = Segment(
        segmentation_layer_id=sentence_layer.id,
        ordinal=0,
        start_offset=0,
        end_offset=len(CONTENT),
        exact_text=CONTENT,
    )
    db_session.add(sentence_segment)
    db_session.flush()
    token_layer = SegmentationLayer(
        text_version_id=version.id,
        granularity="token",
        basis_layer_id=sentence_layer.id,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        content_hash=version.content_hash,
    )
    db_session.add(token_layer)
    db_session.flush()
    word = Segment(
        segmentation_layer_id=token_layer.id,
        ordinal=0,
        start_offset=0,
        end_offset=5,
        exact_text="Hello",
        is_word_like=True,
    )
    separator = Segment(
        segmentation_layer_id=token_layer.id,
        ordinal=1,
        start_offset=5,
        end_offset=len(CONTENT),
        exact_text=CONTENT[5:],
        is_word_like=False,
    )
    db_session.add_all([word, separator])
    db_session.commit()
    return version, sentence_segment, token_layer, word, separator


def test_service_requires_a_transaction_clean_session(db_session) -> None:
    _version, _sentence, _layer, word, _separator = _service_fixture(db_session)
    db_session.begin()
    try:
        with pytest.raises(SessionNotCleanError):
            lemma_annotation_service.put_token_lemma(db_session, word.id, lemma="Haus")
    finally:
        db_session.rollback()
    assert not db_session.in_transaction()


def test_write_failure_rolls_back_partial_annotation(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _version, _sentence, _layer, word, _separator = _service_fixture(db_session)

    def failing_flush(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("injected persistence failure")

    monkeypatch.setattr(Session, "flush", failing_flush)
    with pytest.raises(RuntimeError, match="injected persistence failure"):
        lemma_annotation_service.put_token_lemma(db_session, word.id, lemma="Haus")
    monkeypatch.undo()

    # The failed service call left no partial state and no open transaction.
    assert not db_session.in_transaction()
    assert (
        db_session.scalar(select(func.count()).select_from(TokenLemmaAnnotation)) == 0
    )
    # The token hierarchy is untouched by the failed lemma write.
    assert db_session.get(Segment, word.id) is not None


def test_service_delete_raises_for_missing_annotation(db_session) -> None:
    _version, _sentence, _layer, word, _separator = _service_fixture(db_session)
    with pytest.raises(DomainError) as error:
        lemma_annotation_service.delete_token_lemma(db_session, word.id)
    assert error.value.code == "NOT_FOUND"
    assert not db_session.in_transaction()


def test_force_delete_service_cascades_lemma(db_session) -> None:
    version, _sentence, _layer, word, _separator = _service_fixture(db_session)
    lemma_annotation_service.put_token_lemma(db_session, word.id, lemma="Haus")
    text_version_service.delete_text_version(db_session, version.id, force=True)
    assert (
        db_session.scalar(select(func.count()).select_from(TokenLemmaAnnotation)) == 0
    )
