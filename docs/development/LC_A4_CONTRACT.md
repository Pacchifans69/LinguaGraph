# LC-A4 — Shadow Lifecycle Controller Execution Contract

## Contract status and authority

**Status:** FROZEN CONTRACT ON HUMAN-AUTHORIZED DURABLE LANDING.

**Implementation authorization:** NOT GRANTED BY THIS DOCUMENT. This prepared document has no durable effect before its separately authorized landing. Its status describes the contract after that landing, without implying that implementation, a branch, provider access, ECS access, hosted execution, local security changes, or lifecycle mutation has been authorized.

**Frozen Product/source baseline:** `9fd7e1ebc1b3ede45b68d645654cd3f496a21224`.

**Frozen Product/source-baseline tree:** `939d2394f208490408e421b1e21964cd89e855f3`.

The frozen Product/source baseline identifies the Product/source state against which LC-A4 was designed. It is not the required Git fork point for the implementation branch after the Gate-1 durable landing.

**Implementation branch fork point:** The implementation branch MUST fork from an exact Human-authorized durable `main` commit whose ancestry from the frozen Product/source baseline adds only the Gate-1 LC-A4 governance/contract landing and separately Human-authorized LC-A4 pre-implementation clarification or governance commits. A later `main` commit that also contains unrelated Product, checkpoint, implementation, proof, workflow, or other repository changes MUST NOT become the implementation branch fork point merely because it contains this contract. Any such broader ancestry requires a separate explicit Human topology decision. The exact fork SHA and tree MUST be specified in the later Human branch-creation authorization; this contract does not fix those values.

**Implementation-only diff base:** The exact implementation branch fork commit and tree specified in that authorization. Candidate provenance MUST retain both coordinates: the frozen Product/source baseline SHA/tree above and the exact implementation branch fork SHA/tree.

This clarification changes provenance terminology and branch topology only. It does not authorize implementation, branch creation, dependency installation, or any other mutation; each still requires separate explicit Human authorization.

LC-A4 is a separately governed infrastructure/lifecycle track. M9 remains **CONTRACT FROZEN / IMPLEMENTATION NOT AUTHORIZED**. This contract does not amend or reopen M9, change any M0–M9 Product decision, or designate LC-A4 as a Product milestone.

The normative frozen parents are:

- `docs/development/LC_A3_ARCHITECTURE.md`;
- `docs/development/LC_A3_AUDIT_SCHEMA.md`;
- `docs/development/LC_A3_FAILURE_MATRIX.md`;
- `docs/development/LC_A3_IMPLEMENTATION_PROPOSAL.md`;
- `docs/development/LC_A3_SAFE_SUCCESS_CONTRACT.md`;
- `docs/development/LC_A3_STATE_MACHINE.md`;
- `docs/development/LC_A3_F01_FREEZE_MANIFEST.md`.

The six design documents are frozen at the hashes recorded in the F01 manifest. The manifest itself records their provenance. If this contract conflicts with LC-A3, **LC-A3 wins** and the affected implementation stops for Human review. No silent reinterpretation is allowed.

## 1. Bounded goal and implementation locus

Implement only LC-A3's read-only, fail-closed shadow controller. The planned root is `infra/lifecycle-controller/`, using Python `>=3.13`, `uv`, and `pytest`. This contract landing creates no implementation tree. Implementation must not be placed in the Product API or web app. Planned components are `admission`, `binding`, `ledger`, `recovery`, `policy`, `kill_switch`, `closure`, `endpoint_guard`, `authority`, and `terminal`, with corresponding tests and a production-source static boundary checker under that root. This is a plan, not a list of files created by Gate 1.

The controller may admit and durably bind a run; inspect provider state under separately authorized read-only access; verify workflow closure; evaluate PRE_TASK and POST_TASK policy; run the read-only endpoint guard; record applicable audit events; and fail closed. It does not actuate an instance. Do not wire it into an existing proof workflow in LC-A4.

Explicit non-goals: real StartInstance/StopInstance; controller lifecycle DryRun; automatic stop after proof; automatic recovery mutation; automatic binding garbage collection; ledger backup, rotation or reconstructed authority; new RAM principals, credentials or changes to the frozen four-action policy; host-key auto-update; Human-resolution UI/authentication; changes to Product backend, frontend, CI, proof workflow, or M9 implementation. The Human-only resolution event remains in the inherited event vocabulary but LC-A4 exposes no Agent-accessible resolution path.

## 2. Authority and shadow invariants

The inherited authority separation is `PROOF_AUTHORITY != ECS_LIFECYCLE_AUTHORITY != ACCOUNT_ROOT`. The Agent can request work but cannot assert `SAFE_SUCCESS`, select authoritative evidence, write the authoritative ledger, operate the kill switch, or hold lifecycle credentials. A distinct controller OS identity and a distinct Agent OS identity are deployment requirements, not documentation substitutes for enforcement.

