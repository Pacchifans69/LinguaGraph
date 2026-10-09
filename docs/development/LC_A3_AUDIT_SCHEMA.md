# LC_A3_AUDIT_SCHEMA — audit trail and kill switch

## 1. Purpose

Every automatic lifecycle decision — including decisions that result in **no
mutation** — must be independently reconstructable by a Human after the fact.
A decision that cannot be explained from the audit record is treated as a defect.

`DESIGN_DECISION`: no-op decisions are recorded with the same weight as mutations.
The most important record in this system is the one explaining why the controller
did *not* stop an instance.

## 2. Event ledger schema (append-only JSONL, one event per line)

Storage: `~/.local/state/linguagraph-lifecycle/audit.jsonl` (local, outside any repo).
`DESIGN_DECISION`: append-only JSONL, **one event per line**, `fsync` per event.
The audit store is local and is NOT written into the Product or proof repo.

`DESIGN_DECISION`: this is an **append-only event ledger (write-ahead log)**, not a
mutable per-decision record. A decision that must record both pre-send and post-send
facts is represented by *several* events sharing one `decision_id`. No event is ever
amended, rewritten, or completed after it has been fsynced. The previous model — a
single JSON object per decision, carrying both pre-send and post-send fields — was
structurally unsatisfiable: it could not be written before the send and after the
send at once.

`DESIGN_DECISION`: the ledger has exactly **one serialized writer** per host. The
ordering and `event_seq` guarantees below depend on that (see §3.2).

### 2.1 Common event envelope

Every event MUST carry:

```jsonc
{
  "schema_version": 2,
  "event_type": "<EVENT_TYPE>",
  "event_seq": 0,                                // strictly increasing per ledger
  "timestamp": "2026-09-29T12:00:00Z",           // UTC, RFC3339
  "lifecycle_run_id": "<controller-created, immutable>",
  "instance_id": "i-j6c9854oyawy89fcdxy2"
}
```

Every **decision-scoped** event (`KILL_SWITCH_CHECK`, `DECISION_EVALUATED`,
`MUTATION_INTENT`, `MUTATION_RESPONSE`, `RECONCILIATION`, `DECISION_OUTCOME`) MUST
additionally carry `decision_id` and `decision_phase` (`PRE_TASK | POST_TASK`). Run-scoped `LIFECYCLE_RUN_BOUND` and `LIFECYCLE_RUN_TERMINATED` events are not
decisions and MUST NOT carry `decision_id`.

### 2.2 Canonical event ordering

```
RUN_ADMISSION_CHECK   before lifecycle_run_id allocation (see §3.3); a RUN_CONFLICT
                      stops here and produces no lifecycle-run event
LIFECYCLE_RUN_BOUND   once per run; append + fsync BEFORE any workflow work begins
KILL_SWITCH_CHECK     ENTRY  -- MUST precede every lifecycle policy evaluation
DECISION_EVALUATED
MUTATION_INTENT       append + fsync BEFORE the provider send
KILL_SWITCH_CHECK     PRE_SEND
---- provider mutation send ----
MUTATION_RESPONSE
RECONCILIATION
DECISION_OUTCOME      closes one decision only; MUST NOT terminate the run
LIFECYCLE_RUN_TERMINATED  run-scoped; the only event making the run TERMINAL
```

`KILL_SWITCH_CHECK(ENTRY)` MUST be written before `DECISION_EVALUATED` on the enabled
path. When the ENTRY check observes `AUTOMATION_ENABLED != true`, the decision
terminates before any policy evaluation:

```
KILL_SWITCH_CHECK     ENTRY (automation_enabled=false)
DECISION_OUTCOME         DISABLED_BY_KILL_SWITCH
```

That path produces **no `policy_decision` at all** — the field is absent/null. It MUST
NOT emit `WOULD_START`, `WOULD_STOP`, or `PRESERVE_RUNNING`.

### 2.3 Event types

