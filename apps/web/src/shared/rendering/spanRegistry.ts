/**
 * RenderedSpanRegistry (M0.6) — the canonical bridge from persisted span ids
 * to rendered DOM run elements (pre-implementation report section 8).
 *
 * TextPanel run elements register themselves for every span id in
 * ``run.spanIds`` (one run element may cover several spans; one span may be
 * rendered by several run elements, e.g. a span split across segmentation
 * runs or wrapping across visual lines). Connector geometry reads this
 * registry and must NEVER discover span identity through selectors —
 * ``querySelector('[data-span-id=...]')``, ``querySelectorAll`` and parsing
 * ``data-span-ids`` are explicitly forbidden as canonical locating
 * mechanisms.
 *
 * Invariants:
 *
 * - ``register(spanIds, element)`` returns an ``unregister`` cleanup; it is
 *   idempotent for duplicate invocations of the same element (Set buckets);
 * - ``unregister`` removes ONLY the element passed to it, for exactly the
 *   span ids it registered;
 * - unmounted elements can never remain stale (React 19 ref-callback
 *   cleanups call ``unregister`` on unmount);
 * - unknown span ids return an empty collection;
 * - ``clear()`` drops every registration (a document workspace remount must
 *   not retain old elements — the page owns one registry instance per
 *   document).
 */

export class RenderedSpanRegistry {
  private buckets = new Map<string, Set<HTMLElement>>();

  /**
   * Register `element` for every span id in `spanIds` and return the
   * unregister cleanup. Duplicate registration of the same element for the
   * same span ids is a no-op (buckets are Sets).
   */
  register(spanIds: ReadonlyArray<string>, element: HTMLElement): () => void {
    const unique = new Set(spanIds);
    for (const spanId of unique) {
      let bucket = this.buckets.get(spanId);
      if (bucket === undefined) {
        bucket = new Set<HTMLElement>();
        this.buckets.set(spanId, bucket);
      }
      bucket.add(element);
    }
    return () => this.unregister(unique, element);
  }

  private unregister(
    spanIds: ReadonlySet<string>,
    element: HTMLElement,
  ): void {
    for (const spanId of spanIds) {
      const bucket = this.buckets.get(spanId);
      if (bucket === undefined) {
        continue;
      }
      bucket.delete(element);
      if (bucket.size === 0) {
        this.buckets.delete(spanId);
      }
    }
  }

  /** All rendered run elements registered for `spanId` (empty for unknown). */
  getElements(spanId: string): HTMLElement[] {
    const bucket = this.buckets.get(spanId);
    return bucket === undefined ? [] : [...bucket];
  }

  /** Drop all registrations (document remount / reset). */
  clear(): void {
    this.buckets.clear();
  }

  /** Number of distinct span ids with at least one registered element. */
  get spanIdCount(): number {
    return this.buckets.size;
  }
}
