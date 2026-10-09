from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from .admission import AdmissionService
from .closure import ClosureVerifier
from .kill_switch import KillSwitch
from .ledger import LedgerAuthorityUnavailable, LedgerWriter
from .models import AdmissionResult, DecisionResult
from .policy import PolicyEvaluator


class ShadowController:
    """Tier-A orchestration; it records decisions and never actuates a provider."""

    def __init__(self, writer: LedgerWriter, kill_switch: KillSwitch, verifier: ClosureVerifier):
        self.writer = writer
        self.kill_switch = kill_switch
        self.verifier = verifier
        self.admission = AdmissionService(writer)
        self.policy = PolicyEvaluator()

    def admit_and_work(self, instance_id: str, workflow: str, identity: str, work) -> AdmissionResult:
        result = self.admission.admit(instance_id, workflow, identity, work_hook=work)
        if result.admitted and result.binding:
            self.verifier.bindings[result.binding.lifecycle_run_id] = result.binding.__dict__
        return result

    def evaluate(self, lifecycle_run_id: str, *, observed_state: str, phase: str) -> DecisionResult:
        decision_id = str(uuid4())
        timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        try:
            events = self.writer.scan()
            binding = self.verifier.bindings.get(lifecycle_run_id)
            if binding is None:
                return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
            instance_id = binding["instance_id"]
            self.writer.append({
                "schema_version": 2, "event_type": "KILL_SWITCH_CHECK", "event_seq": len(events),
                "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                "decision_id": decision_id, "decision_phase": phase, "kill_switch_phase": "ENTRY",
                "automation_enabled": self.kill_switch.enabled(),
            })
            events = self.writer.scan()
            if not self.kill_switch.enabled():
                outcome = {
                    "schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": len(events),
                    "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                    "decision_id": decision_id, "decision_phase": phase,
                    "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0,
                    "mutation_action": None, "mutation_sent": False,
                    "mutation_attribution": "NOT_APPLICABLE", "decision_outcome": "DISABLED_BY_KILL_SWITCH",
                }
                self.writer.append(outcome)
                return DecisionResult(None, "DISABLED_BY_KILL_SWITCH", decision_phase=phase)
            verdict = self.verifier.verify_bound(lifecycle_run_id)
            verdict.setdefault("workflow_readiness", "READY")
            result = self.policy.evaluate(observed_state, verdict, automation_enabled=True, phase=phase)
            events = self.writer.scan()
            evaluation = {
                "schema_version": 2, "event_type": "DECISION_EVALUATED", "event_seq": len(events),
                "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                "decision_id": decision_id, "decision_phase": phase, "observed_state": observed_state,
                "workflow_readiness": verdict.get("workflow_readiness", "UNKNOWN"),
                "policy_decision": result.policy_decision, "actuation_supported": False,
                "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0,
                "evidence": verdict.get("evidence", []),
            }
            self.writer.append(evaluation)
            events = self.writer.scan()
            self.writer.append({
                "schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": len(events),
                "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                "decision_id": decision_id, "decision_phase": phase,
                "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0,
                "mutation_action": None, "mutation_sent": False,
                "mutation_attribution": "NOT_APPLICABLE", "decision_outcome": result.decision_outcome,
            })
            return result
        except LedgerAuthorityUnavailable:
            return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)

