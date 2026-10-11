from __future__ import annotations

import json
from pathlib import Path

import pytest

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
import lifecycle_controller.ledger as ledger_module
from lifecycle_controller.ledger import LedgerAuthorityUnavailable, LedgerWriter
from lifecycle_controller.policy import PolicyEvaluator
from test_v3_r1_corrections import (
    PROTECTED, Observer, Safety, bound, terminal_history, write_events, write_fixture,
)


class NoopLock:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FailingLock:
    def __enter__(self):
        raise PermissionError("exclusive lock denied")

    def __exit__(self, *_):
        return False


def test_r2_01_lock_acquisition_failure_is_writer_exclusion_failure(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_bytes(b"{}\n")
    writer = LedgerWriter(path, lock_factory=FailingLock)
    with pytest.raises(LedgerAuthorityUnavailable, match="^LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE$"):
        writer.scan()


def test_r2_01_missing_canonical_ledger_is_binding_authority_unavailable(tmp_path):
    path = tmp_path / "missing.jsonl"
    writer = LedgerWriter(path, lock_factory=NoopLock)
    with pytest.raises(LedgerAuthorityUnavailable, match="BINDING_AUTHORITY_UNAVAILABLE"):
        writer.scan()
    assert not path.exists(), "OPEN EXISTING must never bootstrap the ledger"


def test_r2_01_empty_canonical_ledger_is_binding_authority_unavailable(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_bytes(b"")
    writer = LedgerWriter(path, lock_factory=NoopLock)
    with pytest.raises(LedgerAuthorityUnavailable, match="BINDING_AUTHORITY_UNAVAILABLE"):
        writer.scan()
    assert path.read_bytes() == b""


class CountingSwitch:
    def __init__(self):
        self.calls = 0

    def enabled(self):
        self.calls += 1
        return True


class CountingVerifier:
    def __init__(self, delegate):
        self.delegate = delegate
        self.calls = 0

    def verify_bound(self, run_id):
        self.calls += 1
        return self.delegate.verify_bound(run_id)


class CountingPolicy:
    def __init__(self):
        self.delegate = PolicyEvaluator()
        self.calls = 0

    def evaluate(self, *args, **kwargs):
        self.calls += 1
        return self.delegate.evaluate(*args, **kwargs)


def _recovery_controller(path: Path, run_id: str, events: list[dict]):
    write_events(path, events)
    writer = LedgerWriter(path, lock_factory=NoopLock)
    verifier = CountingVerifier(ClosureVerifier(
        writer=writer, evidence_root=path.parent / "evidence", safety_state_provider=Safety(),
    ))
    observer = Observer("Running")
    switch = CountingSwitch()
    controller = ShadowController(writer, switch, verifier, endpoint_observer=observer)
    controller.policy = CountingPolicy()
    assert controller.start()
    return controller, verifier, observer, switch


def _assert_recovery_refusal(path: Path, run_id: str, expected_status: str, events: list[dict]):
    controller, verifier, observer, switch = _recovery_controller(path, run_id, events)
    try:
        assert controller._recovery_states[run_id] == expected_status
        before = path.read_bytes()
        for phase in ("PRE_TASK", "POST_TASK"):
            result = controller.evaluate(run_id, phase=phase)
            assert result.policy_decision == "FAIL_CLOSED"
            assert result.decision_outcome == "ESCALATED_TO_HUMAN"
            assert path.read_bytes() == before
        assert verifier.calls == 0
        assert observer.calls == []
        assert controller.policy.calls == 0
        assert switch.calls == 0
        assert controller._recovery_states[run_id] == expected_status
    finally:
        controller.close()


def test_r2_02_recovery_required_active_cannot_automatically_continue(tmp_path):
    run_id = "recovery-active"
    _assert_recovery_refusal(
        tmp_path / "active.jsonl", run_id, "RECOVERY_REQUIRED_ACTIVE", [bound(0, run_id)],
    )


def test_r2_02_unresolved_intent_cannot_automatically_continue(tmp_path):
    run_id = "unresolved-intent"
    intent = {
        "schema_version": 2, "event_type": "MUTATION_INTENT", "event_seq": 1,
        "timestamp": "2026-10-10T00:00:01Z", "lifecycle_run_id": run_id,
        "instance_id": PROTECTED, "decision_id": "old-decision", "decision_phase": "POST_TASK",
        "mutation_action": "StopInstance", "mutation_sent": False,
    }
    _assert_recovery_refusal(
        tmp_path / "unresolved.jsonl", run_id, "UNRESOLVED_INTENT", [bound(0, run_id), intent],
    )


def test_r2_02_fresh_current_session_run_keeps_normal_pre_and_post_evaluation(tmp_path):
    path = tmp_path / "fresh.jsonl"
    terminal_history(path)
    writer = LedgerWriter(path, lock_factory=NoopLock)
    switch = CountingSwitch()
    observer = Observer("Stopped")
    verifier = CountingVerifier(ClosureVerifier(
        writer=writer, evidence_root=tmp_path / "evidence", safety_state_provider=Safety(),
    ))
    controller = ShadowController(writer, switch, verifier, endpoint_observer=observer)
    controller.policy = CountingPolicy()
    assert controller.start()
    try:
        admitted = controller.admit(PROTECTED, "A4-SHADOW-01", "fresh-session-run")
        assert admitted.admitted and admitted.lifecycle_run_id in controller._current_run_ids
        write_fixture(tmp_path / "evidence", {
            "requesting_workflow": "A4-SHADOW-01",
            "workflow_run_identity": "fresh-session-run",
            "lifecycle_run_id": admitted.lifecycle_run_id,
        })
        pre = controller.evaluate(admitted.lifecycle_run_id, phase="PRE_TASK")
        assert pre.policy_decision == "WOULD_START"
        observer.state = "Running"
        post = controller.evaluate(admitted.lifecycle_run_id, phase="POST_TASK")
        assert post.policy_decision == "WOULD_STOP"
        assert verifier.calls == 1
        assert observer.calls
        assert controller.policy.calls == 2
        assert switch.calls == 2
    finally:
        controller.close()


def test_r2_01_unopenable_canonical_ledger_is_binding_authority_unavailable(tmp_path, monkeypatch):
    path = tmp_path / "unreadable.jsonl"
    path.write_bytes(b"{}\n")
    writer = LedgerWriter(path, lock_factory=NoopLock)

    def denied_open(*_args, **_kwargs):
        raise PermissionError("canonical object denied")

    monkeypatch.setattr(ledger_module.os, "open", denied_open)
    with pytest.raises(LedgerAuthorityUnavailable, match="BINDING_AUTHORITY_UNAVAILABLE"):
        writer.scan()