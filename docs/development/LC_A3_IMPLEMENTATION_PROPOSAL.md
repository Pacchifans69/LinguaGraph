# LC_A3_IMPLEMENTATION_PROPOSAL — proposed minimal LC-A4 scope

## 1. Recommendation

`DESIGN_DECISION`: LC-A4 should implement **only the read-only and refuse-to-act
half** of this contract. No automatic lifecycle mutation should be enabled in LC-A4.

Rationale: the dangerous property of an automatic controller is not that it can read
state, it is that it can decide to stop something. Everything needed to make the
decision safe (verified closure adapters, ambiguity recovery, audit completeness,
kill-switch behaviour) can be built and tested with mutation **hard-disabled**, and
that is where the verification value is highest per unit of risk.

## 2. LC-A4 IN SCOPE

```
A4-1  Controller skeleton with a compiled-in constant AUTOMATIC_MUTATION_SUPPORTED=false
        - global controller invariant, not a per-event field
        - no code path to StartInstance/StopInstance exists in the binary at all
A4-2  Admission guard (pre-bind)
        - RUN_ADMISSION_CHECK(instance_id) runs BEFORE lifecycle_run_id is allocated
        - a NON_TERMINAL run already present => RUN_CONFLICT,
          FAIL_CLOSED; no id allocated, no LIFECYCLE_RUN_BOUND, no work begins
        - RUN_CONFLICT is an admission outcome, never a lifecycle decision_outcome
A4-3  Run binder (durable)
        - allocates lifecycle_run_id only after admission passes
        - appends LIFECYCLE_RUN_BOUND and fsyncs it BEFORE any workflow work begins
        - append/fsync failure => WORK_MUST_NOT_BEGIN, FAIL_CLOSED
        - binding immutable once durable: no rebind, no overwrite, no repoint
        - automatic binding garbage collection disabled (durable bindings retained)
        - ledger loss => binding authority unavailable => FAIL_CLOSED, no reconstruction
A4-4  Decision engine
        - reads instance state, evaluates the PRE_TASK and POST_TASK state machines
        - ENTRY kill-switch check precedes any lifecycle policy evaluation
        - ENTRY disabled => no policy_decision at all (absent/null)
        - emits workflow_readiness, policy_decision, actuation_supported and
          actuation_decision as separate fields
        - valid bound SAFE_SUCCESS => policy_decision=WOULD_STOP, while
          actuation_supported=false and actuation_decision=NO_MUTATION
A4-5  Append-only event ledger (write-ahead log)
        - JSONL, one event per line, fsync per event, secret-shape scan, refusal semantics
        - single serialized writer; event_seq derived from the last durable event and
          allocated only at append time
        - event types: LIFECYCLE_RUN_BOUND, KILL_SWITCH_CHECK, DECISION_EVALUATED,
          MUTATION_INTENT, MUTATION_RESPONSE, RECONCILIATION, DECISION_OUTCOME,
          LIFECYCLE_RUN_TERMINATED
        - run state derived from ledger shape (ACTIVE / HOLDING_UNRESOLVED / TERMINAL)
        - as a shadow controller LC-A4 MUST NOT emit MUTATION_INTENT
A4-6  Kill switch
        - flag file, fail-closed default, ENTRY check before any policy evaluation,
          PRE-SEND recheck, audited
        - the PRE-SEND guard is implemented and tested in ISOLATION only
        - must be provably effective while mutation is already impossible
A4-7  Closure verification adapters
        - production: verify_bound(lifecycle_run_id) — the ONLY authority-eligible path.
          The caller MUST NOT supply workflow_id, workflow_run_identity, or any evidence
          locator; the controller resolves them from the durable binding
        - test-only: inspect_historical_fixture(fixture_id) — always returns
          AUTHORITY_ELIGIBLE=false and BOUND_EVIDENCE=false; cannot feed SAFE_SUCCESS,
          AUTO_STOP_ELIGIBLE or WOULD_STOP
        - the M9 closure-receipt adapter (claim-without-receipt => INDETERMINATE)
        - adversarial tests: missing receipt, digest mismatch, wrong archive, replay
          across lifecycle runs, retroactive binding of a completed run
A4-8  Endpoint guard (read-only)
        - fresh-IP discovery by InstanceId, pinned ED25519 fingerprint check,
          temp known_hosts, StrictHostKeyChecking=yes, IMDSv2 identity guard
A4-9  Negative and static test suite
        - asserts that no input combination can produce a provider mutation send,
          mutation_action != null, actuation_decision != NO_MUTATION, or
          provider_mutation_count != 0
        - asserts WOULD_START / WOULD_STOP remain reachable in the shadow evaluator
        - asserts the kill switch overrides a fully valid SAFE_SUCCESS
A4-10 Explicit non-claims and security acceptance (see §4.4 and §4.5)
```

