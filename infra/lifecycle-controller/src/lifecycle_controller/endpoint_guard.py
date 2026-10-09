from __future__ import annotations

from typing import Any

from .models import EndpointReadiness


class EndpointGuard:
    def __init__(self, *, expected_host_fingerprint: str):
        self.expected_host_fingerprint = expected_host_fingerprint

    def check(
        self,
        *,
        expected_instance_id: str,
        describe_instances: list[dict[str, Any]],
        public_ip: str | None,
        observed_fingerprint: str | None,
        known_host_match: bool,
        imds_identity: dict[str, str] | None,
    ) -> EndpointReadiness:
        if len(describe_instances) != 1:
            return EndpointReadiness("NOT_READY", "INSTANCE_CARDINALITY")
        instance = describe_instances[0]
        if instance.get("InstanceId") != expected_instance_id:
            return EndpointReadiness("NOT_READY", "INSTANCE_ID_MISMATCH")
        if instance.get("Status") not in {"Running", "Stopped"}:
            return EndpointReadiness("NOT_READY", "AMBIGUOUS_INSTANCE_STATE")
        if not public_ip or instance.get("PublicIpAddress") != public_ip:
            return EndpointReadiness("NOT_READY", "PUBLIC_IP_NOT_FRESH")
        if observed_fingerprint != self.expected_host_fingerprint or not known_host_match:
            return EndpointReadiness("NOT_READY", "SSH_IDENTITY_MISMATCH")
        if not imds_identity or imds_identity.get("instance_id") != expected_instance_id:
            return EndpointReadiness("NOT_READY", "IMDS_IDENTITY_MISMATCH")
        return EndpointReadiness("READY", "ALL_READ_ONLY_GUARDS_PASS", expected_instance_id, public_ip, instance.get("Status"))

