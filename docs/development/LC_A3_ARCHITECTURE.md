# LC_A3_ARCHITECTURE — Automatic Lifecycle Authority Contract

Checkpoint: ECS-LC-A3 (DESIGN ONLY). No implementation is authorized or present.

Provenance labels used throughout:
- `PROVEN_IN_LC_A2` — empirically observed provider behaviour, not an assumption.
- `PROVEN_IN_M9_RUN02` — observed in the M9 reference workflow RUN-02 only.
- `PROVEN_IN_M9_RUN03` — observed in the M9 reference workflow RUN-03 only.
- `DESIGN_DECISION` — a choice made here that requires Human approval.
- `UNPROVEN_IMPLEMENTATION_ASSUMPTION` — something the design relies on that has NOT been tested.

`PROVEN_IN_M9_RUN02` / `PROVEN_IN_M9_RUN03` are **historical, run-scoped** labels.
They may not be widened to each other, and they are not evidence of `BOUND_EVIDENCE`.

---

## 1. Frozen authority invariant

```
PROOF_AUTHORITY != ECS_LIFECYCLE_AUTHORITY != ACCOUNT_ROOT
```
`DESIGN_DECISION` (inherited, already enforced in RAM — see LC-A1R2/LC-A1R2-RP2)

Lifecycle mutation authority is carried ONLY by:

```
LinguaGraphECSLifecycleController   (bootstrap RAM user, assume-only)
  -> sts:AssumeRole
  -> LinguaGraphECSLifecycleRole    (900 s STS session)
```

Least-privilege policy is frozen and MUST NOT be widened:

```
ecs:DescribeInstances       -> acs:ecs:cn-hongkong:1407977619484420:instance/i-j6c9854oyawy89fcdxy2
ecs:StartInstance           -> acs:ecs:cn-hongkong:1407977619484420:instance/i-j6c9854oyawy89fcdxy2
ecs:StopInstance            -> acs:ecs:cn-hongkong:1407977619484420:instance/i-j6c9854oyawy89fcdxy2
ecs:DescribeInstanceStatus  -> Resource:"*"   (provider requires it; accepted residual read exposure)
```
`PROVEN_IN_LC_A2`: this exact scope set successfully performed DescribeInstances, DescribeInstanceStatus, a real StopInstance, and a real StartInstance.

---

## 2. Components

```
+---------------------------+
| Proof / task agent        |   holds PROOF authority only
| (untrusted for lifecycle) |   NEVER holds the bootstrap secret, NEVER holds STS
+-------------+-------------+
              | (1) request: ENSURE_RUNNING / closure claim
              |     local IPC, no cloud credentials
              v
+---------------------------+
| Lifecycle controller      |   sole holder of lifecycle mutation authority
|  - admission guard        |   - RUN_ADMISSION_CHECK before allocating lifecycle_run_id
|  - run binder             |   - allocates lifecycle_run_id, appends LIFECYCLE_RUN_BOUND
|  - decision engine        |   - ENTRY kill switch BEFORE any lifecycle policy evaluation
|  - durable closure adapter|   - performs PRE_TASK / POST_TASK state machines
|  - single-send mutator    |   - LC-A4: absent; no actuator is compiled in
|  - ledger writer          |   - single serialized writer of the append-only event ledger
|  - endpoint guard         |   - owns AssumeRole and the 900 s STS
+-------------+-------------+
              | (2) sts:AssumeRole (bootstrap secret stays here)
              v
+---------------------------+
| Alibaba Cloud ECS (IAM)   |   enforces the 4-action frozen policy
+---------------------------+
```

### 2.1 Why the agent must not hold mutation authority
`DESIGN_DECISION`

The agent's own success claim is not authoritative (see §4 of LC_A3_SAFE_SUCCESS_CONTRACT).
If the agent held lifecycle credentials it could stop the instance on a false
success claim, and could not be prevented by the controller. The request/response
boundary makes the controller the decision point and keeps the agent's blast
radius at "can ask".

`UNPROVEN_IMPLEMENTATION_ASSUMPTION`: the local IPC boundary is assumed to be
sufficient to prevent the agent from invoking lifecycle mutations directly. This
holds only if the bootstrap secret and STS are never exposed to the agent's
process, filesystem namespace, or environment. That property has not been tested.

