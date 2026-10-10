from __future__ import annotations

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.ledger import LedgerWriter
from test_v3_r1_corrections import (
    PROTECTED, Observer, Safety, bound, terminated, write_events, write_fixture,
)
from test_v3_r2_corrections import CountingPolicy, CountingSwitch, CountingVerifier, NoopLock


def _controller(path, evidence, observer):
    writer = LedgerWriter(path, lock_factory=NoopLock)
    switch = CountingSwitch()
    verifier = CountingVerifier(ClosureVerifier(
        writer=writer, evidence_root=evidence, safety_state_provider=Safety(),
    ))
    controller = ShadowController(writer, switch, verifier, endpoint_observer=observer)
    policy = CountingPolicy()
    controller.policy = policy
    assert controller.start()
    return controller, switch, verifier, policy


def _assert_terminal_refusal(result, phase):
    assert result.policy_decision == "FAIL_CLOSED"
    assert result.decision_outcome == "TERMINAL_RUN_CLOSED"
    assert result.decision_phase == phase
    assert result.provider_mutation_count == 0


def test_r3_01_historical_terminal_run_refuses_pre_and_post_without_continuation(tmp_path):
    path = tmp_path / "history.jsonl"
    run_id = "run-old"
    write_events(path, [bound(0, run_id), terminated(1, run_id)])
    observer = Observer("Stopped")
    controller, switch, verifier, policy = _controller(path, tmp_path / "evidence", observer)
    try:
        before = path.read_bytes()
        pre = controller.evaluate(run_id, phase="PRE_TASK")
        post = controller.evaluate(run_id, phase="POST_TASK")
        _assert_terminal_refusal(pre, "PRE_TASK")
        _assert_terminal_refusal(post, "POST_TASK")
        assert path.read_bytes() == before
        assert switch.calls == 0
        assert observer.calls == []
        assert verifier.calls == 0
        assert policy.calls == 0

        new_run = controller.admit(PROTECTED, "A4-SHADOW-01", "new-after-terminal")
        assert new_run.admitted
        assert new_run.lifecycle_run_id != run_id
    finally:
        controller.close()


def test_r3_01_current_session_run_becomes_ineligible_after_durable_terminal(tmp_path):
    path = tmp_path / "current.jsonl"
    write_events(path, [bound(0, "seed-run"), terminated(1, "seed-run")])
    observer = Observer("Stopped")
    controller, switch, verifier, policy = _controller(path, tmp_path / "evidence", observer)
    try:
        admitted = controller.admit(PROTECTED, "A4-SHADOW-01", "current-run")
        assert admitted.admitted
        run_id = admitted.lifecycle_run_id
        binding = bound(2, run_id)
        binding["workflow_run_identity"] = "current-run"
        write_fixture(tmp_path / "evidence", binding)

        pre = controller.evaluate(run_id, phase="PRE_TASK")
        assert pre.policy_decision == "WOULD_START"
        assert run_id in controller._current_run_ids
        assert switch.calls == 1
        assert policy.calls == 1

        terminal_event = terminated(len(controller.writer.scan()), run_id)
        controller.writer.append(terminal_event)
        assert run_id in controller._current_run_ids, "terminal authority must not depend on set cleanup"

        before = path.read_bytes()
        switch_before = switch.calls
        observer_before = len(observer.calls)
        verifier_before = verifier.calls
        policy_before = policy.calls
        pre_after = controller.evaluate(run_id, phase="PRE_TASK")
        post_after = controller.evaluate(run_id, phase="POST_TASK")
        _assert_terminal_refusal(pre_after, "PRE_TASK")
        _assert_terminal_refusal(post_after, "POST_TASK")
        assert path.read_bytes() == before
        assert switch.calls == switch_before
        assert len(observer.calls) == observer_before
        assert verifier.calls == verifier_before
        assert policy.calls == policy_before
    finally:
        controller.close()
