from __future__ import annotations

from .models import Binding


class BindingStore:
    """In-memory view used by the controller; durable authority remains the ledger."""

    def __init__(self):
        self._bindings: dict[str, Binding] = {}

    def add(self, binding: Binding) -> None:
        previous = self._bindings.get(binding.lifecycle_run_id)
        if previous is not None and previous != binding:
            raise ValueError("binding is immutable; repoint is forbidden")
        self._bindings[binding.lifecycle_run_id] = binding

    def get(self, lifecycle_run_id: str) -> Binding | None:
        return self._bindings.get(lifecycle_run_id)

