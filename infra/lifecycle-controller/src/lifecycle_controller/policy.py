from __future__ import annotations

from .models import DecisionResult


class PolicyEvaluator:
    """Phase-specific shadow policy; POST_TASK consumes the full frozen conjunction."""

    STOP_REQUIRED_FACTS = {
        "safe_success": "YES",
        "bound_evidence": "YES",
        "durable_closure_complete": "YES",
        "provider_mutation_ambiguous": "NO",
        "claimed_indeterminate": "NO",
        "forensic_hold": "NO",
        "volatile_evidence_hold": "NO",
        "human_review_required": "NO",
    }

    def evaluate(
        self,
        observed_state: str,
        verdict: dict | None = None,
        *,
        automation_enabled: bool,
        phase: str,
    ) -> DecisionResult:
        if phase not in {"PRE_TASK", "POST_TASK"}:
            return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
        if not automation_enabled:
            return DecisionResult(None, "DISABLED_BY_KILL_SWITCH", decision_phase=phase)
        verdict = verdict or {}
        if phase == "PRE_TASK":
            if observed_state == "Stopped":
                return DecisionResult("WOULD_START", "NO_FURTHER_MUTATION", decision_phase=phase)
            if observed_state == "Running":
                if verdict.get("workflow_readiness") == "READY":
                    return DecisionResult("NO_ACTION_REQUIRED", "NO_FURTHER_MUTATION", decision_phase=phase)
                return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
            if observed_state == "Starting":
                return DecisionResult("FAIL_CLOSED", "INDETERMINATE_START_TRANSITION", decision_phase=phase)
            if observed_state == "Stopping":
                return DecisionResult("FAIL_CLOSED", "INDETERMINATE_STOP_TRANSITION", decision_phase=phase)
            return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
        if observed_state != "Running":
            return DecisionResult("NO_ACTION_REQUIRED", "NO_FURTHER_MUTATION", decision_phase=phase)
        eligible = all(verdict.get(field) == required for field, required in self.STOP_REQUIRED_FACTS.items())
        if eligible:
            return DecisionResult("WOULD_STOP", "NO_MUTATION_SHADOW", decision_phase=phase)
        return DecisionResult("PRESERVE_RUNNING", "PRESERVE_RUNNING", decision_phase=phase)
