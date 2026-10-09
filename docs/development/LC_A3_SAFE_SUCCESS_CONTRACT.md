# LC_A3_SAFE_SUCCESS_CONTRACT — what durable evidence may authorize an automatic stop

## 1. Principle

`SAFE_SUCCESS` is a property of **verified durable evidence**, not of process outcomes.
The controller must be able to re-derive `SAFE_SUCCESS` from evidence alone, without
trusting any boolean asserted by the requesting agent.

`DESIGN_DECISION`: the agent may *supply locators* (which receipt, which archive) but
may not supply the verdict. The controller fetches and verifies.

An Agent-supplied evidence locator MUST NOT be authoritative. A supplied path is at
most a hint; the controller resolves the authoritative locator from the
controller-owned binding (LC_A3_ARCHITECTURE.md §3.1):

```
lifecycle_run_id <-> instance_id <-> requesting_workflow <-> workflow_run_identity
```

That binding is created by the controller, is made durable by a `LIFECYCLE_RUN_BOUND`
event that is appended and fsynced **before any workflow work begins**
(LC_A3_AUDIT_SCHEMA.md §2.4), and is immutable once that event is durable. The agent
cannot create, extend, re-point, or re-bind it, and a locator falling outside the
canonical evidence namespace derived from the bound identity is ignored. No
compatibility reason to preserve agent locator authority was found in this design set.

If the local authoritative ledger is wiped, lost, truncated, rotated, or restored to a state that cannot prove the binding,
then binding authority is unavailable => FAIL_CLOSED. The controller MUST NOT
reconstruct a binding from workflow evidence, receipt metadata, Agent input, or
provider state.

## 2. Signals that are NOT sufficient on their own

Explicitly non-qualifying:

```
process exit code 0
"the SSH command returned"
"the tests passed"
"the claim exists"
"the archive exists"
"the task appears finished"
a file named PASS
a log line containing SUCCESS
agent-declared safe_success = true
```

Each of these can be true while the underlying computation is incomplete, truncated,
or lost. Any one of them alone => `AUTO_STOP_ELIGIBLE=NO`,
`policy_decision=PRESERVE_RUNNING` (with `observed_state=Running`).

## 3. Required conjunction

```
SAFE_SUCCESS = YES  iff
    verify_bound(lifecycle_run_id).durable_closure_complete == DURABLE_CLOSURE_COMPLETE
AND verify_bound(lifecycle_run_id).bound_evidence          == YES
AND no hold flags set
AND no provider ambiguity outstanding
```

`DESIGN_DECISION` — the decisive distinction:

```
VALID_EVIDENCE != BOUND_EVIDENCE
```

Evidence is `VALID_EVIDENCE` when its digests re-compute and its receipt validates.
It is `BOUND_EVIDENCE` only when it additionally resolves inside the canonical evidence
namespace of the *current* `lifecycle_run_id` and its bound `workflow_run_identity`,
where that `lifecycle_run_id` has a durable `LIFECYCLE_RUN_BOUND` event that was
fsynced **before** the workflow work that produced the evidence began
(LC_A3_ARCHITECTURE.md §3.1).

A structurally valid success from another run (for example run A presented under
lifecycle run B) is `VALID_EVIDENCE` but NOT `BOUND_EVIDENCE`; it MUST be rejected as
`REJECT_STALE_OR_UNBOUND_EVIDENCE` and MUST NOT yield `SAFE_SUCCESS=YES`.

**Only `verify_bound()` (§5.1) may feed `SAFE_SUCCESS`.** Historical fixture inspection
(§5.2) always carries `AUTHORITY_ELIGIBLE=false` and `BOUND_EVIDENCE=false` and can
never contribute to this conjunction.

`DESIGN_DECISION` — no retroactive binding. Workflow evidence that is already complete
when the `LIFECYCLE_RUN_BOUND` event is written can never satisfy the "binding before
work begins" requirement. Such evidence MUST NOT be retroactively bound; the attempt is
rejected as `REJECT_STALE_OR_UNBOUND_EVIDENCE` and `SAFE_SUCCESS=NO`.

`DURABLE_CLOSURE_COMPLETE=YES` requires ALL of:
```
1. the workflow's closure record exists and validates
2. the closure record's embedded digests MATCH the actual artifact digests
3. the workflow's terminal step reported success AND that success is bound into (1)
4. the capability/token (if the workflow uses one) is finalized, not dangling
5. FORENSIC_HOLD=NO and VOLATILE_EVIDENCE_HOLD=NO
```

`DESIGN_DECISION`: requirement 2 is the load-bearing one. A receipt that merely
*exists* proves nothing; a receipt whose digests are re-computed against the artifacts
proves the artifacts are the ones the receipt describes.

