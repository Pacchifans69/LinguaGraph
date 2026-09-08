"""M4 concurrency: lemma mutation vs token replacement (REAL PostgreSQL 18).

The frozen M4 contract requires lemma mutation and token replacement/deletion
to serialize on the SAME TextVersion-root mutation lock, with two legal race
outcomes and no silent lost annotation:

- lemma wins first  -> token replacement observes the dependent and fails
  closed with ``SEGMENTATION_HAS_DEPENDENTS``;
- token replacement wins first -> the old token disappears and the subsequent
  lemma mutation fails closed with ``NOT_FOUND``.

Two deterministic tests hold the TextVersion root lock on one connection and
prove the real service call on the contended side obeys that lock ordering.
A third test runs both real service calls concurrently through a barrier and
asserts the no-silent-loss invariant.

This is evidence for the ACCEPTED locking algorithm on meaningful concurrent
paths. It is deliberately NOT a claim of exhaustive proof over every possible
PostgreSQL interleaving.
"""

from __future__ import annotations

import threading
import time
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.errors import DomainError
from app.db.models import Segment, SegmentationLayer, TokenLemmaAnnotation
from app.services import lemma_annotation_service, segmentation_service
from app.services.segmentation_service import SegmentRange, TokenSegmentRange
from app.tests.integration.test_persistence import (
    make_document,
    make_project,
    make_version,
)

pytestmark = pytest.mark.integration

CONTENT = "Hello world."
WORD = "Hello"
WORD_END = len(WORD)
REPLACEMENT = [TokenSegmentRange(start=0, end=5, is_word_like=True),
               TokenSegmentRange(start=5, end=6, is_word_like=False),
               TokenSegmentRange(start=6, end=12, is_word_like=True)]


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


def test_lemma_first_makes_retokenization_fail_closed(db_engine, db_session) -> None:
    """A lemma write holding the root lock forces replacement to fail closed."""
    version, _sentence_layer, token_layer, word = _fixture(db_session)

    controller = _new_session(db_engine)
    result: dict = {}
    started = threading.Event()
    try:
        controller.begin()
        # Exactly the TextVersion-root lock a lemma PUT holds.
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
        # Let the worker reach the lock wait before the lemma write commits.
        time.sleep(0.5)
        assert worker.is_alive(), "replacement should be blocked on the root lock"

        # The lemma write commits while holding the root lock.
        controller.execute(
            text(
                "INSERT INTO token_lemma_annotations"
                " (id, token_segment_id, lemma, created_at, updated_at)"
                " VALUES (:id, :token, 'house', now(), now())"
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
    assert result["details"]["dependency_type"] == "lemma_annotations"
    assert result["details"]["token_layer_id"] == str(token_layer.id)

    # The old token and its annotation survived; nothing was silently lost.
    assert db_session.scalar(
        select(Segment).where(Segment.id == word.id)
    ) is not None
    assert db_session.scalar(
        select(TokenLemmaAnnotation).where(
            TokenLemmaAnnotation.token_segment_id == word.id
        )
    ).lemma == "house"


def test_retokenization_first_makes_lemma_mutation_fail_closed(
    db_engine, db_session
) -> None:
    """A completed replacement leaves the stale lemma mutation failing closed."""
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
                lemma_annotation_service.put_token_lemma(
                    session, word.id, lemma="house"
                )
                result["ok"] = True
            except DomainError as error:
                result["code"] = error.code
            finally:
                session.close()

        worker = threading.Thread(target=annotate)
        worker.start()
        assert started.wait(timeout=5)
        time.sleep(0.5)
        assert worker.is_alive(), "lemma mutation should be blocked on the root lock"

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
        select(TokenLemmaAnnotation).where(
            TokenLemmaAnnotation.token_segment_id == word.id
        )
    ) is None


def _token_layer_id(db_session: Session, version_id) -> uuid.UUID:
    return db_session.scalar(
        select(SegmentationLayer.id).where(
            SegmentationLayer.text_version_id == version_id,
            SegmentationLayer.granularity == "token",
        )
    )


def test_concurrent_lemma_and_replacement_never_lose_the_annotation(
    db_engine, db_session
) -> None:
    """Both real service calls race; the contract invariant always holds.

    Either the replacement was blocked by the dependent (and the annotation
    plus the original token still exist), or the replacement won and the lemma
    mutation failed closed with no row created. A successful lemma write for a
    deleted token is the forbidden outcome.
    """
    version, sentence_layer, token_layer, word = _fixture(db_session)
    barrier = threading.Barrier(2)
    outcome: dict = {}

    def annotate() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            lemma_annotation_service.put_token_lemma(session, word.id, lemma="house")
            outcome["lemma"] = "ok"
        except DomainError as error:
            outcome["lemma"] = error.code
        finally:
            session.close()

    def replace() -> None:
        session = _new_session(db_engine)
        try:
            barrier.wait(timeout=5)
            segmentation_service.replace_token_segmentation(
                session,
                version.id,
                content_hash=version.content_hash,
                basis_sentence_layer_id=sentence_layer.id,
                requested_locale="en",
                resolved_locale="en",
                origin="manual",
                ranges=REPLACEMENT,
            )
            outcome["replace"] = "ok"
        except DomainError as error:
            outcome["replace"] = error.code
        finally:
            session.close()

    threads = [threading.Thread(target=annotate), threading.Thread(target=replace)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
        assert not thread.is_alive()

    assert set(outcome) == {"lemma", "replace"}
    lemma_row = db_session.scalar(
        select(TokenLemmaAnnotation).where(
            TokenLemmaAnnotation.token_segment_id == word.id
        )
    )
    old_token = db_session.scalar(select(Segment).where(Segment.id == word.id))

    if outcome["lemma"] == "ok":
        # The lemma won: the annotation and its token must both survive, and
        # the replacement must have failed closed.
        assert lemma_row is not None
        assert old_token is not None
        assert outcome["replace"] == "SEGMENTATION_HAS_DEPENDENTS"
    else:
        # The replacement won: the stale token is gone and the lemma mutation
        # failed closed without creating a row.
        assert outcome["lemma"] in {"NOT_FOUND", "INVALID_LEMMA_TARGET"}
        assert lemma_row is None
        assert old_token is None
        assert outcome["replace"] == "ok"
