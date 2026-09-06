"""M2 sentence-segmentation API/service integration tests."""

from __future__ import annotations

import threading
import time
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.errors import DomainError
from app.db.models import Segment, SegmentationLayer, TextVersion
from app.db.session import read_transaction
from app.services import segmentation_service, text_version_service
from app.services.segmentation_service import SegmentRange
from app.tests.integration.test_persistence import (
    make_document,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration


def _make_version(api_client, *, content: str = "Hello 🙂. 再见！"):
    project = api_client.post("/api/v1/projects", json={"name": "M2"}).json()
    document = api_client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Sentence work"},
    ).json()
    version = api_client.post(
        f"/api/v1/documents/{document['id']}/text-versions",
        json={
            "language_tag": "en",
            "label": "English",
            "content": content,
        },
    ).json()
    return document["id"], version


def _put(api_client, version: dict, segments, **overrides):
    body = {
        "content_hash": version["content_hash"],
        "requested_locale": version["language_tag"],
        "resolved_locale": "en",
        "origin": "manual",
        "segments": segments,
        **overrides,
    }
    return api_client.put(
        f"/api/v1/text-versions/{version['id']}/segmentations/sentence",
        json=body,
    )


def test_put_derives_unicode_exact_text_and_workspace_flat_arrays(api_client) -> None:
    document_id, version = _make_version(api_client)

    response = _put(
        api_client,
        version,
        [{"start": 0, "end": 9}, {"start": 9, "end": 12}],
        origin="intl_segmenter",
        resolved_locale="en-US",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["layer"]["text_version_id"] == version["id"]
    assert body["layer"]["granularity"] == "sentence"
    assert body["layer"]["requested_locale"] == "en"
    assert body["layer"]["resolved_locale"] == "en-US"
    assert body["layer"]["origin"] == "intl_segmenter"
    assert [item["ordinal"] for item in body["segments"]] == [0, 1]
    assert [item["exact_text"] for item in body["segments"]] == [
        "Hello 🙂. ",
        "再见！",
    ]

    workspace = api_client.get(
        f"/api/v1/documents/{document_id}/workspace"
    ).json()
    assert len(workspace["segmentation_layers"]) == 1
    assert len(workspace["segments"]) == 2
    assert [item["exact_text"] for item in workspace["segments"]] == [
        "Hello 🙂. ",
        "再见！",
    ]


def test_put_is_full_replacement_with_one_active_layer(api_client) -> None:
    document_id, version = _make_version(api_client)
    first = _put(
        api_client,
        version,
        [{"start": 0, "end": 9}, {"start": 9, "end": 12}],
    ).json()

    second_response = _put(
        api_client,
        version,
        [{"start": 0, "end": 12}],
    )

    assert second_response.status_code == 200
    second = second_response.json()
    assert second["layer"]["id"] != first["layer"]["id"]
    assert [item["exact_text"] for item in second["segments"]] == [
        "Hello 🙂. 再见！"
    ]
    workspace = api_client.get(
        f"/api/v1/documents/{document_id}/workspace"
    ).json()
    assert len(workspace["segmentation_layers"]) == 1
    assert len(workspace["segments"]) == 1


@pytest.mark.parametrize(
    ("segments", "code"),
    [
        ([{"start": 1, "end": 12}], "INVALID_SEGMENTATION_PARTITION"),
        (
            [{"start": 0, "end": 8}, {"start": 9, "end": 12}],
            "INVALID_SEGMENTATION_PARTITION",
        ),
        (
            [{"start": 0, "end": 10}, {"start": 9, "end": 12}],
            "INVALID_SEGMENTATION_PARTITION",
        ),
        ([{"start": 0, "end": 13}], "SEGMENT_OUT_OF_RANGE"),
        ([{"start": 0, "end": 0}], "SEGMENT_OUT_OF_RANGE"),
    ],
)
def test_put_rejects_invalid_ranges_and_partitions(
    api_client,
    segments,
    code,
) -> None:
    _document_id, version = _make_version(api_client)
    response = _put(api_client, version, segments)
    assert response.status_code == 422
    assert response.json()["code"] == code


def test_put_rejects_stale_hash_without_mutating_existing_layer(api_client) -> None:
    document_id, version = _make_version(api_client)
    first = _put(api_client, version, [{"start": 0, "end": 12}]).json()

    response = _put(
        api_client,
        version,
        [{"start": 0, "end": 9}, {"start": 9, "end": 12}],
        content_hash="0" * 64,
    )

    assert response.status_code == 409
    assert response.json()["code"] == "STALE_SEGMENTATION_CONTENT"
    workspace = api_client.get(
        f"/api/v1/documents/{document_id}/workspace"
    ).json()
    assert workspace["segmentation_layers"][0]["id"] == first["layer"]["id"]
    assert len(workspace["segments"]) == 1


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"requested_locale": "not_a_tag"}, "INVALID_SEGMENTATION_LOCALE"),
        ({"resolved_locale": "en--US"}, "INVALID_SEGMENTATION_LOCALE"),
        ({"requested_locale": "de"}, "INVALID_SEGMENTATION_LOCALE"),
    ],
)
def test_put_rejects_invalid_or_mismatched_locale(
    api_client,
    overrides,
    code,
) -> None:
    _document_id, version = _make_version(api_client)
    response = _put(
        api_client,
        version,
        [{"start": 0, "end": 12}],
        **overrides,
    )
    assert response.status_code == 422
    assert response.json()["code"] == code