```
LIFECYCLE_RUN_BOUND  run-scoped; binds lifecycle_run_id to the workflow run (§2.4)
DECISION_EVALUATED   policy and workflow evaluation result for a decision_id
KILL_SWITCH_CHECK    ENTRY check (step 1) or PRE_SEND RECHECK (step 9)
MUTATION_INTENT      write-ahead intent; appended + fsynced BEFORE the send
MUTATION_RESPONSE    what the provider returned (absent if lost/unreadable)
RECONCILIATION       read-only provider observation after an ambiguous result
DECISION_OUTCOME     decision-scoped; closes one decision_id only
LIFECYCLE_RUN_TERMINATED  run-scoped; the only event making run_state=TERMINAL
```

### 2.4 `LIFECYCLE_RUN_BOUND` — minimum fields and constraints

```jsonc
{
  "schema_version": 2,
  "event_type": "LIFECYCLE_RUN_BOUND",
  "event_seq": 0,
  "timestamp": "2026-09-29T12:00:00Z",
  "lifecycle_run_id": "<controller-created>",
  "instance_id": "i-j6c9854oyawy89fcdxy2",
  "requesting_workflow": "m9-formal-proof",
  "workflow_run_identity": "<opaque run/candidate identity, no secrets>"
}
```

This event is the **canonical durable home** of the lifecycle run binding
(`LC_A3_ARCHITECTURE.md` §3.1). It is written only after admission passes. The order is
mandatory:

```
RUN_ADMISSION_CHECK passes
  -> allocate lifecycle_run_id
  -> append LIFECYCLE_RUN_BOUND
  -> fsync succeeds
  -> ONLY THEN may workflow work begin
```

- append or `fsync` failure => `WORK_MUST_NOT_BEGIN`, `FAIL_CLOSED`.
- a `lifecycle_run_id` with no durable `LIFECYCLE_RUN_BOUND` event is NOT bound.
- once the event is durable: **binding immutable** — no rebind, no overwrite, no repoint.
- no retroactive binding: a binding event written after the workflow evidence was
  already complete is not a valid binding (`REJECT_STALE_OR_UNBOUND_EVIDENCE`).
- LC-A4: `automatic binding garbage collection = disabled`. Durable bindings are
  retained; LC-A4 does not reap them.
- **ledger loss destroys binding authority.** If the local authoritative ledger is
  wiped, lost, truncated, rotated, or restored
  to a state that cannot prove the binding => BINDING_AUTHORITY_UNAVAILABLE =>
  `FAIL_CLOSED`. The controller MUST NOT reconstruct a binding from workflow evidence,
  receipt metadata, Agent input, or provider state.

### 2.5 Optional fields (present only on the event types that need them)

```
requesting_workflow       workflow_run_identity
region                    observed_state        Running|Stopped|Starting|Stopping|unknown
pre_public_ip             post_public_ip        stopped_mode
workflow_readiness        READY | NOT_READY | UNKNOWN
policy_decision           WOULD_START | WOULD_STOP | PRESERVE_RUNNING
                          | NO_ACTION_REQUIRED | FAIL_CLOSED
                          -- absent/null on the ENTRY-disabled path
actuation_supported       false                  (see §2.7 for applicability)
actuation_decision        NO_MUTATION            (see §2.7 for applicability)
automatic_mutation_supported  false              (global controller invariant, §2.7)
mutation_action           null | StartInstance | StopInstance
mutation_sent             false
provider_mutation_count   0
provider_request_id       mutation_budget_spent  response_class
kill_switch_phase         ENTRY | PRE_SEND        automation_enabled
power_finalization        ssh_hostkey_match      remote_instance_id_match
evidence                  [ { kind, locator, digest_expected, digest_observed, match, bound } ]
decision_outcome             <see §2.9>  -- decision-level values only
```

`TASK_READY` is deliberately NOT a lifecycle action and is NOT in `policy_decision`.
Endpoint readiness is reported through `workflow_readiness` plus the endpoint-guard
fields, so that "the endpoint is usable" is never conflated with "the controller
decided to mutate".

### 2.6 `policy_decision` enum

```
WOULD_START
WOULD_STOP
PRESERVE_RUNNING          observed_state=Running and not eligible to stop
NO_ACTION_REQUIRED
FAIL_CLOSED
```

