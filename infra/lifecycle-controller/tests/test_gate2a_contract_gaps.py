from __future__ import annotations

import json
from pathlib import Path

import pytest

import lifecycle_controller.ledger as ledger_module
from conftest import seed_terminal_history
from lifecycle_controller.admission import AdmissionService
from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerAuthorityUnavailable, LedgerWriter
from lifecycle_controller.policy import PolicyEvaluator
from test_controller import make_fixture
from test_v3_r1_corrections import PROTECTED, bound, terminated, write_events


class _SafetyProbe:
    def __init__(self):
        self.calls = []

    def current_state(self, lifecycle_run_id):
        self.calls.append(lifecycle_run_id)
        return {"forensic_hold": False, "volatile_evidence_hold": False}


class _SwitchProbe:
    def __init__(self, delegate=None):
        self.delegate = delegate
        self.calls = 0

    def enabled(self):
        self.calls += 1
        return self.delegate.enabled() if self.delegate is not None else True


class _VerifierProbe:
    def __init__(self, delegate):
        self.delegate = delegate
        self.calls = 0

    def verify_bound(self, lifecycle_run_id):
        self.calls += 1
        return self.delegate.verify_bound(lifecycle_run_id)


class _ObserverProbe:
    def __init__(self, state="Running"):
        self.state = state
        self.calls = []

    def describe_instances(self, instance_id, region):
        self.calls.append((instance_id, region))
        return [{
            "InstanceId": PROTECTED,
            "RegionId": "cn-hongkong",
            "ZoneId": "cn-hongkong-d",
            "Status": self.state,
            "PublicIpAddress": "198.51.100.2",
        }]


class _PolicyProbe:
    def __init__(self):
        self.delegate = PolicyEvaluator()
        self.calls = 0

    def evaluate(self, *args, **kwargs):
        self.calls += 1
        return self.delegate.evaluate(*args, **kwargs)


def _controller(path, evidence_root, *, kill_switch=None, state="Running"):
    writer = LedgerWriter(path, lock_factory=lambda: None)
    safety = _SafetyProbe()
    verifier = _VerifierProbe(ClosureVerifier(
        writer=writer, evidence_root=evidence_root, safety_state_provider=safety,
    ))
    switch = _SwitchProbe(kill_switch)
    observer = _ObserverProbe(state)
    controller = ShadowController(writer, switch, verifier, endpoint_observer=observer)
    policy = _PolicyProbe()
    controller.policy = policy
    return controller, writer, verifier, safety, switch, observer, policy


def _fixture_namespace(root: Path, lifecycle_run_id: str) -> Path:
    for receipt_path in root.glob("*/receipt.json"):
        receipt = json.loads(receipt_path.read_bytes())
        if receipt.get("lifecycle_run_id") == lifecycle_run_id:
            return receipt_path.parent
    raise AssertionError(f"fixture for {lifecycle_run_id} was not created")


def test_append_os_write_failure_poisons_owned_authority_session(tmp_path, monkeypatch):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance=PROTECTED)
    before = ledger.read_bytes()
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    write_attempts = 0

    def fail_write(_fd, _data):
        nonlocal write_attempts
        write_attempts += 1
        raise OSError("injected os.write failure")

    with writer.acquire():
        monkeypatch.setattr(ledger_module.os, "write", fail_write)
        with pytest.raises(LedgerAuthorityUnavailable, match="authority session poison"):
            writer.append(bound(2, "write-failure-run"))
        assert ledger.read_bytes() == before
        with pytest.raises(LedgerAuthorityUnavailable, match="poison"):
            writer.scan()
        with pytest.raises(LedgerAuthorityUnavailable, match="poison"):
            writer.append(bound(2, "write-failure-run"))
        work = []
        admitted = AdmissionService(writer).admit(PROTECTED, "A4-SHADOW-01", "after-write-failure")
        if admitted.admitted:
            work.append("started")
        assert admitted.admitted is False
        assert admitted.outcome == "FAIL_CLOSED"
        assert admitted.lifecycle_run_id is None
        assert work == []
    assert write_attempts == 1
    assert ledger.read_bytes() == before


