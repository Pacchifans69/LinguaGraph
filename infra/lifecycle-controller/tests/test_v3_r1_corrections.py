from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "tools"))

import pytest

import lifecycle_controller.ledger as ledger_module
from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.endpoint_guard import EndpointGuard
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import (
    LedgerAuthorityUnavailable,
    LedgerWriter,
    _validate_event,
)
from lifecycle_controller.policy import PolicyEvaluator
from verify_static_boundary import analyze_source

PROTECTED = "i-j6c9854oyawy89fcdxy2"


def bound(seq=0, run="run-a", instance=PROTECTED):
    return {
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": seq,
        "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run,
        "instance_id": instance, "requesting_workflow": "A4-SHADOW-01",
        "workflow_run_identity": run,
    }


def terminated(seq, run="seed-run", instance=PROTECTED):
    return {
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_TERMINATED", "event_seq": seq,
        "timestamp": "2026-10-10T00:00:01Z", "lifecycle_run_id": run,
        "instance_id": instance, "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE",
    }


def write_events(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"".join(json.dumps(e, sort_keys=True, separators=(",", ":")).encode() + b"\n" for e in events))


def terminal_history(path: Path):
    write_events(path, [bound(0, "seed-run"), terminated(1)])


class ExclusiveLock:
    def __init__(self):
        self.held = False
        self.acquires = 0

    def __enter__(self):
        if self.held:
            raise PermissionError("already owned")
        self.held = True
        self.acquires += 1
        return self

    def __exit__(self, *_):
        self.held = False


class Switch:
    def enabled(self):
        return True


class Safety:
    def current_state(self, _run):
        return {"forensic_hold": False, "volatile_evidence_hold": False}


class Observer:
    def __init__(self, state="Running"):
        self.state = state
        self.calls = []

    def describe_instances(self, instance_id, region):
        self.calls.append(("describe", instance_id, region))
        return [{"InstanceId": PROTECTED, "RegionId": "cn-hongkong", "ZoneId": "cn-hongkong-d",
                 "Status": self.state, "PublicIpAddress": "198.51.100.2"}]

    def strict_ssh_hostkey_match(self, ip, fingerprint):
        self.calls.append(("ssh", ip, fingerprint))
        return True

    def imdsv2_identity(self, ip):
        self.calls.append(("imds", ip))
        return {"instance_id": PROTECTED, "region": "cn-hongkong", "zone": "cn-hongkong-d"}


def write_fixture(root: Path, binding: dict, terminal="SAFE_SUCCESS"):
    parts = (binding["requesting_workflow"], binding["workflow_run_identity"], binding["lifecycle_run_id"])
    payload = b"".join(len(v.encode()).to_bytes(8, "big") + v.encode() for v in parts)
    ns = root / hashlib.sha256(payload).hexdigest()
    ns.mkdir(parents=True, exist_ok=True)
    artifact = json.dumps({"schema":"linguagraph-a4-shadow-result-v1",
        "lifecycle_run_id":binding["lifecycle_run_id"],"workflow_run_identity":binding["workflow_run_identity"],
        "terminal_result":terminal,"capability_finalization":"FINALIZED"},sort_keys=True,separators=(",", ":")).encode()
    index = json.dumps({"schema":"linguagraph-a4-shadow-index-v1",
        "lifecycle_run_id":binding["lifecycle_run_id"],"workflow_run_identity":binding["workflow_run_identity"],
        "artifacts":[{"path":"result.json","sha256":hashlib.sha256(artifact).hexdigest()}]},sort_keys=True,separators=(",", ":")).encode()
    receipt = json.dumps({"schema":"linguagraph-a4-shadow-receipt-v1",
        "lifecycle_run_id":binding["lifecycle_run_id"],"workflow_run_identity":binding["workflow_run_identity"],
        "index_sha256":hashlib.sha256(index).hexdigest()},sort_keys=True,separators=(",", ":")).encode()
    (ns/"receipt.json").write_bytes(receipt); (ns/"index.json").write_bytes(index); (ns/"result.json").write_bytes(artifact)
    return ns


@pytest.mark.parametrize("source", [
    'def f(client, name):\n    getattr(client, name)()\n',
    'def f(client):\n    getattr(client, "Start" + "Instance")()\n',
    'def f(client):\n    client.__dict__["StartInstance"]()\n',
])
def test_r3_f01_exact_dynamic_target_escape_regressions(source):
    result = analyze_source(source)
    assert result.unresolved_relevant_edges > 0