## 4. Reference case: the M9 formal proof (HISTORICAL fixtures)

Observed facts, reused here as the reference workflow. Each run carries its own
run-scoped provenance label; neither label may be widened to the other:
- `PROVEN_IN_M9_RUN02`: RUN-02 produced `claim exists + no closure receipt` and was
  correctly classified **Case C INDETERMINATE**.
- `PROVEN_IN_M9_RUN03`: RUN-03 produced a complete closure receipt; all RCs were 0;
  the archive, package index, and receipt all had recorded digests.

`DESIGN_DECISION` — scope limit on these fixtures. RUN-02 and RUN-03 are
**already-completed historical** workflow evidence. No `LIFECYCLE_RUN_BOUND` event was
written before their work began, and none can be written now that would satisfy that
requirement. They are therefore reachable only through the **test-only** interface
`inspect_historical_fixture` (§5.2), which always returns:

```
AUTHORITY_ELIGIBLE = false
BOUND_EVIDENCE     = false
```

Consequently the historical M9 fixtures:

```
MUST NOT be claimed as proof of BOUND_EVIDENCE
MUST NOT alone yield A4-SHADOW-01
MUST NOT feed SAFE_SUCCESS, AUTO_STOP_ELIGIBLE, or WOULD_STOP
```

They may exercise classification, digest/archive validation, and their own run-scoped
provenance labels only. The load-bearing bound case requires a **fresh shadow fixture**
whose durable `LIFECYCLE_RUN_BOUND` precedes its own workflow work
(LC_A3_IMPLEMENTATION_PROPOSAL.md §4).

### 4.1 M9 adapter — qualifying set (all must hold)
```
closure-receipt.json present and parses
receipt validates against the exact-tree verifier
archive sha256 matches the digest recorded in the receipt/index
package-index sha256 matches the digest recorded in the receipt/index
formal core command RC = 0, and that RC is bound into the receipt
token/capability finalized (single-use budget resolved, not dangling)
no forensic hold; no volatile-evidence hold
=> DURABLE_CLOSURE_COMPLETE=YES  -> SAFE_SUCCESS candidate
```

### 4.2 M9 adapter — the decisive distinction
```
claim.json exists  AND  closure-receipt.json absent
  => DURABLE_CLOSURE_COMPLETE=NO
  => CLAIMED_INDETERMINATE=YES
  => AUTO_STOP_ELIGIBLE=NO
  => policy_decision=PRESERVE_RUNNING

valid closure receipt, but from a different lifecycle run
  => REJECT_STALE_OR_UNBOUND_EVIDENCE
  => SAFE_SUCCESS=NO
  => policy_decision != WOULD_STOP
  => provider_mutation_count=0

valid closure receipt, bound to a lifecycle_run_id whose LIFECYCLE_RUN_BOUND
event was written AFTER the evidence was already complete
  => REJECT_STALE_OR_UNBOUND_EVIDENCE
  => SAFE_SUCCESS=NO
  => policy_decision != WOULD_STOP
  => provider_mutation_count=0

historical RUN-02 / RUN-03 evidence inspected through inspect_historical_fixture
  => AUTHORITY_ELIGIBLE=false
  => BOUND_EVIDENCE=false
  => cannot feed SAFE_SUCCESS; no WOULD_STOP is possible
```
This is exactly the RUN-02 shape. A claim proves only that a run *started*; the
receipt is what proves it *finished and is durable*. Treating the two as equivalent
would have authorized a stop on an indeterminate run — the precise failure this
contract exists to prevent.

### 4.3 Additional M9-specific rule
`DESIGN_DECISION`: a *successful* run does not retire the possibility that a later
forensic need arises. The controller must re-evaluate `FORENSIC_HOLD` at POST_TASK
time; a hold applied after the run completes still forces
`policy_decision=PRESERVE_RUNNING`.

## 5. Adapter interfaces

### 5.1 Production path — `verify_bound` (the only authority-eligible path)

```
verify_bound(lifecycle_run_id) -> {
    authority_eligible       : YES|NO,
    bound_evidence           : YES|NO,
    durable_closure_complete : YES|NO,
    evidence                 : [ { kind, locator, digest_expected, digest_observed, match, bound } ],
    indeterminate            : YES|NO,
    reason                   : str
}
```

The caller MUST NOT supply `workflow_id`, `workflow_run_identity`, or any evidence
locator. The controller resolves all of them from the durable immutable binding:

```
lifecycle_run_id
  -> requesting_workflow      (from the durable LIFECYCLE_RUN_BOUND event)
  -> workflow_run_identity    (from the same event)
  -> select adapter           (per workflow)
  -> derive canonical evidence namespace
```

