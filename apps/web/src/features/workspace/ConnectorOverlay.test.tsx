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
import { collectVisibleMemberRects } from '../../shared/rendering/domRects';
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
  svg: SVGSVGElement;
  container: HTMLElement;
  setRects: (spanId: string, rects: RectData[]) => void;
  rerender: (props: {
    alignmentId?: string | null;
    membersByGroup?: Record<string, AlignmentMember[]>;
    registry?: RenderedSpanRegistry;
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
}: {
  members: AlignmentMember[];
  registry: RenderedSpanRegistry;
  alignmentId: string | null;
  membersByGroup: Record<string, AlignmentMember[]>;
  runsPerSpan?: Record<string, number>;
}) {
  return (
    <div className="panels-container">
      {members.map((m) => (
        <div key={m.span_id} className="text-panel-body" data-panel-for={m.span_id}>
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
      ))}
      <ConnectorOverlay
        alignmentId={alignmentId}
        membersByGroup={membersByGroup}
        registry={registry}
      />
    </div>
  );
}

function mountOverlay(
  members: AlignmentMember[],
  options: { rects?: Record<string, RectData[]>; runsPerSpan?: Record<string, number> } = {},
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
    />,
  );
  const container = view.container;

  // Capture the React-created run elements + panel bodies and install the
  // layout stubs BEFORE the first rAF flush computes geometry.
  const runElements: Record<string, HTMLElement> = {};
  const allRunsBySpan: Record<string, HTMLElement[]> = {};
  const panelBodies: Record<string, HTMLElement> = {};
  for (const m of members) {
    const panelBody = container.querySelector(
      `[data-panel-for="${m.span_id}"]`,
    ) as HTMLElement | null;
    const runs = Array.from(
      panelBody?.querySelectorAll('[data-run]') ?? [],
    ) as HTMLElement[];
    if (panelBody === null || runs.length === 0) {
      throw new Error(`fixture run/panel missing for ${m.span_id}`);
    }
    runElements[m.span_id] = runs[0];
    allRunsBySpan[m.span_id] = runs;
    panelBodies[m.span_id] = panelBody;
    stubBoundingRect(panelBody, VIEWPORT_RECT);
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
        />,
      ),
  };
}

function lineCoords(): Array<[number, number, number, number]> {
  const svg = screen.getByTestId('connector-overlay');
  return Array.from(svg.querySelectorAll('line')).map((line) => [
    Number(line.getAttribute('x1')),
    Number(line.getAttribute('y1')),
    Number(line.getAttribute('x2')),
    Number(line.getAttribute('y2')),
  ]);
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

  it('clips partially visible rects to the visible intersection', () => {
    mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        // span-1 pokes out of the viewport's left edge: client rect
        // (60,70,100,20) -> overlay-relative (-40,20,60,40); the viewport
        // overlay-relative left edge is 10, so the visible intersection is
        // (10,20,60,40) with center (35,30).
        'span-1': [rect(60, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const lines = lineCoords();
    expect(lines).toHaveLength(2);
    const anchorXs = new Set(lines.map(([x1]) => x1));
    expect(anchorXs.has(35)).toBe(true);
  });

  it('ignores fully offscreen rects', () => {
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

  it('uses overlay-relative coordinates (client rects are converted)', () => {
    mountOverlay([member('span-1'), member('span-2')], {
      rects: {
        // Client rect (120,70) with overlay origin (100,50):
        // overlay-relative (20,20), center (70,30).
        'span-1': [rect(120, 70, 100, 20)],
        'span-2': [rect(500, 70, 100, 20)],
      },
    });
    flushRaf();
    const lines = lineCoords();
    expect(lines).toHaveLength(2);
    const [x1, y1] = lines[0];
    // Anchors are overlay-relative: x1 == 70, y1 == 30 (raw client
    // coordinates would be >= 120 / >= 70).
    expect(x1).toBe(70);
    expect(y1).toBe(30);
  });
});

describe('collectVisibleMemberRects', () => {
  it('flattens rects across multiple run elements (span split across runs)', () => {
    const container = document.createElement('div');
    const panelBody = document.createElement('div');
    panelBody.className = 'text-panel-body';
    stubBoundingRect(panelBody, VIEWPORT_RECT);
    const runA = document.createElement('span');
    const runB = document.createElement('span');
    panelBody.append(runA, runB);
    container.appendChild(panelBody);
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
    mount.setRects('span-1', [rect(120, 270, 100, 20)]);
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
    // Still exactly one connector set; span-1's anchor is the rect center
    // NEAREST the provisional hub — the second run's center (150,160),
    // whose client rect (200,200) converts to overlay-relative (100,150).
    const lines = lineCoords();
    expect(lines).toHaveLength(2);
    const xs = lines.map(([x1]) => x1);
    expect(xs.some((x) => Math.abs(x - 150) < 0.001)).toBe(true);
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
});
