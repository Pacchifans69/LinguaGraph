from __future__ import annotations

from .models import DecisionResult


class PolicyEvaluator:
    def evaluate(self, observed_state: str, verdict: dict, *, automation_enabled: bool, phase: str) -> DecisionResult:
        if not automation_enabled:
            return DecisionResult(None, "DISABLED_BY_KILL_SWITCH", decision_phase=phase)
        readiness = verdict.get("workflow_readiness", "READY")
        safe_success = verdict.get("safe_success") == "YES"
        if observed_state == "Running":
            if safe_success and readiness == "READY":
                return DecisionResult("WOULD_STOP", "NO_MUTATION_SHADOW", decision_phase=phase)
            return DecisionResult("PRESERVE_RUNNING", "PRESERVE_RUNNING", decision_phase=phase)
        if observed_state == "Stopped":
            if readiness == "READY":
                return DecisionResult("WOULD_START", "NO_FURTHER_MUTATION", decision_phase=phase)
            return DecisionResult("NO_ACTION_REQUIRED", "NO_FURTHER_MUTATION", decision_phase=phase)
        return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)

