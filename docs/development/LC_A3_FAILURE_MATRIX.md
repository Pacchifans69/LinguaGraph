# LC_A3_FAILURE_MATRIX — enumerated conditions, decisions and outcomes

Legend for the Outcome column:
`SR` = Start allowed (exactly one) · `ST` = Stop allowed (exactly one)
`PR` = `policy_decision=PRESERVE_RUNNING` — observed_state=Running and not eligible to stop
`NM` = `MUTATION_POLICY=NO_FURTHER_MUTATION` — no mutation; observed state left exactly as found
`DIS` = ENTRY kill switch disabled — `decision_outcome=DISABLED_BY_KILL_SWITCH` and
        **no `policy_decision` is produced** (the policy evaluator did not execute)
`FC` = FAIL_CLOSED · `ESC` = escalate to Human
`ADM` = admission outcome — the request never became a lifecycle run

| # | Condition (observed) | Outcome | Notes |
|---|---|---|---|
| **PRE_TASK** ||||
| P1 | exactly 1 instance, Status=Running | SR: no / ST: n/a; proceed to endpoint guard | no start issued |
| P2 | exactly 1 instance, Status=Stopped | SR: one StartInstance | then bounded poll |
| P3 | Status=Starting or Stopping | NM (poll only) | never race a mutation |
| P4 | match_count=0 | FC | wrong instance id or wrong region |
| P5 | match_count>1 | FC | ambiguous target |
| P6 | Status unknown/absent/other value | FC | unrecognized provider state |
| P7 | Start sent, Running observed | continue | `provider_request_id` recorded if available |
| P8 | Start sent, window expires, still Stopped | ESC | `START_SENT_UNKNOWN` path; no attribution |
| P9 | Start response ambiguous (START_SENT_UNKNOWN) | reconcile only | §3.2 of STATE_MACHINE; never re-send |
| P10 | Start definitively rejected (4xx + request id) | ESC | no auto recovery (deferred design) |
| **ENDPOINT GUARD** ||||
| E1 | fresh public IP absent | FC, TASK_READY=NO | instance has no reachable endpoint |
| E2 | fresh private IP != 172.23.68.216 | FC | identity anomaly |
| E3 | host key fingerprint != pinned constant | FC, no login | never `StrictHostKeyChecking=no` |
| E4 | ssh-keyscan returns nothing | FC, no login | cannot establish identity |
| E5 | SSH unreachable within window | FC, TASK_READY=NO | do not fall back to a cached IP |
| E6 | IMDS instance-id mismatch | FC | endpoint is not the protected instance |
| E7 | IMDS region/zone mismatch | FC | endpoint is not the protected instance |
| E8 | all of E1–E7 pass | TASK_READY=YES | endpoint handed to agent |
| **POST_TASK** ||||
| S1 | SAFE_SUCCESS=YES, closure verified, no holds, automation enabled | ST: one StopInstance | the only row that may stop |
| S2 | SAFE_SUCCESS=NO (FAIL) | PR | instance stays up for inspection |
| S3 | SAFE_SUCCESS=NO (INDETERMINATE) | PR | |
| S4 | claim exists, no closure receipt | PR | RUN-02 shape; CLAIMED_INDETERMINATE=YES |
| S5 | receipt exists but digests mismatch artifacts | PR | receipt is not evidence of these artifacts |
| S6 | closure adapter missing / raises / times out | PR | fail closed, never default YES |
| S7 | FORENSIC_HOLD=YES | PR | |
| S8 | VOLATILE_EVIDENCE_HOLD=YES | PR | |
| S9 | HUMAN_REVIEW_REQUIRED=YES | PR | |
| S10 | PROVIDER_MUTATION_AMBIGUOUS=YES | PR | resolve before any new mutation |
| S11 | AUTOMATION_ENABLED=false | DIS | ENTRY check terminates before policy evaluation; `policy_decision` is absent/null; no `WOULD_START`/`WOULD_STOP`/`PRESERVE_RUNNING` is produced |
| S12 | durable `MUTATION_INTENT` with no conclusive attribution | run state `HOLDING_UNRESOLVED` + ESC | derived `recovery_status=UNRESOLVED_INTENT`; NON_TERMINAL; blocks admission of a new run; read-only reconciliation only; no blind retry; no inverse mutation; Human resolution must append a run-scoped `LIFECYCLE_RUN_TERMINATED` |
| **POST_STOP** ||||
| T1 | Status=Stopped AND StoppedMode=StopCharging | economical verified | `COMPUTE_ECONOMICAL_STOP_VERIFIED=YES` |
| T2 | Status=Stopped AND StoppedMode!=StopCharging | NM + ESC | leave stopped; `POWER_FINALIZATION=FAIL_ECONOMICAL_MODE_NOT_ESTABLISHED`; never claim cost saving |
| T3 | Status=Stopped AND StoppedMode missing/unknown | NM + ESC | leave stopped; unknown is not "yes" |
| T4 | Stop sent, window expires, still Running | NM + ESC | `STOP_SENT_UNKNOWN` path; ambiguous mutation, no further mutation |
| T5 | Status=Stopping beyond window | NM (keep polling) + ESC | never re-send |
| T6 | Stop definitively rejected | NM | instance still running; no auto recovery |
| **RUN ADMISSION (pre-bind)** ||||
| A1 | a NON_TERMINAL run already exists for the protected instance | ADM: RUN_CONFLICT, FC | admission outcome for a request that never became a lifecycle run; no `lifecycle_run_id` is allocated; no `LIFECYCLE_RUN_BOUND` event is appended; no workflow work begins |
| A2 | no NON_TERMINAL run exists for the protected instance | admission PASS | only now may `lifecycle_run_id` be allocated and `LIFECYCLE_RUN_BOUND` appended |
| **RUN BINDING / EVIDENCE PROVENANCE** ||||
| B0 | `LIFECYCLE_RUN_BOUND` append or fsync fails | FC | `WORK_MUST_NOT_BEGIN`; workflow work may not begin |
| B1 | `lifecycle_run_id` unknown, unbound, or with no durable `LIFECYCLE_RUN_BOUND` | FC | no adapter is invoked; `verify_bound` refuses before derivation |
| B2 | valid successful evidence from run A presented under bound lifecycle run B | NM, evidence rejected | `REJECT_STALE_OR_UNBOUND_EVIDENCE`; `SAFE_SUCCESS=NO`; `policy_decision != WOULD_STOP`; `provider_mutation_count=0` |
| B3 | Agent-supplied evidence locator outside the canonical namespace | ignored | Agent locators are never authoritative |
| B4 | historical RUN-02 / RUN-03 inspected through `inspect_historical_fixture` | `AUTHORITY_ELIGIBLE=false`, `BOUND_EVIDENCE=false` | test-only path; cannot feed `SAFE_SUCCESS`, `AUTO_STOP_ELIGIBLE` or `WOULD_STOP` |
| B5 | attempt to retroactively bind already-completed workflow evidence | NM, evidence rejected | `REJECT_STALE_OR_UNBOUND_EVIDENCE`; `SAFE_SUCCESS=NO`; historical M9 runs are never `BOUND_EVIDENCE` |
| B6 | local authoritative ledger wiped / lost / truncated / rotated, or restored to a state that cannot prove the binding | FC | binding authority unavailable; the controller MUST NOT reconstruct a binding from workflow evidence, receipt metadata, Agent input, or provider state |
| **CROSS-CUTTING** ||||
| X1 | provider returns throttling | NM, bounded backoff on READS only | never retry a mutation |
| X2 | STS session expired mid-flow | NM | re-assume is a new decision, requires Human policy |
| X3 | audit ledger append/fsync fails | NM | if the durable intent cannot be recorded, the provider mutation MUST NOT be sent |
| X4 | audit ledger event contains a secret (detected) | FC + ESC | design violation, §5 of AUDIT_SCHEMA |
| X5 | instance type / charge type drift (not PostPaid / not vpc / local storage added) | NM + ESC | economical-mode preconditions no longer hold |
| X6 | kill switch false at the ENTRY check (step 1) | DIS | `decision_outcome=DISABLED_BY_KILL_SWITCH`; ENTRY precedes every lifecycle policy evaluation, so **no `policy_decision` exists** on this path |
| X7 | ENTRY=true, PRE-SEND RECHECK false (step 9) | NM | `mutation_sent=false`; `provider_mutation_count=0`; durable decision outcome written so the durable intent is not left as `HOLDING_UNRESOLVED` |
| X8 | LC-A4 shadow controller (no actuator exists) | no `MUTATION_INTENT` | `actuation_supported=false`; `actuation_decision=NO_MUTATION`; `provider_mutation_count=0` |
| X9 | duplicate or non-contiguous durable `event_seq` | FC | ledger corruption; the single-writer serialization invariant is broken |

