# LinguaGraph M9 — Grapheme-Safe Native Selection Capture

## Contract Status

**Status:** FROZEN — HUMAN APPROVED

**Human checkpoint naming and HCR-A1–A10 approval date:** 2026-09-27

**Approved pre-freeze durable base:** `fd224bf0a2b9c8d2797091ea0341ee551a89b340`

**Approved pre-freeze durable tree:** `e7c8fe63146dc0a8b2e11f3509ea68267d9a922c`

**Implementation authorization:** NOT GRANTED by this freeze. Bounded M9
implementation may begin only after the docs-only freeze commit is
independently verified and the Human separately authorizes creation of the
implementation branch.

**Planned implementation branch:**
`m9-grapheme-safe-native-selection-capture`

This contract is the authoritative bounded execution contract for M9.

It inherits:

- the accepted M0 domain model, canonical-text rules, Unicode code-point
  persistence coordinates, Span identity, and AlignmentGroup N:M semantics;
- the completed M1–M8 implementation checkpoints;
- ADR-001 through ADR-016.

M9 does not silently reopen those decisions.

---

## 1. Goal

M9 hardens only the authoring boundary by which a native browser
`Selection` / `Range` captured inside a canonical `TextPanel` becomes a
new frontend `PendingSpan`.

Current M0–M8 behavior rejects a DOM endpoint that splits a UTF-16 surrogate
pair, then converts valid DOM UTF-16 positions into canonical Unicode
code-point offsets. A code-point boundary can nevertheless lie inside one
user-perceived extended grapheme cluster, including emoji modifier sequences,
ZWJ sequences, regional-indicator flags, or combining sequences.

M9 adds a second fail-closed authoring validation:

~~~text
native Selection / Range
→ existing canonical DOM/root/hash validation
→ existing UTF-16 endpoint validation
→ existing UTF-16 → Unicode code-point conversion
→ NEW full-canonical-content grapheme-boundary validation
→ existing exact quote validation
→ PendingSpan
~~~

A new native TextPanel selection is capturable only when both canonical
endpoints are extended-grapheme-cluster boundaries of the complete canonical
`TextVersion.content`.

M9 does not change the persisted coordinate system. Database/API/Span
coordinates remain Unicode code-point offsets.

---

## 2. Human-Approved Decisions HCR-A1 through HCR-A10

### 2.1 HCR-A1 — native-selection-only scope

M9 governs only new native canonical TextPanel selection capture into
`PendingSpan`.

Sentence editing, token editing, backend boundary validation, persisted-range
migration, document editing, and re-anchoring remain outside M9.

### 2.2 HCR-A2 — reject only; never snap

A grapheme-invalid native endpoint is rejected exactly.

M9 must not:

- expand the selection outward;
- shrink it inward;
- choose a nearest boundary;
- apply direction-dependent correction;
- rewrite or replace the browser's native Selection/Range.

### 2.3 HCR-A3 — Intl.Segmenter, no new dependency, fail closed

Frontend grapheme validation uses the platform `Intl.Segmenter` grapheme
capability.

M9 adds no package dependency and no custom Unicode grapheme algorithm.

If the required grapheme-segmentation capability is unavailable or unusable,
capture fails closed with the frontend-only
`GRAPHEME_SEGMENTER_UNAVAILABLE` result. M9 must not silently fall back to
code-point-only acceptance.

### 2.4 HCR-A4 — forward authoring only; legacy compatibility

M9 restricts new native selection authoring only.

Existing persisted code-point-valid ranges remain valid domain data and must
remain readable, renderable, highlightable, registry-addressable, and
connector-addressable even if an endpoint lies inside a grapheme cluster.

`canonicalRangeToDomRange` remains code-point based.

### 2.5 HCR-A5 — failed recapture clears stale selection authority

Every native capture attempt targeting the current canonical content root has
one of these outcomes:

~~~text
OK
→ replace currentSelection

EMPTY_SELECTION
→ clear currentSelection

ANY OTHER ERROR
→ clear currentSelection
~~~

A failed new attempt must never leave a previously captured selection
stageable through "Add to Alignment".

### 2.6 HCR-A6 — full grapheme editing remains deferred