## 3. LC-A4 explicitly OUT OF SCOPE

```
real StartInstance / StopInstance from the controller
emitting MUTATION_INTENT at all in the LC-A4 shadow controller (it has no actuator)
retroactive binding of already-completed workflow evidence
automatic binding garbage collection of durable LIFECYCLE_RUN_BOUND events
reconstructing a binding after ledger loss from workflow evidence, receipt metadata,
Agent input, or provider state
ledger backup / retention infrastructure design
a pre-run diagnostic/audit channel for rejected admissions (not required for closure)
the Human-resolution UI and authentication mechanism
any lifecycle DryRun issued by the controller
automatic stop after a successful proof
wiring into any existing proof workflow
new RAM users/roles/policies/access keys
any change to the frozen 4-action least-privilege policy
widening DescribeInstanceStatus beyond Resource:"*"
automatic recovery mutation after ambiguity
host-key auto-update (must remain a Human action)
```

## 4. Acceptance criteria for LC-A4

### 4.1 Named acceptance tests

```
A4-ADMIT-01 RUN_ADMISSION_CHECK runs BEFORE lifecycle_run_id allocation: a rejected
            request never receives an id
A4-ADMIT-02 a NON_TERMINAL run already exists for the protected
            instance => admission_outcome=RUN_CONFLICT, FAIL_CLOSED,
            no `lifecycle_run_id` is allocated and no `LIFECYCLE_RUN_BOUND` event is
            appended; no workflow work begins
A4-BIND-00  binding event append/fsync failure => workflow work MUST NOT begin
            (WORK_MUST_NOT_BEGIN, FAIL_CLOSED)
A4-BIND-01  cross-run replay rejected: valid successful evidence from run A presented
            under bound lifecycle run B => REJECT_STALE_OR_UNBOUND_EVIDENCE,
            SAFE_SUCCESS=false, policy_decision != WOULD_STOP
A4-BIND-02  unknown / unbound lifecycle_run_id => FAIL_CLOSED before any adapter is
            invoked; WOULD_START / WOULD_STOP remain reachable once properly bound
A4-BIND-03  an Agent-supplied evidence locator cannot override the controller-derived
            authority: SAFE_SUCCESS stays NO and no WOULD_STOP is emitted
A4-BIND-04  a rebind / repoint attempt on a durable lifecycle_run_id
            => DENIED, FAIL_CLOSED
A4-BIND-05  retroactive binding of an already-completed run
            => REJECT_STALE_OR_UNBOUND_EVIDENCE
A4-BIND-06  one canonical authoritative ledger missing / truncated / corrupt /
            non-contiguous / unexpectedly replaced / rotated / unprovably restored
            => BINDING_AUTHORITY_UNAVAILABLE, FAIL_CLOSED, with no reconstruction from workflow evidence,
            receipt metadata, Agent input, or provider state
A4-HIST-01  inspect_historical_fixture always returns AUTHORITY_ELIGIBLE=false and
            BOUND_EVIDENCE=false
A4-HIST-02  historical RUN-02 / RUN-03 inspection cannot feed SAFE_SUCCESS,
            AUTO_STOP_ELIGIBLE or WOULD_STOP
A4-SHADOW-01 valid bound SAFE_SUCCESS, executed with AUTOMATION_ENABLED=true
            => policy_decision=WOULD_STOP
            => actuation_supported=false
            => actuation_decision=NO_MUTATION
            => provider_mutation_count=0
A4-SHADOW-02 claim with no durable receipt => SAFE_SUCCESS=false and no WOULD_STOP
A4-WAL-01   audit durability failure (append/fsync error) => no provider mutation
A4-WAL-02   durable MUTATION_INTENT with no conclusive mutation_attribution => run state
            HOLDING_UNRESOLVED, derived recovery_status=UNRESOLVED_INTENT, NON_TERMINAL,
            blocks admission of a new run; read-only reconciliation only, no blind retry
A4-WAL-03   a shadow run emits no MUTATION_INTENT event
A4-TERM-01  Stopped + unexpected stopped mode => MUTATION_POLICY=NO_FURTHER_MUTATION,
            ESCALATE, and no PRESERVE_RUNNING terminology on the Stopped path
A4-KILL-01  kill switch false at ENTRY => decision_outcome=DISABLED_BY_KILL_SWITCH with
            policy_decision absent/null, and no WOULD_START / WOULD_STOP /
            PRESERVE_RUNNING produced
A4-KILL-02  ENTRY=true but PRE-SEND RECHECK=false, exercised as ISOLATED guard logic
            => mutation_sent=false, provider_mutation_count=0, durable decision outcome
            recorded. This is NOT a runtime proof of a real post-intent send path.
A4-PROV-01  RUN-02 provenance exact (PROVEN_IN_M9_RUN02)
A4-PROV-02  RUN-03 provenance exact (PROVEN_IN_M9_RUN03)
A4-AUTH-01  the agent cannot modify the kill switch                    => DENIED => PASS
A4-AUTH-02  the agent cannot modify the audit ledger                   => DENIED => PASS
A4-AUTH-03  the agent cannot retrieve the bootstrap secret or the
            lifecycle STS                                              => DENIED => PASS
```

