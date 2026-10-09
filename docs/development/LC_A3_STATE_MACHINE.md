# LC_A3_STATE_MACHINE — PRE_TASK / POST_TASK, mutation and reconciliation contract

## 1. PRE_TASK state machine (ENSURE_RUNNING)

Trigger: agent requests `ENSURE_RUNNING`. The controller performs this itself; the
agent never calls ECS.

```
DescribeInstances --InstanceIds ["<exact id>"]     (read-only)

match_count != 1                      -> FAIL_CLOSED, TASK_READY=NO
Status == Running                     -> no StartInstance; go to ENDPOINT GUARD
Status == Stopped                     -> send exactly one StartInstance; go to RECONCILE_START
Status in {Starting, Stopping}        -> read-only bounded polling ONLY; on settle re-dispatch; never race
Status unknown / absent / other       -> FAIL_CLOSED, TASK_READY=NO
```

`DESIGN_DECISION` — polling is read-only and bounded; the controller never issues a
second lifecycle mutation while a transition is in flight. `PROVEN_IN_LC_A2`:
`Starting>Running` and `Stopped` transitions were observable by `DescribeInstanceStatus`.

### RECONCILE_START
```
poll DescribeInstanceStatus until Status==Running (bounded window)
Running observed        -> proceed to ENDPOINT GUARD
window expired          -> LC_A3 outcome BLOCKED_START_NOT_CONFIRMED;
                           PRESERVE_OBSERVED_STATE; escalate
start response ambiguous-> see §3 START_SENT_UNKNOWN
```

### ENDPOINT GUARD (mandatory; TASK_READY=YES only if all pass)
```
1. fresh DescribeInstances by exact InstanceId -> exactly 1, Status=Running
2. POST_START_PUBLIC_IP from THAT response       (cached IP is never authority)
3. ssh-keyscan ED25519 against that fresh IP
4. fingerprint MUST equal the pinned constant
      SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg
   mismatch -> SSH_IDENTITY_GUARD=FAIL, TASK_READY=NO, STOP (never StrictHostKeyChecking=no)
5. SSH with per-call -o HostName=<fresh ip>, temp known_hosts, StrictHostKeyChecking=yes
6. IMDSv2 identity guard: instance-id / region / zone exact match
7. only now: TASK_READY=YES, endpoint handed to the agent
```
`PROVEN_IN_LC_A2`: every step 1–6 was executed successfully, including the exact
fingerprint match and IMDS `cn-hongkong` / `cn-hongkong-d`.

`UNPROVEN_IMPLEMENTATION_ASSUMPTION`: that the endpoint guard can be made
*mandatory* in code rather than advisory. The proof requires an automated test that
demonstrates the agent cannot obtain an endpoint except through the guard.

---

## 2. POST_TASK state machine

```
Admission gate (before any lifecycle_run_id exists):
    RUN_ADMISSION_CHECK(instance_id)
    a NON_TERMINAL run already exists for this instance
                                               -> RUN_CONFLICT, FAIL_CLOSED
                                               -> do NOT allocate lifecycle_run_id
                                               -> do NOT append LIFECYCLE_RUN_BOUND
                                               -> do NOT begin workflow work
Binding gate (controller-side only):
    LIFECYCLE_RUN_BOUND is durable for the controller-owned lifecycle_run_id,
    and the binding is immutable once that event is fsynced
    unknown / unbound lifecycle_run_id         -> FAIL_CLOSED
    authoritative ledger cannot prove the binding -> FAIL_CLOSED
    ENTRY kill-switch check                    -> see §3; precedes all policy evaluation

AUTO_STOP_ELIGIBLE = AND of ALL of:
    SAFE_SUCCESS                 = YES
    EVIDENCE_BOUND_TO_RUN        = YES
    DURABLE_CLOSURE_COMPLETE     = YES
    PROVIDER_MUTATION_AMBIGUOUS  = NO
    CLAIMED_INDETERMINATE        = NO
    FORENSIC_HOLD                = NO
    VOLATILE_EVIDENCE_HOLD       = NO
    HUMAN_REVIEW_REQUIRED        = NO
    AUTOMATION_ENABLED           = true

AUTO_STOP_ELIGIBLE == YES -> policy_decision=WOULD_STOP
                          -> send exactly one StopInstance(ForceStop=false, StoppedMode=StopCharging)
otherwise, observed_state=Running
                          -> policy_decision=PRESERVE_RUNNING
                          -> POWER_POLICY=PRESERVE_RUNNING
otherwise, observed_state!=Running
                          -> MUTATION_POLICY=NO_FURTHER_MUTATION
                          -> PRESERVE_OBSERVED_STATE
```

