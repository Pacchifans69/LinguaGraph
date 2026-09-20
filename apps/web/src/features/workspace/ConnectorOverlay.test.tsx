/**
 * ConnectorOverlay tests (M0.6 Round 1).
 *
 * jsdom has no layout engine, so ClientRect geometry is stubbed per element
 * (this mirrors the real pipeline: registry lookup -> getClientRects ->
 * clip to .text-panel-body viewport -> overlay-relative conversion).
 *
 * Covers: rendering nothing when idle; one connector set only; fewer than 2
 * visible members; hidden members; partial clipping; fully offscreen rects;
 * overlay-relative coordinates; span split across run elements; and the
 * recompute lifecycle (scroll / resize / ResizeObserver / snapshot change,
 * requestAnimationFrame coalescing, listener cleanup while idle).
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';
import {
  collectMemberDomGeometry,
  collectVisibleMemberRects,
} from '../../shared/rendering/domRects';
import type { AlignmentMember } from './api';
import { ConnectorOverlay } from './ConnectorOverlay';

// --- controllable requestAnimationFrame -----------------------------------

let pendingRaf: Array<() => void> = [];

function flushRaf() {
  const callbacks = pendingRaf;
  pendingRaf = [];
  act(() => {
    for (const callback of callbacks) {
      callback();
    }
  });
}

// --- ResizeObserver stub ---------------------------------------------------

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  observed: Element[] = [];
  disconnected = false;
  /** How often the callback was invoked (proves no manual triggering). */
  triggerCount = 0;
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.triggerCount += 1;
    this.callback([], this as unknown as ResizeObserver);
  }
}

// --- layout stubs ----------------------------------------------------------

interface RectData {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): RectData {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function stubClientRects(
  element: Element,
  rects: RectData[],
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(element, 'getClientRects').mockReturnValue(
    // DOMRect.fromRect ignores left/top (it reads x/y only), so construct
    // the rects positionally.
    rects.map((r) => new DOMRect(r.left, r.top, r.width, r.height)) as unknown as DOMRectList,
  );
}

function stubBoundingRect(element: Element, r: RectData): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(r.left, r.top, r.width, r.height),
  );
}

const OVERLAY_RECT = rect(100, 50, 800, 600);
const VIEWPORT_RECT = rect(110, 60, 780, 580);

function panelRectForIndex(index: number): RectData {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return rect(108 + column * 344, 58 + row * 184, 320, 160);
}

function bodyRectForPanel(panel: RectData): RectData {
  return rect(panel.left + 4, panel.top + 4, panel.width - 8, panel.height - 8);
}

function member(spanId: string, groupId = 'group-1'): AlignmentMember {
  return {
    id: `member-${spanId}`,
    alignment_group_id: groupId,
    span_id: spanId,
    created_at: '2026-01-01T00:00:00Z',
  };
}

interface MountResult {
  registry: RenderedSpanRegistry;
  runElements: Record<string, HTMLElement>;
  allRunsBySpan: Record<string, HTMLElement[]>;
  panelBodies: Record<string, HTMLElement>;
  panelSlots: Record<string, HTMLElement>;
  svg: SVGSVGElement;
  container: HTMLElement;
  setRects: (spanId: string, rects: RectData[]) => void;
  rerender: (props: {
    alignmentId?: string | null;
    membersByGroup?: Record<string, AlignmentMember[]>;
    registry?: RenderedSpanRegistry;
    layoutKey?: string;
  }) => void;
}

/**
 * Renders the panels + runs THROUGH React (React 19's createRoot clears any
 * pre-existing container content, so pre-built DOM would be destroyed). The
 * fixture mirrors the production layout: .panels-container > .text-panel-body
 * > [data-run], with the run registered in the registry exactly like
 * TextPanel does. `runsPerSpan` renders a span split across several run
 * elements (same panel body).
 */