Global controller invariant: `AUTOMATIC_MUTATION_SUPPORTED=false`. Production contains zero `StartInstance` callsites, zero `StopInstance` callsites, and zero provider lifecycle mutation-send callsites. The authoritative shadow writer exposes no `MUTATION_INTENT` append API and normal LC-A4 runtime emits zero such events. For every shadow decision, `provider_mutation_count=0`, `actuation_supported=false` where that schema field applies, and `actuation_decision=NO_MUTATION` where it applies. `mutation_action` remains null. The LC-A3 event-type-specific field applicability still governs; these fields must not be copied onto events where the frozen schema forbids them.

`policy_decision` and `actuation_decision` remain distinct. `WOULD_START` and `WOULD_STOP` remain reachable policy results. The load-bearing positive case is a fresh, valid, correctly bound `SAFE_SUCCESS` with `AUTOMATION_ENABLED=true`: `policy_decision=WOULD_STOP`, `actuation_supported=false`, `actuation_decision=NO_MUTATION`, `provider_mutation_count=0`. An inert evaluator that never reaches `WOULD_STOP` fails LC-A4. Every real lifecycle actuation claim is `DEFERRED_BEYOND_LC_A4`; `REAL_POST_INTENT_PRE_SEND_RUNTIME_PROOF=DEFERRED_TO_FUTURE_ACTUATOR_STAGE`.

The inherited future-actuator order `MUTATION_INTENT` durable append -> PRE-SEND kill-switch recheck -> provider send is preserved as a design constraint, not implemented or runtime-proven in LC-A4. The PRE-SEND guard may be tested only in isolation. No test may create a production shadow intent or describe an isolated guard test as proof of a real send path.

## 3. Canonical ledger, writer ownership and event schema

The canonical authoritative ledger is the single local `~/.local/state/linguagraph-lifecycle/audit.jsonl` specified by `LC_A3_AUDIT_SCHEMA.md` §2; the kill-switch file is `~/.local/state/linguagraph-lifecycle/AUTOMATION_ENABLED`. Resolve `~` as the controller identity's state home and protect that canonical runtime directory by Windows ACL. The ledger is append-only JSONL, one event per line, outside Product and proof repositories. Schema version 2, common envelope, UTC timestamp, run and decision scope, event-type applicability, and enums are exactly those in LC-A3 audit schema §§2–3. `RUN_CONFLICT` is an admission outcome, never a lifecycle decision outcome.

Before scanning the ledger, the controller must acquire Windows-kernel-enforced exclusive writer ownership: a dedicated lock object/file in the ACL-protected runtime directory opened with Win32 `CreateFileW`-style zero-share exclusive semantics, or a demonstrably equivalent mandatory Windows kernel primitive. Hold the handle for the controller lifetime. The second controller or writer must be mechanically denied. If exclusivity cannot be established, report `LEDGER_SINGLE_WRITER_NOT_ENFORCEABLE`, `LC-A4_LEDGER_ACCEPTANCE=BLOCKED`, and stop before ledger scan. PID files, heartbeats, timestamp leases, file-exists conventions, process-local mutexes, and documentation are insufficient. The writer lock establishes exclusivity only; it never becomes a startup recovery predicate.

Under that exclusive ownership, derive `event_seq` from the last durable event and allocate the next value at append time. Validate and redact permitted fields, then reject any secret-shaped event before append. Never record bootstrap AccessKeySecret, STS fields, SSH private key, raw credential-bearing response, or full authorization token. Write exactly one JSONL event and perform a durable per-event flush (`FlushFileBuffers` or demonstrably equivalent). Do not report the event durable before flush succeeds. Append or flush failure makes the ledger unhealthy and fails closed; no workflow work begins if `LIFECYCLE_RUN_BOUND` was not durably written. Do not infer a successful append from a partially written line or assign a semantic `event_seq` gap after failure.

Startup scan must validate every complete line, schema, contiguous and unique `event_seq`, event ordering, immutable binding, run/decision association and terminal uniqueness. Missing, wiped, truncated, corrupt, non-contiguous, unexpectedly replaced, rotated, or unprovably restored ledger state means `BINDING_AUTHORITY_UNAVAILABLE` and `FAIL_CLOSED`. Do not truncate, repair, rotate, rebuild, or reconstruct binding from workflow evidence, receipt metadata, Agent input, provider state, or a secondary source. Retain historical terminal bindings without automatic GC.

The parser/schema **may recognize** durable `MUTATION_INTENT`, `MUTATION_RESPONSE` and attribution records for startup reconstruction and adversarial fixtures because LC-A3's event vocabulary includes them. The **production authoritative writer may not emit** `MUTATION_INTENT` and exposes no API for it. A4-WAL-02/04/05 use preconstructed ledger fixtures or an explicitly non-authoritative fixture builder. Fixture intent records must never be represented as output of the production shadow writer.

