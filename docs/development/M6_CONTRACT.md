# LinguaGraph M6 — Mode-Oriented Workbench Information Architecture

## Contract Status

**Status:** FROZEN — HUMAN APPROVED

**Human contract review / freeze authorization date:** 2026-09-11

**Approved pre-freeze durable base:** `6adcf78b18349621bb80d6ea35f93308c2f1d42a`

**Approved pre-freeze durable tree:** `cf32f682539b8bf58f35660809e5f0c120720426`

**Implementation authorization:** NOT GRANTED by this freeze. Bounded M6 implementation may begin only after the docs-only freeze commit is independently verified and the Human separately authorizes creation of the implementation branch.

**Planned implementation branch:** `m6-mode-oriented-workbench-information-architecture`

This contract is the authoritative bounded execution contract for M6.

It inherits:

- the accepted M0 architecture and invariants;
- the completed M1 interaction/presentation boundary;
- the completed M2 persistent sentence-segmentation layer;
- the completed M3 sentence-bound token-segmentation layer;
- the completed M4 sparse token-occurrence lemma-annotation layer;
- the completed M5 sparse token-occurrence coarse-POS layer;
- ADR-001 through ADR-013.

M6 does not silently reopen those decisions.

---

## 1. Goal and Governing Human Finding

M6 resolves `HRA-F01` — Workbench information architecture / panel density.

At the approved pre-freeze base, each visible TextVersion owns one `.panel-slot`
whose source order is:

```text
panel controls
TextPanel
Sentence SegmentationPanel
TokenSegmentationPanel
LemmaAnnotationPanel
PosAnnotationPanel
```

All visible slots precede the complete Alignment workflow. Every linguistic
surface is therefore permanently expanded once per visible TextVersion, and
Alignment requires scrolling past the repeated annotation stack.

M6 replaces that composition with:

```text
persistent canonical Text Canvas
+ persistent task navigation
+ one bounded visible task surface
+ persistent compact Alignment Tray status
```

The approved task destinations are:

```text
Alignment | Sentence | Token | Lemma | POS
```

M6 must preserve every M0–M5 domain and interaction workflow while making the
Workbench structurally extensible: adding a future linguistic layer should add
one navigation destination and one bounded editor surface, not another
permanently expanded panel beneath every TextVersion.

M6 does not authorize any future linguistic layer.

---

## 2. Human-Approved Information Architecture Decisions

### 2.1 HCR-IA1 — A+

**APPROVED:** persistent canonical canvas plus one task deck, strengthened by
the following conditions:

- the canonical canvas remains mounted and visible in every task mode;
- the task deck owns Alignment, Sentence, Token, Lemma, and POS destinations;
- exactly one bounded task surface is visible at a time;
- the active linguistic TextVersion is explicit;
- compact Alignment Tray status remains persistently visible;
- no contextual side rail, docking, resizing, free-form layout, or connector
  routing redesign is introduced.

### 2.2 HCR-IA2 — mount-preserved sessions

**APPROVED:** every `TextVersion × linguistic layer` editor session remains
mounted while its TextVersion survives in the authoritative workspace.

Inactive sessions preserve their local draft, dirty, pending, error, and
confirmation state but do not participate in visual layout, the accessibility
tree, tab order, or pointer interaction.

The same continuity rule applies to the complete Alignment task surface so an
`AlignmentInspector` note draft, mutation result, or dialog cannot be lost by
an ordinary task-mode switch.

### 2.3 HCR-IA3 — mode-independent connectors

**APPROVED:** `ConnectorOverlay` remains mounted in the persistent canonical
canvas in every task mode. Active Alignment visualization is mode-independent.
The full Alignment Tray, Inspector, and Saved Alignments surfaces are shown in
Alignment mode; a compact tray summary and action remain visible outside the
task deck.

---

## 3. Terminology

### 3.1 Canonical Text Canvas

The persistent region containing visible TextVersion management controls,
canonical `TextPanel` instances, their flat render runs, and the
`ConnectorOverlay`.

### 3.2 Task mode

Exactly one of:

```ts
type WorkbenchMode =
  | 'alignment'
  | 'sentence'
  | 'token'
  | 'lemma'
  | 'pos';
```

### 3.3 Active linguistic target

The one visible TextVersion selected for Sentence, Token, Lemma, or POS work.
It is distinct from the set of visible canonical TextVersions.

### 3.4 Editor session

The mounted local UI state owned by one linguistic editor for one exact
TextVersion. A session is not persisted domain state and is not a backend
annotation entity.

The Alignment task surface is likewise a mount-preserved task session because
its Inspector owns local note-draft and dialog state.

### 3.5 Session summary

Bounded coordination metadata needed to expose whether a mounted session is
clean, dirty, saving, or failed while its editor is inactive. A summary never
contains or becomes authoritative for persisted linguistic data.

### 3.6 Compact tray status

The persistently visible Alignment affordance outside the task deck. It shows
at least pending-member count/readiness and provides one explicit action that
opens Alignment mode. It is not a second full Alignment Tray.

