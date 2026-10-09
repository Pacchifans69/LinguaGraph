from __future__ import annotations

import pytest

from lifecycle_controller.endpoint_guard import EndpointGuard
from lifecycle_controller.terminal import TerminalManager


def test_endpoint_guard_requires_all_read_only_identity_checks():
    guard = EndpointGuard(expected_host_fingerprint="ssh-ed25519 AAAA")
    ready = guard.check(
        expected_instance_id="i-test",
        describe_instances=[{"InstanceId": "i-test", "Status": "Running", "PublicIpAddress": "198.51.100.2"}],
        public_ip="198.51.100.2",
        observed_fingerprint="ssh-ed25519 AAAA",
        known_host_match=True,
        imds_identity={"instance_id": "i-test", "region": "cn-hongkong", "zone": "a"},
    )
    assert ready.workflow_readiness == "READY"


@pytest.mark.parametrize("change", [
    {"describe_instances": []},
    {"describe_instances": [{"InstanceId": "other", "Status": "Running", "PublicIpAddress": "198.51.100.2"}]},
    {"public_ip": "198.51.100.9"},
    {"observed_fingerprint": "wrong"},
    {"known_host_match": False},
    {"imds_identity": {"instance_id": "other", "region": "cn-hongkong", "zone": "a"}},
])
def test_endpoint_guard_withholds_readiness_on_any_failed_guard(change):
    args = dict(
        expected_instance_id="i-test",
        describe_instances=[{"InstanceId": "i-test", "Status": "Running", "PublicIpAddress": "198.51.100.2"}],
        public_ip="198.51.100.2", observed_fingerprint="ssh-ed25519 AAAA", known_host_match=True,
        imds_identity={"instance_id": "i-test", "region": "cn-hongkong", "zone": "a"},
    )
    args.update(change)
    assert EndpointGuard(expected_host_fingerprint="ssh-ed25519 AAAA").check(**args).workflow_readiness != "READY"


def test_normal_closure_requires_all_seven_predicates():
    manager = TerminalManager()
    predicates = dict(binding=True, ledger_healthy=True, post_task_outcome=True, no_open_decision=True,
                      no_unresolved_intent=True, no_recovery_status=True, checks_complete=True)
    assert manager.can_normal_close(**predicates) is True
    for key in predicates:
        failed = dict(predicates, **{key: False})
        assert manager.can_normal_close(**failed) is False


def test_duplicate_termination_is_denied():
    manager = TerminalManager()
    assert manager.terminate("r", set()) == "TERMINATED"
    assert manager.terminate("r", {"r"}) == "TERMINATION_ALREADY_RECORDED"