`policy_decision` is the policy evaluator's conclusion. `actuation_decision` is what
the actuator did. They are independent fields and MUST NOT be collapsed into one enum.

`WOULD_START` and `WOULD_STOP` are **legal and necessary** in the LC-A4 shadow
evaluator. They are not by themselves a violation of anything.

**On the ENTRY-disabled path `policy_decision` is not produced at all.** The lifecycle
policy evaluator never executes, so there is no policy verdict to record — the field is
absent/null rather than `PRESERVE_RUNNING`, `FAIL_CLOSED`, or any other value.

### 2.7 LC-A4 invariants and field applicability

Global controller/build invariant — it holds for the controller as a whole, not per
event:

```
AUTOMATIC_MUTATION_SUPPORTED = false
```

Field applicability — these fields are REQUIRED only on the event types where the schema
says they apply, and MUST NOT be added to other events merely for uniformity:

```
DECISION_EVALUATED : policy_decision, workflow_readiness, actuation_supported,
                     actuation_decision, provider_mutation_count
DECISION_OUTCOME      : decision_outcome, actuation_decision, provider_mutation_count
LIFECYCLE_RUN_BOUND, LIFECYCLE_RUN_TERMINATED, KILL_SWITCH_CHECK,
MUTATION_RESPONSE, RECONCILIATION
                   : do NOT carry actuation_supported, actuation_decision or
                     provider_mutation_count
LIFECYCLE_RUN_TERMINATED : carries run_terminal_reason, no decision_id
```

Shadow-specific rule:

```
the shadow controller MUST NOT emit MUTATION_INTENT
```

A fully valid, correctly bound `SAFE_SUCCESS` in LC-A4 MUST still emit
`DECISION_EVALUATED` with `policy_decision=WOULD_STOP`, followed by a `DECISION_OUTCOME`
event. That proves the policy evaluator; `actuation_decision=NO_MUTATION` records that
no mutation followed.

Because the shadow controller never emits `MUTATION_INTENT`, LC-A4 cannot runtime-prove
the `MUTATION_INTENT -> PRE-SEND RECHECK -> provider send` path.
`REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF` is `DEFERRED_TO_FUTURE_ACTUATOR_STAGE`, and a
synthetic shadow `MUTATION_INTENT` MUST NOT be written to imitate that path.

### 2.8 Examples, abbreviated

Enabled path (ENTRY first):

```jsonc
{"schema_version":2,"event_type":"LIFECYCLE_RUN_BOUND","event_seq":40,
 "timestamp":"2026-09-29T11:59:58Z",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "requesting_workflow":"m9-formal-proof","workflow_run_identity":"<opaque, no secrets>"}
{"schema_version":2,"event_type":"KILL_SWITCH_CHECK","event_seq":41,
 "timestamp":"2026-09-29T12:00:00Z","decision_id":"<uuid4>",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "decision_phase":"POST_TASK","kill_switch_phase":"ENTRY","automation_enabled":true}
{"schema_version":2,"event_type":"DECISION_EVALUATED","event_seq":42,
 "timestamp":"2026-09-29T12:00:00Z","decision_id":"<uuid4>",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "observed_state":"Running","workflow_readiness":"READY",
 "decision_phase":"POST_TASK","policy_decision":"WOULD_STOP","actuation_supported":false,
 "actuation_decision":"NO_MUTATION","provider_mutation_count":0,
 "evidence":[{"kind":"closure_receipt","locator":"<canonical path>",
              "digest_expected":"<sha256>","digest_observed":"<sha256>",
              "match":true,"bound":true}]}
{"schema_version":2,"event_type":"DECISION_OUTCOME","event_seq":43,
 "timestamp":"2026-09-29T12:00:00Z","decision_id":"<uuid4>",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "actuation_decision":"NO_MUTATION","provider_mutation_count":0,
 "mutation_action":null,"mutation_sent":false,
 "decision_outcome":"NO_MUTATION_SHADOW"}
```

ENTRY-disabled path — note the **absence** of `policy_decision`:

