import { describe, expect, it } from 'vitest';
import {
  ROUTING_CLEARANCE_PX,
  computeRoutedConnectorGeometry,
  type RoutedConnectorGeometry,
  type RoutingMember,
} from './connectorRouting';
import type { Point, RectLike } from './geometry';

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function member(memberId: string, anchor: Point, panel: RectLike): RoutingMember {
  return { memberId, anchor, panel };
}

function pointInsideStrict(point: Point, obstacle: RectLike): boolean {
  return (
    point.x > obstacle.left &&
    point.x < obstacle.right &&
    point.y > obstacle.top &&
    point.y < obstacle.bottom
  );
}

function segmentEntersRectInterior(
  a: Point,
  b: Point,
  obstacle: RectLike,
): boolean {
  if (a.x === b.x) {
    if (!(a.x > obstacle.left && a.x < obstacle.right)) return false;
    return (
      Math.max(Math.min(a.y, b.y), obstacle.top) <
      Math.min(Math.max(a.y, b.y), obstacle.bottom)
    );
  }
  if (a.y === b.y) {
    if (!(a.y > obstacle.top && a.y < obstacle.bottom)) return false;
    return (
      Math.max(Math.min(a.x, b.x), obstacle.left) <
      Math.min(Math.max(a.x, b.x), obstacle.right)
    );
  }
  return true;
}

function expanded(obstacle: RectLike): RectLike {
  return rect(
    obstacle.left - ROUTING_CLEARANCE_PX,
    obstacle.top - ROUTING_CLEARANCE_PX,
    obstacle.width + ROUTING_CLEARANCE_PX * 2,
    obstacle.height + ROUTING_CLEARANCE_PX * 2,
  );
}

function expectSafe(
  geometry: RoutedConnectorGeometry,
  panels: ReadonlyArray<RectLike>,
  width: number,
  height: number,
): void {
  expect(geometry.routes.length).toBeGreaterThanOrEqual(2);
  for (const route of geometry.routes) {
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    expect(route.points.at(-1)).toEqual(geometry.hub);
    for (const point of route.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(height);
    }
    for (let index = 1; index < route.points.length; index += 1) {
      const a = route.points[index - 1];
      const b = route.points[index];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      for (const panel of panels) {
        expect(segmentEntersRectInterior(a, b, panel)).toBe(false);
      }
    }
  }
  for (const panel of panels) {
    expect(pointInsideStrict(geometry.hub, panel)).toBe(false);
  }
}

