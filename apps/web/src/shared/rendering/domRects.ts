/**
 * DOM rect collection for connector geometry.
 *
 * Span identity comes ONLY from RenderedSpanRegistry. DOM traversal here is
 * limited to canonical layout discovery: the owning .text-panel-body and
 * .panel-slot rectangles used for clipping and M8 obstacle routing.
 */

import { intersectRects, isVisibleRect, toOverlayRect, type RectLike } from './geometry';

export interface VisibleMemberDomGeometry {
  kind: 'visible';
  rects: RectLike[];
  panelRect: RectLike;
  panelElement: HTMLElement;
}

export type MemberDomGeometry =
  | VisibleMemberDomGeometry
  | { kind: 'hidden' }
  | { kind: 'invalid' };

export function collectMemberDomGeometry(
  elements: ReadonlyArray<HTMLElement>,
  overlayRect: RectLike,
): MemberDomGeometry {
  const visible: RectLike[] = [];
  let owningPanel: HTMLElement | null = null;
  let panelRect: RectLike | null = null;
  let sawConnectedElement = false;

  for (const element of elements) {
    if (!element.isConnected) {
      continue;
    }
    sawConnectedElement = true;
    const panelBody = element.closest('.text-panel-body');
    const panel = element.closest('.panel-slot');
    if (!(panelBody instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return { kind: 'invalid' };
    }
    if (owningPanel !== null && panel !== owningPanel) {
      return { kind: 'invalid' };
    }
    if (owningPanel === null) {
      owningPanel = panel;
      const rawPanelRect = panel.getBoundingClientRect();
      if (rawPanelRect.width > 0 && rawPanelRect.height > 0) {
        panelRect = toOverlayRect(rawPanelRect, overlayRect);
      }
    }

    const viewport = panelBody.getBoundingClientRect();
    if (viewport.width === 0 || viewport.height === 0) {
      continue;
    }
    const viewportOverlay = toOverlayRect(viewport, overlayRect);
    for (const rect of element.getClientRects()) {
      const clipped = intersectRects(
        toOverlayRect(rect, overlayRect),
        viewportOverlay,
      );
      if (clipped !== null && isVisibleRect(clipped)) {
        visible.push(clipped);
      }
    }
  }

  if (
    !sawConnectedElement ||
    owningPanel === null ||
    panelRect === null ||
    visible.length === 0
  ) {
    return { kind: 'hidden' };
  }
  return { kind: 'visible', rects: visible, panelRect, panelElement: owningPanel };
}

/** Inherited M0.6 clipping helper retained for focused geometry tests. */
export function collectVisibleMemberRects(
  elements: ReadonlyArray<HTMLElement>,
  overlayRect: RectLike,
): RectLike[] {
  const geometry = collectMemberDomGeometry(elements, overlayRect);
  return geometry.kind === 'visible' ? geometry.rects : [];
}

/** Visible direct .panel-slot children of the canonical panels container. */
export function collectVisiblePanelRects(
  container: HTMLElement,
  overlayRect: RectLike,
): RectLike[] {
  const panels: RectLike[] = [];
  for (const child of Array.from(container.children)) {
    if (
      !(child instanceof HTMLElement) ||
      !child.classList.contains('panel-slot')
    ) {
      continue;
    }
    const rect = child.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    panels.push(toOverlayRect(rect, overlayRect));
  }
  return panels;
}