## Invariants asserted by this matrix

1. Only row `S1` may produce an automatic stop. Every other POST_TASK row is `PR`
   (observed_state=Running, not eligible to stop) or `NM`.
2. No row produces a second mutation of the same kind for the same incident.
3. No row authorizes `ForceStop=true`.
4. No row permits `StrictHostKeyChecking=no`.
5. Every `FC`/`ESC` row leaves the instance in a state a Human can inspect.
6. No row may label a Stopped, ambiguous-mutation, or post-stop outcome
   `PRESERVE_RUNNING`; those rows are `NM`.
7. No row may produce a provider mutation without a durable `MUTATION_INTENT` event
   written and fsynced before the send.
8. No row may treat an Agent-supplied evidence locator as authoritative.
9. No row may permit workflow work to begin without a durable `LIFECYCLE_RUN_BOUND`
   event for the current `lifecycle_run_id`, and no row may bind before admission passes.
10. No row may allow a second active `lifecycle_run_id` on one protected instance;
    `RUN_CONFLICT` is decided at admission, before allocation.
11. The ENTRY kill-switch check precedes every lifecycle policy evaluation; no row may
    invert that order.
12. `policy_decision=WOULD_START` / `WOULD_STOP` is never by itself a violation. Only a
    provider mutation send, `mutation_action != null`,
    `actuation_decision != NO_MUTATION`, or `provider_mutation_count != 0` is.
