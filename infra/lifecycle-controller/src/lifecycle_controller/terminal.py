from __future__ import annotations


class TerminalManager:
    @staticmethod
    def can_normal_close(
        *, binding: bool, ledger_healthy: bool, post_task_outcome: bool,
        no_open_decision: bool, no_unresolved_intent: bool,
        no_recovery_status: bool, checks_complete: bool,
    ) -> bool:
        return all((binding, ledger_healthy, post_task_outcome, no_open_decision,
                    no_unresolved_intent, no_recovery_status, checks_complete))

    @staticmethod
    def terminate(lifecycle_run_id: str, existing_terminal_runs: set[str], *, reason: str = "NORMAL_CONTROLLER_CLOSURE") -> str:
        if lifecycle_run_id in existing_terminal_runs:
            return "TERMINATION_ALREADY_RECORDED"
        existing_terminal_runs.add(lifecycle_run_id)
        return "TERMINATED"

