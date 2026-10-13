from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def ledger_path(tmp_path: Path) -> Path:
    return tmp_path / "audit.jsonl"


def event(event_type: str, seq: int = 0, run: str = "run-1", **extra: object) -> dict:
    value = {
        "schema_version": 2,
        "event_type": event_type,
        "event_seq": seq,
        "timestamp": "2026-10-09T00:00:00Z",
        "lifecycle_run_id": run,
        "instance_id": "i-test",
    }
    if event_type not in {"LIFECYCLE_RUN_BOUND", "LIFECYCLE_RUN_TERMINATED"}:
        value.update({"decision_id": "decision-1", "decision_phase": "POST_TASK"})
    value.update(extra)
    return value


@pytest.fixture
def write_events():
    def _write(path: Path, events: list[dict]) -> None:
        path.write_text("".join(json.dumps(item, sort_keys=True) + "\n" for item in events), encoding="utf-8")

    return _write
def seed_terminal_history(path: Path, *, instance: str = "i-test", run: str = "seed-run") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    events = [
        {"schema_version": 2, "event_type": "LIFECYCLE_RUN_BOUND", "event_seq": 0,
         "timestamp": "2026-10-09T00:00:00Z", "lifecycle_run_id": run, "instance_id": instance,
         "requesting_workflow": "fixture", "workflow_run_identity": "terminal-history"},
        {"schema_version": 2, "event_type": "LIFECYCLE_RUN_TERMINATED", "event_seq": 1,
         "timestamp": "2026-10-09T00:01:00Z", "lifecycle_run_id": run, "instance_id": instance,
         "run_terminal_reason": "NORMAL_CONTROLLER_CLOSURE"},
    ]
    path.write_text("".join(json.dumps(item, sort_keys=True) + "\n" for item in events), encoding="utf-8")

class _DisposableLock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class DisposableProvisioner:
    """Test-side adapter that patches host facts and I/O around production entry."""

    def __init__(
        self,
        path: Path,
        *,
        identity=None,
        current_sid: str = "S-1-controller",
        lock_factory=None,
        uuid_factory=None,
        clock=None,
        open_func=None,
        write_func=None,
        fsync_func=None,
        close_func=None,
        stat_func=None,
    ):
        from lifecycle_controller.provisioning import (
            ControllerIdentity,
            LedgerProvisioner,
        )

        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.identity = identity or ControllerIdentity("S-1-controller", "i-protected")
        self.current_sid = current_sid
        self.lock_factory = lock_factory or (lambda: _DisposableLock())
        self.uuid_factory = uuid_factory
        self.clock = clock
        self.open_func = open_func
        self.write_func = write_func
        self.fsync_func = fsync_func
        self.close_func = close_func
        self.stat_func = stat_func
        self.provisioner = LedgerProvisioner(self.path)

    def provision(self, request):
        from contextlib import ExitStack
        from types import SimpleNamespace
        from unittest.mock import patch
        import lifecycle_controller.provisioning as provisioning

        with ExitStack() as stack:
            os_proxy = SimpleNamespace(**provisioning.os.__dict__)
            if self.open_func is not None:
                os_proxy.open = self.open_func
            if self.write_func is not None:
                os_proxy.write = self.write_func
            if self.fsync_func is not None:
                os_proxy.fsync = self.fsync_func
            if self.close_func is not None:
                os_proxy.close = self.close_func
            if self.stat_func is not None:
                os_proxy.stat = self.stat_func
            stack.enter_context(patch.object(provisioning, "os", os_proxy))
            stack.enter_context(patch.object(
                provisioning, "_load_controller_host_identity", return_value=self.identity
            ))
            stack.enter_context(patch.object(
                provisioning, "current_windows_sid", return_value=self.current_sid
            ))
            stack.enter_context(patch.object(
                provisioning, "WindowsMandatoryLock",
                lambda _path: self.lock_factory(),
            ))
            if self.uuid_factory is not None:
                stack.enter_context(patch.object(provisioning, "uuid4", self.uuid_factory))
            if self.clock is not None:
                stack.enter_context(patch.object(provisioning, "_utc_now", self.clock))
            return self.provisioner.provision(request)
