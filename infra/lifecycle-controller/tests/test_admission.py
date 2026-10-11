from __future__ import annotations
from conftest import seed_terminal_history

import json

import pytest

from lifecycle_controller.admission import AdmissionService
from lifecycle_controller.ledger import LedgerWriter


def test_admission_durably_binds_before_caller_can_start_work(ledger_path):
    seed_terminal_history(ledger_path)
    order = []
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None, order_hook=order.append)
    result = AdmissionService(writer).admit("i-test", "A4-SHADOW-01", "candidate-1")
    work = []
    if result.admitted:
        work.append("work")
    assert result.admitted is True
    assert order == ["append:LIFECYCLE_RUN_BOUND", "flush"]
    assert work == ["work"]
    record = json.loads(ledger_path.read_text(encoding="utf-8").splitlines()[-1])
    assert record["event_type"] == "LIFECYCLE_RUN_BOUND"
    assert record["requesting_workflow"] == "A4-SHADOW-01"


def test_existing_active_run_returns_conflict_without_id_or_work(ledger_path, write_events):
    write_events(ledger_path, [{
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
        "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "old",
        "instance_id": "i-test", "requesting_workflow": "w", "workflow_run_identity": "r",
    }])
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit("i-test", "new", "new-run")
    assert result.admitted is False
    assert result.outcome == "RUN_CONFLICT"
    assert result.lifecycle_run_id is None
    assert len(ledger_path.read_text(encoding="utf-8").splitlines()) == 1


@pytest.mark.parametrize("attribution", [None, "UNKNOWN"])
def test_unresolved_historical_intent_blocks_admission(ledger_path, write_events, attribution):
    events = [
        {
            "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
            "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": "old",
            "instance_id": "i-test", "requesting_workflow": "w", "workflow_run_identity": "r",
        },
        {
            "schema_version": 2, "event_type": "MUTATION_INTENT", "event_seq": 1,
            "timestamp": "2026-10-09T00:00:01Z", "lifecycle_run_id": "old",
            "instance_id": "i-test", "decision_id": "d", "decision_phase": "POST_TASK",
            "mutation_action": "StopInstance", "mutation_sent": False,
        },
    ]
    if attribution is not None:
        events.append({
            "schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": 2,
            "timestamp": "2026-10-09T00:00:02Z", "lifecycle_run_id": "old", "instance_id": "i-test",
            "decision_id": "d", "decision_phase": "POST_TASK", "decision_outcome": "FAIL_CLOSED",
            "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0,
            "mutation_attribution": attribution, "mutation_action": None, "mutation_sent": False,
        })
    write_events(ledger_path, events)
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit("i-test", "new", "new-run")
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
    result = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None)).admit("i-test", "new", "new-run")
    assert result.admitted is True


def test_binding_is_immutable_and_rebind_is_rejected(ledger_path):
    seed_terminal_history(ledger_path)
    service = AdmissionService(LedgerWriter(ledger_path, lock_factory=lambda: None))
    first = service.admit("i-test", "w", "r")
    with pytest.raises(ValueError, match="immutable"):
        service.rebind(first.lifecycle_run_id, "other-instance", "other-workflow", "other-run")


def test_flush_failure_prevents_work(ledger_path):
    seed_terminal_history(ledger_path)
    work = []
    writer = LedgerWriter(
        ledger_path, lock_factory=lambda: None,
        fsync_func=lambda _: (_ for _ in ()).throw(OSError("fsync")),
    )
    result = AdmissionService(writer).admit("i-test", "w", "r")
    if result.admitted:
        work.append("work")
    assert result.admitted is False
    assert result.outcome == "FAIL_CLOSED"
    assert work == []
