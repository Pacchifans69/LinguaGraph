from lifecycle_controller.recovery import classify_run, unresolved_mutation_intent


def intent(attribution=None):
    value = {"event_type": "MUTATION_INTENT", "lifecycle_run_id": "r", "decision_id": "d"}
    if attribution is not None:
        value["mutation_attribution"] = attribution
    return value


def test_unresolved_intent_requires_missing_or_unknown_conclusive_attribution():
    assert unresolved_mutation_intent([intent()], "r") is True
    assert unresolved_mutation_intent([intent("UNKNOWN")], "r") is True
    assert unresolved_mutation_intent([intent("KNOWN_NOT_SENT")], "r") is False
    assert unresolved_mutation_intent([intent("KNOWN_SENT")], "r") is False


def test_recovery_classification_has_exact_two_nonterminal_branches():
    assert classify_run([{"event_type": "LIFECYCLE_RUN_BOUND", "lifecycle_run_id": "r"}], "r") == (
        "ACTIVE", "RECOVERY_REQUIRED_ACTIVE"
    )
    assert classify_run([{"event_type": "LIFECYCLE_RUN_BOUND", "lifecycle_run_id": "r"}, intent()], "r") == (
        "HOLDING_UNRESOLVED", "UNRESOLVED_INTENT"
    )


def test_terminal_precedes_recovery():
    assert classify_run([{"event_type": "LIFECYCLE_RUN_TERMINATED", "lifecycle_run_id": "r"}, intent()], "r") == (
        "TERMINAL", None
    )
