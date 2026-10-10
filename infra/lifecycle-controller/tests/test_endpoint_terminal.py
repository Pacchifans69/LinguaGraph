from __future__ import annotations
from conftest import seed_terminal_history

from lifecycle_controller.endpoint_guard import EndpointGuard
from lifecycle_controller.ledger import LedgerWriter
from lifecycle_controller.terminal import TerminalManager


class Observer:
    def __init__(self, *, state="Running", region="cn-hongkong", zone="cn-hongkong-d",
                 instance="i-j6c9854oyawy89fcdxy2", ip="198.51.100.2", fingerprint="SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg"):
        self.state, self.region, self.zone, self.instance, self.ip, self.fingerprint = state, region, zone, instance, ip, fingerprint
    def describe_instances(self, instance_id, region):
        return [{"InstanceId": self.instance, "RegionId": self.region, "ZoneId": self.zone,
                 "Status": self.state, "PublicIpAddress": self.ip}]
    def strict_ssh_hostkey_match(self, ip, fingerprint):
        return self.fingerprint == fingerprint
    def imdsv2_identity(self, ip):
        return {"instance_id": self.instance, "region": self.region, "zone": self.zone}


def binding(instance="i-j6c9854oyawy89fcdxy2"):
    return {"schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
            "timestamp": "2026-10-10T00:00:00Z", "lifecycle_run_id": "r", "instance_id": instance,
            "requesting_workflow": "A4-SHADOW-01", "workflow_run_identity": "fixture"}


def make_guard(tmp_path, instance="i-j6c9854oyawy89fcdxy2"):
    path = tmp_path / "audit.jsonl"
    seed_terminal_history(path, instance="i-j6c9854oyawy89fcdxy2")
    writer = LedgerWriter(path, lock_factory=lambda: None)
    new_binding = binding(instance)
    new_binding["event_seq"] = 2
    writer.append(new_binding)
    return EndpointGuard(writer)


def test_endpoint_guard_owns_identity_and_exposes_only_after_all_guards(tmp_path):
    result = make_guard(tmp_path).inspect("r", Observer())
    assert result.workflow_readiness == "READY"
    assert result.instance_id == "i-j6c9854oyawy89fcdxy2"
    assert result.public_ip == "198.51.100.2"


def test_endpoint_guard_rejects_caller_selected_binding_identity(tmp_path):
    result = make_guard(tmp_path, "i-caller-selected").inspect("r", Observer())
    assert result.workflow_readiness == "NOT_READY"
    assert result.instance_id is None
    assert result.public_ip is None


def test_endpoint_guard_rejects_nonrunning_wrong_region_zone_and_pin(tmp_path):
    for index, observer in enumerate((
        Observer(state="Stopped"), Observer(region="wrong"), Observer(zone="wrong"),
        Observer(fingerprint="wrong"), Observer(ip=""),
    )):
        result = make_guard(tmp_path / str(index)).inspect("r", observer)
        assert result.workflow_readiness != "READY"
        assert result.instance_id is None
        assert result.public_ip is None
def test_normal_closure_requires_all_seven_predicates():
    predicates = dict(binding=True, ledger_healthy=True, post_task_outcome=True, no_open_decision=True,
                      no_unresolved_intent=True, no_recovery_status=True, checks_complete=True)
    assert TerminalManager.can_normal_close(**predicates) is True
    for key in predicates:
        assert TerminalManager.can_normal_close(**dict(predicates, **{key: False})) is False


def test_duplicate_termination_is_denied():
    assert TerminalManager.terminate("r", set()) == "TERMINATED"
    assert TerminalManager.terminate("r", {"r"}) == "TERMINATION_ALREADY_RECORDED"