```jsonc
{"schema_version":2,"event_type":"KILL_SWITCH_CHECK","event_seq":51,
 "timestamp":"2026-09-29T12:05:00Z","decision_id":"<uuid4>",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "decision_phase":"PRE_TASK","kill_switch_phase":"ENTRY","automation_enabled":false}
{"schema_version":2,"event_type":"DECISION_OUTCOME","event_seq":52,
 "timestamp":"2026-09-29T12:05:00Z","decision_id":"<uuid4>",
 "lifecycle_run_id":"<run A>","instance_id":"i-j6c9854oyawy89fcdxy2",
 "actuation_decision":"NO_MUTATION","provider_mutation_count":0,
 "decision_phase":"PRE_TASK","mutation_attribution":"NOT_APPLICABLE",
 "decision_outcome":"DISABLED_BY_KILL_SWITCH"}
```

### 2.9 `decision_outcome` enum (decision-level values only)

```
STARTED
ECONOMICAL_STOP_VERIFIED
STOPPED_NOT_ECONOMICAL
INDETERMINATE_START_TRANSITION
INDETERMINATE_STOP_TRANSITION
NO_MUTATION_SHADOW        WOULD_STOP was evaluated; the shadow controller actuated nothing
PRESERVE_RUNNING          observed_state=Running, deliberately left running
NO_FURTHER_MUTATION       observed_state!=Running, or ambiguous/post-stop; left exactly as found
FAIL_CLOSED
ESCALATED_TO_HUMAN
DISABLED_BY_KILL_SWITCH
```

Deliberately **not** in this enum:

```
UNRESOLVED_INTENT   derived ledger-shape status, NOT a decision outcome (§3.1)
RUN_CONFLICT        an admission outcome for a request that never became a run (§3.3)
```

## 3. Field semantics, run state and durability ordering

- `LIFECYCLE_RUN_BOUND` append + `fsync` MUST complete before any workflow work begins.
  If it fails, the work MUST NOT begin (`WORK_MUST_NOT_BEGIN`, `FAIL_CLOSED`).
- `MUTATION_INTENT` append + `fsync` MUST complete before the provider mutation is
  sent. If the append or the `fsync` fails, the provider mutation MUST NOT be sent.
- `policy_decision` records what the policy evaluator concluded; `actuation_decision`
  records what the actuator did. They are independent and MUST NOT be merged. LC-A4
  emits `policy_decision=WOULD_STOP` with `actuation_decision=NO_MUTATION`.
- `KILL_SWITCH_CHECK` with `kill_switch_phase=ENTRY` MUST precede every
  `DECISION_EVALUATED` event that could produce `WOULD_START` or `WOULD_STOP`.
- On the ENTRY-disabled path `policy_decision` MUST be absent/null.
- `mutation_sent` is derived from a fsynced `MUTATION_INTENT` event plus the actual
  send attempt, never inferred after the fact. If it cannot be established, the run is
  in state `HOLDING_UNRESOLVED` with derived `recovery_status=UNRESOLVED_INTENT`.
- `provider_request_id` is `null` (not guessed) when the response was ambiguous.
- `policy_decision` and `decision_outcome` may differ: a `WOULD_STOP` policy decision
  whose reconcile failed yields `decision_outcome=INDETERMINATE_STOP_TRANSITION`.
- `pre_public_ip` / `post_public_ip` are recorded even when equal, so that a reused
  address is visible rather than mistaken for "the endpoint never changed".
- `evidence[].bound` is `true` only when the locator resolved inside the canonical
  evidence namespace of the bound `lifecycle_run_id` / `workflow_run_identity`, with
  the binding event durable before the evidence was produced. `match=true,
  bound=false` is NOT sufficient for `SAFE_SUCCESS`.

### 3.1 Mutually exclusive lifecycle run states

Run state is derived in precedence order from the authoritative ledger:

```
1. TERMINAL           durable LIFECYCLE_RUN_TERMINATED exists
2. HOLDING_UNRESOLVED no terminal event; durable unresolved MUTATION_INTENT exists
                      => recovery_status=UNRESOLVED_INTENT, NON_TERMINAL
3. ACTIVE             no terminal event; no unresolved intent; durable LIFECYCLE_RUN_BOUND exists
                      => NON_TERMINAL
```