M9 does not close the broad historical "full grapheme-cluster editing" debt.

Sentence manual split, token manual split, backend segmentation boundaries,
generic text editing, document revisions/re-anchoring, and legacy persisted
range migration remain deferred.

### 2.7 HCR-A7 — frontend error taxonomy

M9 adds two frontend selection-engine-only result codes:

~~~text
INVALID_GRAPHEME_BOUNDARY
GRAPHEME_SEGMENTER_UNAVAILABLE
~~~

They are distinct from existing `INVALID_SELECTION_BOUNDARY`.

Semantics:

- `INVALID_SELECTION_BOUNDARY`: the DOM/code-point endpoint itself is invalid,
  including inherited integer/range/surrogate-pair cases;
- `INVALID_GRAPHEME_BOUNDARY`: the endpoint is a legal canonical code-point
  boundary but lies inside one grapheme cluster;
- `GRAPHEME_SEGMENTER_UNAVAILABLE`: the required runtime grapheme capability
  is absent or unusable.

These are not backend API/domain error codes and are not persisted.

### 2.8 HCR-A8 — content-based, language-tag-independent validity

Grapheme validity is derived from the complete canonical
`TextVersion.content`.

`TextVersion.language_tag` is not boundary authority and must not be supplied
as the semantic input that decides whether a native selection endpoint is
valid.

Any UTF-16 index produced by `Intl.Segmenter` must pass through the existing
shared UTF-16 → code-point conversion strategy before it can be compared with a
canonical endpoint.

### 2.9 HCR-A9 — bounded user feedback

M9 provides bounded feedback for its two new failure categories.

For `INVALID_GRAPHEME_BOUNDARY`, the user-facing meaning is equivalent to:

> Selection must start and end at complete character boundaries.

For `GRAPHEME_SEGMENTER_UNAVAILABLE`, the message must describe a browser /
runtime capability problem rather than blame the user's selection.

M9 does not authorize a general redesign of the UX for inherited selection
errors such as `STALE_TEXT_VERSION`, `DOM_INTEGRITY_ERROR`,
`CROSS_VERSION_SELECTION`, or `SELECTION_TEXT_MISMATCH`.

Authority and feedback are separate: regardless of message rendering, every
failed capture clears stale current selection authority.

### 2.10 HCR-A10 — targeted Human Runtime Acceptance

After automated exact-candidate Gate 2 evidence is established, M9 requires
targeted Human Runtime Acceptance of the exact semantic candidate.

Human review verifies real interaction and stale-selection fail-closed
behavior; it does not replace automated grapheme correctness proof.

---

## 3. Frozen Coordinate and Canonical-Text Invariants

M9 preserves ADR-001:

~~~text
persisted/API text offsets
= zero-based, start-inclusive, end-exclusive Unicode code-point offsets
~~~

M9 must not introduce persisted or API-visible:

- UTF-16 code-unit offsets;
- grapheme-cluster indices;
- UTF-8 byte offsets.

Canonical text remains backend-authoritative, NFC-normalized with LF line
endings under inherited rules.

`content_hash` authority remains unchanged.

M9 does not change `TextVersion`, `Span`, `AlignmentMember`, or
`AlignmentGroup` identity.

---

## 4. Existing Selection Pipeline to Preserve

The current selection engine remains structurally authoritative:

1. validate the requested `[data-text-content-root]`;
2. verify `TextVersion.id`, `content_hash`, canonical DOM text, and flat
   run integrity;
3. require one non-collapsed Range;
4. require endpoints inside the same canonical content root;
5. resolve supported Text-node / run-element / content-root boundary shapes;
6. reject invalid integer/range shapes and UTF-16 surrogate-pair splits;
7. convert DOM UTF-16 offsets to canonical code-point offsets;
8. normalize direction to `start < end`;
9. verify the canonical quote equals native `Range.toString()`;
10. return canonical selection identity plus direction provenance.

M9 inserts grapheme validation after canonical code-point endpoints are
resolved and the non-empty canonical range is known, but before a successful
selection result is returned.

Existing DOM integrity and stale-version checks are not weakened.

---

## 5. Full-Content Grapheme Boundary Authority

