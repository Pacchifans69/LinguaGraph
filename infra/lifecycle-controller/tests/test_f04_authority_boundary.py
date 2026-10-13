from __future__ import annotations

from lifecycle_controller.ledger import LedgerAuthorityUnavailable
from unittest.mock import patch

import lifecycle_controller.provisioning as production_provisioning
from lifecycle_controller.provisioning import (
    ControllerIdentity,
    ControllerProvisioningAuthority,
    FirstBindingRequest,
    LedgerProvisioner,
)


PROTECTED_INSTANCE_ID = "i-j6c9854oyawy89fcdxy2"


def test_A4_B1_25_production_importable_test_seam_cannot_mint_provisioning_authority(tmp_path):
    canonical = tmp_path / "controller-owned" / "audit.jsonl"
    canonical.parent.mkdir()
    request = FirstBindingRequest(
        instance_id=PROTECTED_INSTANCE_ID,
        requesting_workflow="human-authorized-provisioning",
        workflow_run_identity="adversarial-import-caller",
    )

    # Ensure former and newly considered production-importable test seams are
    # absent from the package. The following actual-call attempt then proves
    # the production entry still invokes its host resolver.
    for symbol in (
        "_for_disposable_test", "FirstBindingCore", "_open_file",
        "_write_file", "_flush_file", "_close_file", "_path_stat",
    ):
        assert not hasattr(production_provisioning, symbol), symbol

    # Reproduce the F03 caller path: construct the test authority type and pass
    # it to the production entry. Keep a fallback constructor in the probe so
    # an importable disposable factory is exercised if one regresses.
    test_factory = getattr(ControllerProvisioningAuthority, "_for_disposable_test", None)
    if callable(test_factory):
        forged_authority = test_factory(
            ControllerIdentity("S-AGENT-FORGED", PROTECTED_INSTANCE_ID),
            current_sid="S-AGENT-FORGED",
        )
    else:
        forged_authority = ControllerProvisioningAuthority(
            ControllerIdentity("S-AGENT-FORGED", PROTECTED_INSTANCE_ID)
        )

    try:
        LedgerProvisioner(canonical, authority=forged_authority)
    except TypeError:
        pass
    else:
        raise AssertionError("production LedgerProvisioner accepted caller-created authority")

    # Then exercise the real production method. It must try the fixed host
    # resolver and fail closed in this hermetic process before event-0 write.
    resolver_calls = []

    def unavailable(cls):
        resolver_calls.append(cls)
        raise LedgerAuthorityUnavailable("host authority deliberately unavailable in Tier A")

    with patch.object(
        ControllerProvisioningAuthority,
        "from_controller_host",
        classmethod(unavailable),
    ):
        provisioner = LedgerProvisioner(canonical)
        try:
            provisioner.provision(request)
        except LedgerAuthorityUnavailable:
            pass
        else:
            raise AssertionError("production provisioner bypassed the host authority resolver")

    assert resolver_calls == [ControllerProvisioningAuthority]
    assert not canonical.exists(), "rejected bypass attempt must leave no event-0 residue"
