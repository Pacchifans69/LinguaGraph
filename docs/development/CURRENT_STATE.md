# LinguaGraph — Current Engineering State

This file is the durable engineering handoff and navigation index for the
current repository state. It summarizes facts needed to reconstruct the
project without relying on chat history.

It is not a replacement for accepted ADRs, the frozen M0 pre-implementation
specification/report, executable tests, Alembic history, or merged PR/Git
history.

---

## 1. Repository checkpoint

Current completed implementation milestone:

**M0 — Manual Alignment Workbench: COMPLETE**

Last completed checkpoint:

**M0.7 — Hardening: COMPLETE / MERGED / CLOSED**

M0.1 through M0.7 have been human-reviewed and merged into `main`.

### Checkpoint ledger

| Checkpoint | PR | Final reviewed implementation | Merge / durable implementation result |
|---|---:|---|---|
| M0.1 Repository Foundation | #1 | historical implementation lineage | `5bfdb9b` |
| M0.2 Persistence Model | #2 | `71ab918` | `c92204f` |
| M0.3 Document Workspace | #5 | `33bfaef20c2e64bed92fe00aa147d74611ac41ad` | `1230ffe0282adac3a20c1aafac6c2271c788b198` |
| M0.4 Selection Engine | #6 | `2d0d4bcf6dd562e3cab003aa615049628c173999` | `b2472fcc6e6cda23cb98244ae86ab63fd58ef5ad` |
| M0.5 Alignment Persistence | #7 | `b6714d6454063b6c656631fe63fc23e6813d28f4` | `8d1a57b41f2fb717faca02f3162b4770e62ffbff` |
| M0.6 Alignment Visualization | #8 | `f86d6429d41e76d4093e08898a9e7879e3774c49` | `55442d4ce7f71bd28c3368de641802f942e57055` |
| M0.7 Hardening | #9 | `580e27cbea09e50f40782a92da426e7332e8a54d` | rebase merge → `697b019dc2820c67dacbc0b58a718e198ab655be` immediately after merge |

M0.5 and M0.6 merge commits were verified at their Gate 3 closeouts to have no
file-tree difference from the final reviewed implementation heads.

M0.7 required a different provenance statement because repository policy
allowed only rebase merge. Gate 3 proved exact tree identity instead; see
section 2.

---

## 2. M0.7 durable provenance

### Approved base and candidate

- approved M0.7 base:
  `7b3e61c547a7831275ae5fb01458ed0bdd7c202c`
- historical formal branch: `m0.7-hardening` (deleted after Gate 3 durable
  closure during the separate cleanup step)
- final reviewed / externally proven candidate:
  `580e27cbea09e50f40782a92da426e7332e8a54d`
- candidate parent:
  `d89fe820e544cfa68e3ba48d265a1a7bce27bc55`
- candidate tree:
  `16c2bd3f5a8c5cb4960e193896547093fe091c87`
- pre-PR compare: ahead 19 / behind 0; merge base exactly the approved base.

The candidate remained frozen and unmodified through Gate 2, Static Human
Diff Review and Human Runtime Acceptance.

### PR and merge

PR #9: `M0.7 — Hardening`

At merge decision time GitHub repository policy was:

```text
merge commit   disabled
squash merge  disabled
rebase merge  enabled
```

A merge-commit attempt was rejected by GitHub with HTTP 405 and made no
repository change. After explicit human authorization, PR #9 was merged with
**rebase merge** on 2026-08-30.

GitHub recorded the rewritten durable implementation main tip immediately
after merge as:

`697b019dc2820c67dacbc0b58a718e198ab655be`

Its tree is:

`16c2bd3f5a8c5cb4960e193896547093fe091c87`

The frozen candidate `580e27c…` has the same tree SHA. Therefore:

**candidate → durable implementation main tree identity: PASS / EXACT**

This is the Gate 3 provenance bridge between the exact candidate that was
externally proven and the rebase-rewritten durable `main` lineage.