`DESIGN_DECISION`: `policy_decision` is produced by the policy evaluator and is
recorded separately from what the actuator is able to do. In LC-A4
`actuation_supported=false` and `actuation_decision=NO_MUTATION`. A fully valid and
correctly bound `SAFE_SUCCESS` MUST still yield `policy_decision=WOULD_STOP`, so that
the evaluator is proven rather than merely inert. `WOULD_START` and `WOULD_STOP` are
**legal and necessary** outcomes of the shadow evaluator; what LC-A4 must never produce
is a provider mutation send, `mutation_action != null`,
`actuation_decision != NO_MUTATION`, or `provider_mutation_count != 0`.

`DESIGN_DECISION`: the ENTRY kill-switch check precedes this evaluation. If
`AUTOMATION_ENABLED != true` at ENTRY, the decision terminates with
`DECISION_OUTCOME=DISABLED_BY_KILL_SWITCH` and **no `policy_decision` at all** — the
evaluator never runs, so no `WOULD_START`, no `WOULD_STOP` and no `PRESERVE_RUNNING` is
produced.

Post-stop verification (mandatory):
```
poll Status until Stopped
DescribeInstances exact instance:
    Status=Stopped AND StoppedMode=StopCharging -> COMPUTE_ECONOMICAL_STOP_VERIFIED=YES
    Status=Stopped AND StoppedMode!=StopCharging -> POWER_FINALIZATION=FAIL_ECONOMICAL_MODE_NOT_ESTABLISHED
    Status!=Stopped after bounded window         -> INDETERMINATE_STOP_TRANSITION
```
`PROVEN_IN_LC_A2`: `Stopped` + `StopCharging` was returned for this instance, and the
public IP was released while stopped.

Billing wording contract (frozen): never emit `ALL_BILLING_STOPPED`. Even a verified
economical stop leaves retained resources (system disk, snapshots) potentially billable.

---

## 3. Mutation contract (single-send) and ambiguity reconciliation

Rules for EVERY lifecycle mutation:
```
single-send
request sent => budget spent   (even if the response is lost or unreadable)
no blind retry
ambiguous response => provider-state reconciliation ONLY
MUTATION_INTENT append + fsync MUST complete before the send
MUTATION_INTENT append/fsync failure => the mutation MUST NOT be sent
kill-switch ENTRY check precedes every lifecycle policy evaluation
kill-switch PRE-SEND RECHECK runs after the durable intent and before the send
```

Admission and ledger ordering (LC_A3_ARCHITECTURE.md §3 steps 0a-12,
LC_A3_AUDIT_SCHEMA.md §2.2):

```
RUN_ADMISSION_CHECK  (before lifecycle_run_id allocation; RUN_CONFLICT stops here and
                      produces no lifecycle-run event)
LIFECYCLE_RUN_BOUND  (once per run; append + fsync BEFORE workflow work begins)
KILL_SWITCH_CHECK    (ENTRY)
DECISION_EVALUATED
MUTATION_INTENT      -> append + fsync
KILL_SWITCH_CHECK    (PRE_SEND)
---- provider mutation send ----
MUTATION_RESPONSE    (absent if the response was lost)
RECONCILIATION       (read-only, bounded)
DECISION_OUTCOME
```