**B1 initialization boundary:** LC-A4 production startup MUST NOT infer that a missing or empty canonical ledger is first-use or virgin state. Missing, empty, or otherwise unprovable canonical ledger state MUST return `BINDING_AUTHORITY_UNAVAILABLE / FAIL_CLOSED` before allocation of a `lifecycle_run_id`, any binding append, workflow work, policy evaluation, or authority reconstruction. First-time creation or provisioning of the canonical ledger is not Tier-A production-controller behavior. Host initialization is deferred to a separately Human-authorized Tier-B host-provisioning transaction, and that exact initialization protocol MUST be frozen before Tier-B execution. Tier-A hermetic tests MAY use an explicitly test-only, non-authoritative fixture builder to materialize a pre-initialized canonical-shape ledger; the builder MUST be unreachable from production controller paths and is not evidence of production bootstrap correctness. Tier-A reports MUST state `PRODUCTION_LEDGER_INITIALIZATION=NOT_PROVEN_IN_TIER_A`. Loss of a canonical ledger after authority existed remains unrecoverable automatically: no reconstruction from workflow evidence, receipt metadata, Agent input, provider state, or a secondary source is permitted. This contract introduces no genesis event, initialization marker, sidecar authority, backup, restore, or automatic reinitialization protocol.

**B1 intent reader/writer distinction:** The parser and startup reconstruction path MUST recognize and validate durable historical `MUTATION_INTENT` records needed for recovery classification. The LC-A4 production writer MUST NOT expose an append API for a new `MUTATION_INTENT`, and normal LC-A4 runtime MUST emit zero such events. Adversarial and recovery tests MAY materialize preconstructed valid histories containing `MUTATION_INTENT` only through an explicitly non-authoritative fixture builder. Parser acceptance is not writer authority; the statement that an authoritative ledger rejects `MUTATION_INTENT` is therefore overbroad and does not apply to this reader/writer distinction.

**B1 durability-failure scope:** An authoritative append or durable-flush failure immediately poisons the current controller/writer authority session. After that failure, the session MUST perform no further authoritative scan, append, binding, policy decision, terminal closure, or workflow authorization. Tier A proves this sticky in-session poison only. Tier A MUST NOT treat a newly introduced `.poisoned` sidecar, marker, sentinel, or other second durable file as proof of crash-persistent poison across process or host restart unless such a mechanism is separately frozen. Cross-restart handling after an observed durability failure is deferred to a separately Human-authorized Tier-B operational/recovery design; automatic restart or recovery after durability failure is NOT_PROVEN in Tier A. No second authoritative store is introduced by this contract.

**B2 canonical-ledger replacement boundary:** Within one owned authority session, Tier A MUST prove that replacement, path swap, rotation, or divergence of the canonical ledger object fails closed. Structural JSONL validity of a newly opened pathname is not sufficient continuity evidence. The later implementation may use a held canonical file handle/object, OS file identity, or an equivalent session-local continuity mechanism, but this clarification introduces no second authoritative store.

Across controller process restart, the frozen design currently defines no persistent provenance anchor that can distinguish the genuine latest canonical ledger from a structurally valid older rollback or replacement presented before startup. Such state is therefore `unprovably restored` for production restart authority unless a separately Human-frozen provenance mechanism establishes otherwise. Structural JSONL validity alone MUST NOT establish production restart authority. This contract introduces no generation marker, initialization marker, sidecar hash, registry authority, backup ledger, secondary ledger, automatic restore, or reconstructed authority.

For Gate 2A, A4-BIND-06 is not weakened: negative Tier-A fixtures MUST cover missing, empty, truncated, corrupt and non-contiguous ledgers, structurally invalid restore, and unexpected replacement or rotation during an owned authority session. A B1 test-only pre-initialized fixture MAY support hermetic positive cases, but remains explicitly non-production and cannot prove first provisioning or cross-restart non-rollback provenance. Until a separately Human-authorized Tier-B provisioning/recovery design freezes and proves the production cross-restart provenance mechanism, production startup MUST NOT treat a structurally valid pre-existing ledger as proven current solely because its contents validate. Tier-A reports MUST state `CROSS_RESTART_LEDGER_REPLACEMENT_PROVENANCE=NOT_PROVEN_IN_TIER_A`.

## 4. Admission, binding, evidence and decisions

`RUN_ADMISSION_CHECK(instance_id)` precedes allocation of `lifecycle_run_id`. An existing `ACTIVE` or `HOLDING_UNRESOLVED` run for that protected instance yields `RUN_CONFLICT`, `FAIL_CLOSED`, no ID, no `LIFECYCLE_RUN_BOUND`, and no workflow work. Prior TERMINAL history remains durable but does not block a new run. After admission passes, the controller allocates the ID and durably appends exactly one `LIFECYCLE_RUN_BOUND`, binding `lifecycle_run_id <-> instance_id <-> requesting_workflow <-> workflow_run_identity` before workflow work. Durable binding is immutable; no rebind, repoint, retroactive binding, or automatic deletion. Unknown or unbound ID fails closed before invoking any adapter.

Production closure interface: `verify_bound(lifecycle_run_id)` only. Its caller cannot supply `workflow_id`, `workflow_run_identity`, or an evidence locator. The controller reads durable binding, selects the workflow-specific adapter, derives the canonical evidence namespace, recomputes receipt and artifact digests, checks bound terminal command result, finalized capability/token state and holds, and returns an evidence verdict. There is no generic fallback. Missing/raising/timed-out adapter, missing or mismatched receipt, ledger authority loss, cross-run replay, and Agent-supplied locator fail closed. A receipt valid for another run or completed before this binding is `VALID_EVIDENCE` at most, never `BOUND_EVIDENCE`, and cannot yield `SAFE_SUCCESS` or `WOULD_STOP`.

