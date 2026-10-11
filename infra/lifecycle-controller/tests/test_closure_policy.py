from __future__ import annotations

import pytest

from lifecycle_controller.closure import inspect_historical_fixture
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.policy import PolicyEvaluator


def test_historical_fixtures_are_always_non_authoritative():
    for fixture_id in ("RUN-02", "RUN-03"):
        result = inspect_historical_fixture(fixture_id)
        assert result["authority_eligible"] is False
        assert result["bound_evidence"] is False
        assert result["lifecycle_run_id"] is None


def test_phase_specific_policy_reachability():
    evaluator = PolicyEvaluator()
    pre_start = evaluator.evaluate("Stopped", {}, automation_enabled=True, phase="PRE_TASK")
    assert pre_start.policy_decision == "WOULD_START"
    assert pre_start.decision_outcome == "NO_FURTHER_MUTATION"
    assert pre_start.actuation_decision == "NO_MUTATION"

    ready = {
        "safe_success": "YES", "bound_evidence": "YES", "durable_closure_complete": "YES",
        "provider_mutation_ambiguous": "NO", "claimed_indeterminate": "NO",
        "forensic_hold": "NO", "volatile_evidence_hold": "NO", "human_review_required": "NO",
    }
    post_stop = evaluator.evaluate("Running", ready, automation_enabled=True, phase="POST_TASK")
    assert post_stop.policy_decision == "WOULD_STOP"
    assert post_stop.decision_outcome == "NO_MUTATION_SHADOW"
    assert post_stop.provider_mutation_count == 0

    preserve = evaluator.evaluate("Running", {}, automation_enabled=True, phase="POST_TASK")
    assert preserve.policy_decision == "PRESERVE_RUNNING"
    assert preserve.decision_outcome == "PRESERVE_RUNNING"


@pytest.mark.parametrize("contents", [None, "", "false", "TRUE", "true\n", "garbage"])
def test_kill_switch_variants_disable_without_policy(contents, tmp_path):
    path = tmp_path / "AUTOMATION_ENABLED"
    if contents is not None:
        path.write_text(contents, encoding="utf-8")
    assert KillSwitch(path).enabled() is False


def test_pre_send_guard_isolated_and_never_emits_intent(tmp_path):
    path = tmp_path / "AUTOMATION_ENABLED"
    path.write_text("true", encoding="utf-8")
    switch = KillSwitch(path)
    assert switch.pre_send_guard() is True
    path.write_text("false", encoding="utf-8")
    assert switch.pre_send_guard() is False