---

## 4. Frozen Canonical Text and Coordinate Invariants

M6 preserves:

- backend-authoritative canonical `TextVersion.content`;
- NFC/LF canonicalization and `content_hash` semantics;
- Unicode code-point API/database offsets;
- zero-based half-open ranges `[start, end)`;
- native browser `Selection` and `Range`;
- JavaScript UTF-16 conversion only through the existing shared offset layer;
- one `[data-text-content-root]` per mounted canonical TextPanel;
- flat `[data-run]` children inside each canonical root;
- exactly one text node per run;
- `root.textContent === TextVersion.content`;
- controls, labels, annotation metadata, task navigation, and editors outside
  the canonical root;
- no canonical text virtualization.

M6 may move the linguistic editors out of `.panel-slot`; it may not change the
canonical DOM safety boundary.

Any implementation need to change the canonical root or Selection Engine is a
STOP condition requiring Human scope review.

---

## 5. Frozen Domain and Persistence Invariants

M6 is frontend information-architecture work. It preserves:

- the document workspace snapshot and all existing FastAPI routes;
- the stable error envelope;
- TextVersion ownership and lifecycle;
- sentence-layer exhaustive partition semantics;
- token-layer exact saved-sentence basis;
- persisted Human-reviewed token `is_word_like` authority;
- direct lemma/POS ownership by saved token `Segment.id`;
- lemma/POS sibling independence;
- segmentation dependency blocking;
- no automatic re-anchoring;
- TextVersion-root mutation serialization;
- forced TextVersion deletion cascade;
- Alignment Span, AlignmentGroup, and AlignmentMember identity;
- Alembic history `0001` through `0006` and exact head `0006`.

M6 adds no backend entity, API field, route, error code, database table,
constraint, or migration.

---

## 6. Required Canonical Text Canvas

The canonical canvas must:

- remain visible in all five task modes;
- support multiple simultaneously visible TextVersions;
- preserve independent canonical text scrolling;
- preserve hide, reopen, reorder, and delete controls;
- preserve native selection, current selection, staging, run activation, and
  connector visualization;
- keep `ConnectorOverlay` inside the same coordinate container as the
  canonical panels;
- contain no permanently expanded linguistic editor;
- distinguish ordinary hide from destructive deletion;
- remain the visually dominant reading/selection surface.

The canvas composition becomes conceptually:

```text
.panels-container
  visible TextVersion slot(s)
    panel controls
    TextPanel
  ConnectorOverlay
```

Task navigation, task surfaces, compact tray status, and TextVersion import
must remain outside `.panels-container` so they do not silently alter connector
coordinate ownership.

---

## 7. Required Task Navigation and Task Deck

The task navigation exposes exactly:

```text
Alignment
Sentence
Token
Lemma
POS
```

Requirements:

- one current task is unambiguous visually and programmatically;
- keyboard-only navigation is supported;
- visible focus is preserved;
- semantics match the implemented control pattern (for example, tabs use the
  complete tab/tablist/tabpanel keyboard and ARIA model);
- the current linguistic target is named wherever a linguistic mode is active;
- switching mode never clears current canonical selection, pending tray
  members, or active alignment merely because of the mode change;
- leaving Alignment mode clears pointer-transient `hoveredAlignmentId`, because
  its Saved Alignments hover source is no longer an active visible surface;
- switching between Sentence/Token/Lemma/POS never remounts surviving editor
  sessions;
- switching to or from Alignment mode never remounts the surviving Alignment
  task surface;
- exactly one task surface participates in layout and accessibility at a time;
- every inactive task surface is excluded from layout, accessibility, focus,
  and pointer interaction;
- hidden session status remains discoverable through session summaries.

The implementation may choose an accessible tabs pattern or an equivalent
bounded navigation component. It may not introduce a third-party UI framework.

---

## 8. Active Linguistic Target

The Workbench must distinguish:

```text
visible TextVersions in the canonical canvas
active TextVersion for linguistic editing
```

Selecting an active linguistic target must not implicitly hide another
canonical TextVersion or alter panel order.

Deterministic initialization:

```text
initial task mode:
Alignment

initial linguistic target:
first visible TextVersion in reconciled panelOrder
```

If no TextVersion is visible:

- the active linguistic target is `null`;
- linguistic modes are unavailable or expose an explicit no-visible-target
  state without mounting a stale editor;
- Alignment mode remains available;
- hidden TextVersions remain reopenable.

Reconciliation rules:

- hiding the active target removes it from target eligibility and selects the
  next surviving visible TextVersion deterministically;
- deleting the active target applies the same surviving-target rule after the
  authoritative snapshot confirms deletion;
- reopening a TextVersion does not automatically steal active-target status;
- reordering panels does not change an existing valid active target;
- a newly imported TextVersion is reconciled through existing panel
  preferences and does not create duplicate or stale target identity;
- document route remount resets mode/target according to the deterministic
  initialization above.

---

## 9. Mount-Preserved Linguistic Sessions