**B2 workflow-evidence authority boundary:** Production `verify_bound(lifecycle_run_id)` remains controller-owned. A workflow-specific controller verifier MUST derive canonical locators from the durable binding, read and deterministically parse the workflow's raw closure-receipt/index/artifact evidence, recompute every receipt/index/artifact digest relationship required by that workflow, and validate the bound terminal result and capability/token finalization. Adapter or requester booleans asserting `SAFE_SUCCESS`, `BOUND_EVIDENCE`, durable closure, capability finalization, or hold clearance are not authority. A real production workflow's receipt schema, canonical locators and deterministic verifier contract require separate Human-reviewed integration before that workflow becomes authority-eligible. No generic fallback, generic trusted-receipt boolean, receipt-signature infrastructure, sidecar trust store, or new authority store is introduced here.

A4-SHADOW-01 remains a fresh **test-only bound fixture workflow**. Tier A MAY use a controller-owned deterministic fixture verifier over an explicit fixture receipt format and raw artifact bytes to prove binding-before-work, canonical namespace derivation, receipt parsing, digest recomputation, terminal-result validation, capability-finalization logic and `SAFE_SUCCESS`/`WOULD_STOP` reachability. That proof does not establish production integration for an arbitrary workflow. Tier-A reports MUST state `PRODUCTION_WORKFLOW_RECEIPT_INTEGRATION=NOT_PROVEN_IN_TIER_A`.

Current POST_TASK `FORENSIC_HOLD` and `VOLATILE_EVIDENCE_HOLD` MUST be re-evaluated from controller-owned current safety state; a closure-receipt snapshot, Agent assertion, or adapter self-declared hold-clear boolean is not authority. Tier A MAY use an explicit controller-owned test-only safety-state port to exercise clear and held cases. Provider ambiguity and recovery/Human-review-required state remain derived from canonical controller/ledger state wherever the frozen LC-A3 sources already define them. If any required current authority fact is absent or unavailable, eligibility fails closed.

The actual production authority-bearing source for current forensic/volatile hold state is not established by Tier A and requires separately Human-authorized workflow/deployment integration. Tier-A reports MUST state `PRODUCTION_CURRENT_HOLD_AUTHORITY=NOT_PROVEN_IN_TIER_A`.

Test-only interface: `inspect_historical_fixture(fixture_id)`. It always returns `AUTHORITY_ELIGIBLE=false` and `BOUND_EVIDENCE=false`. RUN-02 has claim without receipt and is indeterminate; RUN-03 can have a valid receipt/digest/archive while remaining historical and unbound. These labels are run-scoped and never widened. The historical interface allocates no lifecycle ID, writes no authoritative ledger event, and cannot feed `SAFE_SUCCESS`, `AUTO_STOP_ELIGIBLE` or `WOULD_STOP`.

A4-SHADOW-01 must create a new isolated fixture run in this order: pass admission -> allocate fresh ID -> durably write binding -> perform fixture workflow work -> produce fresh evidence under the bound namespace -> call production `verify_bound(lifecycle_run_id)` -> derive `SAFE_SUCCESS` -> evaluate `WOULD_STOP` with `NO_MUTATION`. The test harness supplies no workflow ID, run identity or locator to the production verification call. RUN-02/RUN-03 must not be retroactively bound. A separate bound claim-without-receipt test may yield `PRESERVE_RUNNING` for a Running instance; the historical inspection output itself never feeds policy.

The ENTRY kill-switch check precedes every lifecycle policy evaluation and is recorded for every decision. Only a readable file containing exactly `true` enables evaluation; missing, empty, unreadable, `false`, malformed, or ambiguous content disables it. ENTRY disabled records `KILL_SWITCH_CHECK(ENTRY)` then a durable `DECISION_OUTCOME` with `DISABLED_BY_KILL_SWITCH`, `mutation_attribution=NOT_APPLICABLE`, and the current PRE_TASK or POST_TASK phase; `policy_decision` is absent/null. A POST_TASK disabled outcome may satisfy the POST_TASK component of normal closure only if every other closure predicate passes. PRE_TASK cannot. If ENTRY is enabled, valid fresh bound SAFE_SUCCESS and no holds permit `WOULD_STOP`; `PRESERVE_RUNNING` applies only when observed state is Running and stop is ineligible. Stopped or ambiguous states use `NO_FURTHER_MUTATION` and preserve the observed state without `PRESERVE_RUNNING` terminology. `TASK_READY` is workflow readiness, not a policy decision.

## 5. Endpoint guard and read-only validation

For a Running instance, the endpoint guard uses fresh `DescribeInstances` for the exact bound InstanceId, requires exactly one result, derives the public IP from that result, checks the frozen ED25519 pin `SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg`, uses temporary `known_hosts` with `StrictHostKeyChecking=yes`, and requires IMDSv2 instance-id/region/zone exact match before exposing `TASK_READY=YES` or an endpoint to the Agent. Cached IP, automatic pin update, host-key bypass, or an endpoint returned before all checks fails. The guard is mandatory in code.

