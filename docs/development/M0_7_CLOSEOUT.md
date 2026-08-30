# M0.7 — Hardening Closeout

Date: 2026-08-30

This document is the durable Gate 3 closeout record for **M0.7 — Hardening**.
It records repository reality and verification evidence; it does not replace
the accepted ADRs, the frozen M0 pre-implementation specification/report,
Git history, CI provider records, or the implementation itself.

## 1. Final status

**M0.7 — Hardening: COMPLETE / MERGED / CLOSED**

**M0 — Manual Alignment Workbench: COMPLETE**

The M0.7 checkpoint satisfied its frozen scope and the M0 Definition of Done.
No M0.8 checkpoint is defined. Any post-M0 implementation requires a fresh
checkpoint conversation, repository-reality reconstruction, a new bounded
contract, and explicit human authorization; future-phase ideas in the M0 spec
are not themselves an implementation contract.

## 2. Approved provenance

Repository: `Pacchifans69/LinguaGraph`

- approved M0.7 base: `7b3e61c547a7831275ae5fb01458ed0bdd7c202c`
- historical formal implementation branch: `m0.7-hardening`
- final reviewed / externally proven candidate:
  `580e27cbea09e50f40782a92da426e7332e8a54d`
- candidate parent: `d89fe820e544cfa68e3ba48d265a1a7bce27bc55`
- candidate tree: `16c2bd3f5a8c5cb4960e193896547093fe091c87`
- PR: #9 — `M0.7 — Hardening`
- PR creation compare: ahead 19 / behind 0; merge base exactly the approved
  base

The candidate remained frozen and unmodified through the accepted external
Gate 2 proof, Human Diff Review, and Human Runtime Acceptance. The historical
implementation branch was deleted only after merge, Gate 3, and durable-state
closure were complete; the candidate commit and its provenance remain in Git
history and the retained proof records.

## 3. Gate 2

Formal result:

**Gate 2 PASS under approved External Infrastructure Exception**

The exception waived only the provider-specific GitHub-hosted-runner proof.
It did not waive the semantic verification gates, independent hosted Linux
execution, runtime versions, exact provenance, or retained evidence.

### 3.1 GitHub Actions provider state

`G2-X01` remains **OPEN / EXTERNAL**.

Observed provider-specific runs repeatedly failed before any workflow step
started. The accepted characterization is an externally reproduced pre-step
GitHub-hosted-runner start failure; the exact internal provider root cause is
not asserted.

Evidence includes:

- original candidate workflow failures;
- diagnostic smoke/full-workflow failures;
- an independent public hosted-runner probe with the same pre-step pattern;
- PR #9 run #8 (`33306576843`), job `99244080950`, candidate
  `580e27c…`, failed in ~3 s with no executed steps;
- post-merge `main` run #9 (`33306945264`), job `99245049374`, durable
  implementation SHA `697b019…`, again failed pre-step with no executed
  steps / usable job logs;
- subsequent docs-only durable-state runs through run #11 continued the same
  pre-step pattern, so no provider recovery occurred before branch cleanup.

Therefore:

- GitHub Actions provider proof: **BLOCKED / EXTERNAL**;
- GitHub Actions: **NOT PASS**;
- `G2-X01`: **OPEN / EXTERNAL**.

If GitHub-hosted runners later recover, rerun the frozen workflow on the
then-current durable release lineage. Only a successful provider-specific run
may close `G2-X01`; such a later closure does not retroactively invalidate the
approved external exception.

### 3.2 Accepted independent CircleCI proof

Provider: CircleCI Cloud

Project definition: `M0.7 External Proof`

- project: `Pacchifans69/LinguaGraph`
- definition UUID: `529c110d-01f2-4d99-8c3c-e2b0adedf594`
- pipeline #5: `623ce1b5-8f9f-46e4-baf5-f0134f1f7b8d`
- workflow: `m0-7-external-proof`
- workflow UUID: `9c12d9eb-f946-413e-9beb-8c5937139bcd`
- successful job: `bf4da739-325b-4f3f-80a5-448714160e46`
- formal application revision:
  `580e27cbea09e50f40782a92da426e7332e8a54d`
- isolated config repository:
  `Pacchifans69/linguagraph-ci-proof-`
- accepted config SHA:
  `920a6ee1eda077539bf3dc60964dac6a5eb25b94`