The ENTRY check MUST come before `DECISION_EVALUATED`. Kill switch disabled at ENTRY
terminates the decision **before** any policy evaluation:
```
KILL_SWITCH_CHECK    (ENTRY, automation_enabled=false)
DECISION_OUTCOME        (DISABLED_BY_KILL_SWITCH)
-- no policy_decision is produced
```
No `WOULD_START` / `WOULD_STOP` / `PRESERVE_RUNNING` is emitted on that path.

`DESIGN_DECISION`: LC-A4 is a shadow controller and has no actuator. It MUST NOT emit
`MUTATION_INTENT`, and it therefore cannot provide end-to-end runtime proof of the
`MUTATION_INTENT -> PRE-SEND RECHECK -> provider send` path. LC-A4 proves the ENTRY
runtime behaviour, the PRE-SEND guard logic in isolation, and the static contract
ordering; `REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF` is
`DEFERRED_TO_FUTURE_ACTUATOR_STAGE`. A synthetic shadow `MUTATION_INTENT` MUST NOT be
emitted in order to imitate that path.

### 3.1 Ambiguity classes
```
START_SENT_UNKNOWN : StartInstance was transmitted; no trustworthy response
STOP_SENT_UNKNOWN  : StopInstance  was transmitted; no trustworthy response
```
Causes: timeout, connection reset, 5xx, truncated/garbled body, controller crash
between send and record.

### 3.2 Reconciliation procedure (never re-send)
```
for START_SENT_UNKNOWN:
    poll DescribeInstanceStatus / DescribeInstances (read-only, bounded)
      Status=Running                       -> treat start as having occurred
                                              record provider_request_id=UNKNOWN
      Status=Starting                      -> continue bounded polling
      Status=Stopped and window expired    -> INDETERMINATE;
                                              MUTATION_POLICY=NO_FURTHER_MUTATION;
                                              HUMAN_REVIEW_REQUIRED=YES
      any other / can't read               -> FAIL_CLOSED; HUMAN_REVIEW_REQUIRED=YES

for STOP_SENT_UNKNOWN:
    poll DescribeInstanceStatus / DescribeInstances (read-only, bounded)
      Status=Stopped                       -> stop DID occur; verify StoppedMode
                                              -> economical vs FAIL_ECONOMICAL_MODE_NOT_ESTABLISHED
      Status=Stopping                      -> continue bounded polling
      Status=Running and window expired    -> INDETERMINATE; instance left running
                                              HUMAN_REVIEW_REQUIRED=YES
```
`DESIGN_DECISION`: reconciliation never issues a compensating mutation on its own.
The controller will not start an instance it may have just stopped, nor stop one it
may have just started.

`DESIGN_DECISION` — **deferred, requires explicit Human approval**: the only case
where a *recovery mutation* might be justified is a **definite provider rejection**
(not ambiguity) — e.g. a 4xx with a request id proving nothing was accepted — followed
by reconciliation confirming the instance is still in the pre-mutation state. This
checkpoint deliberately does NOT authorize that behaviour for LC-A4; the minimum
implementation escalates to a Human instead. Rationale: "definite rejection" is easy
to misclassify, and the cost of a wrong recovery mutation is higher than the cost of
a Human intervention.

### 3.3 Crash with a durable intent — run state `HOLDING_UNRESOLVED`

If a `MUTATION_INTENT` event is durable, the controller then crashes, and no
durable conclusive `mutation_attribution` exists for that `decision_id`, the run
is in state `HOLDING_UNRESOLVED`. A `DECISION_OUTCOME` with `UNKNOWN` remains
unresolved:

```
derived recovery_status = UNRESOLVED_INTENT     (derived from ledger shape)
NON_TERMINAL
blocks admission of a new lifecycle run for the same protected instance
```

On the next start the controller MUST:

```
read-only provider reconciliation ONLY
no blind retry
no inverse / compensating mutation
no automatic recovery mutation
Human resolution required -> must append a run-scoped LIFECYCLE_RUN_TERMINATED
```

It MUST NOT infer that the send did or did not happen. `UNRESOLVED_INTENT` is derived
from ledger shape and MUST NOT itself be written as a `decision_outcome` value — the whole
point is that the run-scoped `LIFECYCLE_RUN_TERMINATED` is absent.

