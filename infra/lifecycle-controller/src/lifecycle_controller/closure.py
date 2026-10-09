from __future__ import annotations

from typing import Any, Mapping

from .models import EvidenceVerdict


class EvidenceStore:
    """Small fixture-only store; production adapters remain read-only."""

    def __init__(self, records: Mapping[str, dict[str, Any]] | None = None):
        self.records = dict(records or {})


class ClosureVerifier:
    def __init__(self, *, bindings: Mapping[str, Mapping[str, Any]], adapters: Mapping[str, Any]):
        self.bindings = dict(bindings)
        self.adapters = dict(adapters)

    def verify_bound(self, lifecycle_run_id: str) -> dict[str, Any]:
        binding = self.bindings.get(lifecycle_run_id)
        if binding is None:
            return {
                "authority_eligible": "NO", "bound_evidence": "NO", "durable_closure_complete": "NO",
                "safe_success": "NO", "indeterminate": "YES", "evidence": [],
                "reason": "UNKNOWN_OR_UNBOUND_LIFECYCLE_RUN_ID",
            }
        workflow = binding.get("requesting_workflow")
        adapter = self.adapters.get(workflow)
        if adapter is None:
            return self._failed("MISSING_WORKFLOW_ADAPTER")
        try:
            raw = adapter.verify(dict(binding))
        except Exception as exc:  # adapters fail closed, including timeout representations
            return self._failed(f"ADAPTER_FAILURE:{type(exc).__name__}")
        result = dict(raw)
        closure = result.get("durable_closure_complete", "NO") == "YES"
        bound = result.get("bound_evidence", "NO") == "YES"
        if not closure or not bound or result.get("indeterminate") == "YES":
            result["safe_success"] = "NO"
        else:
            result["safe_success"] = "YES"
        result.setdefault("authority_eligible", "YES")
        result.setdefault("indeterminate", "NO")
        result.setdefault("evidence", [])
        return result

    @staticmethod
    def _failed(reason: str) -> dict[str, Any]:
        return {
            "authority_eligible": "YES", "bound_evidence": "NO", "durable_closure_complete": "NO",
            "safe_success": "NO", "indeterminate": "YES", "evidence": [], "reason": reason,
        }


def inspect_historical_fixture(fixture_id: str) -> dict[str, Any]:
    if fixture_id not in {"RUN-02", "RUN-03"}:
        return {
            "authority_eligible": False, "bound_evidence": False, "durable_closure_complete": "NO",
            "lifecycle_run_id": None, "provenance": "UNKNOWN", "evidence": [], "reason": "UNKNOWN_FIXTURE",
        }
    complete = fixture_id == "RUN-03"
    return {
        "authority_eligible": False,
        "bound_evidence": False,
        "durable_closure_complete": "YES" if complete else "NO",
        "lifecycle_run_id": None,
        "provenance": f"PROVEN_IN_M9_{fixture_id}",
        "evidence": [],
        "reason": "HISTORICAL_NON_AUTHORITATIVE",
    }

