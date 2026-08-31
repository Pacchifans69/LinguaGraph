# LinguaGraph M1 — Workbench Interaction & UI Foundation

## Contract Status

**Status:** FROZEN — HUMAN APPROVED  
**Human freeze date:** 2026-08-31  
**Approved pre-freeze durable base:** `f77ad4d94a309d47507b4fe7297f0ccf436144a6`  
**Implementation authorization:** bounded M1 implementation only after the implementation branch is created from the docs-only contract-freeze commit containing this file.  
**Implementation branch:** `m1-workbench-ui-foundation`

This contract does not reopen M0 architecture decisions. It is the authoritative bounded execution contract for M1.

---

## 1. Goal

M1 establishes a stable presentation and interaction foundation for the existing Manual Alignment Workbench.

The checkpoint must make the existing M0 workflow materially clearer, more coherent and more keyboard-accessible while preserving all accepted M0 domain, persistence, Unicode, selection and alignment semantics exactly.

M1 prepares a reusable UI substrate for later segmentation, workspace-layout and candidate-alignment milestones.

---

## 2. Product Outcome

After M1, the existing application must retain the complete M0 workflow while presenting it through a coherent desktop-workbench interaction model:

- clear application / page / workspace hierarchy;
- consistent surfaces, spacing, typography and semantic states;
- explicit grouping of primary, secondary and destructive actions;
- consistent loading, error, empty and mutation-pending presentation;
- stable keyboard behavior;
- predictable focus and disabled-state behavior;
- reusable but bounded UI primitives;
- no regression in native text selection, alignment creation, persistence, visualization or destructive operations.

M1 does not attempt to solve linguistic intelligence or workspace geometry.

---

## 3. Frozen M0 Primitives

The following remain frozen for the entire checkpoint.

### Domain and persistence

- `Project`
- `ParallelDocument`
- `TextVersion`
- arbitrary contiguous `Span`
- symmetric N:M `AlignmentGroup`
- `AlignmentMember`
- annotated TextVersion immutability
- AlignmentService invariants
- atomic create/update/delete semantics
- orphan Span cleanup semantics

### Text model

- canonical NFC TextVersion content;
- LF newline normalization;
- Unicode code-point persisted/API coordinates;
- `[start, end)` range semantics;
- backend-derived `exact_text`, `prefix`, `suffix`;
- centralized JS UTF-16 ↔ code-point conversion.

### Frontend architecture

- TanStack Query owns persisted/server state;
- WorkspaceProvider/local reducer owns ephemeral workspace interaction state;
- pending selections remain client-side until alignment creation;
- canonical content root remains a flat sequence of `[data-run]` elements;
- `RenderedSpanRegistry` remains the canonical persisted-span → rendered-element bridge;
- current connector binding semantics remain unchanged.

### Infrastructure

- Python 3.13 baseline;
- Node 24 baseline;
- PostgreSQL 18 baseline;
- FastAPI / SQLAlchemy / Alembic modular monolith;
- React / TypeScript / Vite frontend architecture;
- Alembic HEAD `0002`.

---

## 4. Required Scope

### 4.1 Design tokens

Introduce one bounded set of application-owned design tokens sufficient for the current product.

Tokens may cover:

- font families;
- typography scale;
- line heights;
- spacing scale;
- surface/background roles;
- foreground/text roles;
- border roles;
- radius scale;
- focus treatment;
- semantic success/warning/error/destructive roles;
- elevation where genuinely required.

Implementation should normally use CSS custom properties or an equivalent local mechanism.

M1 must not create a general-purpose theming engine.

### 4.2 Shared UI primitives

Extract only primitives repeatedly required by the existing application.

Expected candidates include:

- Button;
- IconButton;
- Toolbar / action group;
- form field shell;
- surface/panel shell;
- shared feedback states;
- existing confirmation-dialog infrastructure.

Exact file/component names are implementation details.

A primitive must have at least two real consumers or a direct semantic/accessibility justification.

Generic primitives such as arbitrary `Box`, `Stack`, schema-driven UI builders or universal component factories are outside scope.

### 4.3 Application hierarchy

Refine the existing Projects → Documents → Workspace navigation and visual hierarchy.

Required outcomes:

- application identity/navigation is visually distinct from page-local actions;
- page title/context is clearly distinguished from operational controls;
- breadcrumbs/navigation remain semantic and keyboard accessible;
- create/import workflows remain identifiable without dominating the workbench.

