from __future__ import annotations

import ctypes
import json
import os
import re
import stat
import sys
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterator


class LedgerAuthorityUnavailable(RuntimeError):
    """The canonical ledger cannot establish trustworthy authority."""


class SecretShapeError(ValueError):
    """An event contains forbidden credential-shaped material."""


EVENT_TYPES = {
    "LIFECYCLE_RUN_BOUND", "DECISION_EVALUATED", "KILL_SWITCH_CHECK", "MUTATION_INTENT",
    "MUTATION_RESPONSE", "RECONCILIATION", "DECISION_OUTCOME", "LIFECYCLE_RUN_TERMINATED",
}
DECISION_EVENTS = {
    "KILL_SWITCH_CHECK", "DECISION_EVALUATED", "MUTATION_INTENT",
    "MUTATION_RESPONSE", "RECONCILIATION", "DECISION_OUTCOME",
}
NON_DECISION_EVENTS = {"LIFECYCLE_RUN_BOUND", "LIFECYCLE_RUN_TERMINATED"}
RFC3339 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
SECRET_PATTERNS = (
    re.compile(r"access.?key.?secret", re.I),
    re.compile(r"security.?token", re.I),
    re.compile(r"begin (?:rsa|openssh|ec|private) private key", re.I),
    re.compile(r"\b(?:ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{8,}\b", re.I),
    re.compile(r"authorization\s*:\s*bearer\s+\S+", re.I),
)

# LC-A3 freezes only the listed applicability edges. Other §2.5 optional fields
# retain historical compatibility because their exact event-type allowlists were
# not frozen. The global mutation-support invariant is not an event field.
EXPLICIT_FROZEN_APPLICABILITY: dict[str, set[str]] = {
    "requesting_workflow": {"LIFECYCLE_RUN_BOUND"},
    "workflow_run_identity": {"LIFECYCLE_RUN_BOUND"},
    "policy_decision": {"DECISION_EVALUATED"},
    "workflow_readiness": {"DECISION_EVALUATED"},
    "actuation_supported": {"DECISION_EVALUATED"},
    "actuation_decision": {"DECISION_EVALUATED", "DECISION_OUTCOME"},
    "provider_mutation_count": {"DECISION_EVALUATED", "DECISION_OUTCOME"},
    "run_terminal_reason": {"LIFECYCLE_RUN_TERMINATED"},
    "resolved_recovery_status": {"LIFECYCLE_RUN_TERMINATED"},
}
GLOBAL_NOT_EVENT_FIELD = {"automatic_mutation_supported"}
OPTIONAL_EVENT_FIELDS = {
    "requesting_workflow", "workflow_run_identity", "region", "observed_state",
    "pre_public_ip", "post_public_ip", "stopped_mode", "workflow_readiness",
    "policy_decision", "actuation_supported", "actuation_decision",
    "automatic_mutation_supported", "mutation_action", "mutation_sent",
    "provider_mutation_count", "provider_request_id", "mutation_budget_spent",
    "response_class", "kill_switch_phase", "automation_enabled", "power_finalization",
    "ssh_hostkey_match", "remote_instance_id_match", "evidence", "decision_outcome",
    "mutation_attribution", "run_terminal_reason", "resolved_recovery_status",
}
UNSPECIFIED_HISTORICAL_COMPATIBILITY = (
    OPTIONAL_EVENT_FIELDS - set(EXPLICIT_FROZEN_APPLICABILITY) - GLOBAL_NOT_EVENT_FIELD
)
# Compatibility name retained for callers that inspect the frozen allowlist.
FIELD_ALLOWED_EVENTS = EXPLICIT_FROZEN_APPLICABILITY
COMMON_FIELDS = {"schema_version", "event_type", "event_seq", "timestamp", "lifecycle_run_id", "instance_id"}
DECISION_SCOPE_FIELDS = {"decision_id", "decision_phase"}
ENUMS = {
    "decision_phase": {"PRE_TASK", "POST_TASK"},
    "observed_state": {"Running", "Stopped", "Starting", "Stopping", "unknown"},
    "workflow_readiness": {"READY", "NOT_READY", "UNKNOWN"},
    "policy_decision": {"WOULD_START", "WOULD_STOP", "PRESERVE_RUNNING", "NO_ACTION_REQUIRED", "FAIL_CLOSED"},
    "actuation_decision": {"NO_MUTATION"},
    "mutation_action": {None, "StartInstance", "StopInstance"},
    "kill_switch_phase": {"ENTRY", "PRE_SEND"},
    "decision_outcome": {
        "STARTED", "ECONOMICAL_STOP_VERIFIED", "STOPPED_NOT_ECONOMICAL",
        "INDETERMINATE_START_TRANSITION", "INDETERMINATE_STOP_TRANSITION",
        "NO_MUTATION_SHADOW", "PRESERVE_RUNNING", "NO_FURTHER_MUTATION",
        "FAIL_CLOSED", "ESCALATED_TO_HUMAN", "DISABLED_BY_KILL_SWITCH",
    },
    "mutation_attribution": {"NOT_APPLICABLE", "KNOWN_NOT_SENT", "KNOWN_SENT", "UNKNOWN"},
    "run_terminal_reason": {"NORMAL_CONTROLLER_CLOSURE", "HUMAN_RESOLVED"},
    "resolved_recovery_status": {"UNRESOLVED_INTENT", "RECOVERY_REQUIRED_ACTIVE"},
}


