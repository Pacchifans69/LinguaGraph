from __future__ import annotations
from conftest import seed_terminal_history

import hashlib
import json

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerWriter


class Safety:
    def current_state(self, lifecycle_run_id):
        return {"forensic_hold": False, "volatile_evidence_hold": False}


class Observer:
    def __init__(self, state):
        self.state = state
        self.calls = []
    def describe_instances(self, instance_id, region):
        self.calls.append(("describe", instance_id, region))
        return [{
            "InstanceId": instance_id, "RegionId": region, "ZoneId": "cn-hongkong-d",
            "Status": self.state, "PublicIpAddress": "198.51.100.2",
        }]
    def strict_ssh_hostkey_match(self, ip, fingerprint):
        self.calls.append(("ssh", ip, fingerprint))
        return True
    def imdsv2_identity(self, ip):
        self.calls.append(("imds", ip))
        return {"instance_id": "i-j6c9854oyawy89fcdxy2", "region": "cn-hongkong", "zone": "cn-hongkong-d"}


def make_fixture(root, binding):
    parts = (binding["requesting_workflow"], binding["workflow_run_identity"], binding["lifecycle_run_id"])
    payload = b"".join(len(part.encode()).to_bytes(8, "big") + part.encode() for part in parts)
    directory = root / hashlib.sha256(payload).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    artifact = json.dumps({
        "schema": "linguagraph-a4-shadow-result-v1",
        "lifecycle_run_id": binding["lifecycle_run_id"],
        "workflow_run_identity": binding["workflow_run_identity"],
        "terminal_result": "SAFE_SUCCESS",
        "capability_finalization": "FINALIZED",
    }, sort_keys=True, separators=(",", ":")).encode()
    index = json.dumps({
        "schema": "linguagraph-a4-shadow-index-v1",
        "lifecycle_run_id": binding["lifecycle_run_id"],
        "workflow_run_identity": binding["workflow_run_identity"],
        "artifacts": [{"path": "result.json", "sha256": hashlib.sha256(artifact).hexdigest()}],
    }, sort_keys=True, separators=(",", ":")).encode()
    receipt = json.dumps({
        "schema": "linguagraph-a4-shadow-receipt-v1",
        "lifecycle_run_id": binding["lifecycle_run_id"],
        "workflow_run_identity": binding["workflow_run_identity"],
        "index_sha256": hashlib.sha256(index).hexdigest(),
    }, sort_keys=True, separators=(",", ":")).encode()
    (directory / "receipt.json").write_bytes(receipt)
    (directory / "index.json").write_bytes(index)
    (directory / "result.json").write_bytes(artifact)


@pytest.fixture
def controller_factory():
    controllers = []
    def build(writer, switch, verifier, *, endpoint_observer=None):
        controller = ShadowController(writer, switch, verifier, endpoint_observer=endpoint_observer)
        assert controller.start()
        controllers.append(controller)
        return controller
    yield build
    for controller in controllers:
        controller.close()


def test_post_task_uses_controller_owned_raw_evidence_and_produces_would_stop(tmp_path, controller_factory):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    fixtures = tmp_path / "evidence"
    verifier = ClosureVerifier(writer=writer, evidence_root=fixtures, safety_state_provider=Safety())
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    observer = Observer("Running")
    controller = controller_factory(writer, KillSwitch(switch_path), verifier, endpoint_observer=observer)
    run = controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "candidate-1")
    assert run.admitted
    make_fixture(fixtures, {
        "requesting_workflow": "A4-SHADOW-01",
        "workflow_run_identity": "candidate-1",
        "lifecycle_run_id": run.lifecycle_run_id,
    })

    result = controller.evaluate(run.lifecycle_run_id, phase="POST_TASK")
    assert result.policy_decision == "WOULD_STOP"
    assert result.actuation_decision == "NO_MUTATION"
    events = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines()]
    assert [event["event_type"] for event in events[-4:]] == [
        "LIFECYCLE_RUN_BOUND", "KILL_SWITCH_CHECK", "DECISION_EVALUATED", "DECISION_OUTCOME",
    ]
    assert not any(event["event_type"] == "MUTATION_INTENT" for event in events)
    assert all(event.get("provider_mutation_count", 0) == 0 for event in events)


def test_pre_task_would_start_has_no_completed_closure_dependency(tmp_path, controller_factory):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    verifier = ClosureVerifier(writer=writer, evidence_root=tmp_path / "missing", safety_state_provider=None)
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    controller = controller_factory(writer, KillSwitch(switch_path), verifier, endpoint_observer=Observer("Stopped"))
    run = controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "candidate-2")
    result = controller.evaluate(run.lifecycle_run_id, phase="PRE_TASK")
    assert result.policy_decision == "WOULD_START"
    assert result.actuation_decision == "NO_MUTATION"
    assert len(ledger.read_text(encoding="utf-8").splitlines()) == 6


def test_entry_kill_switch_is_observed_once_per_decision(tmp_path, controller_factory):
    class OneRead(Observer):
        def __init__(self, state):
            super().__init__(state)
            self.enabled_reads = 0
        def enabled(self):
            self.enabled_reads += 1
            return self.enabled_reads == 1
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    verifier = ClosureVerifier(writer=writer, evidence_root=tmp_path / "missing", safety_state_provider=None)
    observer = OneRead('Stopped')
    controller = controller_factory(writer, observer, verifier, endpoint_observer=observer)
    run = controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "candidate-3")
    result = controller.evaluate(run.lifecycle_run_id, phase="PRE_TASK")
    assert result.policy_decision == "WOULD_START"
    assert observer.enabled_reads == 1


def test_pre_task_running_follows_full_endpoint_readiness_path(tmp_path, controller_factory):
    ledger = tmp_path / "audit.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    verifier = ClosureVerifier(writer=writer, evidence_root=tmp_path / "missing", safety_state_provider=None)
    switch_path = tmp_path / "AUTOMATION_ENABLED"
    switch_path.write_text("true", encoding="utf-8")
    observer = Observer("Running")
    controller = controller_factory(writer, KillSwitch(switch_path), verifier, endpoint_observer=observer)
    run = controller.admit("i-j6c9854oyawy89fcdxy2", "A4-SHADOW-01", "candidate-4")
    result = controller.evaluate(run.lifecycle_run_id, phase="PRE_TASK")
    assert result.policy_decision == "NO_ACTION_REQUIRED"
    assert [call[0] for call in observer.calls] == ["describe", "describe", "ssh", "imds"]
    evaluated = json.loads(ledger.read_text(encoding="utf-8").splitlines()[-2])
    assert evaluated["workflow_readiness"] == "READY"
    assert evaluated["policy_decision"] != "WOULD_START"