The states are mutually exclusive. Both nonterminal states block admission. A crash
after binding but before a decision remains ACTIVE and requires Human review under
`RECOVERY_REQUIRED_ACTIVE`; no automatic continuation or provider mutation follows.
`UNRESOLVED_INTENT` and `RECOVERY_REQUIRED_ACTIVE` are derived recovery statuses,
not decision outcomes or run-terminal reasons. A PRE_TASK `STARTED` outcome closes
only its decision and cannot terminate the run.

`DESIGN_DECISION`: this is a local write-ahead log on a single host. It narrows the
window of unknown send-attribution; it does **NOT** provide distributed exactly-once
delivery, and the design does not claim that it does.

### 3.2 Single-writer serialization and `event_seq` semantics

`DESIGN_DECISION`: the ledger has **one serialized writer**. All of the following
invariants depend on that single-writer serialization and MUST NOT be read as if
concurrent writers were permitted:

```
single serialized writer per ledger
event_seq is derived from the last durable event
the next event_seq value is allocated only at append time
```

Consequences:

- A crash before an append does not allocate the next `event_seq` and therefore leaves
  **no semantic gap**: the value is re-derived from the last durable event on restart.
- `duplicate event_seq` => ledger corruption => `FAIL_CLOSED`.
- `non-contiguous durable ledger event_seq` => ledger corruption => `FAIL_CLOSED`.
- Concurrent lifecycle runs would break both binding authority and `event_seq`
  monotonicity, so LC-A4 admits at most one run at a time per protected instance
  (`RUN_ADMISSION_CHECK`, §3.3).

### 3.3 Admission outcomes (`RUN_CONFLICT`)

`RUN_ADMISSION_CHECK(instance_id)` runs **before** `lifecycle_run_id` is allocated. If
an `ACTIVE` or `HOLDING_UNRESOLVED` run already exists for the protected instance:

```
admission_outcome = RUN_CONFLICT
FAIL_CLOSED
no `lifecycle_run_id` is allocated
no `LIFECYCLE_RUN_BOUND` event is appended
no workflow work begins
```

`RUN_CONFLICT` is an **admission outcome**, not a lifecycle run `decision_outcome`, and it
MUST NOT be added to the §2.9 enum. No provider mutation, binding, or retroactive
`lifecycle_run_id` may be invented merely to audit the conflict.

`DESIGN_DECISION`: if a pre-run diagnostic record for a rejected request is ever wanted,
it belongs to a separate diagnostic channel that is explicitly **outside** the
authoritative lifecycle-run event chain. It is not required for LC-A3/LC-A4 closure and
is not designed here.

## 4. Relationship to existing evidence

The audit ledger is **not** a replacement for workflow evidence. It references it
(`evidence[].locator` on the `DECISION_EVALUATED` event) and records the digests it
verified. The M9 closure receipt, archive and package index remain the authoritative
durable artifacts; the ledger events explain the lifecycle decision made about them.

The `locator` recorded here is the **controller-derived canonical locator**, resolved
from the bound `lifecycle_run_id` / `workflow_run_identity`. An Agent-supplied locator
is never recorded as authority.

The ledger is also the durable home of the run binding itself (`LIFECYCLE_RUN_BOUND`).
A binding that exists only in controller memory is not a binding, and a binding whose
ledger segment has been lost is not recoverable — binding authority is unavailable and
the controller fails closed rather than reconstructing it from evidence or provider
state.

## 5. No-secrets rule

MUST NOT appear in any audit record:
```
bootstrap AccessKeySecret
STS AccessKeyId / AccessKeySecret / SecurityToken
SSH private key material
raw credential-bearing API responses
full authorization tokens (hash only, if a reference is needed)
```
`DESIGN_DECISION`: the controller applies a redaction pass and a secret-shape scan
before appending. An event that trips the scan is refused; no `MUTATION_INTENT` event
is written for that decision and no provider mutation may be sent, and the decision is
recorded as `policy_decision=FAIL_CLOSED`, `decision_outcome=FAIL_CLOSED` (see failure
matrix `X4`). Writing a secret is treated as a design failure, not a logging
inconvenience.