No route changes are permitted.

### 4.4 Workspace action hierarchy

Reorganize existing workspace actions into explicit layers.

At minimum distinguish:

- workspace-level actions;
- panel-level actions;
- current-selection actions;
- pending-alignment actions;
- persisted-alignment actions;
- destructive actions.

Existing capabilities must remain available.

M1 may change placement, labels, grouping and styling.

M1 may not change their domain semantics.

### 4.5 Feedback states

Existing routes and workflows must use coherent representations for:

- initial loading;
- empty collections/workspaces;
- recoverable API errors;
- validation errors;
- mutation pending;
- destructive pending;
- successful state transition where explicit feedback is useful.

Feedback must remain semantic and readable without relying on color alone.

No toast framework is required.

### 4.6 Keyboard foundation

M1 keyboard scope is intentionally small.

Required:

1. Existing `Escape` semantics remain:
   - clear the current native/current selection;
   - do not clear already-staged tray members;
   - do not bypass a locked destructive dialog.

2. Add one explicit creation shortcut:

   **Primary modifier + Enter** (`Ctrl+Enter` / `Meta+Enter`) may invoke **Create Alignment** only when:
   - the pending tray is valid under the existing frontend mirror;
   - no create mutation is pending;
   - the event did not originate from an editable form control where the shortcut would conflict with text entry or a component-local action.

3. Shortcut handling must be centralized enough that route/components do not grow independent global `keydown` implementations for equivalent actions.

Explicitly excluded:

- command palette;
- configurable shortcuts;
- single-letter global shortcuts;
- generalized keyboard-command framework;
- shortcut persistence.

---

## 5. Canonical Text DOM Safety Boundary

This is a release-blocking M1 constraint.

Visual and component refactors must not alter the semantic structure relied upon by the Selection Engine.

Inside `[data-text-content-root]`:

- children remain flat `[data-run]` elements;
- every run continues to contain exactly one text node;
- no button, tooltip wrapper, icon, badge or nested formatting element may be inserted;
- `textContent` must continue to equal canonical TextVersion content exactly;
- run start/end metadata semantics remain unchanged.

All additional chrome belongs outside the canonical content root.

Any proposed UI design that requires violating this boundary is a contract conflict and must STOP for Human Review.

---

## 6. Workspace Layout Boundary

M1 may change presentation styling around the existing panel arrangement.

M1 must not introduce new spatial-layout behavior.

Explicitly forbidden:

- drag-and-drop panel positioning;
- free-form panel coordinates;
- resizable panels;
- grid-layout engine;
- docking;
- split panes;
- saved geometric layouts;
- server-persisted layout;
- connector anchor/routing redesign;
- collision avoidance;
- edge bundling.

Existing hide/open/reorder semantics and per-document panel preference behavior remain valid.

Any CSS/layout change must preserve those semantics and must not intentionally solve HRA-F09.

HRA-F09 remains a registered post-M1 visualization debt.

---

## 7. Explicit Non-Goals

M1 contains no implementation of:

- grapheme-aware editing beyond existing safe code-point behavior;
- word segmentation;
- sentence segmentation;
- tokenization;
- token-boundary snapping;
- linguistic annotations;
- candidate alignments;
- machine-assisted alignment;
- NLP or LLM providers;
- semantic synchronized scrolling;
- Alignment Graph view;
- workspace docking/resizing;
- advanced connector routing;
- authentication;
- collaboration;
- pagination;
- virtualization;
- graph database;
- vector database.

---

## 8. Dependency and Configuration Freeze

M1 is expected to require no new runtime or package dependency.

Unless Human Review explicitly approves an exception:

- `apps/api/pyproject.toml` must not change;
- `apps/web/package.json` must not change;
- `apps/api/uv.lock` must not change;
- `apps/web/package-lock.json` must not change;
- Node/Python/PostgreSQL versions must not change;
- Vite/TypeScript/runtime configuration must not be loosened;
- no UI framework, CSS framework, icon package or state-management dependency may be introduced.

Inline/local SVG or existing text/icon mechanisms may be used where needed.

Unexpected dependency need is a STOP / contract-review event.

---

## 9. Migration and API Impact

Expected impact:

```text
Database schema:      NONE
Alembic revision:     NONE
Alembic HEAD:         0002
API endpoints:        NONE
API request shapes:   NONE
API response shapes:  NONE
Backend semantics:    NONE
```

