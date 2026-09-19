# LinguaGraph M8 — Alignment Connector Obstacle-Avoiding Routing

## Contract Status

**Status:** FROZEN — HUMAN APPROVED

**Human checkpoint naming / contract-freeze authorization date:** 2026-09-19

**Approved pre-freeze durable base:** `7f4975a0bc2374eedb2c5b00dc187ce8c3b6f4ed`

**Approved pre-freeze durable tree:** `5b5aeeb789623dfd9a14032efe5ef923d5d2a8c7`

**Implementation authorization:** NOT GRANTED by this freeze. Bounded M8
implementation may begin only after the docs-only freeze commit is
independently verified and the Human separately authorizes creation of the
implementation branch.

**Planned implementation branch:**
`m8-alignment-connector-obstacle-avoiding-routing`

This contract is the authoritative bounded execution contract for M8.

It inherits:

- the accepted M0 domain model, Unicode/canonical-text rules, Span identity,
  and AlignmentGroup N:M hyperedge semantics;
- the completed M1 interaction/presentation boundary;
- the completed M2–M5 linguistic persistence contracts;
- the completed M6 mode-oriented Workbench information architecture;
- the completed M7 Alignment mutation-concurrency hardening;
- ADR-001 through ADR-015.

M8 does not silently reopen those decisions.

---

## 1. Goal and Governing Retained Debt

M8 closes retained Human Runtime finding `HRA-F09`:

```text
inherited connector lines can cross text glyphs under frozen routing
```

The current as-built connector pipeline is intentionally simple:

```text
AlignmentMember.span_id
→ RenderedSpanRegistry
→ visible/clipped member ClientRects
→ member anchor
→ shared centroid hub
→ straight SVG line
```

That pipeline has no obstacle semantics, so a valid connector may traverse
canonical text or other TextVersion panel content.

M8 introduces deterministic obstacle-avoiding connector routing while
preserving Alignment identity, Span identity, N:M hyperedge semantics,
canonical text, Selection/Range behavior, Workbench state ownership, backend
persistence, API shape, schema, runtime, and dependencies.

`HRA-F09` remains OPEN throughout contract freeze and implementation. It may be
recorded CLOSED only after the exact M8 candidate passes automated geometry
proof, real-browser regression, and explicit Human Runtime Acceptance.

---

## 2. Bounded Scope

### 2.1 In scope

M8 governs only the presentation geometry of the effective Alignment connector
set:

1. visible AlignmentMember geometry collection;
2. deterministic member-rect selection inherited from M0.6;
3. member-derived TextVersion panel-perimeter ports;
4. fixed routing reserve and obstacle clearance;
5. deterministic orthogonal obstacle-avoiding routing;
6. one shared free-space hub for one visible AlignmentGroup;
7. one complete route per visible member;
8. fail-closed suppression when a complete route set cannot be produced;
9. geometry provenance across Alignment and panel-layout changes;
10. scroll/resize/reorder/hide/reopen invalidation;
11. pure geometry/component/browser verification;
12. targeted Human Runtime Acceptance required to close `HRA-F09`.

### 2.2 Presentation-only authority

M8 routing is derived UI state only.

No route, port, gate, bend, hub, obstacle, lane, or connector coordinate becomes
backend, API, persisted, query, or local-storage authority.

### 2.3 Explicitly out of scope

M8 does not authorize:

- Alignment domain redesign or relation types;
- Span identity redesign;
- backend/API/database/Alembic changes;
- TextVersion, sentence, token, lemma, or POS persistence changes;
- morphology, Lexeme/vocabulary identity, syntax, or revision/re-anchoring;
- `RenderedSpanRegistry` replacement or semantic redesign;
- canonical TextPanel text-DOM changes;
- native Selection/Range replacement;
- glyph/run-level obstacle pathfinding;
- Bézier/spline routing;
- connector crossing minimization, edge bundling, lane allocation, or route
  editing;
- connector labels/arrows/port markers/hub markers by default;
- resizable/dockable panes, panel-layout redesign, or saved geometric layouts;
- synchronized scrolling;
- persistent routing state;
- a graph/layout/routing package;
- runtime/dependency upgrades;
- authentication, collaboration, or permissions;
- CI-provider redesign.