**B2 protected endpoint identity:** The controller-owned expected identity for this LC-A4 deployment is protected InstanceId `i-j6c9854oyawy89fcdxy2`, region `cn-hongkong`, zone `cn-hongkong-d`, and ED25519 fingerprint `SHA256:A/t3T5Hnw4bgijSFYYdEdPtJWhx11k6avACBOLNcvLg`. Admission/binding for another InstanceId is not authority-eligible. The durable `LIFECYCLE_RUN_BOUND.instance_id` used by the endpoint guard MUST equal the protected InstanceId.

Expected InstanceId, region, zone and SSH fingerprint are controller-owned expectations, not caller parameters and not values learned from the same `DescribeInstances`, SSH or IMDS observation being checked. Fresh provider/IMDS/SSH values are observations to compare against those expectations. Tier C must prove the exact matches. Any legitimate instance rebuild, migration, zone change or SSH-host-key change requires a new Human-approved contract/configuration update before readiness can again become true; automatic learning or updating of any expected identity value is forbidden.

Tier A tests use pure guard functions, mocks and fixtures only. Actual current ECS identity/state, fresh InstanceId-derived endpoint/IP, observed SSH host fingerprint, and IMDSv2 identity are Tier C and require separately authorized read-only live validation. Tier A cannot close Tier C facts. Neither tier authorizes StartInstance or StopInstance.

## 6. Recovery, open decisions and terminal closure

`open_decision(decision_id)` is true exactly when at least one durable decision-scoped event exists for that ID and no durable `DECISION_OUTCOME` exists. `open_decision_exists(lifecycle_run_id)` is true when any such decision belongs to that run. Crash, worker absence, and provider state never synthesize an outcome.

`unresolved_mutation_intent(run)` is true exactly when a durable `MUTATION_INTENT` exists for a decision in the run and no durable conclusive `mutation_attribution` exists for that decision. `KNOWN_NOT_SENT` and `KNOWN_SENT` are conclusive; `UNKNOWN` and missing are not. `DECISION_OUTCOME` alone never resolves an intent. Decisions without intent use `NOT_APPLICABLE`.

After exclusive writer acquisition and full ledger validation, each pre-existing NON_TERMINAL run is classified by exactly one branch predicate, `unresolved_mutation_intent(run)`: true -> `HOLDING_UNRESOLVED / UNRESOLVED_INTENT`; false -> `ACTIVE / RECOVERY_REQUIRED_ACTIVE`. Both are NON_TERMINAL, block admission, forbid automatic continuation and provider mutation, and require Human review. A run newly bound by this process is ordinary ACTIVE. PID, heartbeat, lease, lock ownership and mutation attribution are not additional classifier branches; attribution is considered only inside `unresolved_mutation_intent`.

Only a durable run-scoped `LIFECYCLE_RUN_TERMINATED` makes a run TERMINAL. PRE_TASK `STARTED` and any `DECISION_OUTCOME` close only their decisions. `NORMAL_CONTROLLER_CLOSURE` requires all seven inherited predicates: durable binding; healthy authoritative ledger; durable POST_TASK `DECISION_OUTCOME`; no open decision; no unresolved intent; no active recovery status; and every required POST_TASK check complete or at its defined fail-closed outcome. `SAFE_SUCCESS=YES` is not a normal-closure requirement. Before normal or separately Human-authorized resolution, check `count(durable LIFECYCLE_RUN_TERMINATED for lifecycle_run_id) <= 1`; a prior event yields `TERMINATION_ALREADY_RECORDED`, DENIED / FAIL_CLOSED, with no second append. LC-A4 supplies no Agent-accessible `HUMAN_RESOLVED` path.

## 7. Windows security boundary and acceptance tiers

The deployment requires distinct controller and Agent Windows OS identities. ACLs must deny Agent write access to the kill switch and authoritative ledger and read access to the bootstrap secret; process/environment/IPC isolation must deny Agent access to lifecycle STS. Agent IPC must deny `HUMAN_RESOLVED`, requests to synthesize it, arbitrary audit append and direct `LIFECYCLE_RUN_TERMINATED`. Repository code and written convention alone are not evidence. If distinct identity and mechanical denial cannot be demonstrated, report `BOUNDARY_NOT_ENFORCEABLE` and `LC_A4_SECURITY_ACCEPTANCE=BLOCKED`, never PASS.

- **Tier A — hermetic repository acceptance:** policy, binding, ledger and durability fault injection, recovery, fixture adapters, fresh bound shadow case, static no-actuator proof, and mocked endpoint guard. No provider/ECS access or host-security mutation.
- **Tier B — local Windows security acceptance:** separately Human-authorized local host/security transaction proving distinct identities, ACLs, exclusive writer ownership, and Agent denial for kill-switch write, ledger write, bootstrap/STS read, Human resolution and direct termination append. No provider/ECS access is required.
- **Tier C — live read-only ECS acceptance:** separately Human-authorized live transaction proving current exact ECS identity/state, fresh bound-InstanceId endpoint/IP, observed pinned SSH host fingerprint and actual IMDSv2 identity. No lifecycle mutation is allowed.

