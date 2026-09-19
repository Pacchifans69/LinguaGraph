import { centroid, type Point, type RectLike } from './geometry';

export const ROUTING_RESERVE_PX = 8;
export const ROUTING_CLEARANCE_PX = 4;

export type PortSide = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';

export interface RoutingMember {
  memberId: string;
  anchor: Point;
  panel: RectLike;
}

export interface ConnectorRoute {
  memberId: string;
  points: Point[];
}

export interface RoutedConnectorGeometry {
  hub: Point;
  routes: ConnectorRoute[];
}

interface PortCandidate {
  side: PortSide;
  sideRank: number;
  port: Point;
  gate: Point;
  projectionDistance: number;
}

interface GraphEdge {
  to: number;
  length: number;
  direction: Direction;
}

type Direction = 'H' | 'V';

interface RoutingGraph {
  nodes: Point[];
  adjacency: GraphEdge[][];
  nodeIndexByKey: Map<string, number>;
}

interface PathResult {
  length: number;
  bends: number;
  points: Point[];
}

interface CandidateRoute {
  route: ConnectorRoute;
  totalCost: number;
  bends: number;
  sideRank: number;
}

const PORT_SIDES: ReadonlyArray<PortSide> = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];

function pointKey(point: Point): string {
  return `${point.x}\u0000${point.y}`;
}

function rectKey(rect: RectLike): string {
  return `${rect.left}\u0000${rect.top}\u0000${rect.right}\u0000${rect.bottom}`;
}

