"""M5 concurrency: POS mutation vs token mutation and sibling writes.

The frozen M5 contract requires POS mutation to serialize on the SAME
TextVersion-root mutation lock already used by token replacement/deletion and
by M4 lemma mutation (contract section 10). Required race behavior:

- POS wins first  -> token replacement/deletion observes the dependent and
  fails closed with ``SEGMENTATION_HAS_DEPENDENTS``;
- token mutation wins first -> the old token disappears and the subsequent
  POS mutation fails closed with ``NOT_FOUND``;
- lemma PUT and POS PUT on the same saved token serialize on that root lock
  but mutate independent rows, so BOTH authoritative rows survive;
- concurrent POS writes to one saved token serialize without leaking a
  unique-constraint/integrity failure, and the final value is the serialized
  write that completes last.

Deterministic tests hold the TextVersion root lock on one connection and prove
the real service call on the contended side obeys that ordering. Barrier tests
run both real service calls concurrently and assert the no-silent-loss
invariant.

This is evidence for the ACCEPTED locking algorithm on meaningful concurrent
paths. It is deliberately NOT a claim of exhaustive proof over every possible
PostgreSQL interleaving.
"""

from __future__ import annotations

import threading
import time
import uuid

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.errors import DomainError
from app.db.models import (
    Segment,
    SegmentationLayer,
    TokenLemmaAnnotation,
    TokenPosAnnotation,
)
from app.services import (
    lemma_annotation_service,
    pos_annotation_service,
    segmentation_service,
)
from app.services.segmentation_service import SegmentRange, TokenSegmentRange
from app.tests.integration.test_persistence import (
    make_document,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration

CONTENT = "Hello world."
REPLACEMENT = [
    TokenSegmentRange(start=0, end=5, is_word_like=True),
    TokenSegmentRange(start=5, end=6, is_word_like=False),
    TokenSegmentRange(start=6, end=12, is_word_like=True),
]


def _fixture(db_session: Session):
    """Saved sentence + token layer with one word-like token, committed."""
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
            TokenSegmentRange(start=5, end=12, is_word_like=False),
        ],
    )
    return version, sentence.layer, token.layer, token.segments[0]


def _new_session(db_engine) -> Session:
    return sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)()


def _token_layer_id(db_session: Session, version_id) -> uuid.UUID:
    return db_session.scalar(
        select(SegmentationLayer.id).where(
            SegmentationLayer.text_version_id == version_id,
            SegmentationLayer.granularity == "token",
        )
    )


def test_pos_first_makes_retokenization_fail_closed(db_engine, db_session) -> None:
    """A POS write holding the root lock forces replacement to fail closed."""
    version, _sentence_layer, token_layer, word = _fixture(db_session)

    controller = _new_session(db_engine)
    result: dict = {}
    started = threading.Event()
    try:
        controller.begin()
        # Exactly the TextVersion-root lock a POS PUT holds.
        controller.execute(
            text("SELECT id FROM text_versions WHERE id = :id FOR UPDATE"),
            {"id": version.id},
        )

        def replace() -> None:
            session = _new_session(db_engine)
            try:
                started.set()
                segmentation_service.replace_token_segmentation(
                    session,
                    version.id,
                    content_hash=version.content_hash,
                    basis_sentence_layer_id=_sentence_layer.id,
                    requested_locale="en",
                    resolved_locale="en",
                    origin="manual",
                    ranges=REPLACEMENT,
                )
                result["ok"] = True
            except DomainError as error:
                result["code"] = error.code
                result["details"] = error.details
            finally:
                session.close()

        worker = threading.Thread(target=replace)
        worker.start()
        assert started.wait(timeout=5)
        time.sleep(0.5)
        assert worker.is_alive(), "replacement should be blocked on the root lock"

        # The POS write commits while holding the root lock.
        controller.execute(
            text(
                "INSERT INTO token_pos_annotations"
                " (id, token_segment_id, pos_tag, created_at, updated_at)"
                " VALUES (:id, :token, 'NOUN', now(), now())"
            ),
            {"id": uuid.uuid4(), "token": word.id},
        )
        controller.commit()
        worker.join(timeout=10)
        assert not worker.is_alive()
    finally:
        controller.close()

    assert result.get("ok") is not True
    assert result["code"] == "SEGMENTATION_HAS_DEPENDENTS"
    assert result["details"]["dependency_types"] == ["pos_annotations"]
    assert result["details"]["dependency_type"] == "pos_annotations"
    assert result["details"]["token_layer_id"] == str(token_layer.id)

    # The old token and its annotation survived; nothing was silently lost.
    assert db_session.scalar(select(Segment).where(Segment.id == word.id)) is not None
    assert db_session.scalar(
        select(TokenPosAnnotation).where(
            TokenPosAnnotation.token_segment_id == word.id
        )
    ).pos_tag == "NOUN"