### 4.2 Historical fixtures vs the load-bearing bound test

Two distinct groups with **different interfaces**; they MUST NOT be merged.

```
A. Historical M9 adapter fixtures — reached ONLY via inspect_historical_fixture (§5.2)
   RUN-02: prove the claim / no-receipt classification
           prove PROVEN_IN_M9_RUN02 provenance
   RUN-03: prove receipt / digest / archive validation
           prove PROVEN_IN_M9_RUN03 provenance

   always AUTHORITY_ELIGIBLE=false, BOUND_EVIDENCE=false
   MUST NOT be claimed as proof of BOUND_EVIDENCE
   MUST NOT alone yield A4-SHADOW-01
   MUST NOT feed SAFE_SUCCESS, AUTO_STOP_ELIGIBLE or WOULD_STOP
   locators are fixed test-fixture configuration, never Agent-supplied authority
```

```
B. Load-bearing bound shadow test — reached ONLY via verify_bound (§5.1)
   The only test that may yield A4-SHADOW-01. Required order:
     RUN_ADMISSION_CHECK passes
     -> allocate lifecycle_run_id
     -> durable LIFECYCLE_RUN_BOUND
       BEFORE fixture workflow work
     -> fixture produces durable closure evidence
     -> verify_bound(lifecycle_run_id) derives the canonical namespace from the binding
     -> SAFE_SUCCESS=true
     -> BOUND_EVIDENCE=true
     -> policy_decision=WOULD_STOP
     -> actuation_decision=NO_MUTATION
   executed with AUTOMATION_ENABLED=true
   the test harness MUST NOT pass workflow_id, workflow_run_identity or a locator
```

`DESIGN_DECISION`: retroactive binding of already-completed workflow evidence is
forbidden. RUN-02 / RUN-03 are historical and complete; no `LIFECYCLE_RUN_BOUND` event
written now can satisfy "binding exists before work begins" for them.

### 4.3 Whole-system criteria