For each authoritative TextVersion, M6 preserves one mounted instance of each
existing linguistic editor:

```text
Sentence SegmentationPanel
TokenSegmentationPanel
LemmaAnnotationPanel
PosAnnotationPanel
```

Stable identity is at least:

```text
TextVersion.id + linguistic layer kind
```

Mode switch, target switch, hide/reopen, and reorder must not change that
identity or remount the session while the TextVersion still exists.

Inactive session requirements:

- no page height or width contribution;
- no scroll position contribution to the active task surface;
- absent from the accessibility tree;
- no focusable descendant in the tab order;
- no pointer interaction;
- local draft and local feedback remain alive;
- ongoing mutation lifecycle remains observable;
- returning to the session restores its unsaved editor state and relevant
  feedback.

Mount preservation does not turn a draft into persisted authority. Successful
persisted mutation still requires authoritative workspace invalidation/refetch.

The number of mounted editors may continue to scale with existing
`TextVersion × current linguistic layers` during M6. M6 must not increase that
mounting order beyond the already existing four linguistic editors per
TextVersion. Performance virtualization or a generic keep-alive framework is
outside scope.

The complete Alignment task surface also remains mounted while inactive. Its
Inspector note draft, dirty flag, pending/error lifecycle, and dialog state
must obey the same continuity and inactive-surface exclusions. This single
Alignment surface does not multiply per TextVersion.

---

## 10. Dirty, Pending, Error, and Conflict Semantics

### 10.1 Ordinary internal navigation

Mode and active-target switches preserve dirty drafts without confirmation.
This is the purpose of mount-preserved sessions.

### 10.2 Pending mutation

An ordinary non-destructive linguistic mutation may continue while its session
becomes inactive. Its saving/success/error lifecycle must remain discoverable
through the session summary and must be rendered in full when the user returns.

Existing same-domain mutation exclusion and TextVersion-root serialization
remain authoritative. M6 does not introduce parallel optimistic domain state.

### 10.3 Authoritative reconciliation

A clean session may adopt a changed authoritative identity.

A session's own successful mutation may reconcile to the resulting
authoritative snapshot and become clean.

If a dirty session encounters an unexpected authoritative identity or
dependency-basis change, M6 must not silently overwrite its draft. It must:

1. preserve the local draft long enough for explicit Human disposition;
2. mark the session as conflicted/stale;
3. prevent submission against an invalid target or basis;
4. require an explicit discard/reload or another contract-valid recovery.

No stale token occurrence may become a lemma or POS mutation target.

### 10.4 Cross-layer dependency safety

Client-side coordination may prevent a parent-layer action that would
invalidate a dirty dependent draft and explain the dependency. It may not
replace backend dependency enforcement or claim persisted dependency state
that the workspace snapshot does not contain.

### 10.5 Error retention

Switching mode/target must not erase a mutation error. The inactive session's
summary must expose the failure; returning to it must show the stable existing
error presentation and any valid recovery guidance.

---

## 11. Session Summary Coordination State

M6 may add bounded workspace-owned coordination state that reports, per
`TextVersion.id + layer kind`:

```text
clean
dirty
saving
error
conflict
dialog-open
```

The coordination state may also report the same bounded status categories for
the one Alignment task surface and the one Import surface.

This summary:

- exists only for navigation/status coordination;
- does not own full drafts;
- does not duplicate persisted annotation rows;
- is not stored in TanStack Query;
- is not sent to the backend;
- is not written to localStorage;
- resets on the document-keyed workspace remount;
- reconciles away when the authoritative TextVersion disappears.

The implementation must avoid render/effect loops and stale summary entries.

---

## 12. Alignment Mode and Persistent Compact Tray Status

Alignment mode contains the complete existing workflow:

```text
AlignmentTray
AlignmentInspector when an alignment is active
SavedAlignments
```

This complete surface remains mounted when another mode is active, but is then
excluded from layout, accessibility, focus, and pointer interaction. Its
Inspector note draft and mutation feedback remain alive.

The compact tray status remains visible in every mode and provides at least:

- pending-member count;
- whether the current pending set is eligible for creation;
- one clearly labelled action to enter Alignment mode.

It must not duplicate the complete member-management or create workflow. Full
remove, clear, create, Inspector, and Saved Alignments interactions remain in
Alignment mode.

Requirements:

- one ordinary navigation action reaches Alignment mode from every linguistic
  mode;
- dirty linguistic drafts do not block that mode switch;
- pending members survive every mode/target switch;
- current selection survives a mode switch while its canonical TextVersion
  remains visible and unchanged;
- active alignment survives every mode/target switch;
- leaving Alignment mode clears `hoveredAlignmentId` so an inactive Saved
  Alignments row cannot remain the invisible source of effective connectors;
- Alignment task navigation or compact status exposes an inactive Inspector
  dirty, pending, error, or conflict state without duplicating the editor;
- existing create-alignment tray freeze remains authoritative;
- Inspector mutation freeze, destructive confirmation, and authoritative
  reconciliation remain unchanged;
