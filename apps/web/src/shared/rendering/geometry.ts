/**
 * Connector geometry helpers (M0.6 Round 1) — framework-light, pure
 * functions over plain rect-like objects so they are unit-testable without a
 * layout engine (pre-implementation report section 8; frozen Round 1
 * contract sections J, K, L).
 *
 * Pipeline for the effective alignment:
 *
 *   group -> membersByGroup -> member.span_id
 *     -> RenderedSpanRegistry.getElements(spanId)
 *     -> element.getClientRects()        (flattened, per element)
 *     -> clipped to the owning .text-panel-body viewport (section K)
 *     -> converted to overlay-relative coordinates (section I)
 *     -> computeAnchors()                (section L, deterministic)
 *
 * A span may be split across multiple segmentation runs (multiple elements)
 * and wrapped across multiple visual lines (multiple ClientRects per
 * element); ALL visible rects are flattened.
 */

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Intersection of two axis-aligned rects; null when they do not overlap. */
export function intersectRects(a: RectLike, b: RectLike): RectLike | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) {
    return null;
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** A rect with positive width AND height is a visible anchor candidate. */
export function isVisibleRect(rect: RectLike): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Center point of one rect. */
export function rectCenter(rect: RectLike): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Center of the union bounding box of several rects (provisional member
 * center). Requires at least one rect (callers filter empty members first).
 */
export function unionCenter(rects: ReadonlyArray<RectLike>): Point {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** Arithmetic mean of points; null for an empty list. */
export function centroid(points: ReadonlyArray<Point>): Point | null {
  if (points.length === 0) {
    return null;
  }
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export interface AnchorSelection {
  /** Final group hub: centroid of the chosen member anchors. */
  hub: Point;
  /**
   * One chosen anchor per VISIBLE member, in input order (the candidate
   * rect center nearest to the provisional hub — deterministic: ties go to
   * the first candidate).
   */
  anchors: Point[];
}

/**
 * Frozen deterministic anchor strategy (Round 1 section L):
 *
 * 1. collect visible candidate rect centers per member;
 * 2. each member's union-bounding-box center is its provisional center;
 * 3. the centroid of provisional member centers is the provisional hub;
 * 4. per member, choose the candidate rect center nearest the provisional
 *    hub;
 * 5. the centroid of the chosen anchors is the final hub;
 * 6. connect each chosen anchor to the final hub.
 *
 * Members without visible rects (hidden/offscreen panels) contribute
 * nothing; when fewer than 2 visible members remain, no connectors are
 * produced (null).
 */
export function computeAnchors(
  visibleRectsByMember: ReadonlyArray<ReadonlyArray<RectLike>>,
): AnchorSelection | null {
  const members = visibleRectsByMember
    .map((rects, index) => ({ rects, index }))
    .filter((member) => member.rects.length > 0);
  if (members.length < 2) {
    return null;
  }

  // Steps 1-3: provisional member centers + provisional hub.
  const provisional = members.map((member) => unionCenter(member.rects));
  const provisionalHub = centroid(provisional);
  if (provisionalHub === null) {
    return null;
  }

  // Step 4: nearest candidate rect center per member (deterministic ties).
  const chosen: Point[] = members.map((member) => {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const rect of member.rects) {
      const candidate = rectCenter(rect);
      const distance = distanceSq(candidate, provisionalHub);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    // `best` is non-null: every filtered member has >= 1 rect.
    return best as Point;
  });

  // Step 5: final hub = centroid of chosen anchors.
  const hub = centroid(chosen);
  if (hub === null) {
    return null;
  }

  return { hub, anchors: chosen };
}

/**
 * Translate a viewport (client) rect into overlay-relative coordinates.
 * `overlay` is the overlay container's own bounding client rect.
 */
export function toOverlayRect(rect: RectLike, overlay: RectLike): RectLike {
  return {
    left: rect.left - overlay.left,
    top: rect.top - overlay.top,
    right: rect.right - overlay.left,
    bottom: rect.bottom - overlay.top,
    width: rect.width,
    height: rect.height,
  };
}
