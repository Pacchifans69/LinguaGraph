from __future__ import annotations

import ctypes
import json
import os
import re
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
    "LIFECYCLE_RUN_BOUND",
    "DECISION_EVALUATED",
    "KILL_SWITCH_CHECK",
    "MUTATION_INTENT",
    "MUTATION_RESPONSE",
    "RECONCILIATION",
    "DECISION_OUTCOME",
    "LIFECYCLE_RUN_TERMINATED",
}
DECISION_EVENTS = {
    "KILL_SWITCH_CHECK",
    "DECISION_EVALUATED",
    "MUTATION_INTENT",
    "MUTATION_RESPONSE",
    "RECONCILIATION",
    "DECISION_OUTCOME",
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
    required = {"schema_version", "event_type", "event_seq", "timestamp", "lifecycle_run_id", "instance_id"}
    if not required.issubset(event):
        raise LedgerAuthorityUnavailable("event envelope incomplete")
    if event["schema_version"] != 2 or event["event_type"] not in EVENT_TYPES:
        raise LedgerAuthorityUnavailable("unsupported event schema or type")
    if not isinstance(event["event_seq"], int) or event["event_seq"] < 0:
        raise LedgerAuthorityUnavailable("invalid event_seq")
    if not isinstance(event["timestamp"], str) or not RFC3339.match(event["timestamp"]):
        raise LedgerAuthorityUnavailable("invalid UTC timestamp")
    if not isinstance(event["lifecycle_run_id"], str) or not event["lifecycle_run_id"]:
        raise LedgerAuthorityUnavailable("invalid lifecycle_run_id")
    if not isinstance(event["instance_id"], str) or not event["instance_id"]:
        raise LedgerAuthorityUnavailable("invalid instance_id")
    event_type = event["event_type"]
    if event_type in DECISION_EVENTS:
        if not event.get("decision_id") or event.get("decision_phase") not in {"PRE_TASK", "POST_TASK"}:
            raise LedgerAuthorityUnavailable("decision event missing decision scope")
    if event_type in NON_DECISION_EVENTS and ("decision_id" in event or "decision_phase" in event):
        raise LedgerAuthorityUnavailable("run event carries decision fields")
    if event_type == "DECISION_EVALUATED":
        fields = {"policy_decision", "workflow_readiness", "actuation_supported", "actuation_decision", "provider_mutation_count"}
        if not fields.issubset(event):
            raise LedgerAuthorityUnavailable("decision evaluation fields incomplete")
    if event_type == "DECISION_OUTCOME":
        fields = {"decision_outcome", "actuation_decision", "provider_mutation_count"}
        if not fields.issubset(event):
            raise LedgerAuthorityUnavailable("decision outcome fields incomplete")
    if event_type == "LIFECYCLE_RUN_BOUND" and (
        not isinstance(event.get("requesting_workflow"), str)
        or not event.get("requesting_workflow")
        or not isinstance(event.get("workflow_run_identity"), str)
        or not event.get("workflow_run_identity")
    ):
        raise LedgerAuthorityUnavailable("binding identity fields incomplete")
    if event_type in {"LIFECYCLE_RUN_BOUND", "LIFECYCLE_RUN_TERMINATED", "KILL_SWITCH_CHECK", "MUTATION_RESPONSE", "RECONCILIATION"}:
        forbidden = {"actuation_supported", "actuation_decision", "provider_mutation_count"}
        if forbidden.intersection(event):
            raise LedgerAuthorityUnavailable("inapplicable actuation field")


def validate_ledger(path: Path) -> list[dict[str, Any]]:
    if not path.exists() or not path.is_file():
        raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: ledger missing")
    try:
        raw = path.read_bytes()
        if not raw:
            raise LedgerAuthorityUnavailable("BINDING_AUTHORITY_UNAVAILABLE: empty ledger")
        if raw and not raw.endswith(b"\n"):
            raise LedgerAuthorityUnavailable("ledger has incomplete final line")
        events = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
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

    @contextmanager
    def acquire(self) -> Iterator[None]:
        lock = None
        try:
            lock = self.lock_factory()
            if lock is not None and hasattr(lock, "__enter__"):
                lock.__enter__()
            self._owned = True
            yield
        except (PermissionError, OSError) as exc:
            raise LedgerAuthorityUnavailable("LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE") from exc
        finally:
            self._owned = False
            if lock is not None and hasattr(lock, "__exit__"):
                lock.__exit__(None, None, None)

    def append(self, event: dict[str, Any]) -> None:
        if event.get("event_type") == "MUTATION_INTENT":
            raise ValueError("authoritative LC-A4 writer cannot append MUTATION_INTENT")
        _validate_event(event)
        context = _nullcontext() if self._owned else self.acquire()
        with context:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            prior = self.scan() if self.path.exists() else []
            expected_seq = len(prior)
            if event["event_seq"] != expected_seq:
                raise LedgerAuthorityUnavailable("event_seq allocation is not contiguous")
            with self.path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(event, sort_keys=True, separators=(",", ":")) + "\n")
                handle.flush()
                self.order_hook(f"append:{event['event_type']}")
                try:
                    self.fsync_func(handle.fileno())
                except OSError as exc:
                    raise LedgerAuthorityUnavailable("ledger flush failed; FAIL_CLOSED") from exc
                self.order_hook("flush")

    def scan(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return validate_ledger(self.path)


class _nullcontext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