Grapheme validity is computed against the complete canonical
`TextVersion.content`, never against an isolated rendered run.

For one canonical content string, the validator derives a set of legal
canonical code-point boundaries from platform grapheme segmentation.

The boundary set includes:

- canonical offset `0`;
- every grapheme segment start after conversion through the existing shared
  UTF-16 → code-point utility;
- canonical content length.

Both selection endpoints must belong to this set.

The validator must fail closed if required segmentation output cannot provide a
coherent complete boundary set.

---

## 6. Run-Boundary Non-Authority

Existing `[data-run]` elements are rendering segments, not grapheme
authority.

Historical code-point-valid Spans may split a grapheme cluster and therefore
may also split the flat rendered run structure at that code-point boundary.

Consequently:

~~~text
DOM run boundary
≠ automatically valid M9 authoring boundary
~~~

A native endpoint represented as a run-element or content-root child boundary
must still be converted to its canonical code-point offset and validated
against the full-content grapheme boundary set.

A selection may cross any number of runs when its outer endpoints are valid
grapheme boundaries.

---

## 7. Intl.Segmenter Capability Boundary

M9 may use a narrowly scoped pure frontend helper, for example:

`apps/web/src/shared/text/grapheme.ts`

The helper may use `Intl.Segmenter` with `granularity: "grapheme"`.

The helper must not use `TextVersion.language_tag` as validity authority.

No npm package, polyfill package, backend library, generated Unicode table, or
custom grapheme-break implementation is authorized.

An unavailable or unusable required platform capability must fail closed as
`GRAPHEME_SEGMENTER_UNAVAILABLE`.

---

## 8. Error Precedence and Failure Semantics

Inherited structural selection errors retain precedence.

A malformed/out-of-range/surrogate-splitting endpoint remains
`INVALID_SELECTION_BOUNDARY`; M9 does not relabel it as a grapheme error.

Only after both endpoints resolve to legal canonical code-point offsets may M9
return `INVALID_GRAPHEME_BOUNDARY`.

A collapsed/no-selection interaction retains `EMPTY_SELECTION` semantics and
does not require grapheme capability merely to clear the current selection.

No M9 error may create or preserve new staging authority.

---

## 9. Direction and Quote Semantics

Selection direction remains provenance only.

Equivalent forward and backward native selections must resolve to the same:

- TextVersion identity;
- content hash;
- canonical start;
- canonical end;
- canonical quote.

M9 must not make grapheme validity direction-dependent.

The exact quote invariant remains:

~~~text
sliceByCodePoints(canonical content, start, end)
==
native Range.toString()
~~~

No snapping is permitted to make this equality pass.

---

## 10. TextPanel Capture State

`TextPanel` remains the owner of native capture event integration.

Native selection capture remains triggered through the inherited canonical
content-root interaction path.

On a successful result:

- M9 clears bounded selection-capture feedback;
- the exact returned selection replaces `currentSelection`.

On `EMPTY_SELECTION`:

- `currentSelection` is cleared;
- no stale selection remains stageable.

On every other error:

- `currentSelection` is cleared before any later staging action can use it;
- M9-specific feedback is shown only for the two new M9 categories;
- inherited error UX is not broadly redesigned.

"Add to Alignment" must remain disabled when no current selection exists.

Tray contents already staged before the failed capture are not cleared by this
rule.

---

## 11. PendingSpan and Alignment Boundary

M9 does not change `PendingSpan` shape, identity, duplicate detection,
overlap rules, tray ownership, or Alignment mutation semantics.

Successful M9 capture still produces the inherited code-point-coordinate
PendingSpan data:

- `textVersionId`;
- `contentHash`;
- `start`;
- `end`;
- `quote`;
- `direction`.

Nothing is persisted until the inherited atomic Alignment creation path runs.

---

## 12. Reverse Mapping and Legacy Persisted Data

`canonicalRangeToDomRange` remains a canonical code-point-range → native DOM
Range locator.

M9 must not add grapheme validity as a precondition to reverse mapping.

Regression coverage must prove that an intentionally code-point-valid
intra-grapheme legacy range can still map back to DOM and render.

