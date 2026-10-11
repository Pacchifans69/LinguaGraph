"""LC-A4 Tier-A read-only shadow lifecycle controller."""

AUTOMATIC_MUTATION_SUPPORTED = False

from .models import Binding, DecisionResult, EndpointReadiness, EvidenceVerdict

__all__ = [
    "AUTOMATIC_MUTATION_SUPPORTED",
    "Binding",
    "DecisionResult",
    "EndpointReadiness",
    "EvidenceVerdict",
]