Gate 1 freezes the governance bridge and this execution contract only. Gate 2A is exact-candidate Tier A proof; Gate 2B is Tier B proof; Gate 2C is Tier C proof. Declare LC-A4 COMPLETE only after required 2A, 2B and 2C all pass on the governed implementation candidate. None of these gates authorizes lifecycle actuation. A failed or missing tier remains open rather than being labeled complete.

## 8. Requirement traceability

The planned components below are relative to `infra/lifecycle-controller/src/lifecycle_controller/`; tests are relative to `infra/lifecycle-controller/tests/`. Source abbreviations: `P` = `LC_A3_IMPLEMENTATION_PROPOSAL.md`, `A` = `LC_A3_ARCHITECTURE.md`, `U` = `LC_A3_AUDIT_SCHEMA.md`, `S` = `LC_A3_SAFE_SUCCESS_CONTRACT.md`, `F` = `LC_A3_FAILURE_MATRIX.md`, and `M` = `LC_A3_STATE_MACHINE.md`. Section references are frozen source sections. `Authority` marks authority-sensitive behavior; `Provider` marks whether that requirement's stated acceptance needs live provider access. Tier A fixtures/mocks do not claim live state.

| Requirement | Frozen source | Component | Planned test | Tier | Authority | Provider | Expected LC-A4 result |
|---|---|---|---|---|---|---|---|
| A4-ADMIT-01 | P §4.1; A §3.1 | admission | unit/admission: rejected request never allocates ID | A | Yes | No | admission before ID |
| A4-ADMIT-02 | P §4.1; U §3.3 | admission, binding | unit/admission: existing NON_TERMINAL -> conflict, no bind/work | A | Yes | No | RUN_CONFLICT / FAIL_CLOSED |
| A4-ADMIT-03 | P §4.7; A §8 | admission | unit/admission: retained TERMINAL history permits new run | A | Yes | No | PASS without GC |
| A4-BIND-00 | P §4.1; U §2.4 | binding, ledger | fault/binding: append and flush failures | A | Yes | No | WORK_MUST_NOT_BEGIN |
| A4-BIND-01 | P §4.1; S §3 | closure/verify | adversarial/closure: run A evidence replayed under run B | A | Yes | No | REJECT_STALE_OR_UNBOUND_EVIDENCE; no WOULD_STOP |
| A4-BIND-02 | P §4.1; S §5.1 | binding, closure/verify | adversarial/closure: unknown ID; adapter call count zero | A | Yes | No | FAIL_CLOSED; bound WOULD_START/STOP still reachable |
| A4-BIND-03 | P §4.1; S §§1,5.1 | closure/verify | adversarial/closure: Agent locator override attempt | A | Yes | No | locator ignored; no SAFE_SUCCESS/WOULD_STOP |
| A4-BIND-04 | P §4.1; A §3.1 | binding | unit/binding: rebind and repoint rejected | A | Yes | No | DENIED / FAIL_CLOSED |
| A4-BIND-05 | P §4.1; S §3 | binding, closure/verify | adversarial/closure: binding after completed evidence | A | Yes | No | REJECT_STALE_OR_UNBOUND_EVIDENCE |
| A4-BIND-06 | P §4.1; U §7 | ledger | fault/ledger: lost, truncated, corrupt, gaps, replacement, rotation, unprovable restore | A | Yes | No | BINDING_AUTHORITY_UNAVAILABLE; no reconstruction |
| A4-HIST-01 | P §4.1; S §5.2 | closure/historical | fixture/historical: inspect both historical IDs | A | Yes | No | AUTHORITY_ELIGIBLE=false; BOUND_EVIDENCE=false |
| A4-HIST-02 | P §4.1; S §§4,5.2 | closure/historical, policy | unit/authority: historical output cannot enter policy | A | Yes | No | no SAFE_SUCCESS/AUTO_STOP_ELIGIBLE/WOULD_STOP |
| A4-HIST-03 | P §4.6; S §5.2 | closure/historical | fixture/historical: ledger bytes/events unchanged; no ID | A | Yes | No | no authoritative write or binding |
| A4-SHADOW-01 | P §§4.1–4.2; U §2.7 | closure/verify, policy | integration/shadow: fresh bound valid success with enabled switch | A | Yes | No | WOULD_STOP / NO_MUTATION / count 0 |
| A4-SHADOW-02 | P §4.1; S §4.2 | closure/verify, policy | fixture/closure: bound claim without receipt | A | Yes | No | SAFE_SUCCESS=NO; no WOULD_STOP |
| A4-WAL-01 | P §4.1; U §3 | ledger, authority | fault/ledger: append and flush failures | A | Yes | No | no provider mutation; FAIL_CLOSED |
| A4-WAL-02 | P §4.1; A §7 | recovery | fixture/recovery: preconstructed unresolved intent | A | Yes | No | HOLDING_UNRESOLVED; block admission; no retry |
| A4-WAL-03 | P §4.1; U §2.7 | authoritative writer, shadow | integration/shadow: all cases count emitted intent | A | Yes | No | exactly zero MUTATION_INTENT |
| A4-WAL-04 | P §4.7; U §8 | recovery | fixture/recovery: intent plus UNKNOWN outcome | A | Yes | No | still unresolved/HOLDING_UNRESOLVED |
| A4-WAL-05 | P §4.7; U §8 | recovery | fixture/recovery: intent plus KNOWN_NOT_SENT | A | Yes | No | intent resolved |
| A4-LEDGER-01 | P §4.6; U §7 | ledger OS ownership | security/writer: two processes compete for same lock | B | Yes | No | second writer DENIED; else ledger acceptance BLOCKED |
| A4-KILL-01 | P §4.1; U §6.3 | kill_switch, policy | unit/kill: missing, empty, unreadable, false, malformed | A | Yes | No | DISABLED_BY_KILL_SWITCH; no policy_decision |
| A4-KILL-02 | P §4.1; U §6.4 | isolated pre-send guard | unit/guard: ENTRY true then PRE-SEND false, fixture intent only | A | Yes | No | not sent; count 0; durable outcome; no real-send claim |
| A4-KILL-03 | P §4.8; A §9 | kill_switch, terminal | unit/kill: PRE_TASK and POST_TASK disabled | A | Yes | No | phase retained; only POST_TASK can satisfy its closure component |
| A4-PROV-01 | P §4.1; S §4 | closure/historical | fixture/provenance: RUN-02 exact label and shape | A | No | No | PROVEN_IN_M9_RUN02 only |
| A4-PROV-02 | P §4.1; S §4 | closure/historical | fixture/provenance: RUN-03 exact label and shape | A | No | No | PROVEN_IN_M9_RUN03 only |
| A4-AUTH-01 | P §§4.1,4.5; U §6.3 | Windows ACL, kill switch | security/agent-identity: attempt flag write | B | Yes | No | OS DENIED |
| A4-AUTH-02 | P §§4.1,4.5; U §7 | Windows ACL, ledger | security/agent-identity: direct ledger write/IPC append | B | Yes | No | OS/API DENIED |
| A4-AUTH-03 | P §§4.1,4.5; A §2.2 | credential/process isolation | security/agent-identity: bootstrap and STS retrieval attempts | B | Yes | No | DENIED; else security BLOCKED |
| A4-AUTH-04 | P §4.7; A §8 | restricted IPC, terminal writer | security/agent-identity: HUMAN_RESOLVED/direct append/synthesis attempts | B | Yes | No | DENIED; else security BLOCKED |
| A4-TERM-01 | P §4.1; A §4 | policy | unit/policy: Stopped plus wrong/missing stopped mode | A | Yes | No | NO_FURTHER_MUTATION; ESCALATE; no PRESERVE_RUNNING |
| A4-TERM-02 | P §4.6; U §3.1 | terminal | unit/terminal: PRE_TASK STARTED only | A | Yes | No | run stays NON_TERMINAL |
| A4-TERM-03 | P §4.6; A §6 | terminal | unit/terminal: outcomes cannot terminate; terminal event can | A | Yes | No | only LIFECYCLE_RUN_TERMINATED makes TERMINAL |
| A4-TERM-04 | P §4.7; A §8 | terminal | unit/terminal: all seven normal-closure predicates | A | Yes | No | NORMAL_CONTROLLER_CLOSURE iff all true |
| A4-TERM-05 | P §4.7; A §8 | terminal | unit/terminal: PRE_TASK-only outcome | A | Yes | No | normal termination denied |
| A4-TERM-06 | P §4.7; S §6.1 | terminal | unit/terminal: SAFE_SUCCESS=NO, other closure predicates pass | A | Yes | No | normal termination permitted |
| A4-TERM-07 | P §4.8; A §9 | open_decision, terminal | fixture/crash: decision event without outcome | A | Yes | No | open decision blocks closure; no inferred outcome |
| A4-TERM-08 | P §4.8; A §9 | terminal, ledger | unit/terminal: second termination attempt | A | Yes | No | TERMINATION_ALREADY_RECORDED; no append |
| A4-RECOVERY-01 | P §§4.6–4.7; A §7 | recovery | fixture/startup: both pre-existing NON_TERMINAL classes | A | Yes | No | exact two classifications; no continuation/mutation |
| G44 | P §4.8; A §9 | kill_switch, terminal | unit/kill: disabled phase/outcome/attribution | A | Yes | No | phase retained; policy absent; NOT_APPLICABLE |
| G45 | P §4.8; A §9 | open_decision | unit/ledger: durable event with/without outcome | A | Yes | No | exact open_decision predicate |
| G46 | P §4.8; A §7 | recovery | fixture/startup: only unresolved intent branches | A | Yes | No | true HOLDING_UNRESOLVED; false ACTIVE |
| G47 | P §4.8; A §9 | terminal | unit/terminal: duplicate terminal across both paths | A | Yes | No | at most one durable terminal event per run |

