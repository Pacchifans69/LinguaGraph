from __future__ import annotations

import inspect
import os

import pytest

from lifecycle_controller.ledger import LedgerAuthorityUnavailable, LedgerWriter
from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.terminal import TerminalManager
from conftest import seed_terminal_history
from test_controller import KillSwitch, Observer, Safety, make_fixture


def test_r4_01_post_task_production_path_durably_terminates_run(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    evidence = tmp_path / "evidence"
    verifier = ClosureVerifier(writer=writer, evidence_root=evidence, safety_state_provider=Safety())
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    controller = ShadowController(writer, KillSwitch(switch_path), verifier, endpoint_observer=Observer("Running"))
    assert controller.start()
    try:
        run = controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "r4-run")
        assert run.admitted
        make_fixture(evidence, {
            "requesting_workflow": "A4-SHADOW-01",
            "workflow_run_identity": "r4-run",
            "lifecycle_run_id": run.lifecycle_run_id,
        })
        result = controller.evaluate(run.lifecycle_run_id, phase="POST_TASK")
        assert result.policy_decision == "WOULD_STOP"
        events = writer.scan()
        terminal = [event for event in events if event.get("lifecycle_run_id") == run.lifecycle_run_id and event["event_type"] == "LIFECYCLE_RUN_TERMINATED"]
        assert len(terminal) == 1
        assert terminal[0]["event_seq"] == len(events) - 1
        assert terminal[0]["run_terminal_reason"] == "NORMAL_CONTROLLER_CLOSURE"
        from lifecycle_controller.recovery import classify_run
        assert classify_run(writer.scan(), run.lifecycle_run_id) == ("TERMINAL", None)
    finally:
        controller.close()


def test_post_task_fail_closed_outcome_can_complete_normal_terminal_closure(tmp_path):
    ledger = tmp_path / "disabled.jsonl"
    from lifecycle_controller.recovery import classify_run
    from test_v3_r1_corrections import PROTECTED
    seed_terminal_history(ledger, instance=PROTECTED)
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("false", encoding="utf-8")
    verifier = ClosureVerifier(writer=writer, evidence_root=tmp_path / "evidence", safety_state_provider=Safety())
    controller = ShadowController(writer, KillSwitch(switch_path), verifier, endpoint_observer=Observer("Running"))
    assert controller.start()
    try:
        run = controller.admit(PROTECTED, "A4-SHADOW-01", "disabled-run")
        result = controller.evaluate(run.lifecycle_run_id, phase="POST_TASK")
        assert result.decision_outcome == "DISABLED_BY_KILL_SWITCH"
        assert classify_run(writer.scan(), run.lifecycle_run_id) == ("TERMINAL", None)
    finally:
        controller.close()

def _controller_for(path, tmp_path, *, fsync_func=os.fsync, order_hook=None):
    ledger = path
    from test_v3_r1_corrections import PROTECTED
    seed_terminal_history(ledger, instance=PROTECTED)
    writer = LedgerWriter(ledger, lock_factory=lambda: None, fsync_func=fsync_func, order_hook=order_hook)
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    verifier = ClosureVerifier(writer=writer, evidence_root=tmp_path / "evidence", safety_state_provider=Safety())
    controller = ShadowController(writer, KillSwitch(switch_path), verifier, endpoint_observer=Observer("Running"))
    assert controller.start()
    run = controller.admit(PROTECTED, "A4-SHADOW-01", "close-test")
    assert run.admitted
    return controller, run.lifecycle_run_id, writer


def test_r4_02_terminal_survives_restart_and_allows_new_admission(tmp_path):
    ledger = tmp_path / "restart.jsonl"
    first, run_id, writer = _controller_for(ledger, tmp_path)
    try:
        from test_controller import make_fixture
        make_fixture(tmp_path / "evidence", {
            "requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "close-test",
            "lifecycle_run_id": run_id,
        })
        first.evaluate(run_id, phase="POST_TASK")
    finally:
        first.close()
    fresh_writer = LedgerWriter(ledger, lock_factory=lambda: None)
    second = ShadowController(fresh_writer, KillSwitch(tmp_path / "AUTOMATION_ENABLED"),
        ClosureVerifier(writer=fresh_writer, evidence_root=tmp_path / "evidence", safety_state_provider=Safety()))
    assert second.start()
    try:
        assert next(e for e in fresh_writer.scan() if e.get("lifecycle_run_id") == run_id and e["event_type"] == "LIFECYCLE_RUN_TERMINATED")
        assert second.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "after-restart").admitted
    finally:
        second.close()


def test_r4_03_duplicate_durable_termination_denies_without_changing_bytes(tmp_path):
    from test_controller import make_fixture
    ledger = tmp_path / "duplicate.jsonl"
    controller, run_id, writer = _controller_for(ledger, tmp_path)
    try:
        make_fixture(tmp_path / "evidence", {"requesting_workflow": "A4-SHADOW-01",
            "workflow_run_identity": "close-test", "lifecycle_run_id": run_id})
        controller.evaluate(run_id, phase="POST_TASK")
        before = ledger.read_bytes()
        result = controller.close_normal(run_id)
        assert result == "TERMINATION_ALREADY_RECORDED"
        assert ledger.read_bytes() == before
        assert sum(e.get("lifecycle_run_id") == run_id and e["event_type"] == "LIFECYCLE_RUN_TERMINATED" for e in writer.scan()) == 1
    finally:
        controller.close()