Any required backend, schema or API modification invalidates the current contract boundary and requires Human Review before implementation continues.

---

## 10. Allowed Implementation Areas

Primary implementation scope:

```text
apps/web/src/app/
apps/web/src/shared/ui/
apps/web/src/styles.css
apps/web/src/features/projects/
apps/web/src/features/documents/
apps/web/src/features/workspace/
apps/web/src/features/alignments/
apps/web/src/**/*.test.*
apps/web/e2e/
```

Additional local CSS files or a bounded `shared/ui` structure may be introduced if they remain within the M1 presentation/interaction purpose.

Documentation may be updated only to describe the frozen/as-built M1 state and verification procedure.

---

## 11. Forbidden Areas Without Human Re-Review

Implementation must not modify:

```text
apps/api/app/db/models/
apps/api/alembic/
apps/api/app/services/alignment_service.py
docs/adr/
.github/workflows/
retained M0.7 diagnostic/proof refs or repositories
```

Backend source generally remains untouched.

Existing tests outside the frontend may only be changed if a genuine pre-existing defect in the test itself is independently demonstrated; this requires Human Review before alteration.

No test may be weakened, skipped or deleted to accommodate M1.

---

## 12. Testing Obligations

### 12.1 Full regression baseline

M1 must preserve the complete M0 semantic baseline.

At Gate 2, execute at minimum:

Backend:

```text
uv sync --frozen
uv run pytest
Alembic empty → HEAD verification
Alembic current/check
```