`UNPROVEN_IMPLEMENTATION_ASSUMPTION`: exactly-once send semantics across a controller
crash. If the controller dies after the syscall but before recording the response
event, the next start cannot know whether the request was transmitted. The design
mitigates this with a write-ahead `MUTATION_INTENT` event (appended and fsynced before
the send), but the adequacy of that mitigation is untested. **This design does NOT
claim distributed exactly-once delivery.** A `HOLDING_UNRESOLVED` run is resolved by
read-only reconciliation and Human escalation, never by retry.

Ledger writes are serialized by a single writer (LC_A3_AUDIT_SCHEMA.md §3.2). A crash
before an append does not allocate the next `event_seq` and therefore leaves no semantic
gap: the value is re-derived from the last durable event on restart.

`DECISION_OUTCOME` closes one `decision_id` and never terminates a lifecycle run.
Only run-scoped `LIFECYCLE_RUN_TERMINATED`, without `decision_id`, makes the run
TERMINAL. A PRE_TASK `STARTED` decision leaves its workflow run NON_TERMINAL.
An early crash after durable binding and before a decision is ACTIVE with
`RECOVERY_REQUIRED_ACTIVE`, admission-blocking, without automatic continuation
or provider mutation; Human review is required.

### 3.4 Restart classifier and normal termination

Claim exclusive ledger-writer ownership before scanning. Failure means
`LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE`,
`LC-A4_LEDGER_ACCEPTANCE=BLOCKED`, STOP. For a pre-existing NON_TERMINAL run:

```
IF unresolved_mutation_intent(run): HOLDING_UNRESOLVED / UNRESOLVED_INTENT
ELSE: ACTIVE / RECOVERY_REQUIRED_ACTIVE
```

Both remain NON_TERMINAL and admission-blocking, require Human review, and allow
no automatic continuation or provider mutation. A run bound by this process after
startup is ordinary ACTIVE. No PID, heartbeat, lease, ownership-proof, or separate
mutation-attribution branch is used.

`mutation_attribution = NOT_APPLICABLE | KNOWN_NOT_SENT | KNOWN_SENT | UNKNOWN`.
`unresolved_mutation_intent(run)` means a durable `MUTATION_INTENT` exists and
no durable conclusive attribution exists for that `decision_id`. The conclusive
values are `KNOWN_NOT_SENT` and `KNOWN_SENT`; `UNKNOWN` and missing are not.
`DECISION_OUTCOME` alone never resolves `MUTATION_INTENT`.

A run may terminate normally only after a durable POST_TASK `DECISION_OUTCOME`,
no open decision, no unresolved intent or recovery status, healthy bound ledger,
and completion of required POST_TASK checks or their defined fail-closed outcomes.
PRE_TASK-only closure is forbidden, and `SAFE_SUCCESS=YES` is not required.

### 3.5 Open decisions, phase preservation, and terminal uniqueness

`open_decision(decision_id)` means at least one durable decision-scoped event
exists for that decision_id and no durable DECISION_OUTCOME exists.
`open_decision_exists(lifecycle_run_id)` means an open decision's durable events
bind to that run. Normal termination requires this predicate to be false. Process
death, worker absence, and provider state do not close a decision.

ENTRY-disabled outcomes preserve current `decision_phase`: PRE_TASK => PRE_TASK
and POST_TASK => POST_TASK. Both append DECISION_OUTCOME with
`decision_outcome=DISABLED_BY_KILL_SWITCH`, no policy_decision, and
`mutation_attribution=NOT_APPLICABLE`. A POST_TASK disabled outcome may satisfy
normal closure's required POST_TASK outcome if all other predicates pass.

For every lifecycle_run_id, `count(durable LIFECYCLE_RUN_TERMINATED) <= 1`.
Before either termination path, an existing terminal event yields
`TERMINATION_ALREADY_RECORDED`, DENIED / FAIL_CLOSED. No second append is
permitted; event_seq uniqueness is a separate invariant.