### 2.2 Credential handling
`DESIGN_DECISION`
- The bootstrap secret is read from the Windows Credential Store at controller start.
- `sts:AssumeRole` is performed once per controller session; the 900 s STS is held in
  controller memory only (`PROVEN_IN_LC_A2` that the keeper pattern retains it safely).
- STS credentials are never written to argv, files, CLI profiles, logs, audit records,
  or shell history; they are destroyed when the session ends.
- The audit record MUST NOT contain any secret (`LC_A3_AUDIT_SCHEMA.md` §5).

---

## 3. Authority decision points

Every automatic lifecycle mutation passes exactly one choke point, which evaluates
in this canonical order and fails closed at the first negative:

```
 0a. RUN_ADMISSION_CHECK     no NON_TERMINAL run for this instance ?
                                                                 else -> RUN_CONFLICT, FAIL_CLOSED
 0b. LIFECYCLE_RUN_BOUND append + fsync   once per run, BEFORE workflow work begins
                                                                 else -> WORK_MUST_NOT_BEGIN, FAIL_CLOSED
 1. kill-switch ENTRY check  AUTOMATION_ENABLED == true ?
                                 else -> DISABLED; no policy_decision; no mutation
 2. binding / identity       lifecycle_run_id bound, and exactly one exact InstanceId ?
                                                                 else -> FAIL_CLOSED
 3. provider-state verify    DescribeInstances / DescribeInstanceStatus fresh read
                                                                 else -> FAIL_CLOSED
 4. workflow closure verify  see LC_A3_SAFE_SUCCESS_CONTRACT.md  else -> policy_decision=PRESERVE_RUNNING
 5. hold evaluation          forensic / volatile / human-review  else -> policy_decision=PRESERVE_RUNNING
 6. policy decision          policy_decision = WOULD_START | WOULD_STOP
                                              | PRESERVE_RUNNING | NO_ACTION_REQUIRED
                                              | FAIL_CLOSED
 7. single-send budget       not already spent for this decision_id
                                                                 else -> reconciliation only
 8. MUTATION_INTENT append + fsync   MUST complete before send   else -> no send, durable decision outcome
 9. kill-switch PRE-SEND RECHECK     AUTOMATION_ENABLED == true ? else -> mutation_sent=false,
                                                                          provider_mutation_count=0
10. ---- provider mutation send ---- (budget becomes spent at send time)
11. reconciliation          read-only provider observation; never blind retry
12. DECISION_OUTCOME append closes one decision_id only; MUST NOT terminate the run
13. LIFECYCLE_RUN_TERMINATED append   run-scoped; only after normal closure or Human resolution
```

`DESIGN_DECISION` — ordering invariants that MUST NOT be reordered:

- Step 0a (`RUN_ADMISSION_CHECK`) MUST run **before** `lifecycle_run_id` is allocated and
  before any `LIFECYCLE_RUN_BOUND` event is appended.
- Step 0b is a **run-identity precondition**, not a policy evaluation. It is the only
  step that happens once per run instead of once per decision.
- Step 1 (`KILL_SWITCH_CHECK`, phase `ENTRY`) MUST precede **every** lifecycle policy
  evaluation. When step 1 fails, no `WOULD_START` and no `WOULD_STOP` may be produced.
- Step 8 (durable `MUTATION_INTENT`) MUST precede step 9 (PRE-SEND recheck), which MUST
  precede step 10 (provider send).

`DESIGN_DECISION`: the kill switch is evaluated at step 1 *at decision time*, not
only at controller start, so it can take effect for the very next decision; and it is
re-checked at step 9, after the durable intent and immediately before the send
(LC_A3_AUDIT_SCHEMA.md §6.4).

**ENTRY-disabled path.** When `AUTOMATION_ENABLED != true` at step 1, the decision
terminates before any lifecycle policy evaluation:

```
KILL_SWITCH_CHECK(ENTRY, automation_enabled=false)
DECISION_OUTCOME(DISABLED_BY_KILL_SWITCH)
-- no policy_decision is produced; the policy evaluator did not execute
```

`policy_decision` is therefore **absent / null** on this path. `PRESERVE_RUNNING`,
`WOULD_START` and `WOULD_STOP` are all incorrect here.

Honest limitation: step 9 and step 10 are **not** one atomic cross-system operation.
The recheck narrows the window between check and send; it cannot close it, and a kill
switch cannot recall a mutation already transmitted (R5). The design MUST NOT claim
that the check and the provider API call are atomic.

### 3.1 Controller-owned lifecycle run admission and binding