def test_empty_content_uses_an_empty_segment_collection(api_client) -> None:
    document_id, version = _make_version(api_client, content="")
    response = _put(api_client, version, [])
    assert response.status_code == 200
    assert response.json()["segments"] == []
    workspace = api_client.get(
        f"/api/v1/documents/{document_id}/workspace"
    ).json()
    assert len(workspace["segmentation_layers"]) == 1
    assert workspace["segments"] == []


def test_delete_is_explicit_and_alignment_independent(api_client) -> None:
    project = api_client.post("/api/v1/projects", json={"name": "M2"}).json()
    document = api_client.post(
        f"/api/v1/projects/{project['id']}/documents",
        json={"title": "Independent layers"},
    ).json()
    versions = []
    for language_tag, label, content in (
        ("en", "English", "alpha beta"),
        ("de", "German", "eins zwei"),
    ):
        versions.append(
            api_client.post(
                f"/api/v1/documents/{document['id']}/text-versions",
                json={
                    "language_tag": language_tag,
                    "label": label,
                    "content": content,
                },
            ).json()
        )
    alignment = api_client.post(
        f"/api/v1/documents/{document['id']}/alignments",
        json={
            "members": [
                {"text_version_id": versions[0]["id"], "start": 0, "end": 5},
                {"text_version_id": versions[1]["id"], "start": 0, "end": 4},
            ]
        },
    )
    assert alignment.status_code == 201
    assert _put(
        api_client,
        versions[0],
        [{"start": 0, "end": 10}],
    ).status_code == 200

    deleted = api_client.delete(
        f"/api/v1/text-versions/{versions[0]['id']}/segmentations/sentence"
    )
    assert deleted.status_code == 204
    assert deleted.content == b""

    workspace = api_client.get(
        f"/api/v1/documents/{document['id']}/workspace"
    ).json()
    assert workspace["segmentation_layers"] == []
    assert workspace["segments"] == []
    assert len(workspace["alignment_groups"]) == 1
    assert len(workspace["alignment_members"]) == 2
    assert len(workspace["spans"]) == 2

    missing = api_client.delete(
        f"/api/v1/text-versions/{versions[0]['id']}/segmentations/sentence"
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "NOT_FOUND"


def test_text_version_delete_blocks_then_force_cascades_segmentation(
    api_client,
) -> None:
    document_id, version = _make_version(api_client)
    assert _put(
        api_client,
        version,
        [{"start": 0, "end": 12}],
    ).status_code == 200

    blocked = api_client.delete(f"/api/v1/text-versions/{version['id']}")
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "TEXT_HAS_ANNOTATIONS"

    forced = api_client.delete(
        f"/api/v1/text-versions/{version['id']}?force=true"
    )
    assert forced.status_code == 204
    workspace = api_client.get(
        f"/api/v1/documents/{document_id}/workspace"
    ).json()
    assert workspace["text_versions"] == []
    assert workspace["segmentation_layers"] == []
    assert workspace["segments"] == []


def test_replacement_rolls_back_completely_on_failure(
    db_session,
    monkeypatch,
) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session,
        document.id,
        language_tag="en",
        label="English",
        content="One. Two.",
    )
    first = segmentation_service.replace_sentence_segmentation(
        db_session,
        version.id,
        content_hash=version.content_hash,
        requested_locale="en",
        resolved_locale="en",
        origin="manual",
        ranges=[SegmentRange(start=0, end=9)],
    )
    first_layer_id = first.layer.id

    def fail_add_all(_instances) -> None:
        raise RuntimeError("simulated child insert failure")

    monkeypatch.setattr(db_session, "add_all", fail_add_all)
    with pytest.raises(RuntimeError, match="simulated child insert failure"):
        segmentation_service.replace_sentence_segmentation(
            db_session,
            version.id,
            content_hash=version.content_hash,
            requested_locale="en",
            resolved_locale="en",
            origin="manual",
            ranges=[
                SegmentRange(start=0, end=5),
                SegmentRange(start=5, end=9),
            ],
        )

    assert db_session.in_transaction() is False
    with read_transaction(db_session):
        layers = list(db_session.scalars(select(SegmentationLayer)).all())
        segments = list(db_session.scalars(select(Segment)).all())
    assert [layer.id for layer in layers] == [first_layer_id]
    assert [(item.start_offset, item.end_offset) for item in segments] == [
        (0, 9)
    ]