function compareNumber(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePoint(a: Point, b: Point): number {
  return compareNumber(a.x, b.x) || compareNumber(a.y, b.y);
}

function compareNumberTuple(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    const comparison = compareNumber(a[index], b[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return compareNumber(a.length, b.length);
}

function comparePointSequence(a: ReadonlyArray<Point>, b: ReadonlyArray<Point>): number {
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    const comparison = comparePoint(a[index], b[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return compareNumber(a.length, b.length);
}

function pointEquals(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function expandRect(rect: RectLike, amount: number): RectLike {
  const left = rect.left - amount;
  const top = rect.top - amount;
  const right = rect.right + amount;
  const bottom = rect.bottom + amount;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function pointInsideStrict(point: Point, rect: RectLike): boolean {
  return (
    point.x > rect.left &&
    point.x < rect.right &&
    point.y > rect.top &&
    point.y < rect.bottom
  );
}

function segmentEntersRectInterior(a: Point, b: Point, rect: RectLike): boolean {
  if (a.x === b.x) {
    if (!(a.x > rect.left && a.x < rect.right)) {
      return false;
    }
    const low = Math.min(a.y, b.y);
    const high = Math.max(a.y, b.y);
    return Math.max(low, rect.top) < Math.min(high, rect.bottom);
  }
  if (a.y === b.y) {
    if (!(a.y > rect.top && a.y < rect.bottom)) {
      return false;
    }
    const low = Math.min(a.x, b.x);
    const high = Math.max(a.x, b.x);
    return Math.max(low, rect.left) < Math.min(high, rect.right);
  }
  return true;
}

function segmentClear(
  a: Point,
  b: Point,
  obstacles: ReadonlyArray<RectLike>,
): boolean {
  if (a.x !== b.x && a.y !== b.y) {
    return false;
  }
  return !obstacles.some((obstacle) => segmentEntersRectInterior(a, b, obstacle));
}

function directionBetween(a: Point, b: Point): Direction {
  return a.x === b.x ? 'V' : 'H';
}

function canonicalizeRoutePoints(points: ReadonlyArray<Point>): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    if (deduped.length === 0 || !pointEquals(deduped[deduped.length - 1], point)) {
      deduped.push(point);
    }
  }
  if (deduped.length <= 2) {
    return deduped;
  }

  // Port and gate are structural M8 points and remain explicit even if the
  // free-space path continues collinearly from the gate.
  const canonical: Point[] = [deduped[0], deduped[1]];
  for (let index = 2; index < deduped.length - 1; index += 1) {
    const previous = canonical[canonical.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const collinear =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y);
    if (!collinear) {
      canonical.push(current);
    }
  }
  canonical.push(deduped[deduped.length - 1]);
  return canonical;
}

function bendCount(points: ReadonlyArray<Point>): number {
  let bends = 0;
  let previousDirection: Direction | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const direction = directionBetween(points[index - 1], points[index]);
    if (previousDirection !== null && previousDirection !== direction) {
      bends += 1;
    }
    previousDirection = direction;
  }
  return bends;
}

function routeLength(points: ReadonlyArray<Point>): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += manhattan(points[index - 1], points[index]);
  }
  return length;
}

function dedupeRects(rects: ReadonlyArray<RectLike>): RectLike[] {
  const byKey = new Map<string, RectLike>();
  for (const rect of rects) {
    byKey.set(rectKey(rect), rect);
  }
  return [...byKey.values()];
}

function portCandidates(
  member: RoutingMember,
  realObstacles: ReadonlyArray<RectLike>,
  expandedObstacles: ReadonlyArray<RectLike>,
  width: number,
  height: number,
): PortCandidate[] {
  const { anchor, panel } = member;
  const ports: Record<PortSide, { port: Point; gate: Point }> = {
    TOP: {
      port: { x: clamp(anchor.x, panel.left, panel.right), y: panel.top },
      gate: {
        x: clamp(anchor.x, panel.left, panel.right),
        y: panel.top - ROUTING_CLEARANCE_PX,
      },
    },
    RIGHT: {
      port: { x: panel.right, y: clamp(anchor.y, panel.top, panel.bottom) },
      gate: {
        x: panel.right + ROUTING_CLEARANCE_PX,
        y: clamp(anchor.y, panel.top, panel.bottom),
      },
    },
    BOTTOM: {
      port: { x: clamp(anchor.x, panel.left, panel.right), y: panel.bottom },
      gate: {
        x: clamp(anchor.x, panel.left, panel.right),
        y: panel.bottom + ROUTING_CLEARANCE_PX,
      },
    },
    LEFT: {
      port: { x: panel.left, y: clamp(anchor.y, panel.top, panel.bottom) },
      gate: {
        x: panel.left - ROUTING_CLEARANCE_PX,
        y: clamp(anchor.y, panel.top, panel.bottom),
      },
    },
  };

  const candidates: PortCandidate[] = [];
  for (let sideRank = 0; sideRank < PORT_SIDES.length; sideRank += 1) {
    const side = PORT_SIDES[sideRank];
    const { port, gate } = ports[side];
    if (gate.x < 0 || gate.x > width || gate.y < 0 || gate.y > height) {
      continue;
    }
    if (
      realObstacles.some(
        (obstacle) =>
          obstacle !== panel && segmentEntersRectInterior(port, gate, obstacle),
      )
    ) {
      continue;
    }
    if (expandedObstacles.some((obstacle) => pointInsideStrict(gate, obstacle))) {
      continue;
    }
    candidates.push({
      side,
      sideRank,
      port,
      gate,
      projectionDistance: manhattan(anchor, port),
    });
  }
  return candidates;
}

function buildGraph(
  width: number,
  height: number,
  expandedObstacles: ReadonlyArray<RectLike>,
  gates: ReadonlyArray<Point>,
  desiredHub: Point,
): RoutingGraph {
  const xs = new Set<number>([0, width]);
  const ys = new Set<number>([0, height]);
  const addX = (value: number): void => {
    if (value >= 0 && value <= width) xs.add(value);
  };
  const addY = (value: number): void => {
    if (value >= 0 && value <= height) ys.add(value);
  };
  addX(desiredHub.x);
  addY(desiredHub.y);
  for (const gate of gates) {
    addX(gate.x);
    addY(gate.y);
  }
  for (const obstacle of expandedObstacles) {
    addX(obstacle.left);
    addX(obstacle.right);
    addY(obstacle.top);
    addY(obstacle.bottom);
  }

  const xValues = [...xs].sort((a, b) => a - b);
  const yValues = [...ys].sort((a, b) => a - b);
  const nodes: Point[] = [];
  const nodeIndexByKey = new Map<string, number>();
  for (const y of yValues) {
    for (const x of xValues) {
      const point = { x, y };
      if (expandedObstacles.some((obstacle) => pointInsideStrict(point, obstacle))) {
        continue;
      }
      nodeIndexByKey.set(pointKey(point), nodes.length);
      nodes.push(point);
    }
  }

  const adjacency: GraphEdge[][] = Array.from({ length: nodes.length }, () => []);
  const connect = (aIndex: number, bIndex: number): void => {
    const a = nodes[aIndex];
    const b = nodes[bIndex];
    if (!segmentClear(a, b, expandedObstacles)) {
      return;
    }
    const length = manhattan(a, b);
    if (length <= 0) {
      return;
    }
    const direction = directionBetween(a, b);
    adjacency[aIndex].push({ to: bIndex, length, direction });
    adjacency[bIndex].push({ to: aIndex, length, direction });
  };

  for (const y of yValues) {
    const row = nodes
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.y === y)
      .sort((a, b) => a.point.x - b.point.x);
    for (let index = 1; index < row.length; index += 1) {
      connect(row[index - 1].index, row[index].index);
    }
  }
  for (const x of xValues) {
    const column = nodes
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.x === x)
      .sort((a, b) => a.point.y - b.point.y);
    for (let index = 1; index < column.length; index += 1) {
      connect(column[index - 1].index, column[index].index);
    }
  }

  for (const edges of adjacency) {
    edges.sort((a, b) => comparePoint(nodes[a.to], nodes[b.to]));
  }

  return { nodes, adjacency, nodeIndexByKey };
}