Admission is checked **before** any lifecycle run identity exists:

```
RUN_ADMISSION_CHECK(instance_id)
  if a NON_TERMINAL run already exists for this protected instance:
      admission_outcome = RUN_CONFLICT
      FAIL_CLOSED
      DO NOT allocate a lifecycle_run_id
      DO NOT append a LIFECYCLE_RUN_BOUND event
      DO NOT begin workflow work
```

`RUN_CONFLICT` is an **admission outcome** for a request that never became a lifecycle
run. It is **not** a lifecycle run `decision_outcome`, and no provider mutation, binding,
or retroactive `lifecycle_run_id` may be invented merely to audit the conflict.

Only after admission passes:

```
allocate lifecycle_run_id
  -> append LIFECYCLE_RUN_BOUND
  -> fsync succeeds
  -> ONLY THEN may workflow work begin
```

Before any workflow work begins the controller creates `lifecycle_run_id` and records
an immutable binding:

```
lifecycle_run_id <-> instance_id <-> requesting_workflow <-> workflow_run_identity
```

The binding is made durable by appending a `LIFECYCLE_RUN_BOUND` event to the local
event ledger and fsyncing it (LC_A3_AUDIT_SCHEMA.md §2.4). If the append or the `fsync`
fails: `WORK_MUST_NOT_BEGIN`, FAIL_CLOSED. A `lifecycle_run_id` whose
`LIFECYCLE_RUN_BOUND` event is not durable is **not bound** and MUST be treated as
unknown.

`DESIGN_DECISION`: the binding is created by the controller and is **immutable once the
`LIFECYCLE_RUN_BOUND` event is durable**: no rebind, no overwrite, no repoint. The
agent cannot create, extend, re-point, or re-bind it. An unknown or unbound
`lifecycle_run_id` => FAIL_CLOSED. In LC-A4, automatic binding garbage collection is
**disabled**: durable bindings are retained rather than reaped.

**Ledger loss destroys binding authority.** If the local authoritative ledger is wiped,
lost, truncated, rotated, or restored to a
state that cannot prove the binding:

```
BINDING_AUTHORITY_UNAVAILABLE => FAIL_CLOSED
```

The controller MUST NOT reconstruct a binding from workflow evidence, receipt metadata,
Agent input, or provider state.

`DESIGN_DECISION` — mutually exclusive lifecycle states, derived in precedence order:

```
1. TERMINAL            durable LIFECYCLE_RUN_TERMINATED exists
2. HOLDING_UNRESOLVED  no terminal event; unresolved MUTATION_INTENT exists
                       => recovery_status=UNRESOLVED_INTENT; NON_TERMINAL; admission blocked
3. ACTIVE              no terminal event; no unresolved intent; durable LIFECYCLE_RUN_BOUND exists
                       => NON_TERMINAL; admission blocked
```

`HOLDING_UNRESOLVED` is NON_TERMINAL and blocks admission. A crash after binding
but before any decision remains ACTIVE with `RECOVERY_REQUIRED_ACTIVE`; it also blocks
admission, forbids automatic continuation and provider mutation, and requires Human
review. `UNRESOLVED_INTENT` and `RECOVERY_REQUIRED_ACTIVE` are recovery statuses, not
`decision_outcome` or `run_terminal_reason` values. Human resolution requires a
run-scoped durable `LIFECYCLE_RUN_TERMINATED` event.

POST_TASK resolution is controller-side only:

```
agent identifies lifecycle_run_id
  -> controller resolves the bound workflow_run_identity
  -> durable closure adapter derives the canonical evidence namespace / locators
```

`DESIGN_DECISION`: an Agent-supplied evidence locator MUST NOT be authoritative. The
adapter derives locators from the bound identity, never from agent input.

`DESIGN_DECISION` — no retroactive binding. A `LIFECYCLE_RUN_BOUND` event created now
cannot satisfy "binding exists before work begins" for workflow evidence that is already
complete. Already-completed evidence MUST NOT be retroactively bound; the attempt is
rejected as `REJECT_STALE_OR_UNBOUND_EVIDENCE`.

---

## 4. Default posture

`DESIGN_DECISION`

```
DEFAULT_POWER_POLICY = PRESERVE_RUNNING
```

`POWER_POLICY=PRESERVE_RUNNING` has exactly one meaning:

```
observed_state = Running
AND the current POST_TASK decision is not eligible to stop
```