```
1. Controller can observe a real Running instance and report endpoint-guard readiness
   after passing the guard (fresh IP, fingerprint match, StrictHostKeyChecking=yes,
   IMDS match).
2. Given RUN-03 closure artifacts inspected through inspect_historical_fixture, the
   adapter returns DURABLE_CLOSURE_COMPLETE=YES together with AUTHORITY_ELIGIBLE=false
   and BOUND_EVIDENCE=false — that historical result cannot feed SAFE_SUCCESS.
3. Given the RUN-02 shape (claim, no receipt), the adapter returns NO + INDETERMINATE,
   and the emitted policy_decision is PRESERVE_RUNNING.
4. With a fully valid, correctly bound SAFE_SUCCESS from the fresh shadow fixture, the
   emitted policy_decision is WOULD_STOP while actuation_decision stays NO_MUTATION and
   provider_mutation_count=0 (because AUTOMATIC_MUTATION_SUPPORTED=false).
5. Setting the kill switch to "false" (or deleting/emptying it) changes the recorded
   decision_outcome to DISABLED_BY_KILL_SWITCH for the next decision, with no restart, the
   ENTRY check happens before any policy evaluation, and no policy_decision is recorded.
6. Every ledger event for every case validates against LC_A3_AUDIT_SCHEMA.md, contains
   no secret-shaped value, and carries only the fields applicable to its event type.
7. A static check demonstrates the binary contains no Start/Stop call site.
8. A static check demonstrates the canonical ordering
   RUN_ADMISSION_CHECK -> LIFECYCLE_RUN_BOUND -> KILL_SWITCH_CHECK(ENTRY)
   -> DECISION_EVALUATED -> MUTATION_INTENT -> KILL_SWITCH_CHECK(PRE_SEND) -> send.
9. A static check demonstrates the production signature verify_bound(lifecycle_run_id)
   accepts no workflow_id, workflow_run_identity, or evidence locator.
```
Criterion 4 is the load-bearing one: LC-A4 is only successful if it proves the
controller *would have* stopped and *did not*. A run that reports only
`PRESERVE_RUNNING` for a fully valid SAFE_SUCCESS proves nothing about the policy
evaluator.

### 4.4 Explicit non-claims

LC-A4 MUST NOT claim any of:

```
distributed exactly-once provider delivery
end-to-end runtime proof of the MUTATION_INTENT -> PRE-SEND RECHECK -> provider send path
BOUND_EVIDENCE derived from the historical M9 RUN-02 / RUN-03 evidence
BOUND_EVIDENCE reconstructed after ledger loss
BOUNDARY_NOT_ENFORCEABLE as a successful security closure
a policy_decision on the ENTRY-disabled path
RUN_CONFLICT or UNRESOLVED_INTENT as a lifecycle decision_outcome
```

`REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF = DEFERRED_TO_FUTURE_ACTUATOR_STAGE`.

### 4.5 Security acceptance (A4-AUTH-01/02/03)

```
DENIED                    => PASS
BOUNDARY_NOT_ENFORCEABLE  => honestly report
                          => LC-A4_SECURITY_ACCEPTANCE=BLOCKED
```

An inability to enforce the authority boundary MUST NOT be counted as successful
closure. `BOUNDARY_NOT_ENFORCEABLE` is an honest diagnostic outcome, not a pass.

## 5. Proposed LC-A5 (not authorized, listed for planning only)

Only after LC-A4 passes, and only under a separate Human authorization and a
separate RAM/policy decision, LC-A5 could enable a **single, manually-triggered**
automatic stop for one named workflow, with the kill switch live and a Human watching.
Fully unattended operation, and the deferred ambiguity-recovery mutation, should
remain out of scope until there is operational evidence from LC-A5.

## 6. Open questions for Human decision

```
Q1  Should the audit store be local-only, or mirrored to durable object storage?
    (Local-only is simpler; mirroring creates its own secret-handling surface.)
Q2  Who may set AUTOMATION_ENABLED=true — any Human on the controller host, or a
    separate approval step?
Q3  What is the acceptable bounded window for stop/start reconciliation polling
    before escalating? (LC-A2 observed Stopped on the first poll and Running on the
    second, so a short window appears sufficient — but that is one observation.)
Q4  Should DescribeInstances remain the only read path, given DescribeInstanceStatus
    requires Resource:"*"? (Cannot be narrowed further; provider constraint.)
Q5  Is a workflow whose closure is not machine-verifiable to be declared ineligible
    for auto-stop permanently, or is a Human-attested closure acceptable for it?
```

## 7. Provenance summary for the whole design set