describe('computeRoutedConnectorGeometry — M8 obstacle routing', () => {
  it('R-G01/R-G12/R-G16 routes two horizontal panels through their inner gap', () => {
    const left = rect(8, 8, 280, 140);
    const right = rect(312, 8, 280, 140);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('a', { x: 220, y: 70 }, left),
        member('b', { x: 380, y: 70 }, right),
      ],
      [left, right],
      { width: 600, height: 180 },
    );
    expect(geometry).not.toBeNull();
    expectSafe(geometry!, [left, right], 600, 180);
    expect(geometry!.hub.x).toBeGreaterThanOrEqual(
      left.right + ROUTING_CLEARANCE_PX,
    );
    expect(geometry!.hub.x).toBeLessThanOrEqual(
      right.left - ROUTING_CLEARANCE_PX,
    );
  });

  it('R-G02 routes vertically stacked panels without entering either panel', () => {
    const top = rect(8, 8, 360, 120);
    const bottom = rect(8, 152, 360, 120);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('top', { x: 180, y: 90 }, top),
        member('bottom', { x: 180, y: 190 }, bottom),
      ],
      [top, bottom],
      { width: 376, height: 280 },
    );
    expect(geometry).not.toBeNull();
    expectSafe(geometry!, [top, bottom], 376, 280);
  });

  it('R-G03 routes three panels in one row to one shared hub', () => {
    const panels = [
      rect(8, 8, 180, 120),
      rect(210, 8, 180, 120),
      rect(412, 8, 180, 120),
    ];
    const geometry = computeRoutedConnectorGeometry(
      [
        member('a', { x: 150, y: 70 }, panels[0]),
        member('b', { x: 300, y: 70 }, panels[1]),
        member('c', { x: 450, y: 70 }, panels[2]),
      ],
      panels,
      { width: 600, height: 160 },
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.routes).toHaveLength(3);
    expectSafe(geometry!, panels, 600, 160);
  });

  it('R-G04/R-G06 routes a 2×2 layout with unequal panel heights', () => {
    const panels = [
      rect(8, 8, 280, 100),
      rect(312, 8, 280, 150),
      rect(8, 182, 280, 130),
      rect(312, 182, 280, 90),
    ];
    const geometry = computeRoutedConnectorGeometry(
      panels.map((panel, index) =>
        member(
          `m${index}`,
          { x: panel.left + 80, y: panel.top + 50 },
          panel,
        ),
      ),
      panels,
      { width: 600, height: 320 },
    );
    expect(geometry).not.toBeNull();
    expectSafe(geometry!, panels, 600, 320);
  });

  it('R-G05/R-G17 uses the reserved perimeter corridor around an intervening stacked panel', () => {
    const top = rect(8, 8, 300, 90);
    const middle = rect(8, 110, 300, 90);
    const bottom = rect(8, 212, 300, 90);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('top', { x: 150, y: 50 }, top),
        member('bottom', { x: 150, y: 250 }, bottom),
      ],
      [top, middle, bottom],
      { width: 316, height: 310 },
    );
    expect(geometry).not.toBeNull();
    expectSafe(geometry!, [top, middle, bottom], 316, 310);
    expect(
      geometry!.routes.some((route) =>
        route.points.some((point) => point.x === 4 || point.x === 312),
      ),
    ).toBe(true);
  });

  it('R-G09 keeps multiple members from one panel as separate routes', () => {
    const left = rect(8, 8, 280, 180);
    const right = rect(312, 8, 280, 180);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('left-a', { x: 160, y: 50 }, left),
        member('left-b', { x: 160, y: 145 }, left),
        member('right', { x: 440, y: 95 }, right),
      ],
      [left, right],
      { width: 600, height: 196 },
    );
    expect(geometry).not.toBeNull();
    expect(geometry!.routes.map((route) => route.memberId)).toEqual([
      'left-a',
      'left-b',
      'right',
    ]);
    expect(geometry!.routes[0].points[0]).not.toEqual(
      geometry!.routes[1].points[0],
    );
    expectSafe(geometry!, [left, right], 600, 196);
  });

  it('R-G13 relocates a desired hub that falls inside an unrelated obstacle', () => {
    const top = rect(8, 8, 280, 100);
    const blocker = rect(8, 120, 280, 100);
    const bottom = rect(8, 232, 280, 100);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('a', { x: 150, y: 90 }, top),
        member('b', { x: 150, y: 250 }, bottom),
      ],
      [top, blocker, bottom],
      { width: 296, height: 340 },
    );
    expect(geometry).not.toBeNull();
    expect(pointInsideStrict(geometry!.hub, blocker)).toBe(false);
    expectSafe(geometry!, [top, blocker, bottom], 296, 340);
  });

  it('R-G14/R-G15 is deterministic across equal-cost route and hub ties', () => {
    const left = rect(8, 8, 180, 180);
    const right = rect(212, 8, 180, 180);
    const input = [
      member('a', { x: 100, y: 100 }, left),
      member('b', { x: 300, y: 100 }, right),
    ];
    const first = computeRoutedConnectorGeometry(input, [left, right], {
      width: 400,
      height: 196,
    });
    const second = computeRoutedConnectorGeometry(input, [left, right], {
      width: 400,
      height: 196,
    });
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it('R-G18 preserves the exact 4px outward gate clearance', () => {
    const left = rect(8, 8, 280, 140);
    const right = rect(312, 8, 280, 140);
    const geometry = computeRoutedConnectorGeometry(
      [
        member('a', { x: 250, y: 70 }, left),
        member('b', { x: 350, y: 70 }, right),
      ],
      [left, right],
      { width: 600, height: 156 },
    );
    expect(geometry).not.toBeNull();
    for (const route of geometry!.routes) {
      const port = route.points[0];
      const gate = route.points[1];
      expect(
        Math.abs(port.x - gate.x) + Math.abs(port.y - gate.y),
      ).toBe(ROUTING_CLEARANCE_PX);
      for (const panel of [left, right].map(expanded)) {
        for (let index = 2; index < route.points.length; index += 1) {
          expect(
            segmentEntersRectInterior(
              route.points[index - 1],
              route.points[index],
              panel,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it('R-G19 keeps every generated point inside the overlay routing envelope', () => {
    const panels = [
      rect(8, 8, 180, 120),
      rect(210, 8, 180, 120),
      rect(412, 8, 180, 120),
    ];
    const geometry = computeRoutedConnectorGeometry(
      [
        member('a', { x: 40, y: 40 }, panels[0]),
        member('c', { x: 560, y: 100 }, panels[2]),
      ],
      panels,
      { width: 600, height: 136 },
    );
    expect(geometry).not.toBeNull();
    expectSafe(geometry!, panels, 600, 136);
  });

  it('R-G21 fails closed when a panel consumes the entire routing envelope', () => {
    const whole = rect(0, 0, 300, 200);
    expect(
      computeRoutedConnectorGeometry(
        [
          member('a', { x: 50, y: 50 }, whole),
          member('b', { x: 250, y: 150 }, whole),
        ],
        [whole],
        { width: 300, height: 200 },
      ),
    ).toBeNull();
  });
});
