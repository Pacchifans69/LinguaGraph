from __future__ import annotations

import inspect

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerWriter, validate_ledger
from lifecycle_controller.provisioning import (
    ControllerIdentity,
    ControllerProvisioningAuthority,
    FirstBindingRequest,
    LedgerProvisioner,
)
from conftest import DisposableProvisioner

PROTECTED_INSTANCE_ID = "i-j6c9854oyawy89fcdxy2"


class TraceLock:
    def __init__(self, trace: list[str]):
        self.trace = trace

    def __enter__(self):
        self.trace.append("enter")
        return self

    def __exit__(self, exc_type, exc, tb):
        self.trace.append("exit")
        return False


class Observer:
    def describe_instances(self, instance_id, region):
        return [{
            "InstanceId": instance_id,
            "RegionId": region,
            "ZoneId": "cn-hongkong-d",
            "Status": "Stopped",
        }]

    def strict_ssh_hostkey_match(self, ip, fingerprint):
        return True

    def imdsv2_identity(self, ip):
        return {
            "instance_id": PROTECTED_INSTANCE_ID,
            "region": "cn-hongkong",
            "zone": "cn-hongkong-d",
        }


def request() -> FirstBindingRequest:
    return FirstBindingRequest(
        instance_id=PROTECTED_INSTANCE_ID,
        requesting_workflow="human-authorized-provisioning",
        workflow_run_identity="workflow-run-2026-10-12",
    )


def authority() -> ControllerIdentity:
    return ControllerIdentity("S-1-controller", PROTECTED_INSTANCE_ID)


def provisioner(path, trace):
    path.parent.mkdir(parents=True, exist_ok=True)
    return DisposableProvisioner(
        path,
        identity=authority(),
        lock_factory=lambda: TraceLock(trace),
        uuid_factory=lambda: "run-first",
        clock=lambda: "2026-10-12T00:00:00Z",
    )


def controller_for(writer, root):
    switch = root / "AUTOMATION_ENABLED"
    switch.write_text("true", encoding="utf-8")
    verifier = ClosureVerifier(
        writer=writer,
        evidence_root=root / "evidence",
        safety_state_provider=None,
    )
    return ShadowController(writer, KillSwitch(switch), verifier, endpoint_observer=Observer())


def test_A4_B1_18_same_session_first_binding_handoff_reaches_normal_pre_task(tmp_path):
    trace: list[str] = []
    path = tmp_path / "audit.jsonl"
    handoff = provisioner(path, trace).provision(request())

    assert trace == ["enter"]
    events = validate_ledger(path)
    assert len(events) == 1
    assert events[0]["event_type"] == "LIFECYCLE_RUN_BOUND"
    assert events[0]["event_seq"] == 0
    assert events[0]["instance_id"] == PROTECTED_INSTANCE_ID
    assert handoff.binding.lifecycle_run_id == events[0]["lifecycle_run_id"]
    assert handoff.binding.instance_id == PROTECTED_INSTANCE_ID
    assert not hasattr(provisioner(path, trace), "append")

    controller = controller_for(handoff.writer, tmp_path)
    assert controller.start()
    controller.adopt_provisioned(handoff)
    assert handoff.binding.lifecycle_run_id in controller._current_run_ids
    assert handoff.binding.lifecycle_run_id not in controller._recovery_states
    assert trace == ["enter"]

    result = controller.evaluate(handoff.binding.lifecycle_run_id, phase="PRE_TASK")
    assert result.policy_decision == "WOULD_START"
    assert result.decision_outcome == "NO_FURTHER_MUTATION"
    assert trace == ["enter"]
    assert sum(
        event["event_type"] == "LIFECYCLE_RUN_BOUND"
        for event in validate_ledger(path)
    ) == 1
    controller.close()
    assert trace == ["enter", "exit"]

    fresh_writer = LedgerWriter(path, lock_factory=lambda: None)
    fresh = controller_for(fresh_writer, tmp_path)
    assert fresh.start()
    assert handoff.binding.lifecycle_run_id in fresh._recovery_states
    assert handoff.binding.lifecycle_run_id not in fresh._current_run_ids
    restarted = fresh.evaluate(handoff.binding.lifecycle_run_id, phase="PRE_TASK")
    assert restarted.policy_decision == "FAIL_CLOSED"
    assert restarted.decision_outcome == "ESCALATED_TO_HUMAN"
    fresh.close()


def test_A4_B1_19_provisioner_has_no_caller_authority_or_identity_inputs():
    init_parameters = inspect.signature(LedgerProvisioner.__init__).parameters
    provision_parameters = inspect.signature(LedgerProvisioner.provision).parameters
    assert set(init_parameters) == {"self", "path"}
    assert set(provision_parameters) == {"self", "request"}


def test_A4_B1_19b_constructible_identity_data_is_not_accepted_as_authority():
    inert_data = ControllerProvisioningAuthority(
        ControllerIdentity("S-1-forged", "i-forged")
    )
    with pytest.raises(TypeError):
        LedgerProvisioner("C:/ProgramData/LinguaGraph/Runtime/audit.jsonl", authority=inert_data)


def test_A4_B1_20_handoff_is_one_use_and_exact_writer_bound(tmp_path):
    trace: list[str] = []
    path = tmp_path / "audit.jsonl"
    handoff = provisioner(path, trace).provision(request())
    controller = controller_for(handoff.writer, tmp_path)
    assert controller.start()
    controller.adopt_provisioned(handoff)
    try:
        try:
            controller.adopt_provisioned(handoff)
        except Exception as exc:
            assert "one-use" in str(exc)
        else:
            raise AssertionError("reusing a provisioning handoff must fail")
    finally:
        controller.close()


def test_A4_B1_21_residue_is_not_repaired_after_create_write_failure(tmp_path):
    calls = 0

    def partial(fd, data):
        nonlocal calls
        calls += 1
        if calls == 1:
            import os
            return os.write(fd, data[:3])
        raise OSError("partial write")

    trace: list[str] = []
    path = tmp_path / "audit.jsonl"
    provisioner_instance = DisposableProvisioner(
        path,
        identity=authority(),
        lock_factory=lambda: TraceLock(trace),
        uuid_factory=lambda: "run-first",
        clock=lambda: "2026-10-12T00:00:00Z",
        write_func=partial,
    )
    try:
        provisioner_instance.provision(request())
    except Exception as exc:
        assert "FAIL_CLOSED" in str(exc)
    else:
        raise AssertionError("partial write must fail closed")
    residue = path.read_bytes()
    assert len(residue) == 3
    assert residue == residue[:3]
    try:
        provisioner_instance.provision(request())
    except Exception as exc:
        assert "poisoned" in str(exc)
    else:
        raise AssertionError("poisoned authority must not retry")
    assert path.read_bytes() == residue