```
PROVEN_IN_LC_A2 (empirical, reusable as fact):
  economical StopCharging is real and observable via StoppedMode
  real StopInstance and real StartInstance work under the frozen 4-action policy
  the system-assigned public IP IS released on economical stop
  InstanceId-keyed rediscovery returns the endpoint after restart
  the pinned ED25519 fingerprint matches after a stop/start cycle
  IMDSv2 returns instance-id / region / zone exactly
  a 900 s STS session retains credentials safely across a keeper interaction
  the frozen policy grants exactly the four intended actions and no more

PROVEN_IN_M9_RUN02 (empirical, run-scoped, historical; reusable only for the RUN-02 shape):
  claim exists with no closure receipt => INDETERMINATE (Case C)
  NOT evidence of BOUND_EVIDENCE; reachable only via inspect_historical_fixture

PROVEN_IN_M9_RUN03 (empirical, run-scoped, historical; reusable only for the RUN-03 shape):
  a complete closure receipt with RC=0 bound into it, and matching archive /
  package-index digests
  NOT evidence of BOUND_EVIDENCE; reachable only via inspect_historical_fixture

DESIGN_DECISION (requires Human approval, not yet implemented):
  controller-owned decision point; agent cannot mutate
  admission before binding: RUN_ADMISSION_CHECK, then allocate lifecycle_run_id, then
  durable LIFECYCLE_RUN_BOUND + fsync before work begins; immutable; no rebind; no
  automatic GC in LC-A4; ledger loss => binding authority unavailable => FAIL_CLOSED
  at most one admitted lifecycle run per protected instance; a conflicting request is
  rejected at admission and creates no binding and no lifecycle event
  HOLDING_UNRESOLVED (derived UNRESOLVED_INTENT) is NON_TERMINAL and blocks admission
  PRESERVE_RUNNING default (observed_state=Running only; never for Stopped paths;
  never for the ENTRY-disabled path, which produces no policy_decision at all)
  policy_decision kept separate from actuation_decision; WOULD_START / WOULD_STOP are
  legal shadow outcomes and are not by themselves violations
  production verification is verify_bound(lifecycle_run_id) only; historical fixtures
  go through a test-only path that is never authority-eligible
  per-workflow closure adapters; no generic fallback
  single-send with reconcile-only ambiguity handling; no auto recovery mutation
  kill switch as a fail-closed local flag, independent of RAM
  LC-A4 limited to mutation-disabled implementation

UNPROVEN_IMPLEMENTATION_ASSUMPTION (must be tested or explicitly accepted):
  the IPC boundary truly keeps the bootstrap secret away from the agent
  an Agent-supplied locator can be safely ignored in favour of the canonical namespace
  a write-ahead MUTATION_INTENT event narrows, but does not eliminate, the crash
  window; distributed exactly-once delivery is NOT claimed
  the single-writer serialization assumption for ledger writes holds in practice
  LC-A4 cannot runtime-prove the post-intent PRE-SEND recheck or the provider send
  path; REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF is deferred to a future actuator stage
  a recovery run requires a Human-authorized durable LIFECYCLE_RUN_TERMINATED
  with run_terminal_reason=HUMAN_RESOLVED and resolved_recovery_status set to
  UNRESOLVED_INTENT or RECOVERY_REQUIRED_ACTIVE; only that run-scoped event
  makes the run TERMINAL and releases its admission block; DECISION_OUTCOME
  closes one decision only
  the endpoint guard can be enforced in code, not just documented
  economical-mode repeatability, AZ capacity variance, address-pool variance
  that every target workflow can express completion as a digest-bound record
```

### 4.6 Ledger and lifecycle acceptance extensions

`A4-HIST-03`: historical fixture inspection writes no authoritative ledger event,
requires and fabricates no `lifecycle_run_id`, and creates no `LIFECYCLE_RUN_BOUND`.
`A4-LEDGER-01`: a second concurrent authoritative writer is DENIED; inability to
enforce exclusivity yields `LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE` and
`LC-A4_LEDGER_ACCEPTANCE=BLOCKED`, never PASS. The concrete lock mechanism is deferred.
`A4-TERM-02`: PRE_TASK `STARTED` cannot terminate a run.
`A4-TERM-03`: only `LIFECYCLE_RUN_TERMINATED` makes the run TERMINAL.
`A4-RECOVERY-01`: a bound nonterminal run found at startup is fail-closed and
requires Human review; no automatic continuation or provider mutation.