interface SearchState {
  node: number;
  direction: Direction;
  length: number;
  bends: number;
  path: number[];
}

function searchStateKey(node: number, direction: Direction): string {
  return `${node}:${direction}`;
}

function compareSearchState(
  a: SearchState,
  b: SearchState,
  nodes: ReadonlyArray<Point>,
): number {
  const primary =
    compareNumber(a.length, b.length) || compareNumber(a.bends, b.bends);
  if (primary !== 0) {
    return primary;
  }
  return comparePointSequence(
    a.path.map((index) => nodes[index]),
    b.path.map((index) => nodes[index]),
  );
}

function shortestPathsFromGate(
  graph: RoutingGraph,
  start: Point,
  initialDirection: Direction,
): Map<number, PathResult> {
  const startIndex = graph.nodeIndexByKey.get(pointKey(start));
  if (startIndex === undefined) {
    return new Map();
  }

  const best = new Map<string, SearchState>();
  const pending = new Map<string, SearchState>();
  const startState: SearchState = {
    node: startIndex,
    direction: initialDirection,
    length: 0,
    bends: 0,
    path: [startIndex],
  };
  const startKey = searchStateKey(startIndex, initialDirection);
  best.set(startKey, startState);
  pending.set(startKey, startState);

  while (pending.size > 0) {
    let currentKey: string | null = null;
    let current: SearchState | null = null;
    for (const [key, candidate] of pending) {
      if (
        current === null ||
        compareSearchState(candidate, current, graph.nodes) < 0
      ) {
        currentKey = key;
        current = candidate;
      }
    }
    if (currentKey === null || current === null) {
      break;
    }
    pending.delete(currentKey);

    for (const edge of graph.adjacency[current.node]) {
      const next: SearchState = {
        node: edge.to,
        direction: edge.direction,
        length: current.length + edge.length,
        bends:
          current.bends + (current.direction === edge.direction ? 0 : 1),
        path: [...current.path, edge.to],
      };
      const key = searchStateKey(next.node, next.direction);
      const previous = best.get(key);
      if (
        previous === undefined ||
        compareSearchState(next, previous, graph.nodes) < 0
      ) {
        best.set(key, next);
        pending.set(key, next);
      }
    }
  }

  const bestByNode = new Map<number, SearchState>();
  for (const state of best.values()) {
    const previous = bestByNode.get(state.node);
    if (
      previous === undefined ||
      compareSearchState(state, previous, graph.nodes) < 0
    ) {
      bestByNode.set(state.node, state);
    }
  }

  const paths = new Map<number, PathResult>();
  for (const [node, state] of bestByNode) {
    paths.set(node, {
      length: state.length,
      bends: state.bends,
      points: state.path.map((index) => graph.nodes[index]),
    });
  }
  return paths;
}

interface PreparedCandidate {
  candidate: PortCandidate;
  pathsByHubNode: Map<number, PathResult>;
}