Whole-system obligations from `P` §4.3 are additional to the named rows: Tier A must validate the complete event schema and field applicability for every shadow case, the production `verify_bound` signature, the mandatory endpoint-gating API, historical RUN-02/RUN-03 isolation, fresh bound positive case, kill-switch next-decision effect without restart, and no actuator by AST/import/call-surface analysis. The inherited actuator ordering is checked as a design invariant; the real `MUTATION_INTENT -> PRE-SEND -> send` runtime path is deferred. Tier C must observe a real Running instance and pass all endpoint guards before reporting `TASK_READY=YES`; that live observation cannot be closed by mocks.

| Additional whole-system check | Source | Component / test | Tier | Authority | Provider | Expected result |
|---|---|---|---|---|---|---|
| Live exact instance/state/IP | P §4.3(1); M §1 endpoint guard | endpoint_guard / current read-only probe | C | Yes | Yes | one bound Running instance and fresh IP |
| Live SSH identity | P §4.3(1); M §1 endpoint guard | endpoint_guard / observed ED25519 pin | C | Yes | Yes | pinned fingerprint match, strict host checking |
| Live IMDSv2 identity | P §4.3(1); M §1 endpoint guard | endpoint_guard / read-only remote identity | C | Yes | Yes | instance-id/region/zone exact match |
| Endpoint cannot bypass guard | M §1 endpoint guard | authority, endpoint_guard / gate-bypass test | A and C | Yes | C only | endpoint withheld until all checks pass |

