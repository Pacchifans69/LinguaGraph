/**
 * ConnectorOverlay (M0.6 Round 1) — lightweight SVG connector overlay for
 * the EFFECTIVE alignment (frozen precedence: ``activeAlignmentId ??
 * hoveredAlignmentId``; section E).
 *
 * - renders ONE connector set at most, and nothing when the effective
 *   alignment is null (section I);
 * - the SVG never intercepts interaction: ``pointer-events: none``;
 * - it lives inside ``.panels-container`` (position: relative) and uses a
 *   panels-relative coordinate system: every client rect is converted with
 *   ``toOverlayRect(rect, svg.getBoundingClientRect())`` before geometry is
 *   computed — no browser-global absolute coordinates reach the SVG;
 * - geometry pipeline (sections J, K, L):
 *     group -> membersByGroup -> member.span_id
 *       -> RenderedSpanRegistry.getElements(spanId)
 *       -> element.getClientRects() flattened
 *       -> each rect clipped to its owning ``.text-panel-body`` viewport
 *       -> overlay-relative conversion
 *       -> deterministic nearest-hub anchor selection (computeAnchors);
 *   fully clipped rects are ignored, partially visible rects use the visible
 *   intersection, hidden panels/members contribute nothing, and fewer than 2
 *   visible members render no connectors;
 * - recompute lifecycle (section M): state-driven recompute on
 *   active/hovered/snapshot changes plus event-driven recompute for
 *   ``scroll`` (capture — scroll events do not bubble), ``resize``,
 *   ResizeObserver on the overlay, and the explicit panel-layout revision
 *   (R1-F01), all coalesced through a single ``requestAnimationFrame``;
 *   listeners are attached ONLY while an effective alignment exists and are
 *   fully detached otherwise;
 * - geometry carries provenance (R1-F04): connector lines render only when
 *   they were computed for the CURRENT effective alignment id, so stale
 *   geometry from a previous alignment (including across ``A -> null -> B``)
 *   can never be displayed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlignmentMember } from './api';
import {
  computeAnchors,
  type Point,
} from '../../shared/rendering/geometry';
import { collectVisibleMemberRects } from '../../shared/rendering/domRects';
import type { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';

export interface ConnectorOverlayProps {
  /** The EFFECTIVE alignment id (``active ?? hovered``); null renders nothing. */
  alignmentId: string | null;
  membersByGroup: Record<string, AlignmentMember[]>;
  registry: RenderedSpanRegistry;
  /**
   * M0.6 (R1-F01): stable panel-layout revision derived from the current
   * ``panelOrder`` + ``visiblePanels``. Panel reorder / hide / show can move
   * rendered text without changing the observed SVG/container dimensions, so
   * ResizeObserver alone cannot reliably detect those layout changes. When
   * this key changes, connector geometry is explicitly invalidated through
   * the same requestAnimationFrame-coalesced mechanism as every other
   * invalidation source.
   */
  layoutKey: string;
}

export interface ConnectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Connector geometry WITH provenance (M0.6 R1-F04): the alignment id the
 * lines were computed for. Lines may only be rendered when this id matches
 * the CURRENT effective alignment id, so stale geometry from a previous
 * alignment can never render under a new one (including across an
 * ``A -> null -> B`` transition, where the component unmounts/remounts the
 * SVG but must not resurrect old lines).
 */
export interface ConnectorGeometry {
  alignmentId: string;
  lines: ConnectorLine[];
}

export function ConnectorOverlay({
  alignmentId,
  membersByGroup,
  registry,
  layoutKey,
}: ConnectorOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geometry, setGeometry] = useState<ConnectorGeometry | null>(null);

  const compute = useCallback((): void => {
    if (alignmentId === null) {
      setGeometry(null);
      return;
    }
    const svg = svgRef.current;
    if (svg === null) {
      setGeometry(null);
      return;
    }
    const overlayRect = svg.getBoundingClientRect();
    const members = membersByGroup[alignmentId] ?? [];
    const visibleRectsByMember = members.map((member) =>
      collectVisibleMemberRects(registry.getElements(member.span_id), overlayRect),
    );
    const anchors = computeAnchors(visibleRectsByMember);
    if (anchors === null) {
      // Fewer than 2 visible members: render no connectors (section K).
      setGeometry(null);
      return;
    }
    const next: ConnectorLine[] = anchors.anchors.map((anchor: Point) => ({
      x1: anchor.x,
      y1: anchor.y,
      x2: anchors.hub.x,
      y2: anchors.hub.y,
    }));
    setGeometry({ alignmentId, lines: next });
  }, [alignmentId, membersByGroup, registry]);

  // Latest-render ref so the stable scheduler always invalidates against the
  // current geometry inputs without re-attaching listeners.
  const computeRef = useRef(compute);
  computeRef.current = compute;

  const rafRef = useRef<number | null>(null);
  const schedule = useCallback((): void => {
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      computeRef.current();
    });
  }, []);

  // State-driven recompute: effective alignment / snapshot / registry
  // inputs, PLUS the explicit panel-layout revision (R1-F01: panel
  // reorder/hide/show invalidates geometry even when the container
  // dimensions do not change).
  useEffect(() => {
    if (alignmentId !== null) {
      schedule();
    }
  }, [alignmentId, membersByGroup, registry, layoutKey, schedule]);

  // Event-driven recompute + listener lifecycle (section M): listeners exist
  // ONLY while an effective alignment is present.
  useEffect(() => {
    if (alignmentId === null) {
      return;
    }
    const svg = svgRef.current;
    if (svg === null) {
      return;
    }
    // Capture-phase scroll on the overlay container catches every descendant
    // scroll (scroll events do not bubble). This covers .text-panel-body
    // scrolling and any workspace/window scroll inside the container.
    const container = svg.parentElement;
    container?.addEventListener('scroll', schedule, { capture: true, passive: true });
    // Window scroll (workspace page can scroll as a whole).
    window.addEventListener('scroll', schedule, { passive: true });
    // Window resize + overlay/container resize (panel reorder, hide/show,
    // font/layout changes) via ResizeObserver on the overlay element.
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(svg);

    return () => {
      container?.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [alignmentId, schedule]);

  if (alignmentId === null) {
    return null;
  }

  return (
    <svg
      ref={svgRef}
      className="connector-overlay"
      data-testid="connector-overlay"
      aria-hidden="true"
    >
      {geometry !== null && geometry.alignmentId === alignmentId
        ? geometry.lines.map((line, index) => (
            <line
              key={index}
              className="connector-line"
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            />
          ))
        : null}
    </svg>
  );
}