- Saved Alignments remains reachable without scrolling through all linguistic
  editors.

---

## 13. Connector and Rendered-Span Boundary

M6 preserves:

- `RenderedSpanRegistry` as the span-to-DOM bridge;
- member/span identity binding;
- active-over-hover precedence;
- connector visibility only for the effective alignment;
- fewer-than-two-visible-members suppression;
- SVG `pointer-events: none`;
- clipping through the established canonical TextPanel body viewport;
- current anchor and routing algorithm;
- existing scroll/resize/reorder/hide geometry lifecycle.

`ConnectorOverlay` remains a child of the canonical panels coordinate
container. Neither task mode nor active target may reparent or unmount the
canonical TextPanel instances.

Mode/target changes that do not alter canonical geometry need not cause a
synthetic connector invalidation. Any M6 state that does change canonical
geometry must participate in a correct geometry invalidation path.

`HRA-F09` — connector routing visual debt — remains independently deferred.
M6 must not claim to remediate or close it.

---

## 14. TextVersion Import and Management

The existing Add TextVersion workflow remains required but is not a sixth
linguistic task mode.

M6 relocates it to canvas-level TextVersion management:

- a compact action near the canvas/header opens an on-demand bounded Import
  surface;
- Import is not permanently expanded under the linguistic or Alignment stack;
- paste/upload, BCP-47 language tag, label, strict UTF-8 handling, canonical
  import, and error semantics remain unchanged;
- successful import continues to open/reconcile the new TextVersion through
  authoritative refetch and existing preferences;
- the Import surface may remain mounted while hidden using the same layout,
  accessibility, focus, and pointer exclusions as inactive task surfaces;
- populated Import form state may reset on success or explicit Human discard,
  but not incidentally because another task mode was selected.

TextVersion delete remains distinct from hide and import.

---

## 15. Dialog, Focus, Keyboard, and Leave Protection

Existing `ConfirmDialog` semantics remain authoritative:

- `role="alertdialog"` and `aria-modal="true"`;
- focus enters on the safe first action;
- Escape belongs to the dialog while mounted;
- destructive pending state locks Escape/close;
- focus restoration on close.

Because the existing dialog has no full focus trap, M6 must ensure that while a
session dialog is open:

- mode and active-target navigation cannot make that session inactive;
- the dialog cannot remain mounted inside a hidden/inert task surface;
- background task controls cannot activate the hidden session transition;
- destructive pending lock remains intact.

Existing workspace keyboard behavior remains:

- Escape selection/dialog ownership;
- `Ctrl/Meta+Enter` create-alignment guard;
- suppression within input, textarea, select, and combobox controls.

M6 must add dirty-leave protection:

- ordinary mode/target changes require no prompt because sessions remain
  mounted;
- hiding a TextVersion preserves its dirty sessions;
- deleting a TextVersion with any dirty session requires explicit warning that
  unsaved work will be lost;
- internal navigation to another document or route must not silently discard
  dirty sessions;
- browser reload/close must use the available native leave-warning mechanism
  when dirty sessions exist;
- after explicit Human confirmation to leave/delete, ephemeral drafts may be
  discarded.

M6 does not promise recovery after process crash, browser failure, or explicit
confirmed departure.

---

## 16. Frontend State Ownership and Persistence

Frozen ownership:

| State | Authority |
|---|---|
| persisted workspace, TextVersions, layers, segments, lemma/POS, alignments | backend + TanStack Query snapshot |
| current selection, pending tray, active/hovered alignment | existing WorkspaceProvider reducer/context |
| panel order, visible panels | existing per-document localStorage v1 |
| active task mode, active linguistic target | document-scoped ephemeral workspace UI |
| editor drafts, dirty/error/dialog state | mounted editor sessions |
| session summary badges | bounded ephemeral IA coordination state |
| connector DOM mapping | existing RenderedSpanRegistry |

M6 must not:

- place persisted domain data under UI-state authority;
- place active mode, active target, drafts, or summaries into TanStack Query;
- reuse `linguagraph.workspace.preferences.v1.<documentId>` fields for new
  meanings;
- add a localStorage schema/version for mode, target, drafts, or layout;
- add server-persisted UI layout;
- add a new state-management library.

Successful persisted mutation still invalidates/refetches the authoritative
workspace. M6 adds no optimistic persisted authority.

---

## 17. TextVersion Hide, Reopen, Reorder, and Delete

### Hide

- removes the TextPanel from the visible canonical canvas;
- preserves existing staged tray members;
- clears that version's current selection according to the inherited reducer
  semantics;
- removes the version from active-target eligibility;
- preserves its mounted linguistic sessions and dirty work;
- exposes unsaved-session status in the hidden-version management surface.

### Reopen

- returns the canonical panel to its reconciled panel order;
- restores target eligibility;
- preserves its existing linguistic sessions;
- does not automatically replace another valid active target.

### Reorder

- remains a local UI preference only;
- never writes server `sort_order`;
- preserves active target and mounted sessions;
- triggers correct connector geometry invalidation.