---

## 3. Inherited Alignment and Rendering Invariants

### 3.1 AlignmentGroup

An AlignmentGroup remains one symmetric N:M hyperedge:

- minimum two members;
- minimum two distinct TextVersions;
- all members belong to the same ParallelDocument;
- multiple non-overlapping members from one TextVersion remain allowed;
- one Span may participate in multiple AlignmentGroups;
- no source/target direction or relation type is introduced.

M8 changes only how an already-authoritative group is drawn.

### 3.2 Effective Alignment precedence

The existing precedence remains:

```text
effectiveAlignmentId = activeAlignmentId ?? hoveredAlignmentId
```

M8 may render at most one connector set at a time.

### 3.3 Visibility and clipping

Existing visibility semantics remain authoritative:

- no effective Alignment → no connector overlay;
- fewer than two visible members → no connector geometry;
- disconnected/hidden members contribute no geometry;
- fully clipped/offscreen members contribute no geometry;
- partially clipped members use only their visible clipped geometry;
- panel-body scrolling changes geometry through recomputation rather than
  virtual/offscreen connector continuation.

### 3.4 RenderedSpanRegistry

`RenderedSpanRegistry` remains the sole canonical bridge:

```text
AlignmentMember.span_id
→ RenderedSpanRegistry.getElements(spanId)
→ rendered run elements
```

M8 must not discover Span identity by DOM selector, `data-*` parsing, text
search, or coordinate guessing.

`apps/web/src/shared/rendering/spanRegistry.ts` is frozen by default.

---

## 4. Superseded Connector-Routing Decision

M0 intentionally chose simple straight/quadratic connector geometry with no
complex edge routing. M6 then explicitly preserved the current anchor/routing
algorithm and deferred `HRA-F09`.

M8 supersedes only that routing decision.

M8 does not supersede:

- `RenderedSpanRegistry` identity authority;
- member/span binding;
- clipping semantics;
- active-over-hover precedence;
- visible-member suppression;
- mode-independent `ConnectorOverlay` ownership;
- requestAnimationFrame-coalesced invalidation;
- canonical TextPanel structure;
- N:M shared-hub semantics.

---

## 5. Terminology

### 5.1 Chosen member anchor

The point selected from one visible AlignmentMember's clipped render rects by
the inherited deterministic member-rect strategy. It identifies the member's
visual locality but is not itself rendered as the final connector endpoint in
M8.

### 5.2 Owning panel

The single visible `.panel-slot` containing all connected render elements for
one member.

If the connected elements for one member resolve to more than one owning
`.panel-slot`, that member geometry is invalid and the entire connector set
fails closed for that frame.

### 5.3 Panel obstacle

The overlay-relative rectangle of one visible `.panel-slot`.

The entire panel is an obstacle, including controls, header, canonical text
body, and actions.

### 5.4 Perimeter port

A point on the real owning-panel boundary derived from the chosen member
anchor.

### 5.5 Routing gate

The point obtained by moving one perimeter port outward by the frozen obstacle
clearance. The port→gate segment is the only segment allowed inside the owning
panel's expanded-clearance zone; it may never enter the real panel interior.

### 5.6 Shared hub

One deterministic free-space routing point used by every rendered route of the
effective AlignmentGroup.

---

## 6. Inherited Member-Rect Selection

M8 preserves the existing deterministic member-rect selection behavior:

```text
visible rects per member
→ union-bounding-box center per visible member
→ provisional centroid
→ choose the visible rect center nearest that centroid
→ deterministic first-candidate tie behavior
```

This preserves existing support for:

- wrapped spans;
- multiple `getClientRects()` per run;
- a Span split across multiple render runs;
- partial clipping;
- hidden/offscreen members;
- same-TextVersion multiple members.

The resulting chosen member anchor feeds M8 port derivation rather than a
direct straight line.

---

## 7. Routing Reserve and Obstacle Clearance

### 7.1 Frozen constants

M8 freezes:

