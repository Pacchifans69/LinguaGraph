from __future__ import annotations

from datetime import datetime, timezone

from .ledger import LedgerAuthorityUnavailable, LedgerWriter
from .recovery import unresolved_mutation_intent


class TerminalManager:
    @staticmethod
    def can_normal_close(
        *, binding: bool, ledger_healthy: bool, post_task_outcome: bool,
        no_open_decision: bool, no_unresolved_intent: bool,
        no_recovery_status: bool, checks_complete: bool,
    ) -> bool:
        return all((binding, ledger_healthy, post_task_outcome, no_open_decision,
                    no_unresolved_intent, no_recovery_status, checks_complete))

    @staticmethod
    def close_normal(writer: LedgerWriter, lifecycle_run_id: str, *, recovery_status_active: bool) -> str:
        """Append the sole normal terminal marker after deriving every gate from the owned ledger."""
        with writer.acquire():
            events = writer.scan()
            run_events = [event for event in events if event.get("lifecycle_run_id") == lifecycle_run_id]
            terminals = [event for event in run_events if event.get("event_type") == "LIFECYCLE_RUN_TERMINATED"]
            if terminals:
                return "TERMINATION_ALREADY_RECORDED"

            bindings = [event for event in run_events if event.get("event_type") == "LIFECYCLE_RUN_BOUND"]
            binding = len(bindings) == 1
            post_task_outcomes = {
                event.get("decision_id") for event in run_events
                if event.get("event_type") == "DECISION_OUTCOME" and event.get("decision_phase") == "POST_TASK"
            }
            post_task_outcome = bool(post_task_outcomes)
            outcomes = {
                event.get("decision_id") for event in run_events
                if event.get("event_type") == "DECISION_OUTCOME"
            }
            decisions = {
                event.get("decision_id") for event in run_events
                if event.get("event_type") in {
                    "KILL_SWITCH_CHECK", "DECISION_EVALUATED", "MUTATION_INTENT",
                    "MUTATION_RESPONSE", "RECONCILIATION", "DECISION_OUTCOME",
                }
            }
            no_open_decision = decisions <= outcomes
            no_unresolved_intent = not unresolved_mutation_intent(run_events, lifecycle_run_id)
            no_recovery_status = not recovery_status_active

            post_checks: dict[str, dict[str, list[dict]]] = {}
            for event in run_events:
                if event.get("decision_phase") != "POST_TASK":
                    continue
                decision_id = event.get("decision_id")
                if not decision_id:
                    continue
                check = post_checks.setdefault(decision_id, {})
                check.setdefault(event["event_type"], []).append(event)
            checks_complete = True
            for check in post_checks.values():
                kill_checks = check.get("KILL_SWITCH_CHECK", [])
                evaluations = check.get("DECISION_EVALUATED", [])
                outcomes = check.get("DECISION_OUTCOME", [])
                if len(kill_checks) != 1 or len(outcomes) != 1:
                    checks_complete = False
                    break
                kill_check = kill_checks[0]
                outcome = outcomes[0]
                if kill_check.get("kill_switch_phase") != "ENTRY":
                    checks_complete = False
                    break
                if kill_check.get("automation_enabled") is False:
                    if evaluations or outcome.get("decision_outcome") != "DISABLED_BY_KILL_SWITCH" or outcome.get("mutation_attribution") != "NOT_APPLICABLE":
                        checks_complete = False
                        break
                elif kill_check.get("automation_enabled") is True:
                    if len(evaluations) != 1:
                        checks_complete = False
                        break
                else:
                    checks_complete = False
                    break
            if not TerminalManager.can_normal_close(
                binding=binding,
                ledger_healthy=True,
                post_task_outcome=post_task_outcome,
                no_open_decision=no_open_decision,
                no_unresolved_intent=no_unresolved_intent,
                no_recovery_status=no_recovery_status,
                checks_complete=checks_complete,
            ):
                return "CLOSURE_DENIED"

            timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            writer.append({
                "schema_version": 2,
                "event_type": "LIFECYCLE_RUN_TERMINATED",
                "event_seq": len(events),
                "timestamp": timestamp,
                "lifecycle_run_id": lifecycle_run_id,
                "instance_id": bindings[0]["instance_id"],
                "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE",
            })
            durable_events = writer.scan()
            if sum(
                event.get("lifecycle_run_id") == lifecycle_run_id
                and event.get("event_type") == "LIFECYCLE_RUN_TERMINATED"
                for event in durable_events
            ) != 1:
                raise LedgerAuthorityUnavailable("normal terminal append did not establish unique durable closure")
            return "TERMINATED"