### Delete

- retains the existing ordinary/force backend lifecycle;
- adds a client warning if unsaved mounted sessions would be destroyed;
- does not create a new backend force parameter;
- unmounts sessions only after authoritative deletion succeeds;
- reconciles target, tray, selection, alignments, summaries, and preferences
  through their existing ownership boundaries.

---

## 18. Responsive and Density Boundary

M6 targets desktop Workbench acceptance at minimum:

```text
1280 × 720
1440 × 900
```

At both viewports:

- canonical text remains readable and selectable;
- multiple visible TextVersions remain usable;
- task navigation, active target, compact tray status, and current task surface
  remain reachable;
- Alignment mode does not require scrolling past inactive editors;
- hidden editors contribute no layout height;
- no key action is clipped without a reachable scroll path;
- connector endpoints remain bound to the correct canonical runs;
- focus indicators remain visible.

M6 may refine existing responsive CSS. It does not authorize a mobile-first
redesign, contextual side rail, split pane, resizable pane, docking, or saved
geometric layout.

---

## 19. Extensibility Rule

The accepted M6 architecture must make a later layer structurally equivalent
to:

```text
add one task destination
+ add one bounded editor surface
+ add its explicit dependency/status contract
```

It must not require:

```text
for every TextVersion:
    append another permanently expanded panel to the canonical slot
```

This rule is architectural only. It does not pre-authorize morphology, syntax,
new persistence, or a generic annotation ontology.

---

## 20. Default Allowed Implementation Change Surface

### Frontend composition and state

```text
apps/web/src/features/workspace/WorkspacePage.tsx
apps/web/src/features/workspace/state/
apps/web/src/features/workspace/<new bounded M6 IA components>
apps/web/src/features/workspace/ImportPanel.tsx
apps/web/src/features/workspace/useWorkspaceKeyboard.ts

apps/web/src/features/segmentation/
apps/web/src/features/lemma/
apps/web/src/features/pos/
apps/web/src/features/alignments/

apps/web/src/styles.css
apps/web/src/**/*.test.*
apps/web/e2e/
```

Changes to existing feature panels are limited to:

- mount-preserved visibility integration;
- session-summary reporting;
- dirty/conflict continuity;
- active-target integration;
- accessible labels/status;
- removal of assumptions that linguistic editors are permanently nested in
  the same `.panel-slot` as canonical text.

### Conditionally allowed frozen-component wiring

```text
apps/web/src/features/workspace/ConnectorOverlay.tsx
apps/web/src/features/workspace/TextPanel.tsx
apps/web/src/features/workspace/state/WorkspaceProvider.tsx
apps/web/src/features/workspace/state/workspaceReducer.ts
apps/web/src/features/workspace/state/workspaceContext.ts
apps/web/src/features/workspace/state/preferences.ts
apps/web/src/shared/ui/ConfirmDialog.tsx
```

These files may change only when M6 wiring, reconciliation, geometry
invalidation, or dirty-leave safety directly requires it. Their frozen domain,
canonical DOM, dialog, and preference semantics may not be broadened.

### Tests, verification, and implementation documentation

```text
apps/web/src/**/*.test.*
apps/web/e2e/
.github/workflows/ci.yml
scripts/verify.ps1
docs/adr/ADR-014-*.md
docs/architecture/ARCHITECTURE.md
docs/testing/
docs/development/
AGENTS.md
README.md
```

Workflow changes are limited to factually necessary M6 test inclusion or
labels. No CI-provider redesign is authorized.

Any file outside this default surface requires direct M6 necessity, explicit
reporting, and Human scope review before modification.

---

## 21. Default Prohibited Implementation Surface

```text
apps/api/**
apps/web/src/shared/text/**
apps/web/src/shared/rendering/spanRegistry.ts semantic changes
database migrations
dependency manifests
lockfiles
runtime baseline changes
connector anchor/routing algorithm changes
```

Also prohibited:

- weakening backend authority or mutation invalidation;
- changing sentence/token/lemma/POS identity;
- changing Alignment persistence;
- inserting annotation UI inside `[data-text-content-root]`;
- replacing native Selection/Range;
- replacing `RenderedSpanRegistry`;
- adding a UI/layout/state framework;
- broad unrelated refactoring.

An implementation need to enter a prohibited surface is a STOP condition.

---

## 22. Dependency, Runtime, and Configuration Boundary

M6 adds no runtime/package dependency.

Frozen:

```text
apps/api/pyproject.toml
apps/api/uv.lock
apps/web/package.json
apps/web/package-lock.json
```

Runtime baseline remains:

```text
Python       3.13
Node.js      24
PostgreSQL   18
```

No tabs library, keep-alive library, state library, layout engine, connector
library, virtualization library, browser-selection replacement, or UI
framework is authorized.

---

## 23. Workflow Boundary and G2-X01

`G2-X01` remains:

```text
OPEN / EXTERNAL
```

No M0.7, M4, or M5 External Infrastructure Exception carries forward to M6.

At M6 Gate 2:

1. first attempt canonical GitHub-hosted verification on the exact frozen M6
   candidate;
2. independently inspect whether repository workflow steps execute;
3. distinguish application/test failure from provider/pre-step failure;
4. retain exact run/job/candidate/tree/base provenance.

If the same provider/pre-step failure persists, any alternative hosted proof
path requires a new explicit **M6-specific** Human External Infrastructure
Exception. No exception is pre-authorized by this contract.

No exception may waive:

- exact candidate/tree/base provenance;
- clean hosted Linux execution;
- Python 3.13, Node 24, PostgreSQL 18;
- frozen dependency installation;
- Alembic integrity;
- full real-PostgreSQL backend tests with zero skips;
- lint, typecheck, Vitest, and production build;
- complete M0–M6 Playwright coverage;
- cleanup, dependency-hash equality, or tracked-tree integrity.

Existing M5 CircleCI proof remains retained historical evidence only. It is not
proof for an M6 candidate.

---

## 24. Documentation Freeze Surface

The M6 docs-only contract-freeze commit is strictly limited to:

```text
docs/development/M6_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It contains no:

```text
implementation code
test modification
ADR-014 implementation record
architecture-as-built modification
dependency modification
lockfile modification
runtime change
workflow modification
implementation branch creation
```

`docs/architecture/ARCHITECTURE.md` and `docs/testing/testing-strategy.md`
remain as-built M5 documents during the freeze. They must not describe
unimplemented M6 behavior as current reality.

---

## 25. ADR-014 Obligation

Bounded M6 implementation must add an ADR equivalent to:

```text
ADR-014 — Mode-oriented Workbench information architecture
```

It must record at least:

- `HRA-F01` and the repeated-stack root cause;
- persistent canonical canvas ownership;
- single bounded task deck and five task destinations;
- active mode and active linguistic target ownership;
- mount-preserved editor sessions;
- dirty/pending/error/conflict continuity;
- session-summary coordination boundary;
- mode-independent connectors and unchanged coordinate container;
- persistent compact tray status and complete Alignment mode;
- canvas-level on-demand TextVersion import;
- deterministic hide/reopen/reorder/delete reconciliation;
- localStorage/server-persistence exclusions;
- desktop responsive acceptance;
- future-layer extensibility rule;
- rejected contextual side rail and per-TextVersion progressive-disclosure
  alternatives;
- continued deferral of `HRA-F09`.

ADR-014 must remain consistent with this frozen contract and cannot broaden
it. It is an implementation record, not part of the docs-only freeze.

---

## 26. Frontend Component and Integration Testing Obligations

Required coverage includes:

### 26.1 Initialization and navigation

```text
deterministic Alignment initial mode
deterministic first-visible active linguistic target
no-visible-target behavior
all five task destinations
keyboard-only navigation
visible current mode and target
document route remount reset
```

### 26.2 Mount preservation

```text
mode switch does not remount editor session
target switch does not remount editor session
hide/reopen does not remount surviving session
reorder does not remount session
inactive session has no layout contribution
inactive session absent from accessibility tree and tab order
inactive session cannot receive pointer interaction
```

### 26.3 Draft and status continuity

```text
dirty sentence draft survives mode/target switches
dirty token draft survives mode/target switches
dirty lemma draft survives mode/target switches
dirty POS draft survives mode/target switches
hidden-version dirty session survives reopen
pending mutation remains discoverable while inactive
error remains discoverable and recoverable while inactive
dirty Alignment Inspector note survives mode switches
Alignment pending/error state remains discoverable while inactive
session summary reconciles without stale entries
own successful mutation reconciles cleanly
unexpected authoritative basis change cannot silently overwrite dirty draft
stale token occurrence cannot be submitted
```

### 26.4 Alignment preservation

```text
current selection survives ordinary mode switch
pending tray survives mode/target switch
compact tray count/readiness matches reducer authority
compact action enters Alignment mode
full Tray/Inspector/Saved Alignments only in Alignment surface
active alignment remains effective in linguistic modes
leaving Alignment mode clears pointer-transient hover
active-over-hover precedence unchanged
create-alignment freeze unchanged
Inspector mutation freeze unchanged
```

### 26.5 TextVersion lifecycle and import

```text
active target reconciliation after hide/delete
reopen does not steal valid target
reorder preserves target
hidden dirty status is discoverable
dirty delete warning
delete cancellation preserves session
successful delete removes session only after authoritative reconciliation
on-demand Import surface
Import state does not reset on unrelated task switch
successful import opens/reconciles new TextVersion
```

### 26.6 Canonical and connector regression

```text
canonical root count and exact textContent
flat data-run children with one text node each
native selection and Unicode offsets
registry lifecycle
connector identity and visibility
scroll/resize/reorder/hide geometry recalculation
mode/target transitions do not reparent canonical panels
```

### 26.7 Dialog, keyboard, and leave protection

```text
open alertdialog pins active session
pending destructive dialog remains locked
Escape ownership and focus restoration
task controls cannot hide an open dialog
Ctrl/Meta+Enter alignment guard
form-control shortcut suppression
internal dirty-leave protection
native browser dirty-leave registration/cleanup
```

No existing test may be weakened, deleted, skipped, filtered, or reduced to
structural selectors merely to make M6 pass. Prefer roles, labels, and stable
product semantics over old `.panel-slot` nesting assumptions.

---

## 27. M6 Playwright Path

Add a bounded M6 E2E path such as:

```text
apps/web/e2e/workbench-information-architecture.spec.ts
```

Minimum primary path:

```text
create/import at least two TextVersions
→ save sentence and token layers
→ save lemma and POS annotations
→ reload authoritative workspace
→ verify default canvas does not expand all linguistic panels
→ select a linguistic target and move through Sentence/Token/Lemma/POS
→ create dirty drafts and verify mode/target continuity
→ verify compact tray status remains reachable
→ enter Alignment mode in one ordinary navigation action
→ native-select and stage members from two TextVersions
→ switch task modes and verify tray persistence
→ create and activate an Alignment
→ verify connectors remain correct in linguistic modes
→ hide/reopen/reorder panels and verify target/session/connector reconciliation
→ save/reload and verify persisted M0–M5 state unchanged
```

Required variants:

- Unicode code-point selection and annotation identity;
- dirty sentence/token/lemma/POS sessions;
- inactive pending/error status;
- authoritative conflict/stale-target recovery;
- open destructive dialog and pending lock;
- dirty TextVersion deletion cancellation/confirmation;
- on-demand import;
- 1280×720 desktop viewport;
- 1440×900 desktop viewport;
- two and four visible TextVersions;
- long canonical text.

The M6 spec supplements and does not replace the golden, Unicode, sentence,
token, lemma, and POS Playwright surfaces.

---

## 28. Complete Gate 2 Semantic Surface

Nominal complete M6 verification must include:

```text
uv sync --frozen