def test_retokenization_first_makes_pos_mutation_fail_closed(
    db_engine, db_session
) -> None:
    """A completed replacement leaves the stale POS mutation failing closed."""
    version, _sentence_layer, _token_layer, word = _fixture(db_session)

    controller = _new_session(db_engine)
    result: dict = {}
    started = threading.Event()
    try:
        controller.begin()
        controller.execute(
            text("SELECT id FROM text_versions WHERE id = :id FOR UPDATE"),
            {"id": version.id},
        )

        def annotate() -> None:
            session = _new_session(db_engine)
            try:
                started.set()
                pos_annotation_service.put_token_pos(session, word.id, pos_tag="NOUN")
                result["ok"] = True
            except DomainError as error:
                result["code"] = error.code
            finally:
                session.close()

        worker = threading.Thread(target=annotate)
        worker.start()
        assert started.wait(timeout=5)
        time.sleep(0.5)
        assert worker.is_alive(), "POS mutation should be blocked on the root lock"

        # The replacement completes while holding the root lock: the old token
        # segment disappears (segments cascade from the deleted layer).
        controller.execute(
            text("DELETE FROM segmentation_layers WHERE id = :id"),
            {"id": _token_layer_id(db_session, version.id)},
        )
        controller.commit()
        worker.join(timeout=10)
        assert not worker.is_alive()
    finally:
        controller.close()

    assert result.get("ok") is not True
    assert result["code"] == "NOT_FOUND"
    assert db_session.scalar(
        select(TokenPosAnnotation).where(
            TokenPosAnnotation.token_segment_id == word.id
        )
    ) is None