STOP_FACTS = {
    "safe_success": "YES",
    "bound_evidence": "YES",
    "durable_closure_complete": "YES",
    "provider_mutation_ambiguous": "NO",
    "claimed_indeterminate": "NO",
    "forensic_hold": "NO",
    "volatile_evidence_hold": "NO",
    "human_review_required": "NO",
}


@pytest.mark.parametrize("field,bad", [
    ("safe_success", "NO"), ("bound_evidence", "NO"),
    ("durable_closure_complete", "NO"), ("provider_mutation_ambiguous", "YES"),
    ("claimed_indeterminate", "YES"), ("forensic_hold", "YES"),
    ("volatile_evidence_hold", "YES"), ("human_review_required", "YES"),
])
def test_r3_f02_every_post_task_stop_predicate_is_required(field, bad):
    facts = {**STOP_FACTS, field: bad}
    result = PolicyEvaluator().evaluate("Running", facts, automation_enabled=True, phase="POST_TASK")
    assert result.policy_decision == "PRESERVE_RUNNING"


def test_r3_f02_full_post_task_conjunction_reaches_would_stop_and_requires_entry_enabled():
    evaluator = PolicyEvaluator()
    assert evaluator.evaluate("Running", STOP_FACTS, automation_enabled=True, phase="POST_TASK").policy_decision == "WOULD_STOP"
    assert evaluator.evaluate("Running", STOP_FACTS, automation_enabled=False, phase="POST_TASK").policy_decision is None


def test_r3_f06_field_applicability_classification_does_not_invent_region_scope():
    assert "region" in ledger_module.UNSPECIFIED_HISTORICAL_COMPATIBILITY
    assert "automatic_mutation_supported" in ledger_module.GLOBAL_NOT_EVENT_FIELD
    assert ledger_module.EXPLICIT_FROZEN_APPLICABILITY["requesting_workflow"] == {"LIFECYCLE_RUN_BOUND"}
    event = {"schema_version":2,"event_type":"KILL_SWITCH_CHECK","event_seq":0,
        "timestamp":"2026-10-10T00:00:00Z","lifecycle_run_id":"r","instance_id":"i",
        "decision_id":"d","decision_phase":"POST_TASK","kill_switch_phase":"ENTRY",
        "automation_enabled":True,"region":"cn-hongkong"}
    _validate_event(event)


def test_r3_f06_pre_send_mutation_intent_cannot_claim_sent():
    intent={"schema_version":2,"event_type":"MUTATION_INTENT","event_seq":1,
        "timestamp":"2026-10-10T00:00:00Z","lifecycle_run_id":"r","instance_id":"i",
        "decision_id":"d","decision_phase":"PRE_TASK","mutation_action":"StartInstance","mutation_sent":True}
    with pytest.raises(LedgerAuthorityUnavailable): _validate_event(intent)


def test_r3_f06_historical_intent_still_rejects_shadow_actuation_fields():
    intent={"schema_version":2,"event_type":"MUTATION_INTENT","event_seq":1,
        "timestamp":"2026-10-10T00:00:00Z","lifecycle_run_id":"r","instance_id":"i",
        "decision_id":"d","decision_phase":"PRE_TASK","mutation_action":"StartInstance",
        "actuation_supported":False}
    with pytest.raises(LedgerAuthorityUnavailable): _validate_event(intent)


def test_r3_f05_scan_pins_object_and_never_parses_replacement_path(tmp_path, monkeypatch):
    path=tmp_path/"audit.jsonl"; write_events(path,[bound(0),terminated(1,"run-a")])
    replacement=tmp_path/"replacement.jsonl"; write_events(replacement,[bound(0,"other"),terminated(1,"other")])
    writer=LedgerWriter(path,lock_factory=lambda:None)
    original=ledger_module.validate_ledger_bytes
    parsed=[]
    def replace_then_parse(raw):
        parsed.append(raw)
        try:
            os.replace(replacement,path)
        except PermissionError:
            # Windows may deny replacing the open pinned object; swap the
            # controller's pathname deterministically after the continuity check.
            writer.path = replacement
        return original(raw)
    monkeypatch.setattr(ledger_module,"validate_ledger_bytes",replace_then_parse)
    with pytest.raises(LedgerAuthorityUnavailable): writer.scan()
    assert parsed == [b"".join(json.dumps(e,sort_keys=True,separators=(",", ":")).encode()+b"\n" for e in [bound(0),terminated(1,"run-a")])]