## 9. Verification commands and expected artifacts

The later implementation authorization must create and lock `infra/lifecycle-controller/pyproject.toml` and `uv.lock`. On its exact candidate, Gate 2A must run, from `infra/lifecycle-controller/`:

```text
uv sync --frozen
uv run pytest -q
uv run python tools/verify_static_boundary.py
```

The static checker must inspect production source via Python AST, import resolution and call-surface analysis, including wrappers and dynamic dispatch, and fail if it cannot prove any relevant call edge. A text grep alone does not prove absence. Its report must state `StartInstance callsite count = 0`, `StopInstance callsite count = 0`, and `provider lifecycle mutation-send callsite count = 0`. It must also verify `verify_bound` accepts only `lifecycle_run_id` from the caller and that no production writer method can append `MUTATION_INTENT`.

The runtime suite must include append and flush failures; missing, empty, false and unreadable kill switch; corrupt, truncated and non-contiguous ledger; a second writer; cross-run replay; retroactive binding; unknown run ID; Agent locator; open decision after crash; preconstructed `UNKNOWN` and `KNOWN_NOT_SENT` intent fixtures; duplicate termination; both startup recovery classes; valid `WOULD_START` and `WOULD_STOP`; and the fresh bound `WOULD_STOP / NO_MUTATION` case. For **every** shadow case assert emitted `MUTATION_INTENT=0`, `provider_mutation_count=0`, and applicable `actuation_decision=NO_MUTATION`.

Gate 2B must produce a separately authorized local Windows report with actual process tokens, ACL/read-write denial results, and a two-process exclusive-lock result. Gate 2C must produce a separately authorized read-only live report with exact InstanceId, region/zone/state, fresh IP, pinned SSH fingerprint, IMDSv2 identity, and timestamped observations. No raw credential material belongs in either report. Gate 2A, 2B and 2C evidence must identify the exact implementation commit and tree they address. Any failed, skipped or unrun required check is not PASS.

Expected artifacts are the exact-source static report; test log and case manifest; schema/ledger fault evidence; fresh bound fixture provenance; Windows authority-boundary denial report; live read-only endpoint/identity report; and an exact SHA/tree evidence index. Historical fixture reports must be labeled as non-authoritative and kept out of the authoritative ledger. No proof archive may contain bootstrap secret, STS, SSH private key or full token.

## 10. Fail-closed, rollback and deferred claims

At any point, missing or contradictory authority, lock failure, unhealthy ledger, unsafe or stale evidence, missing receipt, unknown adapter, unavailable kill switch, uncertain endpoint identity, or failed security separation stops the affected decision. Do not turn unknown into success, invent a terminal event, infer a provider send, repeat a send, auto-repair the ledger, or release a recovered run's admission block without the inherited authorized terminal event. A rollback of controller code cannot delete or rewrite the canonical ledger; recovery still follows the ledger and the single startup predicate.

LC-A4 does not claim distributed exactly-once delivery, provider actuation safety, a real post-intent PRE-SEND runtime path, economical-stop repeatability, bound authority for historical RUN-02/RUN-03, or binding reconstruction after ledger loss. Those claims remain outside LC-A4. Real StartInstance, StopInstance and any provider lifecycle mutation are `DEFERRED_BEYOND_LC_A4`.

## 11. Authorization boundary after Gate 1

Gate 1 landing authorizes the governance bridge and this contract only. It does not authorize controller source creation, dependency installation, implementation branch creation, provider/ECS access, SSH, Windows account or service creation, ACL mutation, Credential Store access/change, STS, hosted proof, StartInstance, StopInstance, or `MUTATION_INTENT` emission. Each later mutation requires separate explicit Human authorization. This document itself must never be used as evidence of such authorization.