def _wait_for_postgresql_lock(
    db_engine,
    *,
    backend_pid: int,
    worker: threading.Thread,
) -> None:
    """Wait until the worker is blocked on the TextVersion coordination lock."""

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with db_engine.connect() as conn:
            wait_event_type = conn.execute(
                text(
                    "SELECT wait_event_type FROM pg_stat_activity "
                    "WHERE pid = :backend_pid"
                ),
                {"backend_pid": backend_pid},
            ).scalar_one_or_none()
        if wait_event_type == "Lock":
            return
        if not worker.is_alive():
            break
        time.sleep(0.01)
    raise AssertionError("worker did not wait on the TextVersion row lock")


def _run_while_segmentation_is_uncommitted(
    db_engine,
    *,
    text_version_id,
    operation,
) -> tuple[list[object], list[Exception]]:
    """Run a TextVersion mutation while a locked segmentation insert is pending."""

    factory = sessionmaker(
        bind=db_engine,
        autoflush=False,
        expire_on_commit=False,
    )
    ready = threading.Event()
    backend_pid: list[int] = []
    results: list[object] = []
    errors: list[Exception] = []

    def worker_target() -> None:
        try:
            with factory() as worker_session:
                pid = worker_session.scalar(text("SELECT pg_backend_pid()"))
                worker_session.commit()
                assert pid is not None
                backend_pid.append(pid)
                ready.set()
                results.append(operation(worker_session))
        except Exception as exc:  # pragma: no cover - asserted by caller
            errors.append(exc)

    worker = threading.Thread(target=worker_target)
    try:
        with factory() as annotating_session:
            with annotating_session.begin():
                version = annotating_session.scalar(
                    select(TextVersion)
                    .where(TextVersion.id == text_version_id)
                    .with_for_update()
                )
                assert version is not None
                layer = SegmentationLayer(
                    text_version_id=version.id,
                    granularity="sentence",
                    requested_locale=version.language_tag,
                    resolved_locale=version.language_tag,
                    origin="manual",
                    content_hash=version.content_hash,
                )
                annotating_session.add(layer)
                annotating_session.flush()
                annotating_session.add(
                    Segment(
                        segmentation_layer_id=layer.id,
                        ordinal=0,
                        start_offset=0,
                        end_offset=len(version.content),
                        exact_text=version.content,
                    )
                )
                annotating_session.flush()

                worker.start()
                assert ready.wait(timeout=5)
                _wait_for_postgresql_lock(
                    db_engine,
                    backend_pid=backend_pid[0],
                    worker=worker,
                )
        worker.join(timeout=5)
    finally:
        if worker.is_alive():
            worker.join(timeout=5)

    assert not worker.is_alive()
    return results, errors


def test_content_replacement_waits_for_inflight_segmentation_then_rejects(
    db_session,
    db_engine,
) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session,
        document.id,
        language_tag="en",
        label="English",
        content="Original.",
    )

    results, errors = _run_while_segmentation_is_uncommitted(
        db_engine,
        text_version_id=version.id,
        operation=lambda session: text_version_service.replace_content(
            session,
            version.id,
            content="Changed.",
        ),
    )

    assert results == []
    assert len(errors) == 1
    assert isinstance(errors[0], DomainError)
    assert errors[0].code == "TEXT_HAS_ANNOTATIONS"
    with db_engine.connect() as conn:
        assert conn.execute(
            text("SELECT content FROM text_versions WHERE id = :id"),
            {"id": version.id},
        ).scalar_one() == "Original."
        assert conn.execute(
            text(
                "SELECT count(*) FROM segmentation_layers "
                "WHERE text_version_id = :id"
            ),
            {"id": version.id},
        ).scalar_one() == 1


def test_default_delete_waits_for_inflight_segmentation_then_rejects(
    db_session,
    db_engine,
) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session,
        document.id,
        language_tag="en",
        label="English",
        content="Original.",
    )

    results, errors = _run_while_segmentation_is_uncommitted(
        db_engine,
        text_version_id=version.id,
        operation=lambda session: text_version_service.delete_text_version(
            session,
            version.id,
        ),
    )

    assert results == []
    assert len(errors) == 1
    assert isinstance(errors[0], DomainError)
    assert errors[0].code == "TEXT_HAS_ANNOTATIONS"
    with db_engine.connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM text_versions WHERE id = :id"),
            {"id": version.id},
        ).scalar_one() == 1
        assert conn.execute(
            text(
                "SELECT count(*) FROM segmentation_layers "
                "WHERE text_version_id = :id"
            ),
            {"id": version.id},
        ).scalar_one() == 1


def test_service_rejects_unsupported_granularity(db_session) -> None:
    project = make_project(db_session)
    document = make_document(db_session, project.id)
    version = make_version(
        db_session,
        document.id,
        language_tag="en",
        label="English",
        content="One.",
    )
    with pytest.raises(DomainError) as excinfo:
        segmentation_service.replace_sentence_segmentation(
            db_session,
            version.id,
            content_hash=version.content_hash,
            requested_locale="en",
            resolved_locale="en",
            origin="manual",
            ranges=[SegmentRange(start=0, end=4)],
            granularity="word",
        )
    assert excinfo.value.code == "UNSUPPORTED_SEGMENTATION_GRANULARITY"