13. On the ENTRY-disabled path, `policy_decision` MUST be absent/null. No row may attach
    `PRESERVE_RUNNING` (or any policy value) to a disabled ENTRY outcome.
14. `UNRESOLVED_INTENT` / `HOLDING_UNRESOLVED` is NON_TERMINAL and blocks admission; it
    is never a `decision_outcome` value.
15. No row may feed `SAFE_SUCCESS` or a policy decision from the historical
    `inspect_historical_fixture` path.
16. No row may reconstruct binding authority from workflow evidence, receipt metadata,
    Agent input, or provider state after ledger loss.

`DESIGN_DECISION`: rows P8, P10, T2, T3, T4, T5, S12 deliberately escalate rather
than self-heal. Automation that repairs its own uncertainty is harder to audit than
automation that admits it.

## 4. Ledger and recovery extensions

| ID | Condition | Expected outcome | Required evidence / constraint |
|---|---|---|---|
| A3 | prior TERMINAL run and no NON_TERMINAL run | admission PASS | immutable terminal history does not block a new binding |
| R0 | second authoritative writer cannot be denied | `LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE` | `LC-A4_LEDGER_ACCEPTANCE=BLOCKED`, not PASS |
| R1 | bound run survives startup without terminal event or unresolved intent | `ACTIVE` / `RECOVERY_REQUIRED_ACTIVE` | NON_TERMINAL; block admission; Human review; no automatic continuation or provider mutation |
| R2 | unresolved intent survives startup | `HOLDING_UNRESOLVED` / `UNRESOLVED_INTENT` | NON_TERMINAL; block admission |
| B7 | historical fixture inspected | test-only output | no authoritative ledger event or fabricated lifecycle_run_id |

## 5. Attribution and closure extensions

| ID | Condition | Expected outcome | Required evidence / constraint |
|---|---|---|---|
| R3 | startup after exclusive writer acquisition; pre-existing NON_TERMINAL run with unresolved_mutation_intent(run)=true | HOLDING_UNRESOLVED / UNRESOLVED_INTENT | Human review, no automatic continuation or mutation |
| R4 | same, unresolved_mutation_intent(run)=false | ACTIVE / RECOVERY_REQUIRED_ACTIVE | Human review, no automatic continuation or mutation |
| R5 | only PRE_TASK DECISION_OUTCOME | normal termination DENIED | required POST_TASK outcome absent |
| R6 | all seven normal-closure predicates pass | NORMAL_CONTROLLER_CLOSURE | SAFE_SUCCESS=YES is not required |
| R7 | prior TERMINAL binding and no NON_TERMINAL run | admission PASS | no GC or deletion required |
| X11 | Agent attempts HUMAN_RESOLVED or requests synthesis | DENIED | otherwise LC-A4_SECURITY_ACCEPTANCE=BLOCKED |

## 6. Final decision and terminal cases

| ID | Condition | Expected outcome | Required evidence / constraint |
|---|---|---|---|
| K1 | ENTRY disabled in PRE_TASK context | PRE_TASK DECISION_OUTCOME | no policy_decision; NOT_APPLICABLE; DISABLED_BY_KILL_SWITCH; cannot satisfy required POST_TASK outcome |
| K2 | ENTRY disabled in POST_TASK context | POST_TASK DECISION_OUTCOME | no policy_decision; NOT_APPLICABLE; DISABLED_BY_KILL_SWITCH; may satisfy POST_TASK outcome if other closure predicates pass |
| R8 | open_decision_exists(lifecycle_run_id)==true | normal termination DENIED | a crash or missing worker does not close a decision |
| R9 | LIFECYCLE_RUN_TERMINATED already exists for lifecycle_run_id | TERMINATION_ALREADY_RECORDED | DENIED / FAIL_CLOSED; no second append even with a distinct event_seq |