The durable implementation main state is 19 commits ahead of the approved
base, 0 behind, with merge base exactly the approved base.

---

## 3. M0.7 lifecycle

- repository reality reconstruction: PASS;
- Gate 1 integrity: PASS;
- M0.7 contract reconstruction: PASS;
- Human Contract Review / freeze: PASS;
- bounded implementation: PASS;
- formal candidate freeze: PASS;
- Gate 2: **PASS under approved External Infrastructure Exception**;
- Static Human Diff Review: PASS;
- Human Runtime Acceptance: PASS;
- PR #9: created and reviewed;
- Human Merge Decision: APPROVED;
- PR #9: MERGED via rebase;
- Gate 3 post-merge integrity: PASS;
- durable-state closure: PASS;
- implementation-branch cleanup: PASS.

Full closeout ledger:

`docs/development/M0_7_CLOSEOUT.md`

---

## 4. Gate 2 evidence and external infrastructure exception

### Formal result

**Gate 2 PASS under approved External Infrastructure Exception**

The exception waived only provider-specific GitHub-hosted-runner execution.
It did not waive semantic gates, hosted Linux execution, runtime versions,
provenance, integrity, or retained evidence.

### GitHub Actions provider state

**GitHub Actions provider proof: BLOCKED / EXTERNAL**

**G2-X01: OPEN / EXTERNAL**

The repeated failure pattern is pre-step: jobs fail before checkout or any
workflow step begins. Evidence includes the frozen candidate runs, diagnostic
workflows, an independent public runner probe, PR #9 run #8, post-merge
`main` run #9, and later docs-only durable-state runs through run #11.

Post-merge implementation evidence:

- run: `33306945264` (run #9, push to `main`);
- head: `697b019dc2820c67dacbc0b58a718e198ab655be`;
- job: `99245049374`;
- result: failure before any workflow step;
- executed steps: none;
- usable job logs: none.

Later docs-only durable tips reproduced the same pre-step pattern; provider
recovery still had not occurred when implementation-branch cleanup completed.

This does not constitute a new application correctness failure and does not
close `G2-X01`. The exact internal provider root cause is not asserted.

If GitHub-hosted runners later recover, rerun the frozen workflow on the
then-current durable release lineage. Only successful provider-specific proof
may close `G2-X01`; such later proof does not retroactively invalidate the
approved exception.

### Accepted independent CircleCI proof

- project: `Pacchifans69/LinguaGraph`;
- definition: `M0.7 External Proof`;
- definition UUID: `529c110d-01f2-4d99-8c3c-e2b0adedf594`;
- pipeline #5: `623ce1b5-8f9f-46e4-baf5-f0134f1f7b8d`;
- workflow: `m0-7-external-proof`;
- workflow UUID: `9c12d9eb-f946-413e-9beb-8c5937139bcd`;
- successful job: `bf4da739-325b-4f3f-80a5-448714160e46`;
- exact application SHA:
  `580e27cbea09e50f40782a92da426e7332e8a54d`;
- isolated config repo: `Pacchifans69/linguagraph-ci-proof-`;
- accepted config SHA:
  `920a6ee1eda077539bf3dc60964dac6a5eb25b94`.

Runtime and gate results:

```text
Python       3.13.15
Node         24.20.0
PostgreSQL   18.6
Alembic      0002 (head)
backend      390 passed
skip guard   PASS
npm ci       PASS
lint         PASS
typecheck    PASS
Vitest/RTL   PASS
build        PASS
Playwright   golden + Unicode PASS
DB cleanup   PASS
tracked tree PASS
provenance   exact dual-SHA PASS
```

The external configuration lineage is separate from the application
candidate. ADR-009 is unchanged.

A historical generic `CircleCI Pipeline` error status may still be visible on
the candidate from earlier setup attempts. The accepted proof is the specific
successful `ci/circleci: m0-7-external-proof` job listed above.

---

## 5. M0.7 implemented hardening

M0.7 stayed within the frozen section-54 Hardening scope:

- integration tests and fail-closed real-PostgreSQL execution;
- migration-from-zero / downgrade-upgrade / Alembic drift verification;
- bounded PostgreSQL connection behavior;
- safer disposable test/E2E database lifecycle;
- GitHub Actions release-baseline workflow configuration;
- independent external CI proof under the approved exception;
- Unicode release-blocker Playwright E2E;
- error visibility, loading/empty states and accessibility hardening;
- destructive-operation pending locks and confirmation focus lifecycle;
- production build verification;
- safe Windows `dev.ps1` and `verify.ps1` orchestration;
- as-built architecture, API, testing and manual-acceptance documentation.

Static review confirmed M0.7 introduced:

- no dependency-manifest/lockfile drift;
- no ADR changes;
- no Alembic `versions/*` changes;
- no schema change;
- no M0 explicit non-goal.

Schema head remains `0002`.

---

## 6. Human Runtime Acceptance

Human Runtime Acceptance: **PASS**.

Covered:

- Project / ParallelDocument / TextVersion creation;
- simultaneous EN/DE/FR/ES panels;
- hide/show/reorder and reload-persisted panel preferences;
- native selection and canonical offsets;
- Alignment Tray duplicate/overlap/Escape behavior;
- persistent multi-version Alignment creation and reload;
- annotation indicators;
- hover/active counterparts and connector binding;
- Alignment Inspector note persistence and member removal;
- Unicode `Café 🙂 mañana für français` offsets, exact text, persistence,
  reload and visualization;
- destructive confirmation / pending lock;
- loading, empty, focus and keyboard sanity.

### HRA observations

**HRA-F07 — OPEN / NON-BLOCKING ROBUSTNESS DEBT**

A broken/malformed `node` command that resolves but emits no version stdout
can surface a raw PowerShell/.NET prerequisite error instead of a normalized
launcher diagnostic. Normal Node 24 execution is unaffected.

**HRA-F08 — CLOSED / NON-CANDIDATE**

Edge's text-selection mini menu can intercept the first Escape before the web
page receives it. A/B testing with the mini menu disabled demonstrated that a
single delivered Escape clears both application and native selection while
preserving the staged tray.

**HRA-F09 — OPEN / NON-BLOCKING VISUAL DEBT**

The frozen M0.6 center-to-hub connector algorithm can route a line through text
glyphs, visually resembling a strikethrough. Human inspection confirmed that
it remains attached to the correct spans; correcting the routing would be a
later visualization-design change, not an M0.7 hardening blocker.

---

## 7. M0 Definition of Done

The authoritative M0 Definition of Done has 24 requirements. At M0.7 closeout
all are satisfied:

1. Project creation — PASS.
2. ParallelDocument creation — PASS.
3. arbitrary BCP-47 TextVersion — PASS.
4. EN/DE/FR/ES simultaneous display — PASS.
5. reliable contiguous native text selection — PASS.
6. Unicode code-point API/database offsets — PASS.
7. 2–N selections → AlignmentGroup — PASS.
8. same TextVersion may contribute multiple spans — PASS.
9. Alignment persistence — PASS.
10. reload recovery — PASS.
11. Alignment editing — PASS.
12. Alignment deletion — PASS.
13. hover/click counterpart discovery — PASS.
14. stable selected-alignment visualization — PASS.
15. backend unit tests — PASS.
16. backend real-PostgreSQL integration tests — PASS.
17. frontend tests — PASS.
18. Unicode regression tests — PASS.
19. E2E golden path — PASS.
20. clean database migration to HEAD — PASS.
21. frontend production build — PASS.
22. typecheck — PASS.
23. lint — PASS.
24. documentation — PASS.

Architecture-level release blocker: **PASS** — the core schema contains no
EN/DE/FR/ES-specific structure.

---

## 8. Current architecture / schema baseline

Accepted ADRs: **ADR-001 … ADR-009**, frozen unless a later governed decision
changes them.

Database:

- PostgreSQL 18 baseline;
- Alembic revisions: `0001` → `0002`;
- current M0 schema head: `0002`;
- M0.3–M0.7 add no new schema revision.

Core language-neutral entities:

```text
Project
ParallelDocument
TextVersion
Span
AlignmentGroup
AlignmentMember
```

Core invariants remain:

- canonical UTF-8/NFC text;
- Unicode code-point offsets;
- immutable annotated TextVersion content;
- atomic alignment mutations;
- server-derived exact text/context;
- language-neutral schema;
- authoritative workspace snapshot for persisted frontend state.

---

## 9. Verification entry points

Local Windows run:

```powershell
.\scripts\dev.ps1
```

Windows PowerShell 5.1 execution-policy fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Local verification:

```powershell
.\scripts\verify.ps1
```

or on Windows PowerShell 5.1:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

Canonical CI workflow configuration:

`.github/workflows/ci.yml`

See `docs/testing/testing-strategy.md` for evidence semantics. A configured
workflow is not proof of a successful provider run.

---

## 10. Known retained limitations

The following are accepted/non-blocking at M0 closure:

- `G2-X01` GitHub-hosted-runner provider proof remains OPEN / EXTERNAL;
- HRA-F07 malformed-Node diagnostic quality;
- HRA-F09 connector line can cross text glyphs;
- accepted same-group concurrent PATCH behavior is not a collaborative
  locking protocol;
- mutation vs destructive-deletion interleavings are not redesigned into a
  broader cross-operation lock;
- nondeterministic concurrent request ordering is not converted into a
  distributed collaboration model;
- M0 intentionally excludes translation/NLP/LLM, authentication,
  collaboration/WebSocket/CRDT, Redis/Neo4j/Elasticsearch/vector search,
  native desktop/mobile/browser-extension packaging, PDF/EPUB readers and
  sophisticated synchronized scrolling.

---

## 11. Cleanup status

**Implementation-branch cleanup: PASS.**

After Gate 3 and durable-state closure:

- the historical `m0.7-hardening@580e27c…` implementation branch was deleted
  locally and remotely under exact-SHA guards;
- the final human-reported `git branch -a` listing contained neither local nor
  `origin/m0.7-hardening`;
- GitHub independently returned HTTP 404 `Branch not found` for
  `m0.7-hardening` after deletion.

Proof/diagnostic evidence is intentionally retained while `G2-X01` remains
**OPEN / EXTERNAL**. Retained evidence includes:

- `ci/m0.7-external-proof@7ae9ce47570c8581423ed2932daf99d417acf52e`;
- `diagnostic/actions-indexing@e825a785883357d877d12003dc59615ea2bf586e`;
- historical CI/setup refs `m0.7-ci-proof` and `circleci-project-setup`;
- external config repository
  `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`;
- public runner probe
  `Pacchifans69/actions-runner-probe@e3a96b0b49a5612bf43d209d8e2991df95dc30a5`;
- CircleCI proof artifacts/metadata and GitHub Actions diagnostic history.

These retained proof fixtures must not be confused with active implementation
branches. Reconsider their cleanup only after a later human review, especially
if provider-specific GitHub Actions proof succeeds and `G2-X01` is closed.

---

## 12. Next work rule

There is no planned or authorized **M0.8** checkpoint.

The M0 specification's future-stage discussion describes architectural
direction only. Before implementing any post-M0 milestone:

1. start a fresh checkpoint conversation;
2. reconstruct current `main` and retained external-debt reality;
3. define the bounded milestone contract and explicit non-goals;
4. perform integrity/architecture review;
5. obtain human contract approval/freeze;
6. create a new implementation branch from the approved durable `main` base.

Do not recreate or reuse the deleted historical `m0.7-hardening` branch as a
post-M0 implementation branch.