Alembic empty → 0006
alembic current == 0006
alembic check

full backend pytest suite on PostgreSQL 18
zero skipped-test guard

npm ci
npm run lint
npm run typecheck
npm run test
npm run build

Playwright golden path
Playwright Unicode release blocker
Playwright M2 sentence segmentation
Playwright M3 token segmentation
Playwright M4 lemma annotation
Playwright M5 POS annotation
Playwright M6 information architecture

dependency-hash equality
cleanup
tracked-tree integrity
```

Even though M6 is frontend-only by contract, the backend and migration
baseline remain required regression proof.

---

## 29. Human Runtime Acceptance

Fresh M6 Human Runtime Acceptance is required before merge decision.

### 29.1 Density and hierarchy

Verify at 1280×720 and 1440×900:

- two short TextVersions with all four linguistic layers saved;
- four short TextVersions with all four layers saved;
- at least one long TextVersion;
- default page no longer repeats four permanently expanded linguistic panels
  beneath every TextVersion;
- canonical canvas remains visually dominant;
- current task, current linguistic target, and dependency path are immediately
  understandable;
- adding another conceptual task destination would not require adding a
  permanently expanded editor to every canonical panel.

### 29.2 Alignment reachability

- compact tray status remains visible in every linguistic mode;
- complete Alignment workflow is one ordinary navigation action away;
- pending tray members survive task/target switching;
- active Alignment connectors remain visible and correctly bound in linguistic
  modes;
- Inspector and Saved Alignments require no traversal of inactive editors;
- hide/reopen/reorder/resize/scroll preserve connector correctness.

### 29.3 Session continuity

- dirty sentence, token, lemma, and POS drafts survive task/target switches;
- a dirty Alignment Inspector note survives task-mode switches;
- hidden TextVersion drafts survive reopen;
- inactive saving/error/conflict states remain discoverable;
- authoritative changes do not silently overwrite dirty work;
- invalidated token targets cannot be submitted;
- delete and document-leave paths do not silently discard dirty work;
- returning to a session restores usable focus and editor context.

### 29.4 Accessibility and keyboard

- keyboard-only task and target navigation;
- meaningful regions/headings and current-state announcement;
- visible focus;
- inactive editors absent from tab order/accessibility tree;
- dirty/saving/error state not communicated only through color;
- dialog ownership, Escape behavior, and focus restoration;
- `Ctrl/Meta+Enter` and editable-control suppression;
- no invisible `aria-modal` remains after task interaction.

### 29.5 Import and TextVersion lifecycle

- Add TextVersion is easy to find without permanent page-height cost;
- import state is not incidentally lost;
- hide remains reversible and distinct from delete;
- dirty status on hidden versions is discoverable;
- forced deletion retains existing authoritative confirmation and cascade.

Human Runtime Acceptance supplements automated Gate 2 evidence and does not
replace it.

`HRA-F01` may close only after this Human Runtime Acceptance explicitly judges
the new density, hierarchy, reachability, and continuity acceptable.

---

## 30. Explicit Non-Goals

M6 excludes:

- backend/API/schema redesign;
- Alembic `0007`;
- new linguistic annotation types;
- morphology or syntax;
- generic Annotation/EAV editor or ontology;
- Lexeme/vocabulary identity;
- automatic NLP/LLM annotation;
- token-to-tray automation;
- automatic alignment;
- synchronized scrolling;
- canonical text virtualization;
- contextual side rail as the primary architecture;
- per-TextVersion accordion/progressive disclosure as the primary architecture;
- split panes;
- resizable panels;
- docking or grid-layout engines;
- saved geometric layouts;
- server-persisted mode/target/layout;
- connector routing or `HRA-F09` remediation;
- mobile-first redesign;
- authentication, collaboration, or permissions;
- global command palette;
- new dependency or UI framework;
- CI-provider redesign;
- unrelated M0–M5 cleanup.

---

## 31. STOP Conditions

Implementation must stop and report before changing scope if:

- canonical `[data-text-content-root]` structure must change;
- native Selection/Range or Unicode coordinate semantics must change;
- backend, API, schema, or Alembic must change;
- sentence/token/lemma/POS identity or persistence must change;
- Alignment persistence must change;
- `RenderedSpanRegistry` semantics must change;
- connector anchor/routing algorithm must change;
- a new package or runtime baseline change is required;
- mount preservation cannot prevent ordinary mode/target draft loss;
- dirty authoritative conflict cannot fail closed;
- an alertdialog can become hidden while still active;
- 1280×720 cannot keep canonical text and core navigation usable;
- an existing M0–M5 regression test must be weakened or removed;
- implementation expands into morphology, syntax, generic annotation, or
  unrelated product scope.

---

## 32. Definition of Done

M6 implementation is complete only when all of the following are true:

1. `HRA-F01` is explicitly closed by Human Runtime Acceptance.
2. Canonical text remains the dominant, persistent reading/selection surface.
3. Every visible TextVersion no longer permanently expands Sentence, Token,
   Lemma, and POS panels beneath its canonical text.
4. Task navigation exposes exactly Alignment, Sentence, Token, Lemma, and POS.
5. Exactly one bounded task surface participates in layout/accessibility.
6. Active mode and active linguistic TextVersion are explicit.
7. Mode and target state are document-scoped ephemeral state.
8. Existing localStorage v1 retains only panel order and visibility.
9. Surviving editor sessions remain mounted across mode, target, hide/reopen,
   and reorder transitions.
10. Inactive sessions make no layout, accessibility, focus, or pointer
    contribution.
11. Sentence, token, lemma, and POS dirty drafts survive ordinary mode/target
    switches.
12. Alignment Inspector note drafts survive ordinary task-mode switches.
13. Pending/error/conflict state remains discoverable while inactive.
14. Unexpected authoritative changes cannot silently overwrite dirty drafts.
15. Stale token occurrences cannot receive lemma/POS submissions.
16. Dialogs cannot become hidden active modals; destructive pending lock and
    focus behavior remain correct.
17. Dirty delete/document-leave paths require explicit Human disposition.
18. Hide/reopen/reorder/delete target reconciliation is deterministic.
19. TextVersion import is on-demand, reachable, and no longer a permanent page
    tail.
20. Compact tray status remains visible in every mode.
21. Full Alignment workflow is one ordinary navigation action from every
    linguistic mode.
22. Selection, pending tray, and active alignment survive ordinary mode/target
    switches.
23. ConnectorOverlay remains mode-independent in the unchanged canonical
    coordinate container.
24. Leaving Alignment mode clears pointer-transient hover while preserving
    active alignment.
25. Connector identity, clipping, invalidation, and active-over-hover semantics
    pass regression.
26. `[data-text-content-root]`, flat runs, exact textContent, native Selection,
    and code-point offsets remain unchanged.
27. Sentence→token dependency and lemma/POS sibling semantics remain unchanged.
28. Backend/API/schema/Alembic/dependencies/runtime remain unchanged.
29. 1280×720 and 1440×900 Human acceptance pass for two/four/long-text cases.
30. Future layers no longer imply default permanent `layers × TextVersions`
    vertical expansion.
31. Full backend, frontend, build, and M0–M6 Playwright verification passes
    without weakened or skipped tests.
32. `G2-X01` remains correctly classified unless independently proven
    recovered; no historical exception is carried forward.
33. `HRA-F09` remains separately governed and is not implicitly closed.
34. ADR-014, architecture, testing, state, and user-facing documentation match
    the implemented reality.
35. Static Human Diff Review and Human Runtime Acceptance both pass before any
    Human merge decision.

---

## 33. Freeze and Authorization Boundary

This docs-only contract freeze does **not** authorize implementation.

After the freeze is durably landed, the next safe sequence is:

```text
independently verify exact freeze commit/tree and four-file scope
→ Human separately authorizes bounded M6 implementation branch
→ create implementation branch from exact frozen main
→ bounded implementation
```

Until that separate Human authorization:

```text
NO implementation branch
NO application code change
NO test change
NO ADR-014 implementation record
NO workflow change
NO dependency change
NO runtime change
```