### 4.7 Deterministic recovery, attribution, and Human closure checks

`A4-RECOVERY-01`: after exclusive ledger-writer acquisition, every run that
pre-existed process startup and is NON_TERMINAL is classified solely by
`unresolved_mutation_intent(run)`: true => HOLDING_UNRESOLVED / UNRESOLVED_INTENT;
false => ACTIVE / RECOVERY_REQUIRED_ACTIVE. Both block admission and permit no
automatic continuation or provider mutation. A run newly bound by this process
is ordinary ACTIVE. No ownership-proof predicate is used.

`A4-WAL-04`: durable MUTATION_INTENT plus DECISION_OUTCOME carrying
`mutation_attribution=UNKNOWN` remains unresolved and HOLDING_UNRESOLVED.
`A4-WAL-05`: durable MUTATION_INTENT plus conclusive
`mutation_attribution=KNOWN_NOT_SENT` resolves that intent.
`mutation_attribution` has exactly
`NOT_APPLICABLE | KNOWN_NOT_SENT | KNOWN_SENT | UNKNOWN`;
`DECISION_OUTCOME` alone never resolves an intent.

`A4-AUTH-04`: Agent invocation of HUMAN_RESOLVED, request to synthesize it,
or direct append of LIFECYCLE_RUN_TERMINATED is DENIED. If this boundary cannot
be enforced, `LC-A4_SECURITY_ACCEPTANCE=BLOCKED`. Human resolution records
`resolved_recovery_status = UNRESOLVED_INTENT | RECOVERY_REQUIRED_ACTIVE`.

`A4-TERM-04`: NORMAL_CONTROLLER_CLOSURE needs durable binding, healthy ledger,
a durable POST_TASK DECISION_OUTCOME, no open decision, no unresolved intent, no
active recovery status, and completion or defined fail-closed outcome of every
required LC-A4 POST_TASK check. `A4-TERM-05`: PRE_TASK alone cannot terminate.
`A4-TERM-06`: SAFE_SUCCESS=YES is not required for normal termination.
`A4-ADMIT-03`: prior TERMINAL bindings do not block admission when no
NON_TERMINAL run exists; retain history without GC.

### 4.8 Final four acceptance cases

`A4-KILL-03 / G44`: ENTRY-disabled preserves the current decision context's
`decision_phase`: PRE_TASK => PRE_TASK; POST_TASK => POST_TASK. It appends a
`DECISION_OUTCOME` with `decision_outcome=DISABLED_BY_KILL_SWITCH`, no
`policy_decision`, and `mutation_attribution=NOT_APPLICABLE`. The POST_TASK
outcome may satisfy the POST_TASK component of normal closure only if every other
closure predicate passes. PRE_TASK cannot satisfy that component.

`A4-TERM-07 / G45`: evaluate the exact durable predicates:

```
open_decision(decision_id) =
    at least one durable decision-scoped event exists for decision_id
    AND no durable DECISION_OUTCOME exists for decision_id
open_decision_exists(lifecycle_run_id) =
    there exists an open_decision whose durable events bind to lifecycle_run_id
```

Normal closure requires `open_decision_exists(lifecycle_run_id) == false`.
Process death, worker absence, or provider state never infers closure.

`G46`: the startup classifier has exactly one branch predicate,
`unresolved_mutation_intent(run)`. True => HOLDING_UNRESOLVED /
UNRESOLVED_INTENT; false => ACTIVE / RECOVERY_REQUIRED_ACTIVE.
`mutation_attribution` is part of that predicate's evaluation, not an
independent startup branch.

`A4-TERM-08 / G47`: for each lifecycle_run_id,
`count(durable LIFECYCLE_RUN_TERMINATED) <= 1`. Check the authoritative ledger
before normal or Human-resolved termination. Existing terminal event =>
`TERMINATION_ALREADY_RECORDED`, `DENIED / FAIL_CLOSED`, no second append.
This invariant is independent of `event_seq` uniqueness.