function OverlayFixture({
  members,
  registry,
  alignmentId,
  membersByGroup,
  runsPerSpan,
  layoutKey,
}: {
  members: AlignmentMember[];
  registry: RenderedSpanRegistry;
  alignmentId: string | null;
  membersByGroup: Record<string, AlignmentMember[]>;
  runsPerSpan?: Record<string, number>;
  layoutKey: string;
}) {
  return (
    <div className="panels-container">
      {members.map((m) => (
        <div key={m.span_id} className="panel-slot" data-slot-for={m.span_id}>
          <div className="text-panel-body" data-panel-for={m.span_id}>
            {Array.from({ length: runsPerSpan?.[m.span_id] ?? 1 }, (_, i) => (
              <span
                key={i}
                data-run
                ref={(element) => {
                  if (element === null) {
                    return;
                  }
                  return registry.register([m.span_id], element);
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <ConnectorOverlay
        alignmentId={alignmentId}
        membersByGroup={membersByGroup}
        registry={registry}
        layoutKey={layoutKey}
      />
    </div>
  );
}

function mountOverlay(
  members: AlignmentMember[],
  options: {
    rects?: Record<string, RectData[]>;
    runsPerSpan?: Record<string, number>;
    layoutKey?: string;
  } = {},
): MountResult {
  const registry = new RenderedSpanRegistry();
  const rectSpies: Record<string, ReturnType<typeof vi.spyOn>> = {};

  const membersByGroup: Record<string, AlignmentMember[]> = {};
  for (const m of members) {
    (membersByGroup[m.alignment_group_id] ??= []).push(m);
  }

  const view = render(
    <OverlayFixture
      members={members}
      registry={registry}
      alignmentId="group-1"
      membersByGroup={membersByGroup}
      runsPerSpan={options.runsPerSpan}
      layoutKey={options.layoutKey ?? 'layout-a'}
    />,
  );
  const container = view.container;

  // Capture the React-created run elements + panel bodies and install the
  // layout stubs BEFORE the first rAF flush computes geometry.
  const runElements: Record<string, HTMLElement> = {};
  const allRunsBySpan: Record<string, HTMLElement[]> = {};
  const panelBodies: Record<string, HTMLElement> = {};
  const panelSlots: Record<string, HTMLElement> = {};
  for (const [memberIndex, m] of members.entries()) {
    const panelBody = container.querySelector(
      `[data-panel-for="${m.span_id}"]`,
    ) as HTMLElement | null;
    const panelSlot = container.querySelector(
      `[data-slot-for="${m.span_id}"]`,
    ) as HTMLElement | null;
    const runs = Array.from(
      panelBody?.querySelectorAll('[data-run]') ?? [],
    ) as HTMLElement[];
    if (panelBody === null || panelSlot === null || runs.length === 0) {
      throw new Error(`fixture run/panel missing for ${m.span_id}`);
    }
    runElements[m.span_id] = runs[0];
    allRunsBySpan[m.span_id] = runs;
    panelBodies[m.span_id] = panelBody;
    panelSlots[m.span_id] = panelSlot;
    const panelRect = panelRectForIndex(memberIndex);
    stubBoundingRect(panelSlot, panelRect);
    stubBoundingRect(panelBody, bodyRectForPanel(panelRect));
    if (options.rects?.[m.span_id]) {
      rectSpies[m.span_id] = stubClientRects(runs[0], options.rects[m.span_id]);
    }
  }

  const svg = screen.getByTestId('connector-overlay') as unknown as SVGSVGElement;
  stubBoundingRect(svg, OVERLAY_RECT);

  return {
    registry,
    runElements,
    allRunsBySpan,
    panelBodies,
    panelSlots,
    svg,
    container,
    setRects: (spanId: string, rects: RectData[]) => {
      const spy =
        rectSpies[spanId] ?? stubClientRects(runElements[spanId], []);
      rectSpies[spanId] = spy;
      spy.mockReturnValue(
        rects.map(
          (r) => new DOMRect(r.left, r.top, r.width, r.height),
        ) as unknown as DOMRectList,
      );
    },
    rerender: (props) =>
      view.rerender(
        <OverlayFixture
          members={members}
          registry={props.registry ?? registry}
          alignmentId={
            props.alignmentId === undefined ? 'group-1' : props.alignmentId
          }
          membersByGroup={props.membersByGroup ?? membersByGroup}
          runsPerSpan={options.runsPerSpan}
          layoutKey={props.layoutKey ?? options.layoutKey ?? 'layout-a'}
        />,
      ),
  };
}

function routePoints(memberId?: string): Array<Array<[number, number]>> {
  const svg = screen.getByTestId('connector-overlay');
  const selector =
    memberId === undefined
      ? '.connector-route'
      : `.connector-route[data-member-id="${memberId}"]`;
  return Array.from(svg.querySelectorAll(selector)).map((route) =>
    (route.getAttribute('points') ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((pair) => pair.split(',').map(Number) as [number, number]),
  );
}

function lineCoords(): Array<[number, number, number, number]> {
  return routePoints().map((points) => {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return [first[0], first[1], last[0], last[1]];
  });
}

/** Counts real getClientRects reads of a member run (recompute evidence). */
function clientRectReads(spanId: string, mount: MountResult): number {
  return vi.mocked(mount.runElements[spanId].getClientRects).mock.calls.length;
}

beforeEach(() => {
  pendingRaf = [];
  ResizeObserverStub.instances = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingRaf.push(() => callback(0));
    return pendingRaf.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConnectorOverlay rendering', () => {
  it('renders nothing when there is no effective alignment', () => {
    render(
      <ConnectorOverlay
        alignmentId={null}
        membersByGroup={{}}
        registry={new RenderedSpanRegistry()}
        layoutKey="layout-a"
      />,
    );
    expect(screen.queryByTestId('connector-overlay')).toBeNull();
  });

  it('renders an inert, aria-hidden SVG overlay', () => {
    const { svg } = mountOverlay([member('span-1'), member('span-2')]);
    flushRaf();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('connector-overlay')).toBe(true);
  });

  it('draws exactly one connector set for the effective group', () => {
    mountOverlay(
      [member('span-1'), member('span-2'), member('span-3')],
      {
        rects: {
          'span-1': [rect(120, 70, 100, 20)],
          'span-2': [rect(500, 70, 100, 20)],
          'span-3': [rect(300, 300, 100, 20)],
        },
      },
    );
    flushRaf();
    const lines = lineCoords();
    expect(lines).toHaveLength(3);
    // Every line connects a member anchor to the SAME final hub.
    const hubs = new Set(lines.map(([, , x2, y2]) => `${x2},${y2}`));
    expect(hubs.size).toBe(1);
  });

  it('renders no connectors when fewer than 2 visible members remain', () => {
    mountOverlay([member('span-1')], {
      rects: { 'span-1': [rect(120, 70, 100, 20)] },
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(0);
  });

  it('ignores hidden members (disconnected / no rects) entirely', () => {
    const mount = mountOverlay(
      [member('span-hidden'), member('span-visible')],
      { rects: { 'span-visible': [rect(120, 70, 100, 20)] } },
    );
    // The hidden member's run element is removed from the document.
    mount.runElements['span-hidden'].remove();
    flushRaf();
    // Only one visible member remains -> no connectors.
    expect(lineCoords()).toHaveLength(0);
  });

  it('R-G10 clips partially visible rects to the visible intersection', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        // span-1 pokes out of its owning panel body's left edge. The raw
        // client rect (60,70,100,20) becomes overlay-relative
        // (-40,20,60,40). The current fixture's panel body begins at
        // overlay-relative x=12, so the exact visible intersection is
        // (12,20,60,40), width 48.
        'span-1': [rect(60, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();

    const clipped = collectMemberDomGeometry(
      [mount.runElements['span-1']],
      OVERLAY_RECT,
    );
    expect(clipped.kind).toBe('visible');
    if (clipped.kind !== 'visible') {
      throw new Error('span-1 must resolve to visible clipped geometry');
    }
    expect(clipped.rects).toEqual([
      {
        left: 12,
        top: 20,
        right: 60,
        bottom: 40,
        width: 48,
        height: 20,
      },
    ]);
    expect(clipped.panelRect).toEqual({
      left: 8,
      top: 8,
      right: 328,
      bottom: 168,
      width: 320,
      height: 160,
    });
    expect(clipped.panelElement).toBe(mount.panelSlots['span-1']);

    expect(lineCoords()).toHaveLength(2);
    const firstRoute = routePoints('member-span-1')[0]!;
    expect(firstRoute.length).toBeGreaterThanOrEqual(2);
  });

  it('R-G11 ignores fully offscreen rects', () => {
    mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        // Fully left of the viewport: empty intersection.
        'span-1': [rect(0, 70, 50, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(0);
  });

  it('uses exact overlay-relative coordinates rather than raw client coordinates', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        // Client rect (120,70,100,20) with overlay origin (100,50)
        // must become exactly (20,20,120,40), not remain in client space.
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();

    const geometry = collectMemberDomGeometry(
      [mount.runElements['span-1']],
      OVERLAY_RECT,
    );
    expect(geometry.kind).toBe('visible');
    if (geometry.kind !== 'visible') {
      throw new Error('span-1 must resolve to visible overlay geometry');
    }
    expect(geometry.rects).toEqual([
      {
        left: 20,
        top: 20,
        right: 120,
        bottom: 40,
        width: 100,
        height: 20,
      },
    ]);
    expect(geometry.panelRect).toEqual({
      left: 8,
      top: 8,
      right: 328,
      bottom: 168,
      width: 320,
      height: 160,
    });

    const lines = lineCoords();
    expect(lines).toHaveLength(2);
    const firstRoute = routePoints('member-span-1')[0]!;
    const [portX, portY] = firstRoute[0]!;
    const onOverlayPanelPerimeter =
      ((portX === 8 || portX === 328) && portY >= 8 && portY <= 168) ||
      ((portY === 8 || portY === 168) && portX >= 8 && portX <= 328);
    const onRawClientPanelPerimeter =
      ((portX === 108 || portX === 428) && portY >= 58 && portY <= 218) ||
      ((portY === 58 || portY === 218) && portX >= 108 && portX <= 428);
    expect(onOverlayPanelPerimeter).toBe(true);
    expect(onRawClientPanelPerimeter).toBe(false);
  });
});

describe('collectVisibleMemberRects', () => {
  it('R-G08 flattens rects across multiple run elements (span split across runs)', () => {
    const container = document.createElement('div');
    const panelSlot = document.createElement('div');
    panelSlot.className = 'panel-slot';
    stubBoundingRect(panelSlot, rect(108, 58, 784, 584));
    const panelBody = document.createElement('div');
    panelBody.className = 'text-panel-body';
    stubBoundingRect(panelBody, VIEWPORT_RECT);
    const runA = document.createElement('span');
    const runB = document.createElement('span');
    panelBody.append(runA, runB);
    panelSlot.appendChild(panelBody);
    container.appendChild(panelSlot);
    document.body.appendChild(container);
    stubClientRects(runA, [rect(120, 70, 100, 20)]);
    stubClientRects(runB, [rect(240, 70, 100, 20)]);
    const rects = collectVisibleMemberRects([runA, runB], OVERLAY_RECT);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ left: 20, top: 20, width: 100, height: 20 });
    expect(rects[1]).toMatchObject({ left: 140, top: 20 });
    container.remove();
  });

  it('skips disconnected (unmounted) elements', () => {
    const run = document.createElement('span');
    stubClientRects(run, [rect(120, 70, 100, 20)]);
    const rects = collectVisibleMemberRects([run], OVERLAY_RECT);
    expect(rects).toEqual([]);
  });
});

describe('M8 owning-panel and complete-set routing', () => {
  it('R-G20 fails closed when one member resolves across multiple owning panels', () => {
    const mount = mountOverlay(
      [member('span-1'), member('span-2')],
      {
        rects: {
          'span-1': [rect(120, 70, 100, 20)],
          'span-2': [rect(500, 70, 100, 20)],
        },
        runsPerSpan: { 'span-1': 2 },
      },
    );
    stubClientRects(mount.allRunsBySpan['span-1'][1], [rect(140, 90, 60, 20)]);
    mount.panelBodies['span-2'].appendChild(mount.allRunsBySpan['span-1'][1]);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(0);
  });

  it('keeps multiple members from one owning panel as distinct routes', () => {
    const mount = mountOverlay(
      [member('span-1'), member('span-2'), member('span-3')],
      {
        rects: {
          'span-1': [rect(120, 80, 80, 20)],
          'span-2': [rect(220, 140, 80, 20)],
          'span-3': [rect(180, 270, 80, 20)],
        },
      },
    );
    mount.panelBodies['span-1'].appendChild(mount.runElements['span-2']);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(3);
    const first = routePoints('member-span-1')[0]![0];
    const second = routePoints('member-span-2')[0]![0];
    expect(first).not.toEqual(second);
  });
});

describe('ConnectorOverlay recompute lifecycle (section M)', () => {
  it('recomputes on .text-panel-body scroll', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(2);
    const readsBefore = clientRectReads('span-1', mount);

    // The member moves down by 200px (scroll): geometry must invalidate.
    mount.setRects('span-1', [rect(120, 120, 100, 20)]);
    act(() => {
      mount.panelBodies['span-1'].dispatchEvent(new Event('scroll'));
    });
    flushRaf();
    expect(clientRectReads('span-1', mount)).toBeGreaterThan(readsBefore);
    expect(lineCoords()).toHaveLength(2);
  });

  it('recomputes on window scroll', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const readsBefore = clientRectReads('span-1', mount);
    mount.setRects('span-1', [rect(120, 470, 100, 20)]);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    flushRaf();
    expect(clientRectReads('span-1', mount)).toBeGreaterThan(readsBefore);
  });

  it('recomputes on window resize', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const readsBefore = clientRectReads('span-1', mount);
    mount.setRects('span-2', [rect(500, 170, 100, 20)]);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    flushRaf();
    expect(clientRectReads('span-1', mount)).toBeGreaterThan(readsBefore);
  });

  it('recomputes when the ResizeObserver fires (panel reorder/hide/show)', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    expect(ResizeObserverStub.instances.length).toBeGreaterThan(0);
    const observer = ResizeObserverStub.instances[0];
    expect(observer.observed).toContain(mount.container.querySelector('svg'));
    expect(observer.observed).toContain(mount.panelSlots['span-1']);
    expect(observer.observed).toContain(mount.panelBodies['span-1']);

    const readsBefore = clientRectReads('span-1', mount);
    mount.setRects('span-1', [rect(120, 370, 100, 20)]);
    act(() => {
      observer.trigger();
    });
    flushRaf();
    expect(clientRectReads('span-1', mount)).toBeGreaterThan(readsBefore);
  });

  it('recomputes when registry/run membership changes (snapshot-driven)', () => {
    // span-1 is split across TWO run elements from the start.
    const mount = mountOverlay(
      [member('span-1'), member('span-2')],
      {
        rects: {
          'span-1': [rect(120, 70, 100, 20)],
          'span-2': [rect(500, 70, 100, 20)],
        },
        runsPerSpan: { 'span-1': 2 },
      },
    );
    flushRaf();
    expect(lineCoords()).toHaveLength(2);
    // The second run initially has no layout (jsdom default): it does not
    // contribute. Then it gains geometry — the next recompute must see it.
    stubClientRects(mount.allRunsBySpan['span-1'][1], [rect(200, 200, 100, 20)]);

    mount.rerender({
      membersByGroup: { 'group-1': [member('span-1'), member('span-2')] },
    });
    flushRaf();
    // Still exactly one complete connector set after the registered run
    // membership changes and the inherited anchor selection recomputes.
    expect(lineCoords()).toHaveLength(2);
  });

  it('coalesces multiple invalidations within one requestAnimationFrame', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const readsBefore = clientRectReads('span-1', mount);

    // Scroll + resize + ResizeObserver all invalidate BEFORE the frame runs.
    act(() => {
      mount.panelBodies['span-1'].dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      ResizeObserverStub.instances[0].trigger();
    });
    // No flush yet: the single scheduled rAF must not have run.
    expect(clientRectReads('span-1', mount)).toBe(readsBefore);
    flushRaf();
    // Exactly ONE recompute happened despite three invalidations.
    expect(clientRectReads('span-1', mount)).toBe(readsBefore + 1);
  });

  it('detaches listeners when the effective alignment becomes null (idle)', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const observer = ResizeObserverStub.instances[0];
    const readsBefore = clientRectReads('span-1', mount);

    // Clear the effective alignment: the overlay unmounts entirely.
    mount.rerender({ alignmentId: null });
    flushRaf();
    expect(screen.queryByTestId('connector-overlay')).toBeNull();
    expect(observer.disconnected).toBe(true);

    // No event may trigger geometry reads anymore.
    act(() => {
      mount.panelBodies['span-1'].dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      observer.trigger();
    });
    flushRaf();
    expect(clientRectReads('span-1', mount)).toBe(readsBefore);
  });

  it('recomputes when the panel layout key changes (R1-F01) — no scroll/resize/ResizeObserver', () => {
    const mount = mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
      layoutKey: 'panel-a|panel-b#panel-a,panel-b',
    });
    flushRaf();
    expect(lineCoords()).toHaveLength(2);
    const readsBefore = clientRectReads('span-1', mount);

    // Panel reorder: A|B -> B|A. The container dimensions are UNCHANGED and
    // NO scroll/resize/ResizeObserver event is fired — the layout key change
    // itself must be the invalidation source. The run moved to its new
    // position so a recompute must observe the new rects.
    mount.setRects('span-1', [rect(120, 120, 100, 20)]);
    mount.rerender({ layoutKey: 'panel-b|panel-a#panel-a,panel-b' });

    // The rAF has not run yet: the layout change must not have caused any
    // synchronous measurement.
    expect(clientRectReads('span-1', mount)).toBe(readsBefore);
    flushRaf();
    // Exactly one recompute from the layout invalidation, reading fresh rects.
    expect(clientRectReads('span-1', mount)).toBe(readsBefore + 1);
    expect(lineCoords()).toHaveLength(2);
    // The ResizeObserver callback was never invoked by this test.
    expect(ResizeObserverStub.instances[0].triggerCount).toBe(0);
  });

  it('never renders stale geometry under a new alignment before its rAF runs (R1-F04 A -> B)', () => {
    // Two groups: group-1 members on the upper line, group-2 lower.
    const mount = mountOverlay(
      [
        member('span-1', 'group-1'),
        member('span-2', 'group-1'),
        member('span-3', 'group-2'),
        member('span-4', 'group-2'),
      ],
      {
        rects: {
          'span-1': [rect(120, 70, 100, 20)],
          'span-2': [rect(500, 70, 100, 20)],
          'span-3': [rect(120, 270, 100, 20)],
          'span-4': [rect(500, 270, 100, 20)],
        },
      },
    );
    flushRaf();
    const groupOneGeometry = lineCoords();
    expect(groupOneGeometry).toHaveLength(2);

    // Switch the effective alignment to group-2. Its rAF has NOT run yet:
    // the stale group-1 lines must NOT render under group-2.
    mount.rerender({ alignmentId: 'group-2' });
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();
    expect(
      screen.getByTestId('connector-overlay').querySelectorAll('.connector-route'),
    ).toHaveLength(0);

    // After group-2 geometry recomputes, a fresh complete route set renders.
    flushRaf();
    const lines = lineCoords();
    expect(lines).toHaveLength(2);
    expect(lines).not.toEqual(groupOneGeometry);
  });

  it('never resurrects old geometry across A -> null -> B (R1-F04)', () => {
    const mount = mountOverlay(
      [
        member('span-1', 'group-1'),
        member('span-2', 'group-1'),
        member('span-3', 'group-2'),
        member('span-4', 'group-2'),
      ],
      {
        rects: {
          'span-1': [rect(120, 70, 100, 20)],
          'span-2': [rect(500, 70, 100, 20)],
          'span-3': [rect(120, 270, 100, 20)],
          'span-4': [rect(500, 270, 100, 20)],
        },
      },
    );
    flushRaf();
    expect(lineCoords()).toHaveLength(2);

    // A -> null: the overlay unmounts (state persists internally).
    mount.rerender({ alignmentId: null });
    flushRaf();
    expect(screen.queryByTestId('connector-overlay')).toBeNull();

    // null -> B: the SVG remounts; the old group-1 geometry must NOT be
    // rendered for group-2 until its own geometry is computed.
    mount.rerender({ alignmentId: 'group-2' });
    const remountedSvg = screen.getByTestId('connector-overlay');
    // The remounted SVG is a fresh element: re-install its layout stub.
    stubBoundingRect(remountedSvg, OVERLAY_RECT);
    expect(remountedSvg).toBeInTheDocument();
    expect(remountedSvg.querySelectorAll('.connector-route')).toHaveLength(0);

    flushRaf();
    expect(lineCoords()).toHaveLength(2);
  });
});