def _contains_secret(value: Any) -> bool:
    if isinstance(value, str):
        return any(pattern.search(value) for pattern in SECRET_PATTERNS)
    if isinstance(value, dict):
        return any(_contains_secret(k) or _contains_secret(v) for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return any(_contains_secret(item) for item in value)
    return False


def _validate_event(event: dict[str, Any]) -> None:
    if _contains_secret(event):
        raise SecretShapeError("secret-shaped material rejected before append")
    required = COMMON_FIELDS
    if not required.issubset(event):
        raise LedgerAuthorityUnavailable("event envelope incomplete")
    event_type = event["event_type"]
    if event["schema_version"] != 2 or event_type not in EVENT_TYPES:
        raise LedgerAuthorityUnavailable("unsupported event schema or type")
    if not isinstance(event["event_seq"], int) or isinstance(event["event_seq"], bool) or event["event_seq"] < 0:
        raise LedgerAuthorityUnavailable("invalid event_seq")
    if not isinstance(event["timestamp"], str) or not RFC3339.match(event["timestamp"]):
        raise LedgerAuthorityUnavailable("invalid UTC timestamp")
    if not isinstance(event["lifecycle_run_id"], str) or not event["lifecycle_run_id"]:
        raise LedgerAuthorityUnavailable("invalid lifecycle_run_id")
    if not isinstance(event["instance_id"], str) or not event["instance_id"]:
        raise LedgerAuthorityUnavailable("invalid instance_id")
    if event.keys() & GLOBAL_NOT_EVENT_FIELD:
        raise LedgerAuthorityUnavailable("global controller invariant is not an event field")
    allowed = COMMON_FIELDS | OPTIONAL_EVENT_FIELDS
    if event_type in DECISION_EVENTS:
        allowed = allowed | DECISION_SCOPE_FIELDS
        if not event.get("decision_id") or event.get("decision_phase") not in ENUMS["decision_phase"]:
            raise LedgerAuthorityUnavailable("decision event missing decision scope")
    elif "decision_id" in event or "decision_phase" in event:
        raise LedgerAuthorityUnavailable("run event carries decision fields")
    for key in event.keys() - allowed:
        raise LedgerAuthorityUnavailable(f"unknown event field: {key}")
    for key, value in event.items():
        if key in EXPLICIT_FROZEN_APPLICABILITY and event_type not in EXPLICIT_FROZEN_APPLICABILITY[key]:
            raise LedgerAuthorityUnavailable(f"inapplicable event field: {key}")
        if key in ENUMS and value not in ENUMS[key]:
            raise LedgerAuthorityUnavailable(f"invalid {key}")
    if event_type == "DECISION_EVALUATED":
        required_fields = {"policy_decision", "workflow_readiness", "actuation_supported", "actuation_decision", "provider_mutation_count"}
        if not required_fields.issubset(event):
            raise LedgerAuthorityUnavailable("decision evaluation fields incomplete")
        if event["actuation_supported"] is not False or event["actuation_decision"] != "NO_MUTATION" or event["provider_mutation_count"] != 0:
            raise LedgerAuthorityUnavailable("shadow evaluation must remain non-actuating")
    elif event_type == "DECISION_OUTCOME":
        required_fields = {"decision_outcome", "actuation_decision", "provider_mutation_count"}
        if not required_fields.issubset(event):
            raise LedgerAuthorityUnavailable("decision outcome fields incomplete")
        if event["actuation_decision"] != "NO_MUTATION" or event["provider_mutation_count"] != 0:
            raise LedgerAuthorityUnavailable("shadow outcome must remain non-actuating")
    elif event_type == "MUTATION_INTENT":
        if event.get("mutation_action") not in {"StartInstance", "StopInstance"}:
            raise LedgerAuthorityUnavailable("historical mutation intent missing action")
        if event.get("mutation_sent") is True:
            raise LedgerAuthorityUnavailable("pre-send MUTATION_INTENT cannot claim mutation_sent=true")
        if event.keys() & {"actuation_supported", "actuation_decision", "provider_mutation_count"}:
            raise LedgerAuthorityUnavailable("historical MUTATION_INTENT cannot carry shadow actuation fields")
    elif event_type == "KILL_SWITCH_CHECK":
        if "kill_switch_phase" not in event or not isinstance(event.get("automation_enabled"), bool):
            raise LedgerAuthorityUnavailable("kill-switch fields incomplete")
    elif event_type == "LIFECYCLE_RUN_BOUND":
        if (
            not isinstance(event.get("requesting_workflow"), str) or not event.get("requesting_workflow")
            or not isinstance(event.get("workflow_run_identity"), str) or not event.get("workflow_run_identity")
        ):
            raise LedgerAuthorityUnavailable("binding identity fields incomplete")
    elif event_type == "LIFECYCLE_RUN_TERMINATED":
        if event.get("run_terminal_reason") not in ENUMS["run_terminal_reason"]:
            raise LedgerAuthorityUnavailable("terminal reason missing or invalid")
        if event.get("run_terminal_reason") == "HUMAN_RESOLVED":
            if event.get("resolved_recovery_status") not in ENUMS["resolved_recovery_status"]:
                raise LedgerAuthorityUnavailable("human resolution missing recovery status")
        elif "resolved_recovery_status" in event:
            raise LedgerAuthorityUnavailable("normal termination carries human resolution")
    if "actuation_supported" in event and event["actuation_supported"] is not False:
        raise LedgerAuthorityUnavailable("actuation_supported must be false")
    if "provider_mutation_count" in event and (
        not isinstance(event["provider_mutation_count"], int)
        or isinstance(event["provider_mutation_count"], bool)
        or event["provider_mutation_count"] != 0
    ):
        raise LedgerAuthorityUnavailable("provider mutation count must be zero")
    if "automation_enabled" in event and not isinstance(event["automation_enabled"], bool):
        raise LedgerAuthorityUnavailable("automation_enabled must be boolean")
    for field in ("mutation_sent", "mutation_budget_spent", "ssh_hostkey_match", "remote_instance_id_match"):
        if field in event and not isinstance(event[field], bool):
            raise LedgerAuthorityUnavailable(f"{field} must be boolean")
    if "evidence" in event:
        if not isinstance(event["evidence"], list):
            raise LedgerAuthorityUnavailable("evidence must be a list")
        evidence_fields = {"kind", "locator", "digest_expected", "digest_observed", "match", "bound"}
        for item in event["evidence"]:
            if not isinstance(item, dict) or not evidence_fields.issubset(item):
                raise LedgerAuthorityUnavailable("evidence item incomplete")
            if not isinstance(item["match"], bool) or not isinstance(item["bound"], bool):
                raise LedgerAuthorityUnavailable("evidence match and bound must be boolean")


def validate_ledger_bytes(raw: bytes) -> list[dict[str, Any]]:
    if not raw:
        raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: empty ledger")
    if not raw.endswith(b"\n"):
        raise LedgerAuthorityUnavailable("ledger has incomplete final line")
    try:
        events = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: unreadable ledger") from exc
    for index, event in enumerate(events):
        if not isinstance(event, dict) or event.get("event_seq") != index:
            raise LedgerAuthorityUnavailable("ledger event_seq is not contiguous")
        _validate_event(event)
    by_run: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_run.setdefault(event["lifecycle_run_id"], []).append(event)
    for run_events in by_run.values():
        if sum(e["event_type"] == "LIFECYCLE_RUN_BOUND" for e in run_events) > 1:
            raise LedgerAuthorityUnavailable("duplicate immutable binding")
        if sum(e["event_type"] == "LIFECYCLE_RUN_TERMINATED" for e in run_events) > 1:
            raise LedgerAuthorityUnavailable("duplicate terminal event")
        bound_positions = [i for i, e in enumerate(run_events) if e["event_type"] == "LIFECYCLE_RUN_BOUND"]
        if bound_positions and bound_positions[0] != 0:
            raise LedgerAuthorityUnavailable("binding is not first run event")
    return events


def validate_ledger(path: Path) -> list[dict[str, Any]]:
    if not path.exists() or not path.is_file():
        raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: ledger missing")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: unreadable ledger") from exc
    return validate_ledger_bytes(raw)


