/**
 * ConnectorOverlay (M8) — deterministic obstacle-avoiding SVG connector
 * routing for the EFFECTIVE alignment (`activeAlignmentId ?? hoveredAlignmentId`).
 *
 * Span identity still comes only from RenderedSpanRegistry. M8 changes only
 * presentation geometry: visible members derive owning-panel perimeter ports
 * and route through free canvas space to one shared N:M hub without entering
 * any visible .panel-slot interior.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlignmentMember } from './api';
import { computeAnchors, type Point } from '../../shared/rendering/geometry';
import {
  collectMemberDomGeometry,
  collectVisiblePanelRects,
  type VisibleMemberDomGeometry,
} from '../../shared/rendering/domRects';
import {
  computeRoutedConnectorGeometry,
  type ConnectorRoute,
} from '../../shared/rendering/connectorRouting';
import type { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';

export interface ConnectorOverlayProps {
  alignmentId: string | null;
  membersByGroup: Record<string, AlignmentMember[]>;
  registry: RenderedSpanRegistry;
  layoutKey: string;
}

export interface ConnectorGeometry {
  alignmentId: string;
  layoutKey: string;
  hub: Point;
  routes: ConnectorRoute[];
}

function pointsAttribute(points: ReadonlyArray<Point>): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
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
    const container = svg?.parentElement;
    if (svg === null || !(container instanceof HTMLElement)) {
      setGeometry(null);
      return;
    }

    const overlayRect = svg.getBoundingClientRect();
    if (overlayRect.width <= 0 || overlayRect.height <= 0) {
      setGeometry(null);
      return;
    }

    const members = membersByGroup[alignmentId] ?? [];
    const collected = members.map((member) => ({
      member,
      geometry: collectMemberDomGeometry(
        registry.getElements(member.span_id),
        overlayRect,
      ),
    }));
    if (
      collected.some(
        ({ geometry: memberGeometry }) => memberGeometry.kind === 'invalid',
      )
    ) {
      setGeometry(null);
      return;
    }

    const visible = collected.filter(
      (
        entry,
      ): entry is {
        member: AlignmentMember;
        geometry: VisibleMemberDomGeometry;
      } => entry.geometry.kind === 'visible',
    );
    if (visible.length < 2) {
      setGeometry(null);
      return;
    }

    const anchors = computeAnchors(
      visible.map(({ geometry: memberGeometry }) => memberGeometry.rects),
    );
    if (anchors === null) {
      setGeometry(null);
      return;
    }

    const routed = computeRoutedConnectorGeometry(
      visible.map(({ member, geometry: memberGeometry }, index) => ({
        memberId: member.id,
        anchor: anchors.anchors[index],
        panel: memberGeometry.panelRect,
      })),
      collectVisiblePanelRects(container, overlayRect),
      { width: overlayRect.width, height: overlayRect.height },
    );
    if (routed === null) {
      setGeometry(null);
      return;
    }

    setGeometry({
      alignmentId,
      layoutKey,
      hub: routed.hub,
      routes: routed.routes,
    });
  }, [alignmentId, layoutKey, membersByGroup, registry]);

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

  useEffect(() => {
    if (alignmentId !== null) {
      schedule();
    }
  }, [alignmentId, membersByGroup, registry, layoutKey, schedule]);

  useEffect(() => {
    if (alignmentId === null) {
      return;
    }
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (svg === null || !(container instanceof HTMLElement)) {
      return;
    }

    container.addEventListener('scroll', schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const observer = new ResizeObserver(schedule);
    observer.observe(svg);
    for (const target of container.querySelectorAll(
      '.panel-slot, .text-panel-body',
    )) {
      observer.observe(target);
    }

    return () => {
      container.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [alignmentId, layoutKey, membersByGroup, registry, schedule]);

  if (alignmentId === null) {
    return null;
  }

  const renderable =
    geometry !== null &&
    geometry.alignmentId === alignmentId &&
    geometry.layoutKey === layoutKey;

  return (
    <svg
      ref={svgRef}
      className="connector-overlay"
      data-testid="connector-overlay"
      aria-hidden="true"
    >
      {renderable
        ? geometry.routes.map((route) => (
            <polyline
              key={route.memberId}
              className="connector-route"
              data-member-id={route.memberId}
              points={pointsAttribute(route.points)}
            />
          ))
        : null}
    </svg>
  );
}