```text
ROUTING_RESERVE_PX   = 8
ROUTING_CLEARANCE_PX = 4
```

These are CSS-pixel presentation constants, not user preferences or domain
state.

### 7.2 In-container routing reserve

To guarantee a connected free-space perimeter corridor even when canonical
panels are stacked at full track width, M8 may add exactly an 8px internal
routing reserve around `.panels-container`.

The reserve must be implemented inside the existing canonical coordinate
container. It must not create horizontal document overflow.

The existing responsive grid track counts, breakpoints, panel order, panel
visibility preference semantics, and canonical panel ownership remain
unchanged.

The reserve is a bounded routing allowance, not a panel/grid redesign.

### 7.3 Expanded obstacles

For routing collision checks, every visible `.panel-slot` obstacle is expanded
outward by 4px on all sides.

Because the container reserves 8px internally, an expanded outermost panel
still leaves a free perimeter corridor within the overlay coordinate space.

No route requires negative X coordinates, X coordinates beyond overlay width,
or geometry below/above the overlay solely to bypass a panel.

---

## 8. Perimeter-Port Contract

Let the chosen member anchor be:

```text
A = (ax, ay)
```

and the real owning panel be:

```text
P = [left, top, right, bottom]
```

The four candidate perimeter ports are:

```text
LEFT   = (left,  clamp(ay, top, bottom))
RIGHT  = (right, clamp(ay, top, bottom))
TOP    = (clamp(ax, left, right), top)
BOTTOM = (clamp(ax, left, right), bottom)
```

Each port has an outward gate exactly 4px away along its side normal.

A candidate is invalid if:

- the gate leaves the overlay routing envelope;
- port→gate enters another real panel;
- the gate lies inside another expanded obstacle;
- the owning-panel association is ambiguous/invalid.

Port choice is not decided only by which side faces the desired hub. All valid
candidates participate in deterministic route comparison.

---

## 9. Rectilinear Routing Graph

M8 uses a small pure-TypeScript rectangular visibility graph.

It must not introduce a graph/layout package.

### 9.1 Canonical coordinate sets

Construct canonical X coordinates from:

```text
overlay left/right routing bounds
all valid gate.x values
desiredHub.x
all expanded-obstacle left/right edges
```

Construct canonical Y coordinates from:

```text
overlay top/bottom routing bounds
all valid gate.y values
desiredHub.y
all expanded-obstacle top/bottom edges
```

Coordinates are numerically sorted and deduplicated.

### 9.2 Routing nodes

The Cartesian X×Y intersections are routing nodes only when they are not
inside the strict interior of any expanded obstacle.

Boundary points are permitted.

### 9.3 Routing edges

Axis-aligned neighboring nodes on the same canonical X or Y coordinate are
connected only when the segment between them does not enter any expanded
obstacle interior.

Edge cost is Manhattan length.

No diagonal routing edge exists.

---

## 10. Member Route Selection

For one member, one candidate port/gate, and one candidate shared hub, the
comparison cost includes:

```text
anchor → port projection distance
+ port → gate distance
+ gate → hub Manhattan route length
```

The anchor→port projection is a scoring term only; that segment is not drawn
through canonical text.

Among candidate routes for the same member/hub, choose lexicographically by:

```text
1. smaller total cost
2. fewer bends
3. fixed port-side order: TOP, RIGHT, BOTTOM, LEFT
4. deterministic canonical point-sequence order
```

No arbitrary bend-to-pixel penalty is introduced.

The route algorithm may use a small deterministic Dijkstra-style search or an
equivalent pure algorithm, but observable output must be independent of Map,
Set, DOM-enumeration, or browser iteration accidents.

Identical geometry input must produce identical canonical route output.

---

## 11. Shared-Hub Contract

### 11.1 N:M visualization remains a hyperedge

M8 preserves:

```text
member A ─┐
member B ─┼─ shared hub
member C ─┘
```

It must not render a pairwise/directional chain such as `A → B → C`.

### 11.2 Desired hub

The desired hub is the centroid of the chosen member anchors produced by the
inherited M0.6 strategy.

It is a preferred visual location, not mandatory geometry.