It describes a Running instance that is deliberately left running. It MUST NOT be
used to describe a Stopped instance, an ambiguous mutation, or a post-stop anomaly, and
it MUST NOT be used for the ENTRY-disabled path (which produces no `policy_decision`).

For every other case:

```
MUTATION_POLICY = NO_FURTHER_MUTATION
PRESERVE_OBSERVED_STATE           (observed state left exactly as found)
ESCALATE = YES                    (where attribution is unknown)
```

Automatic stop is an exception that must be positively justified by the full
conjunction in LC_A3_SAFE_SUCCESS_CONTRACT.md. Any missing, unknown, unreadable, or
contradictory input yields `MUTATION_POLICY=NO_FURTHER_MUTATION`, and
`POWER_POLICY=PRESERVE_RUNNING` only when the observed state is Running. The
controller never stops an instance because it "could not find a reason not to".

---

## 5. Open risks carried into implementation

| id | risk | label |
|---|---|---|
| R1 | Public IP is released on economical stop and re-issued; a re-issued value MAY be identical (observed `47.238.211.55`). Any caching of the address is a latent failure. | `PROVEN_IN_LC_A2` for release; `UNPROVEN_IMPLEMENTATION_ASSUMPTION` for value variance over time |
| R2 | Economical-mode eligibility was proven by a single stop. Repeatability, AZ capacity variance, and address-pool behaviour are untested. | `UNPROVEN_IMPLEMENTATION_ASSUMPTION` |
| R3 | `DescribeInstanceStatus` requires `Resource:"*"`, so the controller can read account-wide status metadata. Accepted residual exposure. | `PROVEN_IN_LC_A2` |
| R4 | The frozen ED25519 host key must be updated by a Human if the instance is legitimately rebuilt. An automatic path to update it would defeat the guard. | `DESIGN_DECISION` |
| R5 | A kill switch cannot recall a mutation already sent; it only prevents the next one. | `DESIGN_DECISION` |
| R6 | A valid success from an earlier lifecycle run could be replayed under a later run unless evidence is bound to the current `lifecycle_run_id`. | `DESIGN_DECISION` |
| R7 | Two concurrent workflows on one protected instance could interleave ledger writes and destroy binding authority and `event_seq` monotonicity. Mitigated in LC-A4 by a pre-bind admission check plus a single serialized ledger writer. | `DESIGN_DECISION` |
| R8 | LC-A4 has no actuator, so it cannot runtime-prove the post-intent PRE-SEND recheck or the provider send path; that proof is deferred to a future actuator stage. | `UNPROVEN_IMPLEMENTATION_ASSUMPTION` |
| R9 | A run left in `HOLDING_UNRESOLVED` blocks admission of new runs for its instance until a Human appends a run-scoped `LIFECYCLE_RUN_TERMINATED`; without that resolution the instance is permanently non-admitting. | `DESIGN_DECISION` |
| R10 | Loss of the local authoritative ledger destroys binding authority outright; LC-A4 deliberately does not reconstruct bindings from evidence or provider state. | `DESIGN_DECISION` |

## 6. Run-scoped termination and single canonical ledger

`DECISION_OUTCOME` carries `decision_id` and closes only that decision. It MUST NOT
make the lifecycle run TERMINAL. PRE_TASK `STARTED` leaves the run NON_TERMINAL.
`LIFECYCLE_RUN_TERMINATED` is run-scoped, carries no `decision_id`, and is the ONLY
event making `run_state=TERMINAL`; its `run_terminal_reason` is
`NORMAL_CONTROLLER_CLOSURE` or `HUMAN_RESOLVED`. Normal shadow termination awaits
the required lifecycle/workflow closure sequence. Automatic recovery cannot invent
a Human resolution.

LC-A4 has exactly one current canonical local authoritative ledger. It does not
support rotation, archive chaining, backup reconstruction, retained-segment
reconstruction, or binding reconstruction from secondary sources. Missing, truncated,
corrupt, non-contiguous, unexpectedly replaced, rotated, or unprovably restored
ledger state yields `BINDING_AUTHORITY_UNAVAILABLE`, `FAIL_CLOSED`.

## 7. Deterministic startup recovery and mutation attribution

At controller-process startup, first establish exclusive authoritative-ledger writer
ownership. If exclusivity cannot be established, report
`LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE`,
`LC-A4_LEDGER_ACCEPTANCE=BLOCKED`, and STOP before ledger scan. After acquisition,
scan the canonical ledger. For every NON_TERMINAL run pre-existing this process startup,
use exactly one classifier predicate:

```
IF unresolved_mutation_intent(run) == true:
    run_state=HOLDING_UNRESOLVED; recovery_status=UNRESOLVED_INTENT
ELSE:
    run_state=ACTIVE; recovery_status=RECOVERY_REQUIRED_ACTIVE
```

Both branches block admission and require Human review, with no automatic
continuation or provider mutation. A run admitted and bound by the current process
after startup is ordinary ACTIVE and not a recovery case. No PID, heartbeat, lease,
or ownership-proof predicate is used. `mutation_attribution` participates only in
evaluating `unresolved_mutation_intent(run)`, not in a second classifier branch.

Each decision's durable `mutation_attribution` is exactly one of
`NOT_APPLICABLE | KNOWN_NOT_SENT | KNOWN_SENT | UNKNOWN`. Without
`MUTATION_INTENT`, use `NOT_APPLICABLE`. Define:

```
unresolved_mutation_intent(run) =
    a durable MUTATION_INTENT exists in the run for decision_id
    AND no durable conclusive mutation_attribution exists for that decision_id
```

`KNOWN_NOT_SENT` and `KNOWN_SENT` are conclusive; `UNKNOWN` and missing
are not. A `DECISION_OUTCOME` alone never resolves `MUTATION_INTENT`. A PRE-SEND
disable before send gives `KNOWN_NOT_SENT`; conclusive response or read-only
reconciliation gives `KNOWN_SENT`; ambiguity gives `UNKNOWN` and leaves
`HOLDING_UNRESOLVED`. Provider state need not allow conclusive attribution.

## 8. Human resolution and normal closure

`HUMAN_RESOLVED` is a separate Human-authorized maintenance path. The Agent
context MUST NOT invoke it, MUST NOT request the controller to synthesize it, and
MUST NOT append `LIFECYCLE_RUN_TERMINATED` directly. The Human terminal event
records `resolved_recovery_status` as exactly one of
`UNRESOLVED_INTENT | RECOVERY_REQUIRED_ACTIVE`. Automatic recovery cannot
synthesize this resolution.

`NORMAL_CONTROLLER_CLOSURE` is permitted only if ALL conditions hold:

```
1. durable LIFECYCLE_RUN_BOUND exists for the lifecycle_run_id
2. the one canonical ledger is healthy and authoritative
3. a POST_TASK decision for that run has a durable DECISION_OUTCOME
4. no decision for that run remains open
5. unresolved_mutation_intent(run) == false
6. no recovery_status is active for that run
7. all required LC-A4 POST_TASK checks completed normally or produced their defined
   fail-closed decision outcome
```

A PRE_TASK-only decision cannot close the run. `SAFE_SUCCESS=YES` is not required
for normal termination. Historical TERMINAL bindings remain immutable but do not
block admission of a new lifecycle_run_id; only NON_TERMINAL runs block.

## 9. Final decision and terminal invariants

At ENTRY, a disabled decision preserves the current `decision_phase`:
PRE_TASK => PRE_TASK; POST_TASK => POST_TASK. Both produce a durable
`DECISION_OUTCOME` with `decision_outcome=DISABLED_BY_KILL_SWITCH`, no
`policy_decision`, and `mutation_attribution=NOT_APPLICABLE`. A POST_TASK
disabled outcome may satisfy the required POST_TASK outcome only if all other
normal-closure predicates pass; a PRE_TASK outcome cannot. This is
`A4-KILL-03`.

```
open_decision(decision_id) =
    at least one durable decision-scoped event exists for decision_id
    AND no durable DECISION_OUTCOME exists for decision_id
open_decision_exists(lifecycle_run_id) =
    there exists an open_decision whose durable events bind to lifecycle_run_id
```

Normal closure requires `open_decision_exists(lifecycle_run_id) == false`. A
crash or missing worker cannot imply a decision outcome. This is `A4-TERM-07`.

Before normal or Human-resolved termination, check for a prior run-scoped
terminal event. For each lifecycle_run_id,
`count(durable LIFECYCLE_RUN_TERMINATED) <= 1`. A prior event returns
`TERMINATION_ALREADY_RECORDED` and denies a second append fail closed,
independently of `event_seq` uniqueness. This is `A4-TERM-08`.
