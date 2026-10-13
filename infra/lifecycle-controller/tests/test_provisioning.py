from __future__ import annotations

import json
import os
from types import SimpleNamespace

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerAuthorityUnavailable, LedgerWriter, validate_ledger
from lifecycle_controller.provisioning import ControllerIdentity, FirstBindingRequest
from conftest import DisposableProvisioner


class NoopLock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def build(path, **kwargs):
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs.setdefault("lock_factory", lambda: NoopLock())
    kwargs.setdefault("uuid_factory", lambda: "run-first")
    kwargs.setdefault("clock", lambda: "2026-10-12T00:00:00Z")
    current_sid = kwargs.pop("current_sid", "S-1-controller")
    return DisposableProvisioner(
        path,
        identity=ControllerIdentity("S-1-controller", "i-protected"),
        current_sid=current_sid,
        **kwargs,
    )


def request():
    return FirstBindingRequest(
        instance_id="i-protected",
        requesting_workflow="human-authorized-provisioning",
        workflow_run_identity="workflow-run-2026-10-12",
    )


def test_A4_B1_01_normal_missing_ledger_fails_closed(tmp_path):
    path = tmp_path / "audit.jsonl"
    with pytest.raises(LedgerAuthorityUnavailable):
        LedgerWriter(path, lock_factory=lambda: None).scan()


def test_A4_B1_02_normal_empty_ledger_fails_closed(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"")
    with pytest.raises(LedgerAuthorityUnavailable):
        LedgerWriter(path, lock_factory=lambda: None).scan()


def test_A4_B1_03_ordinary_append_cannot_bootstrap_empty_ledger(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"")
    event = {
        "schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
        "timestamp": "2026-10-12T00:00:00Z", "lifecycle_run_id": "r",
        "instance_id": "i-protected", "requesting_workflow": "w",
        "workflow_run_identity": "identity",
    }
    with pytest.raises(LedgerAuthorityUnavailable):
        LedgerWriter(path, lock_factory=lambda: None).append(event)


def test_A4_B1_04_provisioning_creates_event_seq_zero_binding_only(tmp_path):
    path = tmp_path / "audit.jsonl"
    with build(path).provision(request()) as result:
        events = validate_ledger(path)
        assert result.event["event_type"] == "LIFECYCLE_RUN_BOUND"
        assert result.event["event_seq"] == 0
        assert events == [dict(result.event)]


def test_A4_B1_05_durable_flush_precedes_success(tmp_path):
    calls = []

    def write(fd, data):
        calls.append("write")
        return os.write(fd, data)

    def flush(fd):
        calls.append("flush")
        return os.fsync(fd)

    with build(tmp_path / "audit.jsonl", write_func=write, fsync_func=flush).provision(request()) as result:
        assert result.event["event_seq"] == 0
        assert calls[-1] == "flush"


def test_A4_B1_06_second_provisioning_attempt_is_denied(tmp_path):
    path = tmp_path / "audit.jsonl"
    with build(path).provision(request()):
        pass
    with pytest.raises(LedgerAuthorityUnavailable, match="already exists"):
        build(path).provision(request())


