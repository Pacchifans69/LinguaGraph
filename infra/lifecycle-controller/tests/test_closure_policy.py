from __future__ import annotations

import inspect
import json
from dataclasses import dataclass

import pytest

from lifecycle_controller.closure import (
    ClosureVerifier,
    EvidenceStore,
    inspect_historical_fixture,
)
from lifecycle_controller.policy import PolicyEvaluator


@dataclass
class Adapter:
    result: dict
    calls: int = 0

    def verify(self, binding):
        self.calls += 1
        return self.result


def binding(run="run-b", identity="candidate-b"):
    return {"lifecycle_run_id": run, "instance_id": "i-test", "requesting_workflow": "fixture",
            "workflow_run_identity": identity, "bound_at": "2026-10-09T00:00:00Z"}


def test_verify_bound_exposes_only_lifecycle_run_id():
    assert list(inspect.signature(ClosureVerifier.verify_bound).parameters) == ["self", "lifecycle_run_id"]


def test_fresh_bound_evidence_reaches_safe_success_and_would_stop(ledger_path):
    verifier = ClosureVerifier(bindings={"run-b": binding()}, adapters={"fixture": Adapter({
        "durable_closure_complete": "YES", "bound_evidence": "YES", "indeterminate": "NO",
        "evidence": [{"kind": "receipt", "match": True, "bound": True}], "reason": "ok",
    })})
    verifier.bindings["run-b"]["ledger_path"] = str(ledger_path)
    result = verifier.verify_bound("run-b")
    assert result["safe_success"] == "YES"
    decision = PolicyEvaluator().evaluate("Running", result, automation_enabled=True, phase="POST_TASK")
    assert decision.policy_decision == "WOULD_STOP"
    assert decision.actuation_supported is False
    assert decision.actuation_decision == "NO_MUTATION"
    assert decision.provider_mutation_count == 0


def test_unknown_run_does_not_invoke_adapter():
    adapter = Adapter({"durable_closure_complete": "YES", "bound_evidence": "YES"})
    verifier = ClosureVerifier(bindings={}, adapters={"fixture": adapter})
    result = verifier.verify_bound("unknown")
    assert result["authority_eligible"] == "NO"
    assert adapter.calls == 0


@pytest.mark.parametrize("result", [
    {"durable_closure_complete": "NO", "bound_evidence": "NO", "reason": "missing receipt"},
    {"durable_closure_complete": "NO", "bound_evidence": "NO", "reason": "digest mismatch"},
])
def test_invalid_bound_evidence_cannot_yield_would_stop(result):
    verifier = ClosureVerifier(bindings={"run-b": binding()}, adapters={"fixture": Adapter(result)})
    verdict = verifier.verify_bound("run-b")
    decision = PolicyEvaluator().evaluate("Running", verdict, automation_enabled=True, phase="POST_TASK")
    assert decision.policy_decision == "PRESERVE_RUNNING"


def test_historical_fixtures_are_always_non_authoritative():
    for fixture_id in ("RUN-02", "RUN-03"):
        result = inspect_historical_fixture(fixture_id)
        assert result["authority_eligible"] is False
        assert result["bound_evidence"] is False
        assert result["lifecycle_run_id"] is None


@pytest.mark.parametrize("state,expected", [("Stopped", "WOULD_START"), ("Running", "WOULD_STOP")])
def test_policy_results_remain_reachable(state, expected):
    verdict = {"safe_success": "YES", "durable_closure_complete": "YES", "bound_evidence": "YES", "workflow_readiness": "READY"}
    if state == "Stopped":
        verdict["safe_success"] = "NO"
    assert PolicyEvaluator().evaluate(state, verdict, automation_enabled=True, phase="POST_TASK").policy_decision == expected


@pytest.mark.parametrize("contents", [None, "", "false", "TRUE", "true\n", "garbage"])
def test_kill_switch_variants_disable_without_policy(contents, tmp_path):
    from lifecycle_controller.kill_switch import KillSwitch
    path = tmp_path / "AUTOMATION_ENABLED"
    if contents is not None:
        path.write_text(contents, encoding="utf-8")
    assert KillSwitch(path).enabled() is False


def test_pre_send_guard_isolated_and_never_emits_intent(tmp_path):
    from lifecycle_controller.kill_switch import KillSwitch
    path = tmp_path / "AUTOMATION_ENABLED"
    path.write_text("true", encoding="utf-8")
    switch = KillSwitch(path)
    assert switch.pre_send_guard() is True
    path.write_text("false", encoding="utf-8")
    assert switch.pre_send_guard() is False
