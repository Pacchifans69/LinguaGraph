from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable
from uuid import uuid4

from .ledger import LedgerAuthorityUnavailable, LedgerWriter
from .models import AdmissionResult, Binding
from .recovery import classify_run


class RunConflict(RuntimeError):
    pass


class AdmissionService:
    def __init__(self, writer: LedgerWriter):
        self.writer = writer

    def admit(
        self,
        instance_id: str,
        requesting_workflow: str,
        workflow_run_identity: str,
        *,
        work_hook: Callable[[], None] | None = None,
    ) -> AdmissionResult:
        try:
            events = self.writer.scan()
            runs = {event.get("lifecycle_run_id") for event in events if event.get("instance_id") == instance_id}
            for run_id in runs:
                state, _ = classify_run(events, run_id)
                if state in {"ACTIVE", "HOLDING_UNRESOLVED"}:
                    return AdmissionResult(False, "RUN_CONFLICT")
            lifecycle_run_id = str(uuid4())
            bound_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            binding = Binding(lifecycle_run_id, instance_id, requesting_workflow, workflow_run_identity, bound_at)
            event = {
                "schema_version": 2,
                "event_type": "LIFECYCLE_RUN_BOUND",
                "event_seq": len(events),
                "timestamp": bound_at,
                "lifecycle_run_id": lifecycle_run_id,
                "instance_id": instance_id,
                "requesting_workflow": requesting_workflow,
                "workflow_run_identity": workflow_run_identity,
            }
            self.writer.append(event)
            if work_hook:
                work_hook()
            return AdmissionResult(True, "PASS", lifecycle_run_id, binding)
        except LedgerAuthorityUnavailable:
            return AdmissionResult(False, "FAIL_CLOSED")

    def rebind(self, lifecycle_run_id: str, instance_id: str, workflow: str, identity: str) -> None:
        raise ValueError("binding is immutable; rebind is forbidden")

