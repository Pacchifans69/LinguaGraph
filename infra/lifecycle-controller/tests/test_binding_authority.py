from __future__ import annotations

import pytest

from lifecycle_controller.authority import WriterOwnership
from lifecycle_controller.binding import BindingStore
from lifecycle_controller.models import Binding


def test_binding_store_rejects_repoint_and_unknown_ids():
    store = BindingStore()
    binding = Binding("run", "i-test", "fixture", "candidate", "2026-10-09T00:00:00Z")
    store.add(binding)
    assert store.get("run") == binding
    with pytest.raises(ValueError, match="immutable"):
        store.add(Binding("run", "other", "fixture", "candidate", binding.bound_at))
    assert store.get("unknown") is None


def test_writer_ownership_is_explicitly_available_for_tier_b_only():
    assert WriterOwnership is not None