Rules:
- Adapters are **per-workflow**. There is no generic fallback adapter.
- An unknown, unbound, or unprovable `lifecycle_run_id` => FAIL_CLOSED and **no adapter
  is invoked**. A missing adapter, an adapter that raises, or a timeout
  => `DURABLE_CLOSURE_COMPLETE=NO` (fail closed). Never default to YES.
- Adapters MUST be read-only with respect to the workflow's artifacts.
- Adapters MUST derive the canonical evidence namespace from the bound identity. An
  Agent-supplied locator is never passed through as authority.
- Evidence already complete before the binding event was durable
  => `bound_evidence=NO` and `REJECT_STALE_OR_UNBOUND_EVIDENCE`; it MUST NOT be
  retroactively bound.
- **Only `verify_bound()` output may feed `SAFE_SUCCESS`, `AUTO_STOP_ELIGIBLE`, or
  `policy_decision=WOULD_STOP`.**

### 5.2 Test-only path — `inspect_historical_fixture`

Historical M9 evidence is inspected through a clearly test-only interface:

```
inspect_historical_fixture(fixture_id) -> {
    authority_eligible       : false,       // ALWAYS false
    bound_evidence           : false,       // ALWAYS false
    durable_closure_complete : YES|NO,
    evidence                 : [ { kind, locator, digest_expected, digest_observed, match } ],
    provenance               : PROVEN_IN_M9_RUN02 | PROVEN_IN_M9_RUN03,
    reason                   : str
}
```

Rules:
- It MUST always carry `AUTHORITY_ELIGIBLE=false` and `BOUND_EVIDENCE=false`.
- It MUST NOT feed `SAFE_SUCCESS`, `AUTO_STOP_ELIGIBLE`, or any lifecycle policy
  decision, and therefore MUST NOT produce `WOULD_STOP`.
- Historical fixture locators are **fixed test-fixture configuration**, never
  Agent-supplied runtime authority.
- It exists to exercise classification, digest/archive validation and provenance only.
- Production `verify_bound(lifecycle_run_id)` evidence MAY be copied into the authoritative decision event.
- Historical `inspect_historical_fixture` MUST NOT write evidence or results into the authoritative lifecycle ledger, require or fabricate `lifecycle_run_id`, or create `LIFECYCLE_RUN_BOUND`; it belongs only to test-harness reporting.

`UNPROVEN_IMPLEMENTATION_ASSUMPTION`: that every real workflow can express its
completion as a verifiable digest-bound record. A workflow whose completion is
genuinely not machine-verifiable must be declared ineligible for auto-stop rather
than given a weak adapter.

## 6. Interaction with the kill switch

`AUTOMATION_ENABLED=false` overrides even a fully valid `SAFE_SUCCESS`. Success is
necessary but not sufficient. The ENTRY kill-switch check runs before any lifecycle
policy evaluation: with `AUTOMATION_ENABLED=false` the decision terminates at
`DECISION_OUTCOME(decision_phase=<current context>, decision_outcome=DISABLED_BY_KILL_SWITCH)` and **no `policy_decision` is produced at all**
— not `WOULD_STOP`, not `PRESERVE_RUNNING`. The switch is also re-checked after the
durable intent, immediately before the send (see LC_A3_ARCHITECTURE.md §3, steps 1 and
9; LC_A3_AUDIT_SCHEMA.md §6.4).

Historical fixture output remains `AUTHORITY_ELIGIBLE=false` and
`BOUND_EVIDENCE=false`, cannot feed `SAFE_SUCCESS`, and writes no authoritative event.

### 6.1 Lifecycle termination is distinct from SAFE_SUCCESS

`SAFE_SUCCESS=YES` gates automatic stop, not normal lifecycle termination.
A failed workflow may terminate normally after its POST_TASK decision reaches a
durable `DECISION_OUTCOME`, all required POST_TASK checks complete or produce
their defined fail-closed outcome, and the other normal-closure predicates pass.
A PRE_TASK-only outcome never closes a run.

ENTRY-disabled decision outcomes preserve the current decision_phase. PRE_TASK
remains PRE_TASK and POST_TASK remains POST_TASK. Both carry
`decision_outcome=DISABLED_BY_KILL_SWITCH`, no policy_decision, and
`mutation_attribution=NOT_APPLICABLE`. Only POST_TASK can provide the required
POST_TASK outcome component, subject to every other normal-closure condition.
Normal closure also requires `open_decision_exists(lifecycle_run_id)==false`,
where an open decision has durable decision-scoped events and no durable
DECISION_OUTCOME.