def test_r3_f05_append_path_replacement_does_not_write_replacement_object(tmp_path, monkeypatch):
    path=tmp_path/"audit.jsonl"; write_events(path,[bound(0),terminated(1,"seed-run")])
    replacement=tmp_path/"replacement.jsonl"; write_events(replacement,[bound(0,"other"),terminated(1,"other")])
    replacement_bytes=replacement.read_bytes(); writer=LedgerWriter(path,lock_factory=lambda:None)
    original_verify=writer._verify_path_identity; checks=0
    def swap_after_append_precheck():
        nonlocal checks
        original_verify(); checks += 1
        if checks == 5:  # open checks (2), scan checks (2), then pre-write check
            writer.path = replacement
    monkeypatch.setattr(writer,"_verify_path_identity",swap_after_append_precheck)
    with pytest.raises(LedgerAuthorityUnavailable): writer.append(bound(2,"new"))
    assert checks >= 5
    assert replacement.read_bytes() == replacement_bytes


def test_r3_f03_controller_lifetime_owns_writer_across_nested_operations(tmp_path):
    path=tmp_path/"audit.jsonl"; terminal_history(path); lock=ExclusiveLock()
    writer=LedgerWriter(path,lock_factory=lambda:lock)
    observer=Observer("Running"); evidence=tmp_path/"evidence"
    verifier=ClosureVerifier(writer=writer,evidence_root=evidence,safety_state_provider=Safety())
    controller=ShadowController(writer,Switch(),verifier,endpoint_observer=observer)
    assert controller.start() is True
    try:
        run=controller.admit(PROTECTED,"A4-SHADOW-01","candidate-1")
        assert run.admitted and lock.held and lock.acquires == 1
        write_fixture(evidence,{"requesting_workflow":"A4-SHADOW-01","workflow_run_identity":"candidate-1","lifecycle_run_id":run.lifecycle_run_id})
        assert controller.evaluate(run.lifecycle_run_id,phase="PRE_TASK").policy_decision == "NO_ACTION_REQUIRED"
        assert lock.held and lock.acquires == 1
        assert controller.evaluate(run.lifecycle_run_id,phase="POST_TASK").policy_decision == "WOULD_STOP"
        assert lock.held and lock.acquires == 1
        other=LedgerWriter(path,lock_factory=lambda:lock)
        with pytest.raises(LedgerAuthorityUnavailable):
            with other.acquire(): pass
    finally:
        controller.close()
    assert not lock.held


def test_r3_f04_flush_failure_poison_persists_across_controller_methods(tmp_path):
    path=tmp_path/"audit.jsonl"; terminal_history(path); lock=ExclusiveLock(); calls=[]
    def fsync(fd):
        calls.append(fd)
        if len(calls)==3: raise OSError("injected fsync failure")
        return os.fsync(fd)
    writer=LedgerWriter(path,lock_factory=lambda:lock,fsync_func=fsync)
    controller=ShadowController(writer,Switch(),ClosureVerifier(writer=writer,evidence_root=tmp_path/"ev",safety_state_provider=Safety()),endpoint_observer=Observer("Stopped"))
    assert controller.start()
    try:
        run=controller.admit(PROTECTED,"A4-SHADOW-01","candidate-2")
        assert run.admitted
        first=controller.evaluate(run.lifecycle_run_id,phase="PRE_TASK")
        assert first.policy_decision == "FAIL_CLOSED"
        snapshot=path.read_bytes(); assert lock.held
        assert controller.admit(PROTECTED,"A4-SHADOW-01","candidate-3").admitted is False
        second=controller.evaluate(run.lifecycle_run_id,phase="POST_TASK")
        assert second.policy_decision == "FAIL_CLOSED"
        assert path.read_bytes()==snapshot and len(calls)==3
    finally:
        controller.close()


def test_r3_f02_controller_derived_indeterminate_veto_prevents_would_stop(tmp_path):
    path=tmp_path/"audit.jsonl"
    terminal_history(path)
    evidence=tmp_path/"evidence"
    writer=LedgerWriter(path,lock_factory=lambda:None)
    controller=ShadowController(writer,Switch(),ClosureVerifier(writer=writer,evidence_root=evidence,safety_state_provider=Safety()),endpoint_observer=Observer("Running"))
    assert controller.start()
    try:
        admitted=controller.admit(PROTECTED,"A4-SHADOW-01","current-run")
        assert admitted.admitted
        binding=bound(2,admitted.lifecycle_run_id)
        binding["workflow_run_identity"]="current-run"
        write_fixture(evidence,binding,terminal="INDETERMINATE")
        result=controller.evaluate(admitted.lifecycle_run_id,phase="POST_TASK")
        assert result.policy_decision == "PRESERVE_RUNNING"
        assert result.decision_outcome == "PRESERVE_RUNNING"
    finally:
        controller.close()