function routeForPreparedCandidate(
  member: RoutingMember,
  prepared: PreparedCandidate,
  hubNode: number,
): CandidateRoute | null {
  const path = prepared.pathsByHubNode.get(hubNode);
  if (path === undefined) {
    return null;
  }
  const points = canonicalizeRoutePoints([
    prepared.candidate.port,
    ...path.points,
  ]);
  return {
    route: { memberId: member.memberId, points },
    totalCost: prepared.candidate.projectionDistance + routeLength(points),
    bends: bendCount(points),
    sideRank: prepared.candidate.sideRank,
  };
}

function compareCandidateRoute(a: CandidateRoute, b: CandidateRoute): number {
  return (
    compareNumber(a.totalCost, b.totalCost) ||
    compareNumber(a.bends, b.bends) ||
    compareNumber(a.sideRank, b.sideRank) ||
    comparePointSequence(a.route.points, b.route.points)
  );
}

function bestPreparedRouteForMember(
  member: RoutingMember,
  candidates: ReadonlyArray<PreparedCandidate>,
  hubNode: number,
): CandidateRoute | null {
  let best: CandidateRoute | null = null;
  for (const candidate of candidates) {
    const route = routeForPreparedCandidate(member, candidate, hubNode);
    if (
      route !== null &&
      (best === null || compareCandidateRoute(route, best) < 0)
    ) {
      best = route;
    }
  }
  return best;
}

export function computeRoutedConnectorGeometry(
  members: ReadonlyArray<RoutingMember>,
  panelObstacles: ReadonlyArray<RectLike>,
  overlaySize: { width: number; height: number },
): RoutedConnectorGeometry | null {
  if (
    members.length < 2 ||
    overlaySize.width <= 0 ||
    overlaySize.height <= 0 ||
    !Number.isFinite(overlaySize.width) ||
    !Number.isFinite(overlaySize.height)
  ) {
    return null;
  }

  const realObstacles = dedupeRects([
    ...panelObstacles,
    ...members.map((member) => member.panel),
  ]);
  const expandedObstacles = realObstacles.map((obstacle) =>
    expandRect(obstacle, ROUTING_CLEARANCE_PX),
  );
  const desiredHub = centroid(members.map((member) => member.anchor));
  if (desiredHub === null) {
    return null;
  }

  const candidatesByMember = members.map((member) =>
    portCandidates(
      member,
      realObstacles,
      expandedObstacles,
      overlaySize.width,
      overlaySize.height,
    ),
  );
  if (candidatesByMember.some((candidates) => candidates.length === 0)) {
    return null;
  }

  const gates = candidatesByMember.flatMap((candidates) =>
    candidates.map((candidate) => candidate.gate),
  );
  const graph = buildGraph(
    overlaySize.width,
    overlaySize.height,
    expandedObstacles,
    gates,
    desiredHub,
  );

  // Each port/gate runs the deterministic graph search once. Hub scoring
  // then reuses those results instead of re-running shortest-path search for
  // every candidate hub on every scroll/resize frame.
  const preparedByMember: PreparedCandidate[][] = candidatesByMember.map(
    (candidates) =>
      candidates.map((candidate) => ({
        candidate,
        pathsByHubNode: shortestPathsFromGate(
          graph,
          candidate.gate,
          candidate.side === 'LEFT' || candidate.side === 'RIGHT' ? 'H' : 'V',
        ),
      })),
  );

  let bestGeometry: RoutedConnectorGeometry | null = null;
  let bestTuple: [number, number, number, number, number] | null = null;

  for (let hubIndex = 0; hubIndex < graph.nodes.length; hubIndex += 1) {
    const hub = graph.nodes[hubIndex];
    const routes: ConnectorRoute[] = [];
    let totalCost = 0;
    let totalBends = 0;
    let complete = true;
    for (let index = 0; index < members.length; index += 1) {
      const bestRoute = bestPreparedRouteForMember(
        members[index],
        preparedByMember[index],
        hubIndex,
      );
      if (bestRoute === null) {
        complete = false;
        break;
      }
      routes.push(bestRoute.route);
      totalCost += bestRoute.totalCost;
      totalBends += bestRoute.bends;
    }
    if (!complete) {
      continue;
    }

    const tuple: [number, number, number, number, number] = [
      totalCost,
      totalBends,
      distanceSq(hub, desiredHub),
      hub.y,
      hub.x,
    ];
    if (bestTuple === null || compareNumberTuple(tuple, bestTuple) < 0) {
      bestTuple = tuple;
      bestGeometry = { hub, routes };
    }
  }

  return bestGeometry;
}
