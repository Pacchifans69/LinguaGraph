/**
 * DOM rect collection for connector geometry (M0.6 Round 1).
 *
 * Separated from ConnectorOverlay so the component file only exports
 * components (react-refresh) and the pure geometry helpers stay
 * framework-light. This module is the only place that translates DOM
 * elements into the plain rect-like inputs of `geometry.ts`.
 *
 * Pipeline (frozen contract sections J, K):
 *
 *   RenderedSpanRegistry.getElements(spanId)
 *     -> element.getClientRects()  (flattened across run elements)
 *     -> clipped to the owning .text-panel-body viewport
 *     -> converted to overlay-relative coordinates
 *
 * DOM traversal is allowed ONLY for layout/scroll-container discovery
 * (`closest('.text-panel-body')`) — never for span-identity discovery.
 */

import { intersectRects, isVisibleRect, toOverlayRect, type RectLike } from './geometry';

/**
 * Collect the visible, overlay-relative candidate rects of one member.
 *
 * - every run element's client rects are flattened (a span may be split
 *   across runs and wrap across lines);
 * - each rect is clipped to its owning ``.text-panel-body`` viewport
 *   rectangle: fully clipped rects are ignored, partially visible rects use
 *   the visible intersection;
 * - disconnected (unmounted) elements and hidden/zero-size panels
 *   contribute nothing;
 * - all coordinates are converted into overlay-relative space BEFORE
 *   geometry computation (no browser-global absolute coordinates).
 */
export function collectVisibleMemberRects(
  elements: ReadonlyArray<HTMLElement>,
  overlayRect: RectLike,
): RectLike[] {
  const visible: RectLike[] = [];
  for (const element of elements) {
    if (!element.isConnected) {
      continue;
    }
    // DOM traversal for layout/scroll-container discovery (allowed) — this
    // is NOT span-identity discovery.
    const panelBody = element.closest('.text-panel-body');
    if (!(panelBody instanceof HTMLElement)) {
      continue;
    }
    const viewport = panelBody.getBoundingClientRect();
    if (viewport.width === 0 || viewport.height === 0) {
      // Hidden/zero-size panel: contributes no geometry (section K).
      continue;
    }
    const viewportOverlay = toOverlayRect(viewport, overlayRect);
    for (const rect of element.getClientRects()) {
      const clipped = intersectRects(toOverlayRect(rect, overlayRect), viewportOverlay);
      if (clipped !== null && isVisibleRect(clipped)) {
        visible.push(clipped);
      }
    }
  }
  return visible;
}