class WindowsMandatoryLock:
    """CreateFileW-style zero-share lock; non-Windows cannot claim Tier-B proof."""

    def __init__(self, lock_path: Path):
        self.lock_path = Path(lock_path)
        self._handle = None

    def __enter__(self):
        if sys.platform != "win32":
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE")
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        kernel32 = ctypes.windll.kernel32
        kernel32.CreateFileW.restype = ctypes.c_void_p
        handle = kernel32.CreateFileW(str(self.lock_path), 0xC0000000, 0, None, 4, 0x80, None)
        if handle in (None, ctypes.c_void_p(-1).value):
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE")
        self._handle = handle
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._handle is not None:
            ctypes.windll.kernel32.CloseHandle(self._handle)
            self._handle = None


class LedgerWriter:
    """Session owner pins one canonical file object for scans and appends."""

    def __init__(
        self,
        path: Path,
        *,
        lock_factory: Callable[[], Any] | None = None,
        fsync_func: Callable[[int], None] = os.fsync,
        order_hook: Callable[[str], None] | None = None,
    ):
        self.path = Path(path)
        self.lock_factory = lock_factory or (lambda: WindowsMandatoryLock(self.path.with_suffix(".lock")))
        self.fsync_func = fsync_func
        self.order_hook = order_hook or (lambda _: None)
        self._owned = False
        self._poisoned = False
        self._session_path: Path | None = None
        self._ledger_fd: int | None = None
        self._session_identity: tuple[int, int] | None = None
        self._session_bytes: bytes | None = None

    @contextmanager
    def acquire(self) -> Iterator[None]:
        if self._owned:
            self._ensure_healthy()
            yield
            return
        lock = None
        lock_entered = False
        try:
            lock = self.lock_factory()
            if lock is not None:
                if not hasattr(lock, "__enter__"):
                    raise RuntimeError("mandatory writer lock has no enter operation")
                lock.__enter__()
                lock_entered = True
        except Exception as exc:
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE") from exc

        try:
            self._owned = True
            self._poisoned = False
            self._session_path = self.path
            flags = os.O_RDWR | getattr(os, "O_BINARY", 0)
            try:
                self._ledger_fd = os.open(self.path, flags)  # OPEN EXISTING only; never initialize.
                descriptor_stat = os.fstat(self._ledger_fd)
            except FileNotFoundError as exc:
                raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: ledger missing") from exc
            except OSError as exc:
                raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: canonical ledger unavailable") from exc
            if not stat.S_ISREG(descriptor_stat.st_mode):
                raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: canonical ledger is not a regular file")
            self._session_identity = (descriptor_stat.st_dev, descriptor_stat.st_ino)
            self._verify_path_identity()
            self._session_bytes = self._read_owned_bytes()
            self._verify_path_identity()
            yield
        finally:
            fd, self._ledger_fd = self._ledger_fd, None
            if fd is not None:
                os.close(fd)
            self._owned = False
            self._session_path = None
            self._session_identity = None
            self._session_bytes = None
            if lock_entered:
                lock.__exit__(None, None, None)

    def _ensure_healthy(self) -> None:
        if self._poisoned:
            raise LedgerAuthorityUnavailable("authority session is poison after append/flush failure")

    def _verify_path_identity(self) -> None:
        self._ensure_healthy()
        if not self._owned or self._ledger_fd is None or self.path != self._session_path:
            raise LedgerAuthorityUnavailable("canonical ledger changed during owned session")
        try:
            path_stat = os.stat(self.path, follow_symlinks=False)
            descriptor_stat = os.fstat(self._ledger_fd)
        except OSError as exc:
            raise LedgerAuthorityUnavailable("canonical ledger path unavailable") from exc
        if not stat.S_ISREG(path_stat.st_mode) or not stat.S_ISREG(descriptor_stat.st_mode):
            raise LedgerAuthorityUnavailable("canonical ledger changed: not a regular file")
        if (path_stat.st_dev, path_stat.st_ino) != self._session_identity:
            raise LedgerAuthorityUnavailable("canonical ledger path no longer names owned object")
        if (descriptor_stat.st_dev, descriptor_stat.st_ino) != self._session_identity:
            raise LedgerAuthorityUnavailable("owned canonical ledger object changed")

    def _read_owned_bytes(self) -> bytes:
        if self._ledger_fd is None:
            raise LedgerAuthorityUnavailable("canonical ledger object is not owned")
        try:
            os.lseek(self._ledger_fd, 0, os.SEEK_SET)
            chunks=[]
            while True:
                chunk=os.read(self._ledger_fd, 1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        except OSError as exc:
            raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: canonical ledger unreadable") from exc

    def scan(self) -> list[dict[str, Any]]:
        if not self._owned:
            with self.acquire():
                return self.scan()
        self._ensure_healthy()
        self._verify_path_identity()
        raw=self._read_owned_bytes()
        if raw != self._session_bytes:
            raise LedgerAuthorityUnavailable("canonical ledger content diverged during owned session")
        # Parse exactly the bytes read from the pinned descriptor, then recheck the
        # pathname so a concurrent replacement cannot be returned as authority.
        events=validate_ledger_bytes(raw)
        self._verify_path_identity()
        if self._read_owned_bytes() != raw:
            raise LedgerAuthorityUnavailable("canonical ledger content diverged while parsing owned bytes")
        self._verify_path_identity()
        return events

    def append(self, event: dict[str, Any]) -> None:
        if event.get("event_type") == "MUTATION_INTENT":
            raise ValueError("authoritative LC-A4 writer cannot append MUTATION_INTENT")
        _validate_event(event)
        if not self._owned:
            with self.acquire():
                self.append(event)
            return
        self._ensure_healthy()
        prior=self.scan()
        if event["event_seq"] != len(prior):
            raise LedgerAuthorityUnavailable("event_seq allocation is not contiguous")
        payload=(json.dumps(event,sort_keys=True,separators=(",", ":"))+"\n").encode("utf-8")
        try:
            self._verify_path_identity()
            os.lseek(self._ledger_fd,0,os.SEEK_END)
            view=memoryview(payload)
            while view:
                count=os.write(self._ledger_fd,view)
                if count <= 0:
                    raise OSError("short canonical ledger write")
                view=view[count:]
            self.order_hook(f"append:{event['event_type']}")
            self.fsync_func(self._ledger_fd)
            self.order_hook("flush")
            self._verify_path_identity()
            observed=self._read_owned_bytes()
            self._verify_path_identity()
            if observed != self._session_bytes + payload:
                raise LedgerAuthorityUnavailable("canonical ledger diverged during append")
            self._session_bytes=observed
        except (OSError, LedgerAuthorityUnavailable) as exc:
            self._poisoned=True
            raise LedgerAuthorityUnavailable("ledger append/durable flush failed; authority session poison; FAIL_CLOSED") from exc

class _nullcontext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
