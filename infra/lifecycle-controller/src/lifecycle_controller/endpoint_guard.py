from __future__ import annotations

from typing import Any, Protocol

from .ledger import LedgerWriter
from .models import EndpointReadiness


class EndpointObservationPort(Protocol):
    def describe_instances(self, instance_id: str, region: str) -> list[dict[str, Any]]: ...
    def strict_ssh_hostkey_match(self, public_ip: str, fingerprint: str) -> bool: ...
    def imdsv2_identity(self, public_ip: str) -> dict[str, str] | None: ...


class EndpointGuard:
    EXPECTED_INSTANCE_ID = "i-j6c9854oyawy89fcdxy2"
    EXPECTED_REGION = "cn-hongkong"
    EXPECTED_ZONE = "cn-hongkong-d"
    EXPECTED_HOST_FINGERPRINT = "SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg"

    def __init__(self, writer: LedgerWriter):
        self.writer = writer

    def inspect(self, lifecycle_run_id: str, observer: EndpointObservationPort) -> EndpointReadiness:
        try:
            with self.writer.acquire():
                binding = next(
                    (event for event in self.writer.scan()
                     if event.get("event_type") == "LIFECYCLE_RUN_BOUND"
                     and event.get("lifecycle_run_id") == lifecycle_run_id),
                    None,
                )
                if binding is None or binding.get("instance_id") != self.EXPECTED_INSTANCE_ID:
                    return self._not_ready("DURABLE_BINDING_UNAVAILABLE_OR_MISMATCH")
                records = observer.describe_instances(self.EXPECTED_INSTANCE_ID, self.EXPECTED_REGION)
                if len(records) != 1:
                    return self._not_ready("INSTANCE_CARDINALITY")
                instance = records[0]
                if (
                    instance.get("InstanceId") != self.EXPECTED_INSTANCE_ID
                    or instance.get("RegionId") != self.EXPECTED_REGION
                    or instance.get("ZoneId") != self.EXPECTED_ZONE
                ):
                    return self._not_ready("PROTECTED_ENDPOINT_IDENTITY_MISMATCH")
                if instance.get("Status") != "Running":
                    return self._not_ready("INSTANCE_NOT_RUNNING")
                public_ip = instance.get("PublicIpAddress")
                if not isinstance(public_ip, str) or not public_ip:
                    return self._not_ready("FRESH_PUBLIC_IP_UNAVAILABLE")
                if not observer.strict_ssh_hostkey_match(public_ip, self.EXPECTED_HOST_FINGERPRINT):
                    return self._not_ready("STRICT_HOSTKEY_PIN_FAILED")
                identity = observer.imdsv2_identity(public_ip)
                if identity != {
                    "instance_id": self.EXPECTED_INSTANCE_ID,
                    "region": self.EXPECTED_REGION,
                    "zone": self.EXPECTED_ZONE,
                }:
                    return self._not_ready("IMDSV2_IDENTITY_MISMATCH")
                return EndpointReadiness(
                    "READY", "ALL_READ_ONLY_GUARDS_PASS",
                    self.EXPECTED_INSTANCE_ID, public_ip, "Running",
                )
        except Exception:
            return self._not_ready("ENDPOINT_OBSERVATION_FAILED")

    @staticmethod
    def _not_ready(reason: str) -> EndpointReadiness:
        return EndpointReadiness("NOT_READY", reason)
