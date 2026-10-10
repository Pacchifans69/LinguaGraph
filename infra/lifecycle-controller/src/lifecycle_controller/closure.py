from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path
from typing import Any, Mapping, Protocol


class LedgerReader(Protocol):
    def scan(self) -> list[dict[str, Any]]: ...
    def acquire(self): ...


class CurrentSafetyStatePort(Protocol):
    """Tier-A seam; production current-hold authority is not proven here."""

    def current_state(self, lifecycle_run_id: str) -> Mapping[str, Any] | None: ...


class ClosureVerifier:
    """Controller-owned deterministic verifier for the A4-SHADOW-01 fixture."""

    def __init__(
        self,
        *,
        writer: LedgerReader,
        evidence_root: Path,
        safety_state_provider: CurrentSafetyStatePort | None,
    ):
        self.writer = writer
        self.evidence_root = Path(evidence_root)
        self.safety_state_provider = safety_state_provider

    def verify_bound(self, lifecycle_run_id: str) -> dict[str, Any]:
        try:
            with self.writer.acquire():
                return self._verify_bound_owned(lifecycle_run_id)
        except Exception as exc:
            return self._failed(f"LEDGER_OR_VERIFIER_AUTHORITY_UNAVAILABLE:{type(exc).__name__}")

    def _verify_bound_owned(self, lifecycle_run_id: str) -> dict[str, Any]:
        try:
            events = self.writer.scan()
            binding = next(
                (event for event in events
                 if event.get("event_type") == "LIFECYCLE_RUN_BOUND"
                 and event.get("lifecycle_run_id") == lifecycle_run_id),
                None,
            )
            if binding is None:
                return self._failed("UNKNOWN_OR_UNBOUND_LIFECYCLE_RUN_ID", authority="NO")
            if binding.get("requesting_workflow") != "A4-SHADOW-01":
                return self._failed("UNSUPPORTED_WORKFLOW")
            namespace = self._namespace(binding)
            receipt_raw = (namespace / "receipt.json").read_bytes()
            index_raw = (namespace / "index.json").read_bytes()
            receipt = self._parse(receipt_raw)
            index = self._parse(index_raw)
            self._check_bound_fields(receipt, binding, "linguagraph-a4-shadow-receipt-v1")
            self._check_bound_fields(index, binding, "linguagraph-a4-shadow-index-v1")
            if not self._matches(receipt.get("index_sha256"), index_raw):
                return self._failed("PACKAGE_INDEX_DIGEST_MISMATCH")
            artifacts = index.get("artifacts")
            if not isinstance(artifacts, list) or len(artifacts) != 1:
                return self._failed("INVALID_ARTIFACT_INDEX")
            artifact_entry = artifacts[0]
            if not isinstance(artifact_entry, dict) or set(artifact_entry) != {"path", "sha256"}:
                return self._failed("INVALID_ARTIFACT_INDEX")
            if artifact_entry["path"] != "result.json":
                return self._failed("NONCANONICAL_ARTIFACT_PATH")
            artifact_raw = (namespace / "result.json").read_bytes()
            if not self._matches(artifact_entry.get("sha256"), artifact_raw):
                return self._failed("ARTIFACT_DIGEST_MISMATCH")
            artifact = self._parse(artifact_raw)
            self._check_bound_fields(artifact, binding, "linguagraph-a4-shadow-result-v1")
            if artifact.get("terminal_result") != "SAFE_SUCCESS":
                return self._failed("TERMINAL_RESULT_NOT_SAFE_SUCCESS")
            if artifact.get("capability_finalization") != "FINALIZED":
                return self._failed("CAPABILITY_NOT_FINALIZED")

            current = self._current_safety_state(lifecycle_run_id)
            safety_clear = (
                current is not None
                and current.get("forensic_hold") is False
                and current.get("volatile_evidence_hold") is False
            )
            namespace_key = namespace.name
            evidence = []
            for filename, raw in (
                ("receipt.json", receipt_raw),
                ("index.json", index_raw),
                ("result.json", artifact_raw),
            ):
                digest = hashlib.sha256(raw).hexdigest()
                evidence.append({
                    "kind": filename.split(".")[0],
                    "locator": f"fixture://{namespace_key}/{filename}",
                    "digest_expected": digest,
                    "digest_observed": digest,
                    "match": True,
                    "bound": True,
                })
            return {
                "authority_eligible": "YES",
                "bound_evidence": "YES",
                "durable_closure_complete": "YES",
                "capability_finalized": "YES",
                "current_safety_authority_available": "YES" if current is not None else "NO",
                "current_safety_clear": "YES" if safety_clear else "NO",
                "safe_success": "YES" if safety_clear else "NO",
                "indeterminate": "NO",
                "claimed_indeterminate": "NO",
                "forensic_hold": "YES" if current is not None and current.get("forensic_hold") is True else ("NO" if current is not None else "UNKNOWN"),
                "volatile_evidence_hold": "YES" if current is not None and current.get("volatile_evidence_hold") is True else ("NO" if current is not None else "UNKNOWN"),
                "workflow_readiness": "READY",
                "evidence": evidence,
                "reason": "RAW_FIXTURE_CHAIN_AND_CURRENT_SAFETY_VERIFIED" if safety_clear
                    else "RAW_FIXTURE_CHAIN_VERIFIED_CURRENT_SAFETY_UNAVAILABLE_OR_ACTIVE",
            }
        except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            return self._failed(f"FIXTURE_VERIFICATION_FAILED:{type(exc).__name__}")

    def _current_safety_state(self, lifecycle_run_id: str) -> Mapping[str, Any] | None:
        if self.safety_state_provider is None:
            return None
        state = self.safety_state_provider.current_state(lifecycle_run_id)
        if not isinstance(state, Mapping):
            return None
        if not isinstance(state.get("forensic_hold"), bool) or not isinstance(state.get("volatile_evidence_hold"), bool):
            return None
        return state

    def _namespace(self, binding: Mapping[str, Any]) -> Path:
        parts = (binding["requesting_workflow"], binding["workflow_run_identity"], binding["lifecycle_run_id"])
        payload = b"".join(
            len(part.encode("utf-8")).to_bytes(8, "big") + part.encode("utf-8")
            for part in parts
        )
        key = hashlib.sha256(payload).hexdigest()
        root = self.evidence_root.resolve()
        namespace = root / key
        try:
            namespace.resolve().relative_to(root)
        except ValueError as exc:
            raise ValueError("fixture namespace escaped canonical evidence root") from exc
        return namespace

    @staticmethod
    def _parse(raw: bytes) -> dict[str, Any]:
        def unique_object(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate JSON key")
                result[key] = value
            return result

        value = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
        if not isinstance(value, dict):
            raise ValueError("fixture document must be a JSON object")
        return value

    @staticmethod
    def _check_bound_fields(document: Mapping[str, Any], binding: Mapping[str, Any], schema: str) -> None:
        fields = {
            "linguagraph-a4-shadow-receipt-v1": {"schema", "lifecycle_run_id", "workflow_run_identity", "index_sha256"},
            "linguagraph-a4-shadow-index-v1": {"schema", "lifecycle_run_id", "workflow_run_identity", "artifacts"},
            "linguagraph-a4-shadow-result-v1": {
                "schema", "lifecycle_run_id", "workflow_run_identity", "terminal_result", "capability_finalization",
            },
        }
        if set(document) != fields.get(schema):
            raise ValueError("fixture document fields mismatch")
        if document.get("schema") != schema:
            raise ValueError("fixture schema mismatch")
        if document.get("lifecycle_run_id") != binding.get("lifecycle_run_id"):
            raise ValueError("fixture lifecycle binding mismatch")
        if document.get("workflow_run_identity") != binding.get("workflow_run_identity"):
            raise ValueError("fixture workflow binding mismatch")

    @staticmethod
    def _matches(expected: Any, raw: bytes) -> bool:
        if not isinstance(expected, str) or len(expected) != 64:
            return False
        return hmac.compare_digest(expected, hashlib.sha256(raw).hexdigest())

    @staticmethod
    def _failed(reason: str, *, authority: str = "YES") -> dict[str, Any]:
        return {
            "authority_eligible": authority,
            "bound_evidence": "NO",
            "durable_closure_complete": "NO",
            "capability_finalized": "NO",
            "current_safety_authority_available": "NO",
            "current_safety_clear": "NO",
            "safe_success": "NO",
            "indeterminate": "YES",
            "claimed_indeterminate": "YES",
            "forensic_hold": "UNKNOWN",
            "volatile_evidence_hold": "UNKNOWN",
            "workflow_readiness": "UNKNOWN",
            "evidence": [],
            "reason": reason,
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
