from __future__ import annotations

import inspect
import os

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerAuthorityUnavailable
from lifecycle_controller.provisioning import (
    ControllerIdentity,
    ControllerProvisioningAuthority,
    FirstBindingRequest,
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


class SwappingPathStat:
    """Tier-A path-identity fixture; it models a path replacement observation."""

    def __init__(self):
        self.armed = False

    def __call__(self, value, **kwargs):
        observed = os.stat(value, **kwargs) if not isinstance(value, int) else os.fstat(value)
        if not isinstance(value, int) and self.armed:
                return type(observed)(
                    (observed.st_mode, observed.st_ino + 1, observed.st_dev)
                    + tuple(observed)[3:]
                )
        return observed


def request() -> FirstBindingRequest:
    return FirstBindingRequest(
        instance_id=PROTECTED_INSTANCE_ID,
        requesting_workflow="human-authorized-provisioning",
        workflow_run_identity="workflow-run-2026-10-13",
    )


def test_A4_B1_22_production_authority_cannot_be_minted_from_caller_supplied_identity_check_functions():
    parameters = inspect.signature(ControllerProvisioningAuthority.from_controller_host).parameters
    assert not {"identity_loader", "identity_check", "expected_controller_sid", "protected_instance_id"} & set(parameters)
    with pytest.raises(TypeError):
        ControllerProvisioningAuthority.from_controller_host(
            identity_loader=lambda: ControllerIdentity("S-forged", "i-forged"),
            identity_check=lambda: None,
        )


def _test_authority() -> ControllerIdentity:
    return ControllerIdentity("S-1-controller", PROTECTED_INSTANCE_ID)


def _controller(writer, root):
    switch = root / "AUTOMATION_ENABLED"
    switch.write_text("true", encoding="utf-8")
    verifier = ClosureVerifier(
        writer=writer,
        evidence_root=root / "evidence",
        safety_state_provider=None,
    )
    return ShadowController(writer, KillSwitch(switch), verifier)


def test_A4_B1_23_byte_identical_replacement_between_provisioning_and_adoption_fails_closed(tmp_path):
    trace: list[str] = []
    swapping_stat = SwappingPathStat()
    path = tmp_path / "audit.jsonl"
    handoff = DisposableProvisioner(
        path,
        identity=_test_authority(),
        lock_factory=lambda: TraceLock(trace),
        uuid_factory=lambda: "run-first",
        clock=lambda: "2026-10-13T00:00:00Z",
        stat_func=swapping_stat,
    ).provision(request())
    replacement = path.with_suffix(".replacement")
    replacement.write_bytes(path.read_bytes())
    # The fixture changes the path identity observation after durable event-0
    # validation, matching a byte-identical replacement/path swap.
    controller = _controller(handoff.writer, tmp_path)
    assert controller.start() is True
    try:
        os.replace(replacement, path)
    except PermissionError:
        # Windows sharing rules correctly refuse replacement of the transferred
        # open object; the identity guard remains the second fail-closed line.
        pass
    swapping_stat.armed = True
    with pytest.raises(LedgerAuthorityUnavailable, match="canonical ledger"):
        controller.adopt_provisioned(handoff)
    controller.close()
    assert trace == ["enter", "exit"]


def test_A4_B1_24_transferred_descriptor_and_lock_close_exactly_once_on_success_and_failures(tmp_path):
    path_index = 0

    def provision_with(close_calls, trace, *, stat_func=os.stat):
        nonlocal path_index
        path_index += 1
        return DisposableProvisioner(
            tmp_path / f"audit-{path_index}.jsonl",
            identity=_test_authority(),
            lock_factory=lambda: TraceLock(trace),
            uuid_factory=lambda: "run-first",
            clock=lambda: "2026-10-13T00:00:00Z",
            close_func=lambda fd: (close_calls.append(fd), os.close(fd))[1],
            stat_func=stat_func,
        ).provision(request())

    success_closes: list[int] = []
    success_trace: list[str] = []
    success = provision_with(success_closes, success_trace)
    controller = _controller(success.writer, tmp_path)
    assert controller.start() is True
    controller.adopt_provisioned(success)
    controller.close()
    assert len(success_closes) == 1
    assert success_trace == ["enter", "exit"]

    abort_closes: list[int] = []
    abort_trace: list[str] = []
    aborted = provision_with(abort_closes, abort_trace)
    aborted.abort()
    aborted.abort()
    assert len(abort_closes) == 1
    assert abort_trace == ["enter", "exit"]

    start_fail_closes: list[int] = []
    start_fail_trace: list[str] = []
    failing_stat = SwappingPathStat()
    start_fail = provision_with(start_fail_closes, start_fail_trace, stat_func=failing_stat)
    failing_stat.armed = True
    failed_controller = _controller(start_fail.writer, tmp_path)
    assert failed_controller.start() is False
    failed_controller.close()
    assert len(start_fail_closes) == 1
    assert start_fail_trace == ["enter", "exit"]

    adoption_fail_closes: list[int] = []
    adoption_fail_trace: list[str] = []
    adoption_stat = SwappingPathStat()
    adoption_fail = provision_with(
        adoption_fail_closes,
        adoption_fail_trace,
        stat_func=adoption_stat,
    )
    adoption_controller = _controller(adoption_fail.writer, tmp_path)
    assert adoption_controller.start() is True
    adoption_stat.armed = True
    with pytest.raises(LedgerAuthorityUnavailable, match="canonical ledger"):
        adoption_controller.adopt_provisioned(adoption_fail)
    adoption_controller.close()
    assert len(adoption_fail_closes) == 1
    assert adoption_fail_trace == ["enter", "exit"]


def test_A4_B1_24b_descriptor_close_failure_still_releases_lock_and_retains_residue(tmp_path):
    close_calls: list[int] = []
    trace: list[str] = []

    def close_then_fail(fd):
        close_calls.append(fd)
        os.close(fd)
        raise OSError("injected close failure")

    def unavailable_path_stat(value, **kwargs):
        if isinstance(value, int):
            return os.fstat(value)
        raise OSError("injected path identity failure")

    provisioner = DisposableProvisioner(
        tmp_path / "audit-close-fail.jsonl",
        identity=_test_authority(),
        lock_factory=lambda: TraceLock(trace),
        close_func=close_then_fail,
        stat_func=unavailable_path_stat,
    )
    with pytest.raises(OSError, match="injected close failure"):
        provisioner.provision(request())

    residue = tmp_path / "audit-close-fail.jsonl"
    assert residue.exists()
    assert close_calls and len(close_calls) == 1
    assert trace == ["enter", "exit"]
    with pytest.raises(LedgerAuthorityUnavailable, match="poisoned"):
        provisioner.provision(request())
    assert trace == ["enter", "exit"]
    assert len(close_calls) == 1