If it lies inside an obstacle, it cannot be used directly.

### 11.3 Actual hub selection

Consider every free routing node that is reachable from every visible member
through at least one valid member route.

For each candidate hub H, choose the best route for every member and compare
hub candidates lexicographically by:

```text
1. sum(member route total costs)
2. sum(member route bend counts)
3. squared distance(H, desiredHub)
4. H.y
5. H.x
```

The lexicographically smallest tuple is the actual shared hub.

---

## 12. Canonical Geometry Output and SVG Rendering

The pure routing layer should expose a structure equivalent to:

```ts
interface ConnectorRoute {
  memberId: string;
  points: Point[];
}

interface ConnectorGeometry {
  alignmentId: string;
  layoutKey: string;
  hub: Point;
  routes: ConnectorRoute[];
}
```

Each route point sequence is:

```text
[port, gate, ..., shared hub]
```

Canonicalization must remove:

- adjacent duplicate points;
- redundant collinear interior points.

Every remaining consecutive point pair must form one horizontal or vertical
segment.

The rendering primitive changes from straight SVG `<line>` elements to SVG
`<polyline>` elements or an exactly equivalent orthogonal primitive whose
observable geometry is the canonical point list.

Baseline M8 does not add port markers, hub markers, arrows, labels, or badges.
Rounded line caps/joins may be used as presentation only; they must not change
routing geometry.

---

## 13. Panel-Obstacle Correctness Invariant

For every successfully rendered connector route and every visible real
`.panel-slot` P:

```text
route segment interior ∩ panel interior = ∅
```

The only permitted contact with an owning panel is the route's own perimeter
port on that panel boundary.

After the own port→gate escape stub, route geometry must not enter the interior
of any expanded obstacle.

This stronger invariant is the automated basis for closing the original
text-glyph crossing debt.

Connector-vs-connector intersection is not an M8 correctness failure.

---

## 14. Complete-Set / Fail-Closed Rule

One visible AlignmentMember maps to one route.

If an effective Alignment has at least two visible members but any visible
member cannot participate in one common-hub complete route set:

```text
ConnectorGeometry = null
```

M8 renders none of that connector set for that frame.

It must not:

- render only a subset of the visible members;
- silently collapse multiple same-TextVersion members;
- fall back to the old straight-through line;
- guess a cross-panel route through canonical content.

Run active/hover highlighting remains available even when connector geometry
fails closed.

---

## 15. DOM Geometry Discovery Boundary

DOM traversal is allowed only for layout discovery.

M8 may use member render elements to locate:

```text
closest('.text-panel-body')
closest('.panel-slot')
```

and may collect visible `.panel-slot` rectangles as routing obstacles.

DOM layout traversal must never become Span identity authority.

All connected render elements for one member must resolve to one owning
`.panel-slot`. Multiple owning panels are invalid geometry and trigger the
complete-set fail-closed rule.

---

## 16. Geometry Provenance

Current connector provenance is strengthened from Alignment-only to:

```text
alignmentId + layoutKey
```

Geometry may render only when both values still match the current effective
Alignment and current panel layout.

A hide/reopen/reorder operation that changes `layoutKey` invalidates the
previous geometry immediately, even before the next scheduled recomputation
finishes.

---

## 17. Recompute and Observer Lifecycle

M8 preserves one requestAnimationFrame-coalesced scheduler.

Required invalidation sources remain or expand to:

```text
effective alignment change
member/workspace snapshot change
RenderedSpanRegistry input change
layoutKey change
captured descendant scroll
window scroll
window resize
ResizeObserver
```

While an effective Alignment exists, ResizeObserver coverage must include the
geometry-bearing overlay plus visible `.panel-slot` and `.text-panel-body`
elements needed by the router.

When the effective Alignment is null, listeners/observers remain detached as
in the current lifecycle.

No polling loop is authorized.

---

## 18. Ephemeral-State Boundary

All connector routing state is current-frame/current-layout derived state.

M8 must not persist or synchronize:

```text
port
route
gate
bend
hub
obstacle
routing reserve preference
```

