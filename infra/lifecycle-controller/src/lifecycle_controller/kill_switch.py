from __future__ import annotations

from pathlib import Path


class KillSwitch:
    def __init__(self, path: Path):
        self.path = Path(path)

    def enabled(self) -> bool:
        try:
            return self.path.is_file() and self.path.read_text(encoding="utf-8") == "true"
        except (OSError, UnicodeError):
            return False

    def pre_send_guard(self) -> bool:
        """Isolated read-only guard for a future actuator; it emits no ledger intent."""
        return self.enabled()

