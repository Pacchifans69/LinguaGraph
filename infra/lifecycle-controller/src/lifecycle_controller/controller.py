from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from .admission import AdmissionService
from .closure import ClosureVerifier
from .endpoint_guard import EndpointGuard, EndpointObservationPort
from .kill_switch import KillSwitch
from .ledger import LedgerAuthorityUnavailable, LedgerWriter
from .models import AdmissionResult, DecisionResult
from .policy import PolicyEvaluator
from .recovery import classify_run, unresolved_mutation_intent


class ShadowController:
    """Tier-A controller retaining canonical writer ownership for its lifetime."""

    def __init__(
        self,
        writer: LedgerWriter,
        kill_switch: KillSwitch,
        verifier: ClosureVerifier,
        *,
        endpoint_observer: EndpointObservationPort | None = None,
    ):
        self.writer = writer
        self.kill_switch = kill_switch
        self.verifier = verifier
        self.endpoint_observer = endpoint_observer
        self.admission = AdmissionService(writer)
        self.policy = PolicyEvaluator()
        self.endpoint_guard = EndpointGuard(writer)
        self._authority_session = None
        self._started = False
        self._current_run_ids: set[str] = set()
        self._recovery_states: dict[str, str] = {}

    def start(self) -> bool:
        """Acquire once, scan startup state, then retain ownership until close()."""
        if self._started:
            return True
        session = self.writer.acquire()
        entered = False
        try:
            session.__enter__()
            entered = True
            events = self.writer.scan()
            run_ids = {event.get("lifecycle_run_id") for event in events}
            self._recovery_states = {}
            for run_id in run_ids:
                state, recovery = classify_run(events, run_id)
                if state in {"ACTIVE", "HOLDING_UNRESOLVED"} and recovery is not None:
                    self._recovery_states[run_id] = recovery
            self._authority_session = session
            self._started = True
            return True
        except Exception:
            if entered:
                session.__exit__(None, None, None)
            self._authority_session = None
            self._started = False
            return False

    def close(self) -> None:
        session, self._authority_session = self._authority_session, None
        self._started = False
        if session is not None:
            session.__exit__(None, None, None)

    def __enter__(self):
        if not self.start():
            raise LedgerAuthorityUnavailable("controller authority session could not start")
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def admit(self, instance_id: str, workflow: str, identity: str) -> AdmissionResult:
        if not self._started:
            return AdmissionResult(False, "FAIL_CLOSED")
        result = self.admission.admit(instance_id, workflow, identity)
        if result.admitted and result.lifecycle_run_id:
            self._current_run_ids.add(result.lifecycle_run_id)
        return result

    def evaluate(self, lifecycle_run_id: str, *, phase: str) -> DecisionResult:
        if not self._started:
            return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
        decision_id = str(uuid4())
        timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        try:
            # This nested acquire reuses the controller-lifetime handle; it does
            # not release ownership between admission, verification and decisions.
            with self.writer.acquire():
                events = self.writer.scan()
                run_state, recovery_status = classify_run(events, lifecycle_run_id)
                if run_state == "TERMINAL":
                    return DecisionResult("FAIL_CLOSED", "TERMINAL_RUN_CLOSED", decision_phase=phase)
                binding_event = next(
                    (event for event in events
                     if event.get("event_type") == "LIFECYCLE_RUN_BOUND"
                     and event.get("lifecycle_run_id") == lifecycle_run_id),
                    None,
                )
                if binding_event is None or run_state == "UNKNOWN":
                    return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
                if lifecycle_run_id in self._recovery_states and lifecycle_run_id not in self._current_run_ids:
                    # Startup-inherited recovery remains Human-review-required.
                    return DecisionResult("FAIL_CLOSED", "ESCALATED_TO_HUMAN", decision_phase=phase)
                if run_state == "HOLDING_UNRESOLVED":
                    return DecisionResult("FAIL_CLOSED", "ESCALATED_TO_HUMAN", decision_phase=phase)
                if lifecycle_run_id not in self._current_run_ids:
                    return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)
                instance_id = binding_event["instance_id"]
                automation_enabled = self.kill_switch.enabled()
                self.writer.append({
                    "schema_version": 2, "event_type": "KILL_SWITCH_CHECK", "event_seq": len(events),
                    "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                    "decision_id": decision_id, "decision_phase": phase, "kill_switch_phase": "ENTRY",
                    "automation_enabled": automation_enabled,
                })
                events = self.writer.scan()
                if not automation_enabled:
                    result = DecisionResult(None, "DISABLED_BY_KILL_SWITCH", decision_phase=phase)
                    self._append_outcome(events, timestamp, lifecycle_run_id, instance_id, decision_id, phase, result)
                    return result

                observed = self._observe_state(binding_event)
                state = observed.get("Status", "unknown") if observed is not None else "unknown"
                verdict: dict = {}
                if phase == "PRE_TASK" and state == "Running":
                    if self.endpoint_observer is None:
                        verdict["workflow_readiness"] = "UNKNOWN"
                    else:
                        readiness = self.endpoint_guard.inspect(lifecycle_run_id, self.endpoint_observer)
                        verdict["workflow_readiness"] = readiness.workflow_readiness
                elif phase == "POST_TASK" and state == "Running":
                    verdict = self.verifier.verify_bound(lifecycle_run_id)
                    # These vetoes are derived from canonical controller state,
                    # never accepted from a receipt or adapter input.
                    events = self.writer.scan()
                    ambiguous = unresolved_mutation_intent(events, lifecycle_run_id)
                    verdict["provider_mutation_ambiguous"] = "YES" if ambiguous else "NO"
                    verdict["claimed_indeterminate"] = "YES" if verdict.get("indeterminate") != "NO" else "NO"
                    verdict["human_review_required"] = "YES" if lifecycle_run_id in self._recovery_states else "NO"
                result = self.policy.evaluate(state, verdict, automation_enabled=True, phase=phase)
                events = self.writer.scan()
                evaluation = {
                    "schema_version": 2, "event_type": "DECISION_EVALUATED", "event_seq": len(events),
                    "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
                    "decision_id": decision_id, "decision_phase": phase,
                    "observed_state": state if state in {"Running", "Stopped", "Starting", "Stopping"} else "unknown",
                    "workflow_readiness": verdict.get("workflow_readiness", "UNKNOWN"),
                    "policy_decision": result.policy_decision,
                    "actuation_supported": False,
                    "actuation_decision": "NO_MUTATION",
                    "provider_mutation_count": 0,
                    "evidence": verdict.get("evidence", []),
                }
                self.writer.append(evaluation)
                events = self.writer.scan()
                self._append_outcome(events, timestamp, lifecycle_run_id, instance_id, decision_id, phase, result)
                return result
        except LedgerAuthorityUnavailable:
            return DecisionResult("FAIL_CLOSED", "FAIL_CLOSED", decision_phase=phase)

    def _observe_state(self, binding_event: dict) -> dict | None:
        if self.endpoint_observer is None:
            return None
        if binding_event.get("instance_id") != self.endpoint_guard.EXPECTED_INSTANCE_ID:
            return None
        records = self.endpoint_observer.describe_instances(
            self.endpoint_guard.EXPECTED_INSTANCE_ID,
            self.endpoint_guard.EXPECTED_REGION,
        )
        if len(records) != 1:
            return None
        instance = records[0]
        if (
            instance.get("InstanceId") != self.endpoint_guard.EXPECTED_INSTANCE_ID
            or instance.get("RegionId") != self.endpoint_guard.EXPECTED_REGION
            or instance.get("ZoneId") != self.endpoint_guard.EXPECTED_ZONE
        ):
            return None
        if instance.get("Status") not in {"Running", "Stopped", "Starting", "Stopping"}:
            return None
        return instance

    def _append_outcome(self, events, timestamp, lifecycle_run_id, instance_id, decision_id, phase, result):
        self.writer.append({
            "schema_version": 2, "event_type": "DECISION_OUTCOME", "event_seq": len(events),
            "timestamp": timestamp, "lifecycle_run_id": lifecycle_run_id, "instance_id": instance_id,
            "decision_id": decision_id, "decision_phase": phase,
            "actuation_decision": "NO_MUTATION", "provider_mutation_count": 0,
            "mutation_action": None, "mutation_sent": False,
            "mutation_attribution": "NOT_APPLICABLE", "decision_outcome": result.decision_outcome,
        })