## 6. Kill switch

### 6.1 Definition
```
path:  ~/.local/state/linguagraph-lifecycle/AUTOMATION_ENABLED
valid enabled  : file exists, readable, contains exactly "true"
valid disabled : file contains "false", or is missing, unreadable, empty, malformed, or any other value
```

### 6.2 Semantics
```
AUTOMATION_ENABLED != true
  => automatic StartInstance = DISABLED
  => automatic StopInstance  = DISABLED
  => read-only status inspection MAY remain available
```

### 6.3 Fail-closed properties (required)
1. **Default is disabled.** Absence of the file means disabled, so a fresh install,
   a wiped state directory, or a restored-from-backup host cannot silently enable
   automation.
2. **Fail-closed on error.** Unreadable, malformed, or ambiguous content => disabled.
   There is no "assume enabled" branch anywhere in the decision path.
3. **Evaluated per decision, and re-checked before send.** Checked at the entry of
   every decision point (canonical step 1) and therefore *before* any lifecycle policy
   evaluation, not once at controller start, so disabling takes effect for the next
   decision without a restart; and re-checked after the durable intent and immediately
   before the provider send (canonical step 9). When the ENTRY check fails, the decision
   produces `decision_outcome=DISABLED_BY_KILL_SWITCH` and **no `policy_decision`**.
4. **Independent of provider credentials.** Disabling MUST NOT require deleting RAM
   users, roles, policies, or access keys. The kill switch is a local, Human-editable
   control that does not depend on any cloud API call succeeding.
5. **Cannot be overridden by the agent.** The agent has no code path that can write
   the flag, and cannot cause a mutation while it is disabled.
6. **Audited.** Every decision records `automation_enabled`, including transitions
   caused by the switch, with `decision_outcome=DISABLED_BY_KILL_SWITCH`.

### 6.4 Honest limitation and the second (PRE-SEND) check
`DESIGN_DECISION`: a kill switch cannot recall a mutation already transmitted. It
prevents the *next* mutation. The design therefore keeps the window between decision
and send as short as possible, and re-checks the switch immediately before the send
(canonical step 9, after the durable `MUTATION_INTENT`).

If the PRE-SEND RECHECK observes `AUTOMATION_ENABLED != true`, then:

```
mutation_sent           = false
provider_mutation_count = 0
```

and the controller MUST append a `DECISION_OUTCOME` with
`decision_outcome=DISABLED_BY_KILL_SWITCH` and durable conclusive
`mutation_attribution=KNOWN_NOT_SENT`. That attribution, not the outcome alone,
resolves the already-durable `MUTATION_INTENT`.

The ENTRY check (step 1) and the PRE-SEND RECHECK (step 9) are separated by the
durable intent append + fsync (step 8) and by the provider send (step 10). The check
and the provider API call are **not** one atomic cross-system operation, and the design
MUST NOT claim that they are.

`DESIGN_DECISION`: LC-A4 has no actuator and MUST NOT emit `MUTATION_INTENT`. It
therefore cannot runtime-prove the second check end-to-end.
`REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF` is `DEFERRED_TO_FUTURE_ACTUATOR_STAGE`.

Note the asymmetry, which is intentional: on the **ENTRY**-disabled path no
`policy_decision` is produced because no policy evaluation occurred; on the
**PRE-SEND**-disabled path a policy evaluation already happened, so the recorded
`policy_decision` is the real evaluation result and only the actuation is suppressed.

### 6.5 Emergency procedure (Human)
```
1. write "false" to ~/.local/state/linguagraph-lifecycle/AUTOMATION_ENABLED
2. confirm the next audit record shows decision_outcome=DISABLED_BY_KILL_SWITCH
3. (optional, defence in depth) detach the role policy from LinguaGraphECSLifecycleRole
   -- NOT required for the switch to be effective
```
Step 3 is explicitly optional and slower; step 1 is the primary mechanism.

## 7. Canonical ledger and writer acceptance