Frontend:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test e2e
```

Real PostgreSQL integration tests must execute; skipped integration coverage does not count as PASS.

Unicode Playwright remains a release blocker.

### 12.2 New frontend tests

Tests must cover the newly introduced M1 behavior, including:

- shared primitive semantic behavior;
- disabled/loading/destructive variants where applicable;
- workspace feedback states;
- keyboard `Escape` regression;
- PrimaryModifier+Enter create-alignment guard conditions;
- editable-control shortcut suppression;
- pending mutation shortcut suppression;
- canonical-content DOM integrity;
- focus visibility and confirmation-dialog lifecycle;
- panel hide/open/reorder preference regression;
- connector activation/binding regression after presentation changes.

Tests should assert semantics and observable state, not fragile implementation-specific CSS details.

---

## 13. Human Runtime Acceptance

M1 requires a new Human Runtime Acceptance pass.

At minimum verify at desktop viewport sizes representative of:

```text
1280 × 720
1440 × 900
```

Acceptance must cover:

### Product hierarchy

- Projects page is visually comprehensible without reading source-order details.
- Documents page preserves the same interaction vocabulary.
- Workspace makes document context, panel controls, selection workflow, tray and persisted alignment areas visually distinguishable.

### Workspace

- multiple panels remain usable;
- no controls overlap or become inaccessible at the required desktop viewports;
- hidden-panel controls remain understandable;
- selection text remains the dominant panel content;
- destructive actions are visually identifiable and remain explicitly confirmed.

### Keyboard

- Escape behavior retains M0 semantics;
- PrimaryModifier+Enter creates only a valid staged alignment;
- shortcut does not unexpectedly fire while editing relevant input/textarea controls;
- focus remains visible during keyboard navigation.

### M0 regression

Repeat the essential M0 manual path:

- project/document/TextVersion creation;
- hide/show/reorder;
- native selection;
- tray staging;
- persisted alignment creation;
- reload;
- hover/active counterpart highlighting;
- connectors;
- Inspector note/member mutation;
- alignment deletion;
- Unicode/code-point scenario;
- destructive TextVersion confirmation.

HRA-F09 may remain visible and must be recorded as existing routing debt rather than treated as M1 failure, provided connector binding remains correct.

---

## 14. Acceptance Criteria

M1 passes only when all following conditions are satisfied:

1. Existing M0 functionality remains semantically intact.
2. No database migration is introduced; Alembic HEAD remains `0002`.
3. No API contract change is introduced.
4. No runtime/package dependency drift occurs.
5. Canonical text DOM integrity remains exact.
6. Shared design tokens are used by the major application surfaces introduced/refactored in M1.
7. Repeated controls use bounded shared primitives where justified.
8. Existing feedback states are presented consistently across Projects, Documents and Workspace.
9. Workspace action hierarchy clearly separates workspace, panel, selection, pending alignment, persisted alignment and destructive concerns.
10. Required keyboard behavior passes automated and human verification.
11. Existing panel preference semantics survive reload.
12. Existing connector binding and activation remain correct.
13. Full backend/frontend/Playwright regression gates pass.
14. Unicode release blocker passes.
15. Human Runtime Acceptance passes.
16. No M1 non-goal is implemented incidentally.
17. G2-X01 remains accurately represented until independently resolved.

---

## 15. Gate 2 / External Infrastructure Rule

The M0.7 External Infrastructure Exception was checkpoint-specific historical authorization.

It does **not** automatically apply to M1.

For M1 Gate 2:

### Preferred path

GitHub Actions executes the canonical semantic workflow successfully for the exact frozen M1 candidate.

### If G2-X01 persists

If GitHub-hosted execution again fails before workflow steps begin:

- do not call GitHub Actions PASS;
- confirm the failure remains provider/pre-step rather than candidate behavior;
- STOP Gate 2 before exception;
- present current evidence to Human Review;
- obtain a fresh, explicit M1 External Infrastructure Exception before using an independent hosted proof path.

The accepted M0.7 CircleCI proof proves only the M0.7 candidate and cannot serve as M1 execution evidence.

M1 implementation may not silently reuse historical exception authority.

---

## 16. Retained M0.7 Evidence

M1 must not alter or delete:

- `ci/m0.7-external-proof`;
- `diagnostic/actions-indexing`;
- `m0.7-ci-proof`;
- `circleci-project-setup`;
- `Pacchifans69/linguagraph-ci-proof-`;
- `Pacchifans69/actions-runner-probe`;
- CircleCI proof metadata/artifacts;
- GitHub Actions diagnostic history.

`G2-X01` remains independently governed.

Cleanup of those assets is outside M1.

---

## 17. Major Risks

### R1 — DOM integrity regression

A visual/component abstraction introduces nested markup inside canonical text runs and corrupts selection mapping.

**Control:** section 5 is release-blocking and explicitly tested.

### R2 — Presentation work expands into layout architecture

Panel styling turns into resize/docking/grid behavior or connector redesign.

**Control:** section 6 defines a hard layout boundary.

### R3 — Design-system overengineering

M1 creates a large generic component framework with little current product use.

**Control:** primitive reuse/semantic-justification rule and dependency freeze.

### R4 — Keyboard/browser conflict

Global shortcuts interfere with text inputs, browser behaviors or native selection.

**Control:** only two bounded behaviors are authorized; editable-control suppression is required.

### R5 — Hidden domain/API change

A frontend convenience change demands new server fields or mutations.

**Control:** backend/API/schema impact is explicitly zero; unexpected need triggers STOP.

### R6 — Accessibility regression through custom styling

Custom controls lose semantic HTML, visible focus or dialog safety.

**Control:** semantic-native controls remain preferred; component tests and HRA cover focus and destructive operations.

### R7 — Existing connector geometry becomes accidentally coupled to new styling

Visual spacing changes move panels or text while invalidation assumptions cease to hold.

**Control:** connector binding/activation regression remains mandatory; routing behavior itself stays frozen.

---

## 18. STOP Conditions

Implementation must stop and report if any of the following becomes necessary:

- database migration;
- API contract modification;
- backend domain/service modification;
- new runtime/package dependency;
- ADR change;
- canonical text DOM invariant change;
- RenderedSpanRegistry semantic change;
- connector routing redesign;
- resizable/dockable workspace behavior;
- linguistic segmentation;
- candidate-alignment domain;
- relaxation/removal of an existing M0 test;
- cleanup or mutation of retained M0.7 proof evidence;
- attempted automatic reuse of the M0.7 External Infrastructure Exception.

---

## 19. Contract Exit State

Successful M1 completion establishes:

```text
M0 core                          unchanged
M1 presentation foundation      stable
M1 interaction vocabulary       stable
M1 keyboard baseline            stable
schema                           still 0002
linguistic layer                not yet introduced
candidate layer                 not yet introduced
advanced layout/routing         not yet introduced
G2-X01                           independently governed
```

The intended next architecture checkpoint after M1 is:

**M2 — Linguistic Segmentation Foundation**

M2 must receive its own repository reconstruction, Gate 1, contract reconstruction, Human Review and explicit freeze before implementation.
