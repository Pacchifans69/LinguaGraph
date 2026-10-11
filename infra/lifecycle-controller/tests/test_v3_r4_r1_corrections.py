from __future__ import annotations

import pytest
from lifecycle_controller.ledger import LedgerWriter
from lifecycle_controller.terminal import TerminalManager
from test_controller import make_fixture
from test_v3_r1_corrections import PROTECTED, bound, write_events
from test_v3_r4_corrections import _controller_for


def _records(tmp_path, *, enabled, outcome, attribution="NOT_APPLICABLE", evaluated=False, kill_phase="ENTRY"):
    run = "r4-r1-run"
    decision = "r4-r1-decision"
    events = [
        bound(0, run),
        {"schema_version": 2, "event_type": "KILL_SWITCH_CHECK", "event_seq": 1,
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "kill_switch_phase": kill_phase,
         "automation_enabled": enabled},
    ]
    if evaluated:
        events.append({"schema_version": 2, "event_type": "DECISION_EVALUATED", "event_seq": len(events),
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "observed_state": "Running",
         "workflow_readiness": "UNKNOWN", "policy_decision": "PRESERVE_RUNNING",
         "actuation_supported": False, "actuation_decision": "NO_MUTATION",
         "provider_mutation_count": 0, "evidence": []})
    events.append({"schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": len(events),
         "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run, "instance_id": PROTECTED,
         "decision_id": decision, "decision_phase": "POST_TASK", "actuation_decision": "NO_MUTATION",
         "provider_mutation_count": 0, "mutation_action": None, "mutation_sent": False,
         "mutation_attribution": attribution, "decision_outcome": outcome})
    path = tmp_path / "ledger.jsonl"
    write_events(path, events)
    writer = LedgerWriter(path, lock_factory=lambda: None)
    assert writer.scan() == events
    before = path.read_bytes()
    status = TerminalManager.close_normal(writer, run, recovery_status_active=False)
    return path, writer, run, before, status


def _no_terminal(writer, run):
    assert not any(e.get("lifecycle_run_id") == run and e["event_type"] == "LIFECYCLE_RUN_TERMINATED" for e in writer.scan())


@pytest.mark.parametrize(("outcome", "attribution", "kill_phase"), [
    ("PRESERVE_RUNNING", "NOT_APPLICABLE", "ENTRY"),
    ("FAIL_CLOSED", "NOT_APPLICABLE", "ENTRY"),
    ("DISABLED_BY_KILL_SWITCH", "UNKNOWN", "ENTRY"),
    ("DISABLED_BY_KILL_SWITCH", "NOT_APPLICABLE", "PRE_SEND"),
])
def test_r4_r1_disabled_semantics_must_match_defined_outcome(tmp_path, outcome, attribution, kill_phase):
    path, writer, run, before, status = _records(
        tmp_path, enabled=False, outcome=outcome, attribution=attribution, kill_phase=kill_phase,
    )
    assert status == "CLOSURE_DENIED"
    assert path.read_bytes() == before
    _no_terminal(writer, run)


def test_r4_r1_03_exact_disabled_fail_closed_outcome_closes_once(tmp_path):
    path, writer, run, before, status = _records(tmp_path, enabled=False, outcome="DISABLED_BY_KILL_SWITCH")
    assert status == "TERMINATED"
    events = writer.scan()
    terminal = [e for e in events if e.get("lifecycle_run_id") == run and e["event_type"] == "LIFECYCLE_RUN_TERMINATED"]
    assert len(terminal) == 1
    assert terminal[0]["event_seq"] == len(events) - 1
    assert terminal[0]["run_terminal_reason"] == "NORMAL_CONTROLLER_CLOSURE"
    assert path.read_bytes() != before


def test_r4_r1_04_disabled_with_evaluation_is_contradictory(tmp_path):
    path, writer, run, before, status = _records(
        tmp_path, enabled=False, outcome="DISABLED_BY_KILL_SWITCH", evaluated=True,
    )
    assert status == "CLOSURE_DENIED"
    assert path.read_bytes() == before
    _no_terminal(writer, run)


def test_r4_r1_05_enabled_without_evaluation_denies(tmp_path):
    path, writer, run, before, status = _records(tmp_path, enabled=True, outcome="PRESERVE_RUNNING")
    assert status == "CLOSURE_DENIED"
    assert path.read_bytes() == before
    _no_terminal(writer, run)


def test_r4_r1_enabled_complete_check_closes(tmp_path):
    path, writer, run, before, status = _records(
        tmp_path, enabled=True, outcome="PRESERVE_RUNNING", evaluated=True,
    )
    assert status == "TERMINATED"
    assert sum(e.get("lifecycle_run_id") == run and e["event_type"] == "LIFECYCLE_RUN_TERMINATED" for e in writer.scan()) == 1
    assert path.read_bytes() != before


@pytest.mark.parametrize("entry_enabled", [True, False], ids=["enabled", "disabled"])
@pytest.mark.parametrize("closure_status", [
    "CLOSURE_DENIED", "TERMINATION_ALREADY_RECORDED", "FAIL_CLOSED", "UNEXPECTED_STATUS",
])
def test_r4_r1_automatic_nonterminated_closure_fails_closed(
    tmp_path, monkeypatch, entry_enabled, closure_status,
):
    ledger = tmp_path / f"auto-{entry_enabled}-{closure_status}.jsonl"
    controller, run, writer = _controller_for(ledger, tmp_path)
    if entry_enabled:
        make_fixture(tmp_path / "evidence", {
            "requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "close-test",
            "lifecycle_run_id": run,
        })
    else:
        (tmp_path / "AUTOMATION_ENABLED").write_text("false", encoding="utf-8")
    original_append = writer.append
    terminal_appends = []
    def append(event):
        if event.get("event_type") == "LIFECYCLE_RUN_TERMINATED":
            terminal_appends.append(event)
        return original_append(event)
    monkeypatch.setattr(writer, "append", append)
    def forced_close(_run):
        if closure_status == "TERMINATION_ALREADY_RECORDED":
            existing = writer.scan()
            if not any(e.get("lifecycle_run_id") == run and e["event_type"] == "LIFECYCLE_RUN_TERMINATED" for e in existing):
                writer.append({"schema_version": 2, "event_type": "LIFECYCLE_RUN_TERMINATED",
                    "event_seq": len(existing), "timestamp": "2026-10-10T00:00:02Z",
                    "lifecycle_run_id": run, "instance_id": PROTECTED,
                    "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE"})
        return closure_status
    monkeypatch.setattr(controller, "close_normal", forced_close)
    try:
        result = controller.evaluate(run, phase="POST_TASK")
        assert (result.policy_decision, result.decision_outcome) == ("FAIL_CLOSED", "FAIL_CLOSED")
        terminals = [e for e in writer.scan() if e.get("lifecycle_run_id") == run and e["event_type"] == "LIFECYCLE_RUN_TERMINATED"]
        expected = 1 if closure_status == "TERMINATION_ALREADY_RECORDED" else 0
        assert len(terminals) == len(terminal_appends) == expected
    finally:
        controller.close()