def test_unreadable_kill_switch_read_disables_controller_policy(tmp_path, monkeypatch):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance=PROTECTED)
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    original_read_text = Path.read_text
    read_attempts = 0

    def fail_switch_read(path, *args, **kwargs):
        nonlocal read_attempts
        if path == switch_path:
            read_attempts += 1
            raise PermissionError("injected unreadable kill switch")
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", fail_switch_read)
    controller, writer, verifier, _safety, switch, observer, policy = _controller(
        ledger, tmp_path / "evidence", kill_switch=KillSwitch(switch_path),
    )
    assert controller.start()
    try:
        admitted = controller.admit(PROTECTED, "A4-SHADOW-01", "unreadable-switch")
        assert admitted.admitted
        result = controller.evaluate(admitted.lifecycle_run_id, phase="POST_TASK")
        assert read_attempts == 1
        assert switch.calls == 1
        assert result.decision_outcome == "DISABLED_BY_KILL_SWITCH"
        assert result.policy_decision is None
        assert result.actuation_decision == "NO_MUTATION"
        assert result.provider_mutation_count == 0
        assert verifier.calls == 0
        assert observer.calls == []
        assert policy.calls == 0
        run_events = [
            event for event in writer.scan()
            if event.get("lifecycle_run_id") == admitted.lifecycle_run_id
        ]
        kill_check = next(event for event in run_events if event["event_type"] == "KILL_SWITCH_CHECK")
        outcome = next(event for event in run_events if event["event_type"] == "DECISION_OUTCOME")
        assert kill_check["automation_enabled"] is False
        assert outcome["decision_outcome"] == "DISABLED_BY_KILL_SWITCH"
        assert outcome["actuation_decision"] == "NO_MUTATION"
        assert outcome["provider_mutation_count"] == 0
        assert not any(event["event_type"] == "DECISION_EVALUATED" for event in run_events)
        assert not any(event["event_type"] == "MUTATION_INTENT" for event in run_events)
    finally:
        controller.close()


def test_truncated_final_json_line_without_newline_fails_closed(tmp_path):
    ledger = tmp_path / "truncated.jsonl"
    run_id = "truncated-run"
    write_events(ledger, [bound(0, run_id), terminated(1, run_id)])
    complete = ledger.read_bytes()
    assert complete.endswith(b"\n")
    truncated = complete[:-1]
    last_record = json.loads(truncated.splitlines()[-1])
    assert last_record["event_type"] == "LIFECYCLE_RUN_TERMINATED"
    ledger.write_bytes(truncated)

    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    with pytest.raises(LedgerAuthorityUnavailable, match="incomplete final line"):
        writer.scan()
    controller, *_ = _controller(ledger, tmp_path / "evidence")
    assert controller.start() is False
    assert ledger.read_bytes() == truncated


