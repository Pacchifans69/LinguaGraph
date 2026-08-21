/**
 * Connector geometry helper tests (M0.6 Round 1) — pure functions over
 * plain rect-like objects (frozen contract sections J, K, L).
 *
 * Covers: single-line spans, multiple ClientRects, spans split across run
 * elements, partially clipped / fully offscreen rects, hidden members,
 * same-version multiple members, deterministic nearest-hub anchor selection,
 * overlay-relative conversion, and the fewer-than-2-visible-members rule.
 */

import { describe, expect, it } from 'vitest';
import {
  centroid,
  computeAnchors,
  intersectRects,
  isVisibleRect,
  rectCenter,
  toOverlayRect,
  unionCenter,
  type RectLike,
} from './geometry';

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): RectLike {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

describe('intersectRects / isVisibleRect (clipping, section K)', () => {
  it('returns the visible intersection for partially overlapping rects', () => {
    const clipped = intersectRects(rect(10, 20, 100, 40), rect(50, 30, 100, 60));
    expect(clipped).toEqual({
      left: 50,
      top: 30,
      right: 110,
      bottom: 60,
      width: 60,
      height: 30,
    });
  });

  it('returns null for fully disjoint rects', () => {
    expect(intersectRects(rect(0, 0, 10, 10), rect(20, 0, 10, 10))).toBeNull();
    expect(intersectRects(rect(0, 0, 10, 10), rect(0, 20, 10, 10))).toBeNull();
  });

  it('returns null for edge-touching (zero-area) intersections', () => {
    expect(intersectRects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBeNull();
    expect(intersectRects(rect(0, 0, 10, 10), rect(0, 10, 10, 10))).toBeNull();
  });

  it('isVisibleRect requires positive width and height', () => {
    expect(isVisibleRect(rect(0, 0, 10, 10))).toBe(true);
    expect(isVisibleRect(rect(0, 0, 0, 10))).toBe(false);
    expect(isVisibleRect(rect(0, 0, 10, 0))).toBe(false);
  });
});

describe('unionCenter / centroid / rectCenter', () => {
  it('computes the union bounding-box center of several rects', () => {
    expect(unionCenter([rect(0, 0, 10, 10), rect(20, 10, 10, 10)])).toEqual({
      x: 15,
      y: 10,
    });
  });

  it('computes the centroid of points', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 20 }])).toEqual({
      x: 10 / 3,
      y: 20 / 3,
    });
    expect(centroid([])).toBeNull();
  });

  it('rectCenter is the rect midpoint', () => {
    expect(rectCenter(rect(10, 20, 30, 40))).toEqual({ x: 25, y: 40 });
  });
});

describe('computeAnchors (deterministic nearest-hub selection, section L)', () => {
  it('connects a single-line two-member span pair to their hub', () => {
    const result = computeAnchors([[rect(0, 0, 100, 20)], [rect(300, 0, 100, 20)]]);
    expect(result).not.toBeNull();
    // Chosen anchors are the rect centers; the hub is their centroid.
    expect(result!.anchors).toEqual([
      { x: 50, y: 10 },
      { x: 350, y: 10 },
    ]);
    expect(result!.hub).toEqual({ x: 200, y: 10 });
  });

  it('flattens multiple ClientRects per member (wrapped span)', () => {
    // Member A wraps: two visual-line rects; member B single-line.
    const result = computeAnchors([
      [rect(0, 0, 100, 20), rect(0, 30, 40, 20)],
      [rect(200, 0, 100, 20)],
    ]);
    expect(result).not.toBeNull();
    expect(result!.anchors).toHaveLength(2);
    // Both anchors are rect centers; hub is their centroid.
    const { hub, anchors } = result!;
    const [a, b] = anchors;
    expect(hub.x).toBeCloseTo((a.x + b.x) / 2, 10);
    expect(hub.y).toBeCloseTo((a.y + b.y) / 2, 10);
  });

  it('chooses the candidate rect center nearest the provisional hub (wrapped member)', () => {
    // Member A: far rect (left) and near rect (right); member B: center.
    // The provisional hub sits between B and A's union center, so A's NEAR
    // rect must win deterministically.
    const result = computeAnchors([
      [rect(0, 100, 40, 20), rect(150, 100, 40, 20)],
      [rect(95, 0, 10, 10)],
    ]);
    expect(result).not.toBeNull();
    const [anchorA] = result!.anchors;
    expect(anchorA).toEqual({ x: 170, y: 110 });
  });

  it('is deterministic for ties (first candidate wins)', () => {
    // Member A has two rects EXACTLY equidistant from the provisional hub:
    // centers (5,5) and (5,45) around hub (5,25). The FIRST candidate wins.
    const result = computeAnchors([
      [rect(0, 0, 10, 10), rect(0, 40, 10, 10)],
      [rect(0, 20, 10, 10)],
    ]);
    expect(result).not.toBeNull();
    expect(result!.anchors[0]).toEqual({ x: 5, y: 5 });
  });

  it('supports same-version multiple members (each member gets an anchor)', () => {
    const result = computeAnchors([
      [rect(0, 0, 50, 20)],
      [rect(0, 100, 50, 20)],
      [rect(500, 0, 50, 20)],
    ]);
    expect(result).not.toBeNull();
    expect(result!.anchors).toHaveLength(3);
    // Chosen anchors are the three rect centers; the final hub is their
    // centroid: ((25+25+525)/3, (10+110+10)/3).
    expect(result!.hub.x).toBeCloseTo(575 / 3, 10);
    expect(result!.hub.y).toBeCloseTo(130 / 3, 10);
  });

  it('returns null when fewer than 2 members have visible rects', () => {
    expect(computeAnchors([[rect(0, 0, 10, 10)]])).toBeNull();
    expect(computeAnchors([[], [rect(0, 0, 10, 10)]])).toBeNull();
    expect(computeAnchors([[], []])).toBeNull();
    expect(computeAnchors([])).toBeNull();
  });

  it('ignores hidden members (no visible rects) before the 2-member check', () => {
    // Three members, one fully hidden: only the two visible members count.
    const result = computeAnchors([
      [rect(0, 0, 50, 20)],
      [],
      [rect(300, 0, 50, 20)],
    ]);
    expect(result).not.toBeNull();
    expect(result!.anchors).toHaveLength(2);
  });
});

describe('toOverlayRect (overlay-relative conversion, section I)', () => {
  it('converts client rects into overlay-relative coordinates', () => {
    const overlay = rect(100, 50, 800, 600);
    const converted = toOverlayRect(rect(150, 90, 40, 20), overlay);
    expect(converted).toEqual({
      left: 50,
      top: 40,
      right: 90,
      bottom: 60,
      width: 40,
      height: 20,
    });
  });

  it('produces negative coordinates for rects left/above the overlay', () => {
    const overlay = rect(100, 50, 800, 600);
    const converted = toOverlayRect(rect(80, 30, 40, 20), overlay);
    expect(converted.left).toBe(-20);
    expect(converted.top).toBe(-20);
  });
});