through backend APIs, PostgreSQL, TanStack Query domain data, localStorage, or
workspace preference schema.

Panel scroll/resize/reorder/hide/reopen correctly causes recomputation rather
than coordinate persistence.

---

## 19. Connector-to-Connector Crossings

M8 does not require connector-vs-connector obstacle avoidance.

Legal geometry may contain:

- connector crossings;
- shared corridor segments;
- overlapping route portions;
- convergence at the common hub.

M8 does not authorize edge bundling, lane allocation, crossing minimization,
or interactive route editing.

---

## 20. Pure Geometry Test Contract

M8 must add deterministic pure geometry coverage for at least:

```text
R-G01  two horizontal panels
R-G02  two vertically stacked panels
R-G03  three panels in one row
R-G04  four panels in a 2×2 grid
R-G05  three or more full-width stacked panels using the reserved perimeter corridor
R-G06  unequal panel heights

R-G07  wrapped member span
R-G08  Span split across multiple run elements
R-G09  same TextVersion contributes multiple AlignmentMembers
R-G10  partially clipped member
R-G11  fully clipped / hidden member suppression

R-G12  desired hub already free
R-G13  desired hub inside an obstacle
R-G14  equal-cost route tie is deterministic
R-G15  equal-cost hub tie is deterministic
R-G16  inner-gap route
R-G17  outer reserved-corridor route

R-G18  fixed 4px clearance
R-G19  no horizontal/document overflow from routing geometry
R-G20  one member resolving to multiple owning panels fails closed
R-G21  impossible/degenerate geometry suppresses the complete connector set
```

Every successful route test must assert:

- first point lies on the correct owning-panel perimeter;
- the route corresponds to the correct visible AlignmentMember;
- every segment is horizontal or vertical;
- no segment enters any real panel interior;
- non-own escape geometry avoids expanded obstacle interiors;
- the final point is the shared hub;
- canonicalization removes duplicate/collinear redundant points.

---

## 21. Component Regression Contract

`ConnectorOverlay` component coverage must retain or strengthen:

```text
no effective Alignment → no overlay
aria-hidden overlay
pointer-events:none
one effective connector set only
fewer-than-two-visible-member suppression
hidden/offscreen member handling
partial clipping
overlay-relative coordinates
scroll recomputation
window-scroll recomputation
resize recomputation
ResizeObserver recomputation
layoutKey recomputation
requestAnimationFrame coalescing
listener/observer cleanup
A → null → B stale-geometry suppression
```

M8-specific component coverage must additionally prove:

```text
polyline/orthogonal route rendering
panel-obstacle collection
alignmentId + layoutKey provenance
all-or-nothing fail-closed behavior
observer coverage for panel slots/bodies
same-TextVersion multiple-member route identity
```

Existing tests may not be weakened merely to make the new algorithm pass.
Assertions that encode the deliberately superseded direct-line routing contract
may be replaced only by stronger M8 geometry invariants.

---

## 22. Browser / Playwright Contract

M8 strengthens the existing:

```text
apps/web/e2e/workbench-information-architecture.spec.ts
```

rather than creating a separate E2E family by default.

Required real-browser geometry cases include at least:

```text
1280×720:
- two short panels
- four short panels

1440×900:
- three panels
- four panels
- long + short panel combinations

stacked layout:
- at least two panels
- a case demonstrating the reserved outer corridor when an intervening panel blocks direct gutters
```

Required interactions include:

```text
activate Alignment
hover Alignment
switch Alignment ↔ linguistic task mode
scroll one canonical text body
scroll window
resize viewport
reorder panels
hide panel
reopen panel
```

At least one E2E case must contain more than one AlignmentMember from the same
TextVersion and prove the routes remain distinct.

The existing M6 browser assertion that a direct connector anchor lies inside a
canonical panel body is intentionally superseded. It must be replaced by:

```text
route starts at the correct owning-panel perimeter
route does not enter any visible panel interior
all visible members receive one complete route
all routes share one hub
hub lies outside every visible panel interior
```

That replacement is a stronger changed-routing contract, not test weakening.

---

## 23. Human Runtime Acceptance

