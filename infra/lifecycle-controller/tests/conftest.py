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