def test_r4_05_terminal_flush_failure_poisons_authority_session(tmp_path):
    from test_controller import make_fixture
    def fail_terminal_append(stage):
        if stage == "append:LIFECYCLE_RUN_TERMINATED":
            raise OSError("injected terminal flush boundary failure")
    ledger = tmp_path / "append-failure.jsonl"
    controller, run_id, writer = _controller_for(ledger, tmp_path, order_hook=fail_terminal_append)
    try:
        make_fixture(tmp_path / "evidence", {"requesting_workflow": "A4-SHADOW-01",
            "workflow_run_identity": "close-test", "lifecycle_run_id": run_id})
        result = controller.evaluate(run_id, phase="POST_TASK")
        assert result.policy_decision == "FAIL_CLOSED"
        assert result.decision_outcome == "FAIL_CLOSED"
        with pytest.raises(LedgerAuthorityUnavailable, match="poison"):
            writer.scan()
        assert not controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "after-poison").admitted
    finally:
        controller.close()


@pytest.mark.parametrize("predicate", [
    "binding", "ledger_healthy", "post_task_outcome", "no_open_decision",
    "no_unresolved_intent", "no_recovery_status", "checks_complete",
])
def test_r4_04_authoritative_normal_close_denies_each_false_predicate(tmp_path, predicate):
    from test_v3_r1_corrections import PROTECTED
    from lifecycle_controller.terminal import TerminalManager
    from lifecycle_controller.ledger import LedgerWriter
    from test_v3_r1_corrections import bound, write_events

    path = tmp_path / f"{predicate}.jsonl"
    # A complete POST_TASK record is the baseline; mutate one source predicate.
    run_id = "gate-run"
    records = [bound(0, run_id)]
    decision = f"decision-{predicate}"
    records.extend([
        {"schema_version": 2, "event_type": "KILL_SWITCH_CHECK", "event_seq": 1,
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "kill_switch_phase": "ENTRY", "automation_enabled": True},
        {"schema_version": 2, "event_type": "DECISION_EVALUATED", "event_seq": 2,
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "observed_state": "Running",
         "workflow_readiness": "UNKNOWN", "policy_decision": "PRESERVE_RUNNING", "actuation_supported": False,
         "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0, "evidence": []},
        {"schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": 3,
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "actuation_decision": "NO_MUTATION",
         "provider_mutation_count": 0, "mutation_action": None, "mutation_sent": False,
         "mutation_attribution": "NOT_APPLICABLE", "decision_outcome": "PRESERVE_RUNNING"},
    ])
    recovery_active = False
    if predicate == "binding":
        records = [bound(0, "different-run")]
    elif predicate == "ledger_healthy":
        write_events(path, records)
        path.write_bytes(b"not-json\n")
        writer = LedgerWriter(path, lock_factory=lambda: None)
        before = path.read_bytes()
        from lifecycle_controller.ledger import LedgerAuthorityUnavailable
        with pytest.raises(LedgerAuthorityUnavailable):
            TerminalManager.close_normal(writer, run_id, recovery_status_active=False)
        assert path.read_bytes() == before
        return
    elif predicate == "post_task_outcome":
        records = [records[0]]
    elif predicate == "no_open_decision":
        records.append({"schema_version": 2, "event_type": "KILL_SWITCH_CHECK", "event_seq": 4,
            "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
            "decision_id": "open", "decision_phase": "PRE_TASK", "kill_switch_phase": "ENTRY", "automation_enabled": True})
    elif predicate == "no_unresolved_intent":
        records.extend([
            {"schema_version": 2, "event_type": "MUTATION_INTENT", "event_seq": 4,
             "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
             "decision_id": "intent", "decision_phase": "PRE_TASK", "mutation_action": "StartInstance"},
            {"schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": 5,
             "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run_id, "instance_id": PROTECTED,
             "decision_id": "intent", "decision_phase": "PRE_TASK", "actuation_decision": "NO_MUTATION",
             "provider_mutation_count": 0, "mutation_action": None, "mutation_sent": False,
             "mutation_attribution": "UNKNOWN", "decision_outcome": "FAIL_CLOSED"},
        ])
    elif predicate == "no_recovery_status":
        recovery_active = True
    elif predicate == "checks_complete":
        records = [records[0], records[3]]  # a durable outcome alone is insufficient check completion
        records[1]["event_seq"] = 1
    write_events(path, records)
    writer = LedgerWriter(path, lock_factory=lambda: None)
    before = path.read_bytes()
    status = TerminalManager.close_normal(writer, run_id, recovery_status_active=recovery_active)
    assert status in {"CLOSURE_DENIED", "FAIL_CLOSED"}
    assert path.read_bytes() == before
    assert all(e.get("event_type") != "LIFECYCLE_RUN_TERMINATED" for e in writer.scan())


def test_r4_07_no_agent_human_resolution_api_is_added():
    parameters = inspect.signature(TerminalManager.close_normal).parameters
    assert "reason" not in parameters
    assert "resolved_recovery_status" not in parameters
    assert not hasattr(TerminalManager, "resolve_human")