No existing Span, Alignment, sentence segment, token segment, lemma, or POS row
is migrated, rewritten, invalidated, or deleted by M9.

---

## 13. Explicit Scope

M9 includes only:

1. a pure frontend grapheme-boundary validation helper;
2. integration into native canonical TextPanel selection capture;
3. the two approved frontend-only selection result codes;
4. fail-closed stale-current-selection clearing on every failed recapture;
5. bounded feedback for the two M9-specific errors;
6. unit/component/browser regression required to prove the frozen behavior;
7. ADR-017 implementation record;
8. implementation-state documentation after the behavior exists;
9. targeted Human Runtime Acceptance after automated Gate 2.

---

## 14. Explicit Non-Goals

M9 excludes:

- full grapheme-aware editing;
- sentence manual-split grapheme enforcement;
- token manual-split grapheme enforcement;
- backend grapheme validation;
- database/API grapheme indices;
- migration of legacy spans or linguistic segments;
- automatic snapping or selection rewriting;
- generic content editing;
- document revision/re-anchoring;
- normalization redesign;
- TextVersion mutability redesign;
- Span/Alignment domain redesign;
- new linguistic annotation layers;
- morphology, Lexeme/shared vocabulary identity, or syntax;
- automatic NLP/LLM behavior;
- Selection/Range replacement;
- canonical TextPanel DOM redesign;
- RenderedSpanRegistry changes;
- connector routing changes;
- Workbench information-architecture changes;
- authentication/collaboration;
- runtime/dependency modernization;
- CI-provider redesign.

---

## 15. Persistence, API, Backend, and Migration Boundary

M9 changes no backend or persisted-domain semantics.

Frozen:

~~~text
apps/api/** semantic behavior unchanged
API request/response shapes unchanged
ORM schema unchanged
Alembic HEAD = 0006
new migration = NONE
~~~

Existing migrations remain byte-for-byte unchanged.

M9 adds no backend/domain error code.

Required migration regression remains:

~~~text
empty → 0006
alembic current == 0006
alembic check == no new upgrade operations
~~~

---

## 16. Dependency, Runtime, and Workflow Boundary

M9 adds no dependency.

Frozen runtime baseline:

~~~text
Python      3.13
Node.js     24
PostgreSQL  18
Alembic     0006
~~~

Frozen dependency files:

- `apps/api/pyproject.toml`;
- `apps/api/uv.lock`;
- `apps/web/package.json`;
- `apps/web/package-lock.json`.

`.github/workflows/ci.yml` is frozen by default.

Existing canonical workflow commands are expected to be sufficient. Provider
failure before repository-defined steps is diagnostic evidence, not semantic
application evidence.

---

## 17. Default Production Implementation Surface

After separate implementation authorization, default production changes are
limited to:

- `apps/web/src/shared/text/grapheme.ts` — new narrowly scoped helper;
- `apps/web/src/shared/text/selection.ts`;
- `apps/web/src/features/workspace/TextPanel.tsx`.

No other production file is authorized by default.

`apps/web/src/shared/text/offset.ts` is expected to remain unchanged; M9 must
reuse its existing conversion strategy.

If implementation evidence shows another production file is necessary, the
Agent must STOP and obtain Human scope review before modifying it.

---

## 18. Default Test Surface

M9 may add/modify only the bounded test surface required by its semantics:

- `apps/web/src/shared/text/grapheme.test.ts` — new if the helper is added;
- `apps/web/src/shared/text/selection.test.ts`;
- `apps/web/src/features/workspace/TextPanel.test.tsx`;
- `apps/web/e2e/unicode.spec.ts`.

Existing broader suites remain release regressions and may not be weakened or
skipped.

A separate E2E family is not required by default.

---

## 19. Default Prohibited Implementation Surface

Unless separately Human-authorized, M9 must not modify:

- `apps/api/**`;
- `apps/api/alembic/versions/**`;
- `apps/web/src/features/segmentation/**`;
- `apps/web/src/features/lemma/**`;
- `apps/web/src/features/pos/**`;
- `apps/web/src/features/alignments/**`;
- `apps/web/src/shared/rendering/**`;
- `apps/web/src/features/workspace/WorkspacePage.tsx`;
- `apps/web/src/features/workspace/state/**`;
- `apps/web/src/shared/text/offset.ts`;
- `apps/web/package.json`;
- `apps/web/package-lock.json`;
- `apps/api/pyproject.toml`;
- `apps/api/uv.lock`;
- `.github/workflows/ci.yml`.

Also prohibited:

- unrelated refactoring;
- dependency installation;
- runtime upgrades;
- weakening inherited tests;
- changing persisted/API offset authority;
- broad selection-error UX redesign.

---

## 20. Pure Grapheme Test Contract

At minimum, deterministic unit coverage must prove:

~~~text
G-01 ordinary ASCII / Latin boundaries remain valid
G-02 inherited single non-BMP emoji behavior remains valid
G-03 emoji + skin-tone modifier rejects the internal boundary
G-04 ZWJ family sequence rejects every tested internal code-point boundary
G-05 regional-indicator flag rejects the internal boundary
G-06 NFC-stable multi-code-point combining grapheme rejects its internal boundary
G-07 a complete complex grapheme accepts exact outer code-point boundaries
G-08 content start/end are valid boundaries
G-09 empty content exposes boundary zero without inventing a selection
G-10 unavailable Intl.Segmenter fails closed
G-11 segmenter UTF-16 indices are converted through canonical code-point offsets
G-12 language_tag is not an input to boundary validity
~~~

The combining regression vector must remain multi-code-point after canonical
NFC normalization; for example `x\u0301` rather than a sequence that NFC
collapses to one precomposed code point.

---

## 21. Selection-Engine Regression Contract

At minimum, `selection.test.ts` or equivalent must prove:

~~~text
S-01 valid ordinary selection remains exact
S-02 existing surrogate-pair split remains INVALID_SELECTION_BOUNDARY
S-03 grapheme-internal legal code-point endpoint is INVALID_GRAPHEME_BOUNDARY
S-04 valid complex-grapheme selection returns exact code-point offsets + quote
S-05 forward/backward selections retain identical canonical identity
S-06 whole-content complex-Unicode selection passes
S-07 grapheme cluster split across multiple [data-run] elements still rejects
     an internal run boundary as a new authoring endpoint
S-08 selection crossing multiple runs passes when outer endpoints are valid
S-09 capability absence returns GRAPHEME_SEGMENTER_UNAVAILABLE
S-10 canonicalRangeToDomRange still accepts an intra-grapheme code-point-valid
     legacy range
S-11 inherited DOM integrity/stale/cross-version errors retain semantics
~~~

The cross-run case is mandatory evidence that run boundaries do not become
grapheme authority.

---

## 22. TextPanel Component Regression Contract

Component coverage must prove:

~~~text
T-01 valid capture replaces current selection and leaves Add enabled
T-02 EMPTY_SELECTION clears current selection
T-03 valid A → invalid grapheme B clears A and disables Add
T-04 valid A → segmenter unavailable clears A and disables Add
T-05 inherited non-empty capture error also clears stale current selection
T-06 invalid grapheme feedback is bounded and user-comprehensible
T-07 capability feedback identifies runtime/browser capability failure
T-08 subsequent valid capture recovers normally after an M9 error
T-09 staged tray members survive a later failed current-selection capture
T-10 M9 does not mutate the browser Selection/Range to snap boundaries
~~~

M9-specific feedback must not change duplicate/overlap tray semantics.

---

## 23. Real-Browser / Playwright Contract

`apps/web/e2e/unicode.spec.ts` remains the primary real-browser Unicode proof
surface and must retain the inherited full selection → persistence → reload →
highlight chain.

M9 strengthens it with real Chromium Selection/Range cases that include at
least:

- ordinary text selection;
- complete complex grapheme selection;
- one grapheme-invalid native endpoint;
- valid selection A followed by invalid selection B, proving stale A is not
  stageable;
- successful recovery with a later valid selection;
- at least one real complex-grapheme vector beyond the inherited single
  `🙂` surrogate-pair case.

The browser test must assert code-point offsets, exact quote, and UI staging
state. It must not create persisted M9 evidence by bypassing the real user
selection path.

Automated unit tests, not Human visual judgment, carry exhaustive internal
ZWJ/RI/combining-boundary proof.

---

## 24. Targeted Human Runtime Acceptance

M9 requires targeted Human Runtime Acceptance after automated exact-candidate
Gate 2 evidence is established.

The exact semantic candidate reviewed by the Human must demonstrate at least:

1. ordinary Latin/ASCII selection behaves as before;
2. a complete emoji/complex grapheme can be selected and staged naturally;
3. a grapheme-invalid recapture does not snap and does not leave a previous
   selection stageable;
4. "Add to Alignment" is unavailable after the failed recapture;
5. a subsequent valid selection recovers normal Alignment staging.

Human review does not prove Unicode segmentation correctness. The automated
G/S/T and browser matrices do.

If a later Product change alters selection semantics, TextPanel capture, M9
error handling, or the Human-visible interaction after acceptance, the prior
HRA does not automatically transfer to that successor candidate.

Docs-only or evidence-only successors that do not change Human-visible/runtime
semantics do not mechanically require a fresh HRA; they require explicit
evidence bridging/review under the then-current lifecycle.

---

## 25. Complete Gate 2 Verification Surface

M9-specific evidence supplements, not replaces, the complete release baseline.

Gate 2 must include at least:

~~~text
uv sync --frozen

Alembic empty → 0006
alembic current == 0006
alembic check

full backend pytest against PostgreSQL 18
zero skipped required tests
retained M7 concurrency coverage

npm ci
npm run lint
npm run typecheck
full Vitest / RTL suite
npm run build

full canonical Playwright release surface:
- golden path
- strengthened Unicode / M9 native-selection cases
- M2 sentence segmentation
- M3 token segmentation
- M4 lemma annotation
- M5 POS annotation
- M6 Workbench information architecture
- M8 connector routing

dependency-hash equality
tracked-tree integrity
disposable database cleanup
final exact remote/tree provenance
~~~

Gate 2 automation must establish the exact semantic candidate before targeted
M9 HRA begins.

---

## 26. Hosted Evidence and Provider Boundary

Historical M6–M8 proof repositories, authorizations, provider state, and
exception decisions are retained evidence only.

They do not authorize M9 proof execution or provider mutation.

No spent M8 authorization may be reused.

Any M9-specific proof-repository creation/mutation, alternate hosted proof,
Alibaba ECS allocation/reuse, authorization-token issuance, firewall/network
change, or other provider-side mutation requires fresh explicit Human
authorization.

A canonical GitHub Actions run that ends before repository-defined steps
remains provider/pre-step diagnostic evidence only.

This contract freeze itself authorizes no hosted proof execution.

---

## 27. Documentation Freeze Surface

The M9 docs-only contract-freeze commit is limited to:

- `docs/development/M9_CONTRACT.md`;
- `docs/development/CURRENT_STATE.md`;
- `docs/README.md`;
- `AGENTS.md`;
- `README.md`.

The freeze contains no:

- implementation code;
- test change;
- ADR-017 implementation record;
- architecture-as-built change;
- API change;
- migration;
- workflow change;
- dependency/lockfile change;
- proof-repository mutation;
- provider mutation;
- implementation branch creation.

`docs/architecture/ARCHITECTURE.md`,
`docs/testing/testing-strategy.md`, and `docs/api/api-contract.md` remain
as-built-through-M8 documents during contract freeze. They must not describe
unimplemented M9 behavior as current reality.

---

## 28. ADR-017 Obligation

Bounded M9 implementation must add one ADR equivalent to:

`ADR-017 — Grapheme-Safe Native Selection Capture`

It must record at least:

- grapheme validation applies only to new native canonical TextPanel capture;
- Unicode code-point offsets remain persisted/API authority;
- `Intl.Segmenter` is frontend validation machinery only;
- full canonical `TextVersion.content` is boundary authority;
- `language_tag` is not boundary authority;
- segmenter UTF-16 indices convert through the existing shared offset utility;
- reject-only behavior with no snapping/native Selection rewriting;
- the two M9 frontend-only error categories;
- every failed recapture clears stale current-selection authority;
- legacy code-point-valid ranges remain readable/renderable;
- reverse mapping remains code-point based;
- sentence/token manual split and full grapheme editing remain deferred;
- no backend/schema/migration/dependency change.

ADR-017 is an implementation record and is deliberately absent from the
contract-freeze commit.

---

## 29. STOP Conditions

Implementation must stop and report before broadening scope if:

- a new package/polyfill/generated Unicode table is required;
- `Intl.Segmenter` cannot satisfy the frozen behavior on the supported runtime
  / browser verification surface;
- backend/API/schema/Alembic changes become necessary;
- persisted coordinate authority would need to change from code points;
- existing Span/Alignment data would need migration or invalidation;
- `canonicalRangeToDomRange` would need grapheme restrictions;
- sentence/token manual editing must change;
- `apps/web/src/shared/text/offset.ts` must change;
- canonical TextPanel DOM structure must change;
- WorkspacePage or workspace-state ownership must change;
- rendering/connector infrastructure must change;
- language_tag would need to become grapheme-boundary authority;
- automatic selection snapping or native Range rewriting becomes necessary;
- an inherited regression must be weakened;
- `.github/workflows/ci.yml` must change;
- targeted HRA reveals a required UX redesign beyond the bounded M9 feedback.

---

## 30. Definition of Done

M9 implementation is complete only when all of the following are true:

1. exact frozen-base lineage is verified before implementation;
2. only separately authorized implementation/test/docs surfaces change;
3. database/API/schema/Alembic behavior remains unchanged;
4. Alembic HEAD remains `0006`;
5. dependency manifests/lockfiles and runtime baseline remain unchanged;
6. canonical persisted/API coordinates remain Unicode code points;
7. the grapheme validator uses complete canonical content;
8. `language_tag` is not boundary authority;
9. segmenter UTF-16 indices pass through the shared canonical conversion;
10. valid native endpoints capture exact code-point offsets and exact quote;
11. grapheme-internal code-point endpoints fail closed;
12. no snapping or native Range rewriting occurs;
13. unavailable/unusable grapheme capability fails closed;
14. the approved frontend error taxonomy is preserved;
15. every failed recapture clears stale current-selection authority;
16. already-staged tray members are not cleared by current-selection failure;
17. cross-run grapheme regression proves run boundaries are not authority;
18. forward/backward identity remains equivalent;
19. inherited surrogate-pair protection remains intact;
20. legacy code-point-valid intra-grapheme reverse mapping remains supported;
21. persisted historical spans/alignments require no migration;
22. Sentence/Token manual split behavior remains outside scope;
23. pure G-01…G-12 or equivalent coverage passes;
24. selection S-01…S-11 or equivalent coverage passes;
25. TextPanel T-01…T-10 or equivalent coverage passes;
26. strengthened real-browser Unicode/M9 path passes;
27. inherited golden path and M2–M8 browser regressions pass;
28. full lint/typecheck/Vitest/build release surface passes;
29. full PostgreSQL backend regression passes with zero required skips;
30. dependency/tree integrity and disposable-database cleanup pass;
31. exact-candidate Gate 2 evidence is established independently for M9;
32. ADR-017 is added during implementation and matches this contract;
33. targeted exact-candidate Human Runtime Acceptance passes;
34. architecture/testing/state/user-facing docs match implemented reality
    before Human merge decision;
35. Static Human Diff Review passes before any Human merge decision;
36. no full grapheme editing, morphology, Lexeme, revision/re-anchoring, or
    other future-domain work enters M9.

---

## 31. Freeze and Authorization Boundary

This docs-only contract freeze does **not** authorize implementation.

After the freeze is durably landed, the next safe sequence is:

~~~text
independently verify exact freeze commit/tree and exact docs-only scope
→ Human separately authorizes bounded M9 implementation branch
→ create m9-grapheme-safe-native-selection-capture from exact frozen main
→ bounded implementation
~~~

Until that separate Human authorization:

~~~text
NO implementation branch
NO frontend/application code change
NO test change
NO ADR-017 implementation record
NO workflow change
NO dependency change
NO proof execution
NO proof-repository mutation
NO provider mutation
~~~
