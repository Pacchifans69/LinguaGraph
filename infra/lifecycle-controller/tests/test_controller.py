from __future__ import annotations

import json

from lifecycle_controller.closure import ClosureVerifier
from lifecycle_controller.controller import ShadowController
from lifecycle_controller.kill_switch import KillSwitch
from lifecycle_controller.ledger import LedgerWriter


class Adapter:
    def verify(self, binding):
        return {
            "durable_closure_complete": "YES",
            "bound_evidence": "YES",
            "indeterminate": "NO",
            "workflow_readiness": "READY",
            "evidence": [{"kind": "receipt", "locator": binding["workflow_run_identity"], "match": True, "bound": True}],
        }


def test_enabled_shadow_controller_reaches_would_stop_without_intent(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    switch = tmp_path / "AUTOMATION_ENABLED"
    switch.write_text("true", encoding="utf-8")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    admission = ShadowController(writer, KillSwitch(switch), ClosureVerifier(bindings={}, adapters={"fixture": Adapter()}))
    run = admission.admit_and_work("i-test", "fixture", "candidate-1", lambda: None)
    admission.verifier.bindings[run.binding.lifecycle_run_id] = run.binding.__dict__
    result = admission.evaluate(run.binding.lifecycle_run_id, observed_state="Running", phase="POST_TASK")
    assert result.policy_decision == "WOULD_STOP"
    events = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines()]
    assert [event["event_type"] for event in events] == [
        "LIFECYCLE_RUN_BOUND", "KILL_SWITCH_CHECK", "DECISION_EVALUATED", "DECISION_OUTCOME"
    ]
    assert not any(event["event_type"] == "MUTATION_INTENT" for event in events)
    assert all(event.get("provider_mutation_count", 0) == 0 for event in events if "provider_mutation_count" in event)


def test_entry_disabled_controller_emits_no_policy_decision(tmp_path):
    ledger = tmp_path / "audit.jsonl"
    switch = tmp_path / "AUTOMATION_ENABLED"
    switch.write_text("false", encoding="utf-8")
    writer = LedgerWriter(ledger, lock_factory=lambda: None)
    controller = ShadowController(writer, KillSwitch(switch), ClosureVerifier(bindings={}, adapters={}))
    run = controller.admit_and_work("i-test", "fixture", "candidate-1", lambda: None)
    controller.verifier.bindings[run.binding.lifecycle_run_id] = run.binding.__dict__
    result = controller.evaluate(run.binding.lifecycle_run_id, observed_state="Running", phase="PRE_TASK")
    assert result.policy_decision is None
    outcome = json.loads(ledger.read_text(encoding="utf-8").splitlines()[-1])
    assert outcome["decision_outcome"] == "DISABLED_BY_KILL_SWITCH"
    assert "policy_decision" not in outcome