Exact provenance was fail-closed: CircleCI pipeline revision and actual
`git rev-parse HEAD` both equaled the formal candidate SHA. The external
configuration lineage remained separate from the application lineage.

Runtime / semantic evidence:

- Python 3.13.15;
- Node 24.20.0;
- PostgreSQL 18.6;
- `uv sync --frozen`;
- Alembic empty-database upgrade/current/check with `0002 (head)`;
- backend: 390 passed;
- skipped-test guard: passed;
- `npm ci`;
- frontend lint: passed;
- frontend typecheck: passed;
- Vitest / React Testing Library: passed;
- production build: passed;
- Playwright golden path: passed;
- Playwright Unicode release blocker: passed;
- disposable DB cleanup: passed;
- tracked-tree integrity: passed;
- retained metadata/config snapshot/manifest/SHA256 proof inventory: passed.

ADR-009 was not changed by the exception or by the external CI topology.

## 4. Human review

### 4.1 Static Human Diff Review

**PASS — no candidate blocker found.**

The review confirmed that the M0.7 diff stayed within the frozen Hardening
scope: integration/E2E/Unicode regression, errors/loading/empty states,
accessibility, migration-from-zero, clean build, CI/verification launchers,
and documentation.

It also confirmed:

- no dependency-manifest or lockfile drift;
- no ADR changes;
- no Alembic `versions/*` changes;
- schema head remained `0002`;
- no M0 explicit non-goal was introduced;
- database hardening changed connection/test mechanics, not the domain schema.

### 4.2 Human Runtime Acceptance

**PASS.**

Human acceptance covered:

- Project → ParallelDocument → TextVersion creation;
- EN/DE/FR/ES side-by-side panels;
- hide/show/reorder preference persistence;
- native selection, tray staging, duplicate/overlap behavior and Escape
  semantics;
- persisted Alignment creation and reload;
- annotation indicators, hover/active visualization and connectors;
- Alignment Inspector note editing/member removal/reload persistence;
- Unicode code-point offsets for `Café 🙂 mañana für français` including the
  emoji boundary, persisted exact text and reload/render behavior;
- destructive confirmation and pending lock behavior;
- loading/empty-state/focus/keyboard sanity.

Non-blocking observations retained:

- **HRA-F07:** a resolvable but malformed/broken local Node command that
  returns no version stdout can surface a raw PowerShell/.NET prerequisite
  diagnostic instead of a normalized launcher message. Normal Node 24 and
  `npm.cmd` operation are unaffected.
- **HRA-F09:** the frozen M0.6 center-to-hub connector geometry can cross text
  glyphs and visually resemble a strikethrough. Binding/geometry correctness
  was verified; redesigning routing belongs to later visualization polish.
- Edge's text-selection mini menu can consume the first Escape before the
  page receives it. A/B testing with the mini menu disabled proved that one
  delivered Escape clears application and native selection while preserving
  the tray; this is browser chrome behavior, not a candidate defect.

## 5. Merge reality

PR #9 was first attempted with merge-commit semantics. GitHub rejected that
attempt because repository settings disallow merge commits. Repository merge
settings at the decision point were:

- merge commit: disabled;
- squash merge: disabled;
- rebase merge: enabled.

After explicit human authorization, PR #9 was merged using **rebase merge**.

GitHub recorded:

- merged: 2026-08-30;
- durable implementation `main` tip immediately after merge:
  `697b019dc2820c67dacbc0b58a718e198ab655be`;
- rewritten tip parent:
  `ff0aca62a24e9241cff033b574c69015aa0e5a39`.

Because rebase merge rewrites commit identities, the durable main commit SHA
is not the externally proven candidate SHA. Gate 3 therefore verified content
identity mechanically:

```text
candidate 580e27c... tree = 16c2bd3f5a8c5cb4960e193896547093fe091c87
main      697b019... tree = 16c2bd3f5a8c5cb4960e193896547093fe091c87
```

**Result: exact tree identity PASS.**

The durable implementation `main` is 19 commits ahead of the approved base
and 0 behind; its merge base with the approved base is exactly
`7b3e61c547a7831275ae5fb01458ed0bdd7c202c`.

## 6. Gate 3 post-merge integrity

**PASS.**

Verified after merge:

1. PR #9 is closed and `merged=true`.
2. `main` points to `697b019dc2820c67dacbc0b58a718e198ab655be`
   before the documentation closeout commits.