def test_A4_B1_07_existing_nonempty_ledger_is_denied(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_text("non-empty\n", encoding="utf-8")
    with pytest.raises(LedgerAuthorityUnavailable, match="already exists"):
        build(path).provision(request())


def test_A4_B1_08_partial_write_poison_requires_review(tmp_path):
    calls = 0

    def partial(fd, data):
        nonlocal calls
        calls += 1
        if calls == 1:
            return os.write(fd, data[:3])
        raise OSError("partial write")

    path = tmp_path / "audit.jsonl"
    provisioner = build(path, write_func=partial)
    with pytest.raises(LedgerAuthorityUnavailable, match="FAIL_CLOSED"):
        provisioner.provision(request())
    assert path.exists()
    with pytest.raises(LedgerAuthorityUnavailable, match="poisoned"):
        provisioner.provision(request())


def test_A4_B1_09_flush_failure_poison_requires_review(tmp_path):
    def fail_flush(_fd):
        raise OSError("flush failure")

    path = tmp_path / "audit.jsonl"
    provisioner = build(path, fsync_func=fail_flush)
    with pytest.raises(LedgerAuthorityUnavailable, match="FAIL_CLOSED"):
        provisioner.provision(request())
    with pytest.raises(LedgerAuthorityUnavailable, match="poisoned"):
        provisioner.provision(request())


def test_A4_B1_10_lock_failure_fails_closed(tmp_path):
    def fail_lock():
        raise PermissionError("lock denied")

    path = tmp_path / "audit.jsonl"
    provisioner = build(path, lock_factory=fail_lock)
    path.parent.mkdir(parents=True, exist_ok=True)
    with pytest.raises(LedgerAuthorityUnavailable, match="LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE"):
        provisioner.provision(request())


def test_A4_B1_11_controller_identity_is_required(tmp_path):
    path = tmp_path / "audit.jsonl"
    with pytest.raises(LedgerAuthorityUnavailable, match="does not match"):
        build(path, current_sid="S-1-agent").provision(request())
    assert not path.exists()


def test_A4_B1_12_protected_instance_id_is_required(tmp_path):
    path = tmp_path / "audit.jsonl"
    wrong = FirstBindingRequest("i-other", request().requesting_workflow, request().workflow_run_identity)
    with pytest.raises(LedgerAuthorityUnavailable, match="protected deployment instance"):
        build(path).provision(wrong)
    assert not path.exists()


def test_A4_B1_13_path_replacement_fails_closed(tmp_path):
    calls = 0

    def fake_stat(value, **_kwargs):
        nonlocal calls
        calls += 1
        if isinstance(value, int):
            return SimpleNamespace(st_dev=1, st_ino=1)
        return SimpleNamespace(st_dev=1, st_ino=1 if calls < 3 else 2)

    path = tmp_path / "audit.jsonl"
    with pytest.raises(LedgerAuthorityUnavailable, match="replaced"):
        build(path, stat_func=fake_stat).provision(request())


def test_A4_B1_14_acl_denial_fails_closed(tmp_path):
    def denied_open(*_args, **_kwargs):
        raise PermissionError("ACL denied")

    path = tmp_path / "audit.jsonl"
    with pytest.raises(LedgerAuthorityUnavailable, match="creation failed"):
        build(path, open_func=denied_open).provision(request())


def test_A4_B1_15_binding_uses_genuine_schema_and_no_forbidden_events(tmp_path):
    with build(tmp_path / "audit.jsonl").provision(request()) as result:
        assert set(result.event) == {
        "schema_version", "event_type", "event_seq", "timestamp",
        "lifecycle_run_id", "instance_id", "requesting_workflow",
        "workflow_run_identity",
        }
        assert result.event["event_type"] not in {
        "MUTATION_INTENT", "LIFECYCLE_RUN_TERMINATED", "HUMAN_RESOLVED",
        }


def test_A4_B1_16_restart_after_first_binding_enters_existing_recovery_path(tmp_path):
    path = tmp_path / "audit.jsonl"
    with build(path).provision(request()) as result:
        switch_path = tmp_path / "AUTOMATION_ENABLED"
        switch_path.write_text("true", encoding="utf-8")
        writer = LedgerWriter(path, lock_factory=lambda: None)
        controller = ShadowController(
            writer,
            kill_switch=KillSwitch(switch_path),
            verifier=ClosureVerifier(
                writer=writer,
                evidence_root=tmp_path / "evidence",
                safety_state_provider=None,
            ),
        )
        assert controller.start() is True
        assert result.event["lifecycle_run_id"] in controller._recovery_states
        controller.close()


def test_A4_B1_17_provisioning_has_no_general_event_append_api(tmp_path):
    provisioner = build(tmp_path / "audit.jsonl")
    assert not hasattr(provisioner, "append")
    assert not hasattr(provisioner, "initialize_event")
