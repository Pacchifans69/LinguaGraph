# ADR-016: Panel-Perimeter Obstacle-Avoiding Alignment Routing

## Status

Accepted for the M8 implementation candidate

## Context

The M0.6 connector overlay deliberately used direct member-anchor-to-centroid
lines. M6 preserved that routing while recording Human Runtime finding
`HRA-F09`: valid connector lines can cross canonical text glyphs.

The persisted Alignment model is already correct. The debt is presentation
geometry only, so M8 must not introduce a new Alignment ontology, persisted
connector coordinates, a second Span-to-DOM identity mechanism, or a graph
layout dependency.

## Decision

Alignment connector identity remains:

```text
AlignmentMember.span_id
→ RenderedSpanRegistry
→ visible clipped member rects
```

The inherited deterministic member-rect selection produces one chosen visual
anchor per visible member. M8 projects that anchor to candidate ports on the
owning `.panel-slot` perimeter and routes from a 4px outward gate through
free canvas space.

Every visible `.panel-slot` is an obstacle. The canonical panels container
reserves 8px internally around its perimeter so even full-width stacked panels
retain a connected routing corridor without horizontal document overflow.

Routing is a deterministic orthogonal visibility graph. One effective
AlignmentGroup retains one shared free-space hub; one visible AlignmentMember
retains one independent route, including multiple members from one
TextVersion. Route and hub selection use deterministic lexicographic costs.

The complete connector set fails closed if any visible member cannot reach one
common hub. There is no fallback to a panel-crossing straight line.

Geometry provenance is `alignmentId + layoutKey`. Scroll, resize, panel
reorder/hide/reopen, registry/snapshot changes, and observed panel/body size
changes invalidate geometry through the existing requestAnimationFrame-
coalesced lifecycle.

All ports, gates, routes, bends, obstacles, and hubs are ephemeral UI geometry.
They are never persisted or sent through the API.

## Alternatives considered

- Stroke halos or opacity changes: rejected because they mask, rather than
  close, HRA-F09.
- Glyph/run-level obstacle routing: rejected as unnecessary DOM/layout
  complexity and a threat to the canonical text/Selection boundary.
- Bézier/spline routing: rejected because rectangular obstacle correctness is
  less direct to prove.
- Generic graph/layout libraries: rejected because the bounded panel-obstacle
  problem is small and pure TypeScript is sufficient.
- Persistent/user-edited connector geometry: rejected because layout geometry
  is current-frame derived state.
- Pairwise connector chains: rejected because AlignmentGroup is a symmetric
  N:M hyperedge and must retain one shared visual hub.

## Consequences

- Connector strokes no longer need to enter TextVersion panel interiors to
  identify members; run active/hover highlighting plus span-derived perimeter
  ports carry member locality.
- The panels container receives only the frozen 8px internal routing reserve;
  track-count/breakpoint and panel-order semantics remain unchanged.
- Connector-vs-connector crossings and shared corridor segments remain legal;
  M8 is not a general graph beautification milestone.
- `RenderedSpanRegistry` remains the sole Span-to-DOM identity authority.
- Backend, API, schema, Alembic `0006`, dependencies, and runtime baseline
  remain unchanged.
- HRA-F09 closes only after exact-candidate automated/browser evidence and
  explicit Human Runtime Acceptance.
