from __future__ import annotations
from conftest import seed_terminal_history

import hashlib
import json
import urllib.parse

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.endpoint_guard import EndpointGuard
from lifecycle_controller.ledger import FIELD_ALLOWED_EVENTS, EVENT_TYPES, LedgerAuthorityUnavailable, LedgerWriter, _validate_event, validate_ledger
from lifecycle_controller.policy import PolicyEvaluator
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / 'tools'))
from verify_static_boundary import analyze_source


def bound(seq=0, *, run="run-a", instance="i-j6c9854oyawy89fcdxy2"):
    return {
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": seq,
        "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": run, "instance_id": instance,
        "requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "fixture-01",
    }


def intent(seq=1, **fields):
    return {
        "schema_version": 2, "event_type": "MUTATION_INTENT", "event_seq": seq,
        "timestamp": "2026-10-10T00:01:00Z", "lifecycle_run_id": "run-a", "instance_id": "i-test",
        "decision_id": "decision-a", "decision_phase": "PRE_TASK",
        "mutation_action": "StartInstance", "mutation_sent": False, **fields,
    }


def write_events(path, events):
    path.write_bytes(b"".join(json.dumps(e, sort_keys=True, separators=(",", ":")).encode() + b"\n" for e in events))


@pytest.mark.parametrize("field,value", [
    ("actuation_supported", False),
    ("actuation_decision", "NO_MUTATION"),
    ("provider_mutation_count", 0),
])
def test_historical_intent_rejects_shadow_only_actuation_fields(tmp_path, field, value):
    ledger = tmp_path / "audit.jsonl"
    write_events(ledger, [bound(), intent(**{field: value})])
    with pytest.raises(LedgerAuthorityUnavailable, match="inapplicable"):
        validate_ledger(ledger)


