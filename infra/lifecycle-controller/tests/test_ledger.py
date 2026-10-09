from __future__ import annotations

import json

import pytest

from lifecycle_controller.ledger import (
    LedgerAuthorityUnavailable,
    LedgerWriter,
    SecretShapeError,
    validate_ledger,
)


def bound(seq=0):
    return {"schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": seq,
            "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "r", "instance_id": "i",
            "requesting_workflow": "w", "workflow_run_identity": "identity"}


def test_append_is_jsonl_contiguous_and_flushes(ledger_path):
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None)
    writer.append(bound())
    writer.append({**bound(1), "event_type": "LIFECYCLE_RUN_TERMINATED", "run_terminal_reason": "HUMAN_RESOLVED"})
    events = writer.scan()
    assert [item["event_seq"] for item in events] == [0, 1]


@pytest.mark.parametrize("mutate", [
    lambda e: {**e, "event_seq": 2},
    lambda e: {**e, "timestamp": "not-rfc3339"},
    lambda e: {**e, "schema_version": 1},
    lambda e: {**e, "requesting_workflow": ""},
])
def test_corrupt_or_non_contiguous_ledger_fails_closed(ledger_path, mutate):
    ledger_path.write_text(json.dumps(mutate(bound())) + "\n", encoding="utf-8")
    with pytest.raises(LedgerAuthorityUnavailable):
        validate_ledger(ledger_path)


def test_missing_authoritative_ledger_is_unavailable(ledger_path):
    with pytest.raises(LedgerAuthorityUnavailable):
        validate_ledger(ledger_path)


def test_existing_empty_ledger_is_unavailable(ledger_path):
    ledger_path.write_bytes(b"")
    with pytest.raises(LedgerAuthorityUnavailable):
        validate_ledger(ledger_path)


def test_duplicate_event_seq_is_unavailable(ledger_path):
    second = {**bound(0), "event_type": "LIFECYCLE_RUN_TERMINATED", "run_terminal_reason": "HUMAN_RESOLVED"}
    ledger_path.write_text(json.dumps(bound(0)) + "\n" + json.dumps(second) + "\n", encoding="utf-8")
    with pytest.raises(LedgerAuthorityUnavailable):
        validate_ledger(ledger_path)


def test_inapplicable_actuation_fields_are_rejected(ledger_path):
    with pytest.raises(LedgerAuthorityUnavailable):
        LedgerWriter(ledger_path, lock_factory=lambda: None).append({**bound(), "actuation_decision": "NO_MUTATION"})


@pytest.mark.parametrize("secret", ["AccessKeySecret=abc", "SecurityToken=abc", "-----BEGIN OPENSSH PRIVATE KEY-----", "ghp_1234567890abcdef"])
def test_secret_shaped_event_is_rejected_before_append(ledger_path, secret):
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None)
    with pytest.raises(SecretShapeError):
        writer.append({**bound(), "workflow_run_identity": secret})
    assert not ledger_path.exists() or ledger_path.read_text(encoding="utf-8") == ""


def test_mutation_intent_is_not_available_on_authoritative_writer(ledger_path):
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None)
    with pytest.raises(ValueError, match="MUTATION_INTENT"):
        writer.append({**bound(), "event_type": "MUTATION_INTENT", "decision_id": "d", "decision_phase": "POST_TASK"})


def test_writer_acquisition_denial_fails_closed(ledger_path):
    writer = LedgerWriter(ledger_path, lock_factory=lambda: (_ for _ in ()).throw(PermissionError("denied")))
    with pytest.raises(LedgerAuthorityUnavailable, match="LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE"):
        with writer.acquire():
            pass
