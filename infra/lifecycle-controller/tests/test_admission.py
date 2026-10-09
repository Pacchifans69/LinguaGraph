from __future__ import annotations

import json

import pytest

from lifecycle_controller.admission import AdmissionService, RunConflict
from lifecycle_controller.ledger import LedgerWriter


def test_admission_allocates_id_and_durably_binds_before_work(ledger_path):
    order: list[str] = []
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None, order_hook=order.append)
    service = AdmissionService(writer)

    result = service.admit("i-test", "fixture-workflow", "candidate-1")

    assert result.admitted is True
    assert result.binding.lifecycle_run_id
    assert order == ["append:LIFECYCLE_RUN_BOUND", "flush"]
    record = json.loads(ledger_path.read_text(encoding="utf-8").splitlines()[0])
    assert record["event_type"] == "LIFECYCLE_RUN_BOUND"
    assert record["requesting_workflow"] == "fixture-workflow"


def test_existing_active_run_returns_conflict_without_id_or_work(ledger_path, write_events):
    write_events(ledger_path, [{
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
        "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "old",
        "instance_id": "i-test", "requesting_workflow": "w", "workflow_run_identity": "r",
    }])
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit(
        "i-test", "new", "new-run"
    )
    assert result.admitted is False
    assert result.outcome == "RUN_CONFLICT"
    assert result.lifecycle_run_id is None
    assert len(ledger_path.read_text(encoding="utf-8").splitlines()) == 1


@pytest.mark.parametrize("attribution", [None, "UNKNOWN"])
def test_unresolved_intent_blocks_admission(ledger_path, write_events, attribution):
    intent = {
        "schema_version": 2, "event_type": "MUTATION_INTENT", "event_seq": 0,
        "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "old",
        "instance_id": "i-test", "decision_id": "d", "decision_phase": "POST_TASK",
    }
    events = [intent]
    if attribution:
        intent = dict(intent)
        intent["mutation_attribution"] = attribution
    write_events(ledger_path, events)
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit(
        "i-test", "new", "new-run"
    )
    assert result.outcome == "RUN_CONFLICT"


def test_terminal_history_does_not_block_new_admission(ledger_path, write_events):
    write_events(ledger_path, [
        {"schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
         "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "old", "instance_id": "i-test",
         "requesting_workflow": "w", "workflow_run_identity": "r"},
        {"schema_version": 2, "event_type": "LIFECYCLE_RUN_TERMINATED", "event_seq": 1,
         "timestamp": "2026-10-09T00:01:00Z", "lifecycle_run_id": "old", "instance_id": "i-test",
         "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE"},
    ])
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit(
        "i-test", "new", "new-run"
    )
    assert result.admitted is True


def test_binding_is_immutable_and_rebind_is_rejected(ledger_path):
    service = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None))
    first = service.admit("i-test", "w", "r")
    with pytest.raises(ValueError, match="immutable"):
        service.rebind(first.lifecycle_run_id, "other-instance", "other-workflow", "other-run")


def test_flush_failure_prevents_work(ledger_path):
    work = []
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None, fsync_func=lambda _: (_ for _ in ()).throw(OSError("fsync")))
    service = AdmissionService(writer)
    result = service.admit("i-test", "w", "r", work_hook=lambda: work.append("work"))
    assert result.admitted is False
    assert result.outcome == "FAIL_CLOSED"
    assert work == []