M8 requires targeted Human Runtime Acceptance before `HRA-F09` may close.

At minimum, Human review must inspect required desktop and stacked-layout cases
and verify:

1. connector routes do not visibly enter any TextVersion panel interior;
2. member highlight plus member-derived edge port still makes exact member
   binding understandable;
3. the shared hub still reads as one N:M Alignment rather than a directional
   chain;
4. three/four-panel routes are not pathologically confusing;
5. the 8px internal routing reserve does not materially damage canonical text
   readability or M6 density acceptance;
6. scroll/resize/reorder/hide/reopen do not show stale routes;
7. connectors remain mode-independent in linguistic task modes;
8. no new horizontal page overflow is introduced.

If exact-member comprehensibility fails, implementation must return a new HRA
finding for Human disposition. The Agent may not autonomously add arrows,
labels, markers, or a new visual language under the frozen contract.

---

## 24. Persistence, API, Backend, and Migration Boundary

M8 changes no backend or persisted domain semantics.

Frozen:

```text
apps/api/** semantic behavior unchanged
API routes/request/response shapes unchanged
ORM schema unchanged
Alembic HEAD = 0006
new migration = NONE
```

Required migration regression remains:

```text
empty → 0006
alembic current == 0006
alembic check == no new upgrade operations
```

Existing migration files remain byte-for-byte unchanged.

M8 adds no stable backend/domain error code.

---

## 25. Default Implementation Surface

After separate implementation authorization, the default production surface is
limited to:

```text
apps/web/src/shared/rendering/geometry.ts
apps/web/src/shared/rendering/domRects.ts
apps/web/src/features/workspace/ConnectorOverlay.tsx
apps/web/src/styles.css
```

A narrowly scoped pure routing helper is allowed, for example:

```text
apps/web/src/shared/rendering/connectorRouting.ts
```

Required/allowed tests:

```text
apps/web/src/shared/rendering/geometry.test.ts
apps/web/src/shared/rendering/connectorRouting.test.ts
apps/web/src/features/workspace/ConnectorOverlay.test.tsx
apps/web/e2e/workbench-information-architecture.spec.ts
```

Implementation documentation may include:

```text
docs/adr/ADR-016-*.md
docs/architecture/ARCHITECTURE.md
docs/testing/testing-strategy.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

`WorkspacePage.tsx` is not in the default implementation surface. The current
`.panels-container`, `.panel-slot`, `ConnectorOverlay`, and `layoutKey` wiring
are expected to be sufficient.

If implementation evidence shows `WorkspacePage.tsx` must change, the Agent
must STOP, report the exact necessity, and obtain Human scope review before
modifying it.

---

## 26. Default Prohibited Implementation Surface

Unless separately authorized, M8 must not modify:

```text
apps/api/**
apps/api/alembic/versions/**
apps/web/src/shared/text/**
apps/web/src/shared/rendering/spanRegistry.ts
apps/web/package.json
apps/web/package-lock.json
apps/api/pyproject.toml
apps/api/uv.lock
.github/workflows/ci.yml
```

Also prohibited:

- canonical TextPanel text-DOM semantic changes;
- native Selection/Range changes;
- Alignment API/service/persistence changes;
- workspace state-ownership redesign;
- panel preference-schema changes;
- responsive breakpoint or grid-track-count redesign;
- new framework/library dependencies;
- unrelated refactoring;
- weakening/skipping inherited regressions.

The exact 8px internal routing reserve is the only default-authorized
`.panels-container` layout-space adjustment. It must not alter panel ordering,
track-count rules, or persistence semantics.

---

## 27. Dependency, Runtime, Workflow, and Configuration Boundary

M8 adds no dependency.

Frozen runtime baseline:

```text
Python       3.13
Node.js      24
PostgreSQL   18
Alembic      0006
```

Frozen dependency files:

```text
apps/api/pyproject.toml
apps/api/uv.lock
apps/web/package.json
apps/web/package-lock.json
```

The canonical workflow already executes the strengthened
`workbench-information-architecture.spec.ts`, so M8 does not require a
workflow command change.

Historical M6 wording in `.github/workflows/ci.yml` is not sufficient reason to
enter workflow scope. The workflow is expected to remain byte-for-byte
unchanged under M8 unless a separately reported semantic necessity is approved.

---

## 28. Complete Gate 2 Verification Surface

M8-specific frontend evidence supplements, not replaces, the complete release
baseline.

Gate 2 must include at least:

```text
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
- Unicode
- M2 sentence segmentation
- M3 token segmentation
- M4 lemma annotation
- M5 POS annotation
- strengthened M6/M8 Workbench information-architecture / connector-routing coverage

dependency-hash equality
tracked-tree integrity
disposable database cleanup
final remote/tree provenance
```

Because M8 changes frontend routing semantics, targeted Human Runtime Acceptance
is mandatory in addition to Gate 2 automation.

---

## 29. Hosted Evidence and Provider Boundary

Prior M6/M7 hosted proof and External Infrastructure Exception decisions are
historical evidence only.

They do not authorize M8 proof execution or provider mutation.

M8 Gate 2 must first attempt/inspect the canonical exact-candidate verification
path required by the then-current lifecycle.

If GitHub-hosted execution again exhibits the known provider/pre-step
fingerprint (`runner_id=0`, repository-defined `steps=[]`), that is diagnostic
evidence only and not an application failure.

Any alternate hosted proof path, Alibaba ECS allocation/reuse, proof-repository
mutation, token/authorization issuance, or provider-side mutation requires a
new explicit M8-specific Human authorization.

No spent M6/M7 authorization may be reused.

---

## 30. Documentation Freeze Surface

The M8 docs-only contract-freeze commit is strictly limited to:

```text
docs/development/M8_CONTRACT.md
docs/development/CURRENT_STATE.md
AGENTS.md
README.md
```

It contains no:

```text
implementation code
test modification
ADR-016 implementation record
architecture-as-built modification
API modification
migration
workflow modification
dependency modification
lockfile modification
proof-repository modification
provider mutation
implementation branch creation
```

`docs/architecture/ARCHITECTURE.md`, `docs/api/api-contract.md`,
`docs/testing/testing-strategy.md`, and `docs/README.md` remain as-built-through-
M7 documents during the freeze. They must not describe unimplemented M8
routing as current reality.

---

## 31. ADR-016 Obligation

Bounded M8 implementation must add one ADR equivalent to:

```text
ADR-016 — Panel-Perimeter Obstacle-Avoiding Alignment Routing
```

It must record at least:

- `HRA-F09` as the motivating retained visual debt;
- preservation of N:M shared-hub semantics;
- `RenderedSpanRegistry` as sole Span→DOM identity authority;
- full `.panel-slot` obstacles;
- span-derived perimeter ports;
- 8px internal routing reserve and 4px clearance;
- deterministic rectilinear routing;
- deterministic shared-hub selection;
- complete-set fail-closed behavior;
- `alignmentId + layoutKey` provenance;
- ephemeral geometry only;
- rejection of glyph-level routing, graph/layout dependencies, persistent
  geometry, and connector beautification scope.

ADR-016 must remain consistent with this frozen contract and cannot broaden it.

ADR-016 is an implementation record and is deliberately absent from this
freeze commit.

---

## 32. Explicit Non-Goals

M8 excludes:

- new product/domain entities;
- new linguistic annotation layers;
- Morphology;
- Lexeme/shared vocabulary identity;
- syntax;
- automatic NLP/LLM behavior;
- document revision/re-anchoring;
- authentication/collaboration;
- Alignment relation ontology;
- connector visual labels/markers not required by an explicit Human finding;
- general graph visualization infrastructure;
- provider/CI redesign;
- unrelated M0–M7 cleanup.

---

## 33. STOP Conditions

Implementation must stop and report before broadening scope if:

- HRA-F09 cannot be closed without changing canonical TextPanel text DOM;
- `RenderedSpanRegistry` semantics must change;
- backend/API/schema/Alembic changes become necessary;
- a new runtime/package dependency becomes necessary;
- the responsive grid track-count/breakpoint architecture must change beyond
  the exact routing reserve authorized here;
- route geometry must be persisted;
- the implementation needs to fall back to a panel-crossing straight line;
- supported 2/3/4-panel and stacked layouts cannot produce one complete route
  set under the frozen obstacle model;
- routing creates horizontal document overflow;
- same-TextVersion multiple-member identity cannot be preserved;
- active-over-hover or visibility/clipping semantics must change;
- native Selection/Unicode/canonical text invariants must change;
- `WorkspacePage.tsx` must change without prior Human scope review;
- `.github/workflows/ci.yml` must change without prior Human scope review;
- an inherited regression must be weakened rather than replaced only where the
  old direct-line routing assertion is explicitly superseded by a stronger M8
  invariant;
- targeted HRA reveals that panel-edge routing makes exact member binding
  materially ambiguous and remediation would require new visual semantics.

---

## 34. Definition of Done

M8 implementation is complete only when all of the following are true:

1. exact frozen-base lineage is verified before implementation;
2. only authorized frontend/rendering/test/docs surfaces change;
3. backend/API/schema/Alembic behavior remains unchanged;
4. Alembic HEAD remains `0006` and `alembic check` is clean;
5. dependency manifests/lockfiles and runtime baseline remain unchanged;
6. one visible AlignmentMember maps to one route;
7. same-TextVersion multiple members remain distinct;
8. inherited member rect selection/clipping behavior remains correct;
9. every route begins at its own span-derived owning-panel perimeter port;
10. the 8px internal routing reserve is bounded and creates no horizontal
    overflow;
11. real panel interiors are never crossed by rendered connector segments;
12. non-own routing geometry avoids expanded panel-obstacle interiors;
13. every successful route is orthogonal and canonicalized;
14. all routes of one effective Alignment share one free-space hub;
15. N:M hyperedge semantics remain visually preserved;
16. route/hub output is deterministic for identical geometry input;
17. incomplete geometry fails closed as one whole connector set;
18. no straight-through fallback exists;
19. active-over-hover, clipping, and fewer-than-two-visible semantics remain
    unchanged;
20. `RenderedSpanRegistry` remains sole Span→DOM identity authority;
21. ambiguous multi-panel member DOM geometry fails closed;
22. geometry provenance includes exact `alignmentId + layoutKey`;
23. scroll/resize/reorder/hide/reopen invalidation passes;
24. observer/listener lifecycle remains rAF-coalesced and leak-free;
25. connector geometry remains ephemeral and unpersisted;
26. connector-vs-connector crossings are not treated as domain failure;
27. R-G01 through R-G21 or equivalent frozen geometry coverage passes;
28. strengthened `ConnectorOverlay` component regression passes;
29. strengthened real-browser Workbench routing regression passes;
30. native Selection, Unicode offsets, canonical flat runs, and M6 IA regressions
    pass;
31. full backend PostgreSQL regression passes with zero required skips;
32. full lint/typecheck/Vitest/build/Playwright release surface passes;
33. dependency/tree integrity and disposable-database cleanup pass;
34. exact-candidate Gate 2 evidence is established independently for M8;
35. ADR-016 is added during implementation and matches this frozen contract;
36. targeted Human Runtime Acceptance passes the required routing cases;
37. only then is `HRA-F09` recorded `CLOSED / HUMAN ACCEPTED`;
38. architecture/testing/state/user-facing documentation matches implemented
    reality before Human merge decision;
39. Static Human Diff Review passes before any Human merge decision;
40. no unrelated Candidate A/B/D or other future-domain work enters M8.

---

## 35. Freeze and Authorization Boundary

This docs-only contract freeze does **not** authorize implementation.

After the freeze is durably landed, the next safe sequence is:

```text
independently verify exact freeze commit/tree and exact four-file scope
→ Human separately authorizes bounded M8 implementation branch
→ create m8-alignment-connector-obstacle-avoiding-routing from exact frozen main
→ bounded implementation
```

Until that separate Human authorization:

```text
NO implementation branch
NO frontend/application code change
NO test change
NO ADR-016 implementation record
NO workflow change
NO dependency change
NO proof execution
NO proof-repository mutation
NO provider mutation
```