def test_pos_mutation_vs_token_deletion_race_never_loses_the_annotation(
    db_engine, db_session
) -> None:
    """POS PUT racing a token-layer DELETE obeys the same two legal outcomes."""
    version, _sentence_layer, _token_layer, word = _fixture(db_session)
    barrier = threading.Barrier(2)
    outcome: dict = {}

    def annotate() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            pos_annotation_service.put_token_pos(session, word.id, pos_tag="VERB")
            outcome["pos"] = "ok"
        except DomainError as error:
            outcome["pos"] = error.code
        finally:
            session.close()

    def delete_layer() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            segmentation_service.delete_token_segmentation(session, version.id)
            outcome["delete"] = "ok"
        except DomainError as error:
            outcome["delete"] = error.code
        finally:
            session.close()

    threads = [threading.Thread(target=annotate), threading.Thread(target=delete_layer)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
        assert not thread.is_alive()

    assert set(outcome) == {"pos", "delete"}
    row = db_session.scalar(
        select(TokenPosAnnotation).where(
            TokenPosAnnotation.token_segment_id == word.id
        )
    )
    old_token = db_session.scalar(select(Segment).where(Segment.id == word.id))

    if outcome["pos"] == "ok":
        assert row is not None and row.pos_tag == "VERB"
        assert old_token is not None
        assert outcome["delete"] == "SEGMENTATION_HAS_DEPENDENTS"
    else:
        assert outcome["pos"] in {"NOT_FOUND", "INVALID_POS_TARGET"}
        assert row is None
        assert old_token is None
        assert outcome["delete"] == "ok"


def test_concurrent_lemma_and_pos_writes_on_one_token_both_survive(
    db_engine, db_session
) -> None:
    """Sibling writes serialize on one root lock but mutate independent rows."""
    _version, _sentence_layer, _token_layer, word = _fixture(db_session)
    barrier = threading.Barrier(2)
    outcome: dict = {}

    def annotate_lemma() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            lemma_annotation_service.put_token_lemma(session, word.id, lemma="house")
            outcome["lemma"] = "ok"
        except DomainError as error:  # pragma: no cover - would be a failure
            outcome["lemma"] = error.code
        finally:
            session.close()

    def annotate_pos() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            pos_annotation_service.put_token_pos(session, word.id, pos_tag="NOUN")
            outcome["pos"] = "ok"
        except DomainError as error:  # pragma: no cover - would be a failure
            outcome["pos"] = error.code
        finally:
            session.close()

    threads = [
        threading.Thread(target=annotate_lemma),
        threading.Thread(target=annotate_pos),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
        assert not thread.is_alive()

    # Neither sibling write is lost and neither leaked an integrity failure.
    assert outcome == {"lemma": "ok", "pos": "ok"}
    lemma_row = db_session.scalar(
        select(TokenLemmaAnnotation).where(
            TokenLemmaAnnotation.token_segment_id == word.id
        )
    )
    pos_row = db_session.scalar(
        select(TokenPosAnnotation).where(TokenPosAnnotation.token_segment_id == word.id)
    )
    assert lemma_row is not None and lemma_row.lemma == "house"
    assert pos_row is not None and pos_row.pos_tag == "NOUN"


def test_concurrent_pos_writes_serialize_without_integrity_errors(
    db_engine, db_session
) -> None:
    """Several concurrent PUTs to one token leave exactly one authoritative row."""
    _version, _sentence_layer, _token_layer, word = _fixture(db_session)
    values = ["NOUN", "VERB", "ADJ", "PROPN", "ADV", "DET"]
    barrier = threading.Barrier(len(values))
    outcome: dict = {}

    def write(tag: str) -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=10)
            annotation = pos_annotation_service.put_token_pos(
                session, word.id, pos_tag=tag
            )
            outcome[tag] = annotation.pos_tag
        except DomainError as error:  # pragma: no cover - would be a failure
            outcome[tag] = error.code
        finally:
            session.close()

    threads = [threading.Thread(target=write, args=(tag,)) for tag in values]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
        assert not thread.is_alive()

    # Every serialized write succeeded (no leaked unique-constraint failure).
    assert set(outcome) == set(values)
    assert all(value in values for value in outcome.values())

    # Exactly one authoritative row exists and its value is one of the writes.
    count = db_session.scalar(
        select(func.count())
        .select_from(TokenPosAnnotation)
        .where(TokenPosAnnotation.token_segment_id == word.id)
    )
    assert count == 1
    final = db_session.scalar(
        select(TokenPosAnnotation.pos_tag).where(
            TokenPosAnnotation.token_segment_id == word.id
        )
    )
    assert final in values


def test_serialized_pos_writes_persist_the_last_write(db_engine, db_session) -> None:
    """The value of the write that completes last is the persisted value."""
    version, _sentence_layer, _token_layer, word = _fixture(db_session)

    controller = _new_session(db_engine)
    result: dict = {}
    started = threading.Event()
    try:
        controller.begin()
        controller.execute(
            text("SELECT id FROM text_versions WHERE id = :id FOR UPDATE"),
            {"id": version.id},
        )
        # The first serialized write commits while holding the root lock.
        controller.execute(
            text(
                "INSERT INTO token_pos_annotations"
                " (id, token_segment_id, pos_tag, created_at, updated_at)"
                " VALUES (:id, :token, 'NOUN', now(), now())"
            ),
            {"id": uuid.uuid4(), "token": word.id},
        )

        def write_second() -> None:
            session = _new_session(db_engine)
            try:
                started.set()
                annotation = pos_annotation_service.put_token_pos(
                    session, word.id, pos_tag="VERB"
                )
                result["pos_tag"] = annotation.pos_tag
            except DomainError as error:  # pragma: no cover - would be a failure
                result["code"] = error.code
            finally:
                session.close()

        worker = threading.Thread(target=write_second)
        worker.start()
        assert started.wait(timeout=5)
        time.sleep(0.5)
        assert worker.is_alive(), "the second write should wait for the root lock"

        controller.commit()
        worker.join(timeout=10)
        assert not worker.is_alive()
    finally:
        controller.close()

    assert result.get("pos_tag") == "VERB"
    rows = db_session.scalars(
        select(TokenPosAnnotation).where(TokenPosAnnotation.token_segment_id == word.id)
    ).all()
    assert len(rows) == 1
    assert rows[0].pos_tag == "VERB"
