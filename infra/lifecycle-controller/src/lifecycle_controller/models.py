from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Binding:
    lifecycle_run_id: str
    instance_id: str
    requesting_workflow: str
    workflow_run_identity: str
    bound_at: str


@dataclass(frozen=True)
class AdmissionResult:
    admitted: bool
    outcome: str
    lifecycle_run_id: str | None = None
    binding: Binding | None = None


@dataclass(frozen=True)
class EvidenceVerdict:
    authority_eligible: str
    bound_evidence: str
    durable_closure_complete: str
    evidence: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    indeterminate: str = "NO"
    reason: str = ""
    safe_success: str = "NO"


@dataclass(frozen=True)
class DecisionResult:
    policy_decision: str | None
    decision_outcome: str
    actuation_supported: bool = False
    actuation_decision: str = "NO_MUTATION"
    provider_mutation_count: int = 0
    mutation_sent: bool = False
    mutation_action: None = None
    decision_phase: str = "POST_TASK"


@dataclass(frozen=True)
class EndpointReadiness:
    workflow_readiness: str
    reason: str
    instance_id: str | None = None
    public_ip: str | None = None
    observed_state: str | None = None