3. Candidate tree and durable implementation main tree are exactly identical.
4. No candidate content was lost or added by the rebase merge.
5. M0.7 introduced no schema revision, dependency/lockfile drift, or ADR
   change.
6. Alembic head remains `0002`.
7. The post-merge GitHub Actions runs reproduced the same pre-step external
   failure; they do not create a new application correctness finding and do
   not close `G2-X01`.
8. Human Diff Review and Human Runtime Acceptance remain PASS.
9. The accepted CircleCI proof remains tied to the exact frozen candidate;
   Gate 3 tree identity connects that proven content to the rewritten durable
   `main` lineage.

## 7. M0 Definition of Done closure

The authoritative M0 Definition of Done contains 24 requirements. At M0.7
closeout all are satisfied:

- Project and ParallelDocument creation: proven;
- arbitrary BCP-47 TextVersions and simultaneous EN/DE/FR/ES display: proven;
- reliable contiguous native selection and Unicode code-point offsets: proven;
- 2–N AlignmentGroup creation, same-version multiple spans, persistence,
  reload, edit and delete: proven;
- hover/click counterpart discovery and stable selected-alignment
  visualization: proven;
- backend unit and real-PostgreSQL integration suites: green under the
  approved external proof;
- frontend tests, Unicode regression, E2E golden path, typecheck and lint:
  green under the approved external proof;
- clean database migration to HEAD: green;
- production frontend build: green;
- durable documentation: completed by the M0.7 implementation and closeout;
- architecture-level release blocker: core schema remains language-neutral,
  with no EN/DE/FR/ES-specific schema structure.

## 8. Durable state and cleanup

Durable truths:

- M0.1 … M0.7: **COMPLETE / MERGED**;
- M0.7: **CLOSED** after Gate 3 durable-state closure;
- M0: **COMPLETE**;
- PR #9: merged via rebase;
- formal reviewed/proven candidate: `580e27c…`;
- durable implementation merge lineage: `main@697b019…` immediately after
  rebase merge;
- candidate/main implementation trees: exactly equal;
- Gate 2: **PASS under approved External Infrastructure Exception**;
- GitHub Actions provider proof: **BLOCKED / EXTERNAL**;
- `G2-X01`: **OPEN / EXTERNAL**;
- CircleCI independent proof: **PASS**;
- ADR-001 … ADR-009: accepted/frozen; ADR-009 unchanged;
- Alembic head: `0002`.

### 8.1 Implementation-branch cleanup

**PASS.**

After Gate 3 and durable-state closure:

- the user performed an exact-SHA-guarded cleanup with `origin/main` fixed at
  `04a948b32ed23a5a13d4ce84e747e1ccd4830fe3` and the historical candidate
  ref fixed at `580e27cbea09e50f40782a92da426e7332e8a54d`;
- local `m0.7-hardening` was deleted;
- remote `origin/m0.7-hardening` was deleted and pruned;
- the final human-reported branch listing contained no local or remote
  `m0.7-hardening` ref;
- GitHub was independently queried after deletion and returned HTTP 404
  `Branch not found` for `m0.7-hardening`.

The branch deletion does not erase the historical candidate commit, PR #9,
CircleCI proof provenance, or the Gate 3 candidate→rebase-main tree-identity
record.

### 8.2 Proof/diagnostic retention

Proof cleanup is intentionally **DEFERRED while `G2-X01` remains OPEN /
EXTERNAL**. The following support evidence is retained rather than deleted:

- `ci/m0.7-external-proof@7ae9ce47570c8581423ed2932daf99d417acf52e`;
- `diagnostic/actions-indexing@e825a785883357d877d12003dc59615ea2bf586e`;
- historical CI/setup refs including `m0.7-ci-proof` and
  `circleci-project-setup`;
- `Pacchifans69/linguagraph-ci-proof-@920a6ee1eda077539bf3dc60964dac6a5eb25b94`;
- `Pacchifans69/actions-runner-probe@e3a96b0b49a5612bf43d209d8e2991df95dc30a5`;
- CircleCI pipeline/job metadata, configuration snapshot, manifest and SHA256
  proof inventory;
- GitHub Actions failed-run diagnostics and the private support-ticket record.

Those records may be reconsidered only after later human review, especially if
GitHub-hosted-runner proof eventually succeeds and `G2-X01` is closed.