LC-A4 has exactly one current canonical local authoritative ledger; no rotation,
archive chaining, backup, or retained-segment reconstruction is supported. Loss,
truncation, corruption, non-contiguous `event_seq`, unexpected replacement, rotation,
or unprovable restore yields `BINDING_AUTHORITY_UNAVAILABLE`, `FAIL_CLOSED`.
A second concurrent authoritative writer MUST be denied. If exclusivity cannot be
enforced: `LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE`,
`LC-A4_LEDGER_ACCEPTANCE=BLOCKED`; this is not a PASS alternative.

`LIFECYCLE_RUN_TERMINATED` minimum fields: `schema_version`, `event_type`,
`event_seq`, `timestamp`, `lifecycle_run_id`, `instance_id`,
`run_terminal_reason`. Its reason enum is `NORMAL_CONTROLLER_CLOSURE | HUMAN_RESOLVED`.

## 8. Durable mutation attribution and recovery status

`mutation_attribution` is decision-level and has exactly four values:
`NOT_APPLICABLE | KNOWN_NOT_SENT | KNOWN_SENT | UNKNOWN`. Decisions without
`MUTATION_INTENT` carry `NOT_APPLICABLE`.

```
unresolved_mutation_intent(run) =
    a durable MUTATION_INTENT exists in the run for decision_id
    AND no durable conclusive mutation_attribution exists for that decision_id
```

`KNOWN_NOT_SENT` and `KNOWN_SENT` are conclusive. `UNKNOWN` and missing
are non-conclusive. The mere presence of `DECISION_OUTCOME` never resolves
`MUTATION_INTENT`. PRE-SEND disable yields `KNOWN_NOT_SENT`; conclusive send
evidence yields `KNOWN_SENT`; ambiguity yields `UNKNOWN` and remains
`HOLDING_UNRESOLVED`.

A Human-only `LIFECYCLE_RUN_TERMINATED` with
`run_terminal_reason=HUMAN_RESOLVED` MUST carry
`resolved_recovery_status` with exactly one value from
`UNRESOLVED_INTENT | RECOVERY_REQUIRED_ACTIVE`. The Agent cannot invoke,
request synthesis of, or append that resolution. These statuses remain distinct in
audit history.

## 9. Startup and normal termination

After exclusive writer acquisition, every pre-existing NON_TERMINAL run uses only
`unresolved_mutation_intent(run)` as classifier predicate: true gives
`HOLDING_UNRESOLVED / UNRESOLVED_INTENT`, false gives
`ACTIVE / RECOVERY_REQUIRED_ACTIVE`. Both block admission without automatic
continuation or mutation. Current-process newly bound runs are ordinary ACTIVE.

`NORMAL_CONTROLLER_CLOSURE` requires durable binding, healthy canonical ledger,
a durable POST_TASK `DECISION_OUTCOME`, no open decision, no unresolved intent, no
active recovery status, and completed or defined fail-closed POST_TASK checks. A
PRE_TASK-only outcome is insufficient; `SAFE_SUCCESS=YES` is not required.
Decision-scoped events carry `decision_phase = PRE_TASK | POST_TASK`. Only
NON_TERMINAL runs block admission; prior TERMINAL history does not.

## 10. Final durable predicates

`open_decision(decision_id)` requires at least one durable decision-scoped
event and no durable DECISION_OUTCOME for that decision_id.
`open_decision_exists(lifecycle_run_id)` requires an open decision whose durable
events bind to the run. Normal termination requires the predicate to be false;
process death, worker absence, and provider state do not imply closure.

ENTRY-disabled preserves the current decision_phase: PRE_TASK => PRE_TASK and
POST_TASK => POST_TASK. The durable DECISION_OUTCOME carries
`decision_outcome=DISABLED_BY_KILL_SWITCH` and
`mutation_attribution=NOT_APPLICABLE`, with no policy_decision.

For each lifecycle_run_id, `count(durable LIFECYCLE_RUN_TERMINATED) <= 1`.
Before normal or Human-resolved termination, a prior event yields
`TERMINATION_ALREADY_RECORDED`; the second append is DENIED / FAIL_CLOSED.
This is independent of event_seq uniqueness.