def test_run_b_evidence_replay_cannot_bind_or_stop_run_a(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    binding_b = bound(0, "run-b")
    write_events(ledger, [binding_b, terminated(1, "run-b")])
    evidence_root = tmp_path / "evidence"
    controller, writer, verifier, _safety, _switch, _observer, _policy = _controller(
        ledger, evidence_root,
    )
    assert controller.start()
    try:
        admitted_a = controller.admit(PROTECTED, "A4-SHADOW-01", "run-a-workflow")
        assert admitted_a.admitted
        binding_a = next(
            event for event in writer.scan()
            if event.get("lifecycle_run_id") == admitted_a.lifecycle_run_id
            and event["event_type"] == "LIFECYCLE_RUN_BOUND"
        )
        make_fixture(evidence_root, binding_b)
        make_fixture(evidence_root, binding_a)
        namespace_a = _fixture_namespace(evidence_root, admitted_a.lifecycle_run_id)
        namespace_b = _fixture_namespace(evidence_root, "run-b")
        for filename in ("receipt.json", "index.json", "result.json"):
            (namespace_a / filename).write_bytes((namespace_b / filename).read_bytes())

        valid_for_b = verifier.verify_bound("run-b")
        assert valid_for_b["bound_evidence"] == "YES"
        assert valid_for_b["safe_success"] == "YES"
        rejected_for_a = verifier.verify_bound(admitted_a.lifecycle_run_id)
        assert rejected_for_a["bound_evidence"] == "NO"
        assert rejected_for_a["safe_success"] == "NO"

        result_a = controller.evaluate(admitted_a.lifecycle_run_id, phase="POST_TASK")
        assert result_a.policy_decision != "WOULD_STOP"
        assert result_a.actuation_decision == "NO_MUTATION"
        assert result_a.provider_mutation_count == 0
        evaluated = next(
            event for event in writer.scan()
            if event.get("lifecycle_run_id") == admitted_a.lifecycle_run_id
            and event["event_type"] == "DECISION_EVALUATED"
        )
        assert evaluated["policy_decision"] != "WOULD_STOP"
        assert evaluated["actuation_decision"] == "NO_MUTATION"
        assert evaluated["provider_mutation_count"] == 0
        assert not any(
            event.get("lifecycle_run_id") == admitted_a.lifecycle_run_id
            and event["event_type"] == "MUTATION_INTENT"
            for event in writer.scan()
        )
    finally:
        controller.close()


def test_unknown_run_id_fails_closed_before_authority_continuation(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance=PROTECTED)
    controller, writer, verifier, safety, switch, observer, policy = _controller(
        ledger, tmp_path / "absent-evidence",
    )
    direct = verifier.verify_bound("unknown-run")
    assert direct["reason"] == "UNKNOWN_OR_UNBOUND_LIFECYCLE_RUN_ID"
    assert direct["bound_evidence"] == "NO"
    assert direct["safe_success"] == "NO"
    assert safety.calls == []

    assert controller.start()
    before = ledger.read_bytes()
    verifier.calls = 0
    try:
        result = controller.evaluate("unknown-run", phase="POST_TASK")
        assert result.decision_outcome == "FAIL_CLOSED"
        assert result.policy_decision == "FAIL_CLOSED"
        assert result.actuation_decision == "NO_MUTATION"
        assert result.provider_mutation_count == 0
        assert ledger.read_bytes() == before
        assert verifier.calls == 0
        assert switch.calls == 0
        assert observer.calls == []
        assert policy.calls == 0
    finally:
        controller.close()


def test_open_decision_at_crash_blocks_restart_continuation_and_closure(tmp_path):
    ledger = tmp_path / "open-decision.jsonl"
    run_id = "crashed-open-decision"
    open_decision = {
        "schema_version": 2,
        "event_type": "KILL_SWITCH_CHECK",
        "event_seq": 1,
        "timestamp": "2026-10-10T00:00:01Z",
        "lifecycle_run_id": run_id,
        "instance_id": PROTECTED,
        "decision_id": "open-decision",
        "decision_phase": "POST_TASK",
        "kill_switch_phase": "ENTRY",
        "automation_enabled": True,
    }
    write_events(ledger, [bound(0, run_id), open_decision])
    controller, writer, verifier, _safety, switch, observer, policy = _controller(
        ledger, tmp_path / "evidence",
    )
    assert controller.start()
    before = ledger.read_bytes()
    try:
        assert controller._recovery_states[run_id] == "RECOVERY_REQUIRED_ACTIVE"
        for phase in ("PRE_TASK", "POST_TASK"):
            result = controller.evaluate(run_id, phase=phase)
            assert result.decision_outcome == "ESCALATED_TO_HUMAN"
            assert result.policy_decision == "FAIL_CLOSED"
        assert controller.close_normal(run_id) == "CLOSURE_DENIED"
        assert ledger.read_bytes() == before
        assert verifier.calls == 0
        assert switch.calls == 0
        assert observer.calls == []
        assert policy.calls == 0
        assert not any(
            event.get("lifecycle_run_id") == run_id
            and event["event_type"] == "LIFECYCLE_RUN_TERMINATED"
            for event in writer.scan()
        )
    finally:
        controller.close()


def test_known_not_sent_intent_recovery_is_durable_and_blocks_continuation(tmp_path):
    ledger = tmp_path / "known-not-sent.jsonl"
    run_id = "known-not-sent-run"
    events = [
        bound(0, run_id),
        {
            "schema_version": 2,
            "event_type": "MUTATION_INTENT",
            "event_seq": 1,
            "timestamp": "2026-10-10T00:00:01Z",
            "lifecycle_run_id": run_id,
            "instance_id": PROTECTED,
            "decision_id": "prior-decision",
            "decision_phase": "POST_TASK",
            "mutation_action": "StopInstance",
            "mutation_sent": False,
        },
        {
            "schema_version": 2,
            "event_type": "DECISION_OUTCOME",
            "event_seq": 2,
            "timestamp": "2026-10-10T00:00:02Z",
            "lifecycle_run_id": run_id,
            "instance_id": PROTECTED,
            "decision_id": "prior-decision",
            "decision_phase": "POST_TASK",
            "decision_outcome": "FAIL_CLOSED",
            "actuation_decision": "NO_MUTATION",
            "provider_mutation_count": 0,
            "mutation_attribution": "KNOWN_NOT_SENT",
            "mutation_action": None,
            "mutation_sent": False,
        },
    ]
    write_events(ledger, events)
    controller, writer, verifier, _safety, switch, observer, policy = _controller(
        ledger, tmp_path / "evidence",
    )
    assert controller.start()
    before = ledger.read_bytes()
    try:
        assert controller._recovery_states[run_id] == "RECOVERY_REQUIRED_ACTIVE"
        denied_admission = controller.admit(PROTECTED, "A4-SHADOW-01", "after-known-not-sent")
        assert denied_admission.admitted is False
        assert denied_admission.outcome == "RUN_CONFLICT"
        result = controller.evaluate(run_id, phase="POST_TASK")
        assert result.decision_outcome == "ESCALATED_TO_HUMAN"
        assert result.policy_decision == "FAIL_CLOSED"
        assert result.actuation_decision == "NO_MUTATION"
        assert result.provider_mutation_count == 0
        assert ledger.read_bytes() == before
        assert verifier.calls == 0
        assert switch.calls == 0
        assert observer.calls == []
        assert policy.calls == 0
    finally:
        controller.close()
