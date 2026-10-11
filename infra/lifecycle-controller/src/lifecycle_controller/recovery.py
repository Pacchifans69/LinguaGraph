from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


def unresolved_mutation_intent(events: Iterable[dict[str, Any]], lifecycle_run_id: str) -> bool:
    intents: set[str] = set()
    conclusive: set[str] = set()
    for event in events:
        if event.get("lifecycle_run_id") != lifecycle_run_id:
            continue
        decision_id = event.get("decision_id")
        if event.get("event_type") == "MUTATION_INTENT" and decision_id:
            intents.add(decision_id)
            if event.get("mutation_attribution") in {"KNOWN_NOT_SENT", "KNOWN_SENT"}:
                conclusive.add(decision_id)
        if event.get("mutation_attribution") in {"KNOWN_NOT_SENT", "KNOWN_SENT"} and decision_id:
            conclusive.add(decision_id)
    return bool(intents - conclusive)


def classify_run(events: Iterable[dict[str, Any]], lifecycle_run_id: str) -> tuple[str, str | None]:
    relevant = [event for event in events if event.get("lifecycle_run_id") == lifecycle_run_id]
    if any(event.get("event_type") == "LIFECYCLE_RUN_TERMINATED" for event in relevant):
        return "TERMINAL", None
    if unresolved_mutation_intent(relevant, lifecycle_run_id):
        return "HOLDING_UNRESOLVED", "UNRESOLVED_INTENT"
    if any(event.get("event_type") == "LIFECYCLE_RUN_BOUND" for event in relevant):
        return "ACTIVE", "RECOVERY_REQUIRED_ACTIVE"
    return "UNKNOWN", "BINDING_AUTHORITY_UNAVAILABLE"