def test_valid_historical_intent_remains_parseable(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    write_events(ledger, [bound(), intent(mutation_budget_spent=True)])
    events = validate_ledger(ledger)
    assert [event["event_type"] for event in events] == ["LIFECYCLE_RUN_BOUND", "MUTATION_INTENT"]


def test_field_applicability_matrix_is_complete_and_explicit():
    from lifecycle_controller.ledger import FIELD_ALLOWED_EVENTS
    assert FIELD_ALLOWED_EVENTS["actuation_supported"] == {"DECISION_EVALUATED"}
    assert FIELD_ALLOWED_EVENTS["actuation_decision"] == {"DECISION_EVALUATED", "DECISION_OUTCOME"}
    assert FIELD_ALLOWED_EVENTS["provider_mutation_count"] == {"DECISION_EVALUATED", "DECISION_OUTCOME"}
    from lifecycle_controller.ledger import GLOBAL_NOT_EVENT_FIELD
    assert "automatic_mutation_supported" in GLOBAL_NOT_EVENT_FIELD


def event_for(event_type):
    event = {
        "schema_version": 2, "event_type": event_type, "event_seq": 0,
        "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": "r", "instance_id": "i",
    }
    decision_types = {"KILL_SWITCH_CHECK", "DECISION_EVALUATED", "MUTATION_INTENT", "MUTATION_RESPONSE", "RECONCILIATION", "DECISION_OUTCOME"}
    if event_type in decision_types:
        event.update({"decision_id": "d", "decision_phase": "POST_TASK"})
    if event_type == "LIFECYCLE_RUN_BOUND":
        event.update({"requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "id"})
    elif event_type == "DECISION_EVALUATED":
        event.update({"policy_decision": "FAIL_CLOSED", "workflow_readiness": "UNKNOWN", "actuation_supported": False,
                      "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0, "evidence": []})
    elif event_type == "DECISION_OUTCOME":
        event.update({"decision_outcome": "FAIL_CLOSED", "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0})
    elif event_type == "KILL_SWITCH_CHECK":
        event.update({"kill_switch_phase": "ENTRY", "automation_enabled": True})
    elif event_type == "MUTATION_INTENT":
        event.update({"mutation_action": "StopInstance"})
    elif event_type == "LIFECYCLE_RUN_TERMINATED":
        event["run_terminal_reason"] = "NORMAL_CONTROLLER_CLOSURE"
    return event


FIELD_VALUES = {
    "requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "id", "region": "cn-hongkong",
    "observed_state": "Running", "pre_public_ip": "198.51.100.2", "post_public_ip": "198.51.100.2",
    "stopped_mode": "economical", "workflow_readiness": "READY", "policy_decision": "NO_ACTION_REQUIRED",
    "actuation_supported": False, "actuation_decision": "NO_MUTATION", "automatic_mutation_supported": False,
    "mutation_action": "StopInstance", "mutation_sent": False, "provider_mutation_count": 0,
    "provider_request_id": None, "mutation_budget_spent": False, "response_class": "SUCCESS",
    "kill_switch_phase": "ENTRY", "automation_enabled": True, "power_finalization": "FINALIZED",
    "ssh_hostkey_match": True, "remote_instance_id_match": True, "evidence": [],
    "decision_outcome": "FAIL_CLOSED", "mutation_attribution": "NOT_APPLICABLE",
    "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE", "resolved_recovery_status": "RECOVERY_REQUIRED_ACTIVE",
}


@pytest.mark.parametrize("field,allowed", list(FIELD_ALLOWED_EVENTS.items()))
def test_every_optional_field_obeys_declared_event_applicability(field, allowed):
    for event_type in EVENT_TYPES:
        event = event_for(event_type)
        if field == "resolved_recovery_status" and event_type == "LIFECYCLE_RUN_TERMINATED":
            event["run_terminal_reason"] = "HUMAN_RESOLVED"
        event[field] = FIELD_VALUES[field]
        if event_type in allowed:
            _validate_event(event)
        else:
            with pytest.raises(LedgerAuthorityUnavailable, match="inapplicable"):
                _validate_event(event)

def test_scan_acquires_ownership_before_first_authoritative_read(ledger_path):
    events = []
    class Lock:
        def __enter__(self):
            events.append("lock")
        def __exit__(self, *args):
            events.append("unlock")
    writer = LedgerWriter(ledger_path, lock_factory=Lock)
    with pytest.raises(LedgerAuthorityUnavailable, match="BINDING_AUTHORITY_UNAVAILABLE"):
        writer.scan()
    assert events == ["lock", "unlock"]


@pytest.mark.parametrize("replacement", ["same_path", "path_swap", "divergent_valid"])
def test_owned_session_rejects_canonical_ledger_replacement(ledger_path, tmp_path, replacement):
    seed_terminal_history(ledger_path, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None)
    writer.append(bound(seq=2))
    with writer.acquire():
        assert writer.scan()[2]["lifecycle_run_id"] == "run-a"
        if replacement == "same_path":
            alternate = tmp_path / "alternate.jsonl"
            write_events(alternate, [bound(instance="other")])
            try:
                alternate.replace(ledger_path)
            except PermissionError:
                assert writer.scan()[2]["lifecycle_run_id"] == "run-a"
                return
        elif replacement == "path_swap":
            rotated = tmp_path / "rotated.jsonl"
            try:
                ledger_path.replace(rotated)
                write_events(ledger_path, [bound(instance="other")])
            except PermissionError:
                assert writer.scan()[2]["lifecycle_run_id"] == "run-a"
                return
        else:
            write_events(ledger_path, [bound(instance="other")])
        with pytest.raises(LedgerAuthorityUnavailable, match="canonical ledger (changed|content diverged)"):
            writer.scan()


def test_flush_failure_poison_is_sticky_for_current_owned_session(ledger_path):
    def fail_flush(_fd):
        raise OSError("disk failure")
    seed_terminal_history(ledger_path, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None, fsync_func=fail_flush)
    with writer.acquire():
        with pytest.raises(LedgerAuthorityUnavailable):
            writer.append(bound(seq=2))
        with pytest.raises(LedgerAuthorityUnavailable, match="poison"):
            writer.scan()


class SafetyState:
    def __init__(self, *, forensic_hold=False, volatile_evidence_hold=False):
        self.forensic_hold = forensic_hold
        self.volatile_evidence_hold = volatile_evidence_hold
    def current_state(self, _run):
        return {"forensic_hold": self.forensic_hold, "volatile_evidence_hold": self.volatile_evidence_hold}


def fixture_files(root, event):
    parts = (event["requesting_workflow"], event["workflow_run_identity"], event["lifecycle_run_id"])
    payload = b"".join(len(part.encode()).to_bytes(8, "big") + part.encode() for part in parts)
    namespace = root / hashlib.sha256(payload).hexdigest()
    namespace.mkdir(parents=True, exist_ok=True)
    artifact = json.dumps({
        "schema": "linguagraph-a4-shadow-result-v1",
        "lifecycle_run_id": event["lifecycle_run_id"],
        "workflow_run_identity": event["workflow_run_identity"],
        "terminal_result": "SAFE_SUCCESS",
        "capability_finalization": "FINALIZED",
    }, sort_keys=True, separators=(",", ":")).encode()
    index = json.dumps({
        "schema": "linguagraph-a4-shadow-index-v1",
        "lifecycle_run_id": event["lifecycle_run_id"],
        "workflow_run_identity": event["workflow_run_identity"],
        "artifacts": [{"path": "result.json", "sha256": hashlib.sha256(artifact).hexdigest()}],
    }, sort_keys=True, separators=(",", ":")).encode()
    receipt = json.dumps({
        "schema": "linguagraph-a4-shadow-receipt-v1",
        "lifecycle_run_id": event["lifecycle_run_id"],
        "workflow_run_identity": event["workflow_run_identity"],
        "index_sha256": hashlib.sha256(index).hexdigest(),
    }, sort_keys=True, separators=(",", ":")).encode()
    (namespace / "receipt.json").write_bytes(receipt)
    (namespace / "index.json").write_bytes(index)
    (namespace / "result.json").write_bytes(artifact)
    return namespace


def make_bound_verifier(tmp_path, *, safety_state=None):
    ledger_path = tmp_path / "canonical.jsonl"
    seed_terminal_history(ledger_path, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger_path, lock_factory=lambda: None)
    event = bound(seq=2)
    writer.append(event)
    fixture_root = tmp_path / "fixtures"
    namespace = fixture_files(fixture_root, event)
    verifier = ClosureVerifier(
        writer=writer,
        evidence_root=fixture_root,
        safety_state_provider=safety_state,
    )
    return verifier, namespace


def test_bound_verifier_uses_raw_fixture_chain_and_current_safety_authority(tmp_path):
    import inspect
    verifier, namespace = make_bound_verifier(tmp_path, safety_state=SafetyState())
    assert list(inspect.signature(ClosureVerifier.verify_bound).parameters) == ["self", "lifecycle_run_id"]
    result = verifier.verify_bound("run-a")
    assert result["safe_success"] == "YES"
    assert result["durable_closure_complete"] == "YES"
    assert result["capability_finalized"] == "YES"
    assert result["evidence"][0]["locator"].endswith("/receipt.json")
    assert str(namespace) not in result["evidence"][0]["locator"]


def test_receipt_snapshot_cannot_clear_current_holds(tmp_path):
    verifier, namespace = make_bound_verifier(tmp_path, safety_state=SafetyState(forensic_hold=True))
    result = verifier.verify_bound("run-a")
    assert result["safe_success"] == "NO"
    assert result["current_safety_clear"] == "NO"
    assert result["durable_closure_complete"] == "YES"
    assert result["bound_evidence"] == "YES"
    assert result["capability_finalized"] == "YES"



def test_receipt_snapshot_hold_fields_are_rejected_as_non_authority(tmp_path):
    verifier, namespace = make_bound_verifier(tmp_path, safety_state=SafetyState())
    receipt_path = namespace / "receipt.json"
    receipt = json.loads(receipt_path.read_bytes())
    receipt["forensic_hold"] = False
    receipt["volatile_evidence_hold"] = False
    receipt_path.write_text(json.dumps(receipt, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    result = verifier.verify_bound("run-a")
    assert result["safe_success"] == "NO"
    assert result["durable_closure_complete"] == "NO"


def test_missing_current_safety_authority_fails_closed(tmp_path):
    verifier, _ = make_bound_verifier(tmp_path)
    assert verifier.verify_bound("run-a")["safe_success"] == "NO"


def test_digest_or_binding_mismatch_fails_closed(tmp_path):
    verifier, namespace = make_bound_verifier(tmp_path, safety_state=SafetyState())
    (namespace / "result.json").write_bytes(b'{"terminal_result":"SAFE_SUCCESS"}')
    assert verifier.verify_bound("run-a")["safe_success"] == "NO"


class Observer:
    def __init__(self, *, state="Running", region="cn-hongkong", zone="cn-hongkong-d", instance="i-j6c9854oyawy89fcdxy2", ip="198.51.100.2", fingerprint="SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg"):
        self.state, self.region, self.zone, self.instance, self.ip, self.fingerprint = state, region, zone, instance, ip, fingerprint
        self.calls = []
    def describe_instances(self, instance_id, region):
        self.calls.append(("describe", instance_id, region))
        return [{"InstanceId": self.instance, "RegionId": self.region, "ZoneId": self.zone, "Status": self.state, "PublicIpAddress": self.ip}]
    def strict_ssh_hostkey_match(self, ip, fingerprint):
        self.calls.append(("ssh", ip, fingerprint))
        return self.fingerprint == fingerprint
    def imdsv2_identity(self, ip):
        self.calls.append(("imds", ip))
        return {"instance_id": self.instance, "region": self.region, "zone": self.zone}


def endpoint_guard(tmp_path, instance="i-j6c9854oyawy89fcdxy2"):
    ledger = tmp_path / "canonical.jsonl"
    seed_terminal_history(ledger, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    writer.append(bound(seq=2, instance=instance))
    return EndpointGuard(writer)


def test_endpoint_guard_owns_expected_identity_and_exposes_only_after_all_gates(tmp_path):
    guard = endpoint_guard(tmp_path)
    binding_event = bound()
    observer = Observer()
    ready = guard.inspect("run-a", observer)
    assert ready.workflow_readiness == "READY"
    assert ready.instance_id == "i-j6c9854oyawy89fcdxy2"
    assert [call[0] for call in observer.calls] == ["describe", "ssh", "imds"]


@pytest.mark.parametrize("observer", [
    Observer(instance="other"), Observer(region="cn-hongkong-old"), Observer(zone="wrong"),
    Observer(state="Stopped"), Observer(fingerprint="wrong"), Observer(ip=""),
])
def test_endpoint_guard_fails_closed_without_exposing_endpoint(observer, tmp_path):
    result = endpoint_guard(tmp_path).inspect("run-a", observer)
    assert result.workflow_readiness != "READY"
    assert result.instance_id is None
    assert result.public_ip is None


def test_caller_cannot_supply_expected_endpoint_identity():
    import inspect
    parameters = list(inspect.signature(EndpointGuard.inspect).parameters)
    assert parameters == ["self", "lifecycle_run_id", "observer"]

def test_pre_task_would_start_does_not_require_completed_closure():
    evaluator = PolicyEvaluator()
    result = evaluator.evaluate("Stopped", {}, automation_enabled=True, phase="PRE_TASK")
    assert result.policy_decision == "WOULD_START"
    assert result.actuation_decision == "NO_MUTATION"


@pytest.mark.parametrize("state,outcome", [
    ("Running", "NO_FURTHER_MUTATION"),
    ("Starting", "INDETERMINATE_START_TRANSITION"),
    ("Stopping", "INDETERMINATE_STOP_TRANSITION"),
    ("unknown", "FAIL_CLOSED"),
    ("", "FAIL_CLOSED"),
])
def test_pre_task_state_is_phase_specific(state, outcome):
    result = PolicyEvaluator().evaluate(state, {"workflow_readiness": "READY"}, automation_enabled=True, phase="PRE_TASK")
    assert result.decision_outcome == outcome
    assert result.policy_decision != "WOULD_START" or state == "Stopped"


@pytest.mark.parametrize("state", ["Stopped", "Starting", "Stopping", "unknown", ""])
def test_post_task_never_produces_would_start(state):
    result = PolicyEvaluator().evaluate(state, {}, automation_enabled=True, phase="POST_TASK")
    assert result.policy_decision != "WOULD_START"


@pytest.mark.parametrize("source", [
    "client.StartInstance()",
    "client.StopInstance()",
    "client.start_instance()",
    "from cloud import StartInstance as go\ngo()",
    "go = client.StartInstance\ngo()",
    "a = client.StartInstance\nb = a\nb()",
    "def start():\n    return client.StartInstance()",
    "from provider import *",
    "client.unknown_lifecycle_action()",
    "fn = getattr(client, 'StartInstance')\nfn()",
    "fn = client.__getattribute__('StartInstance')\nfn()",
    "table = {'go': client.StartInstance}\ntable['go']()",
    "items = [client.StartInstance]\nitems[0]()",
    "items = (client.StartInstance,)\nitems[0]()",
    "fn = client.StartInstance if enabled else safe\nfn()",
    "fn = lambda: client.StartInstance\nfn()()",
    "def get_action():\n    return client.StopInstance\nget_action()()",
])
def test_static_boundary_rejects_provider_callable_escape_patterns(source):
    result = analyze_source(source)
    assert result.unresolved_relevant_edges > 0 or result.provider_lifecycle_mutation_send_callsite_count > 0


def test_static_boundary_accepts_no_mutation_source():
    result = analyze_source("def read_state():\n    return 'Running'\n")
    assert result.start_instance_calls == 0
    assert result.stop_instance_calls == 0
    assert result.provider_lifecycle_mutation_send_callsite_count == 0
    assert result.unresolved_relevant_edges == 0
