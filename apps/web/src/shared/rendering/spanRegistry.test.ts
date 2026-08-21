/**
 * RenderedSpanRegistry tests (M0.6 Round 1) — the canonical span->DOM bridge.
 *
 * Covers every frozen invariant (frozen contract section H):
 * one element / one span; one element / multiple spans; one span / multiple
 * elements; duplicate registration safety; unregister removes only the
 * correct element; stale cleanup; unknown span ids; clear/reset.
 */

import { describe, expect, it } from 'vitest';
import { RenderedSpanRegistry } from './spanRegistry';

function makeElement(id: string): HTMLElement {
  const element = document.createElement('span');
  element.dataset.testId = id;
  return element;
}

describe('RenderedSpanRegistry', () => {
  it('registers one element for one span', () => {
    const registry = new RenderedSpanRegistry();
    const element = makeElement('run-1');
    registry.register(['span-1'], element);
    expect(registry.getElements('span-1')).toEqual([element]);
    expect(registry.getElements('span-2')).toEqual([]);
  });

  it('registers one element for multiple span ids', () => {
    const registry = new RenderedSpanRegistry();
    const element = makeElement('run-overlap');
    registry.register(['span-a', 'span-b', 'span-a'], element);
    // Duplicate ids in ONE register call must not duplicate the element.
    expect(registry.getElements('span-a')).toEqual([element]);
    expect(registry.getElements('span-b')).toEqual([element]);
  });

  it('maps one span to multiple rendered elements', () => {
    const registry = new RenderedSpanRegistry();
    const first = makeElement('run-1');
    const second = makeElement('run-2');
    // A span split across two segmentation runs registers in both.
    registry.register(['span-split'], first);
    registry.register(['span-split'], second);
    expect(registry.getElements('span-split')).toHaveLength(2);
    expect(registry.getElements('span-split')).toEqual(
      expect.arrayContaining([first, second]),
    );
  });

  it('duplicate ref invocation does not create duplicate registration', () => {
    const registry = new RenderedSpanRegistry();
    const element = makeElement('run-1');
    const cleanupA = registry.register(['span-1'], element);
    const cleanupB = registry.register(['span-1'], element);
    // One logical registration: the bucket holds the element exactly once.
    expect(registry.getElements('span-1')).toEqual([element]);
    // Either cleanup removes the single registration; the other is a no-op.
    cleanupA();
    expect(registry.getElements('span-1')).toEqual([]);
    cleanupB();
    expect(registry.getElements('span-1')).toEqual([]);
  });

  it('unregister removes only the correct element', () => {
    const registry = new RenderedSpanRegistry();
    const first = makeElement('run-1');
    const second = makeElement('run-2');
    const cleanupFirst = registry.register(['span-shared'], first);
    registry.register(['span-shared'], second);
    cleanupFirst();
    expect(registry.getElements('span-shared')).toEqual([second]);
  });

  it('unregister of a shared element touches only its own span buckets', () => {
    const registry = new RenderedSpanRegistry();
    const element = makeElement('run-overlap');
    const other = makeElement('run-other');
    const cleanup = registry.register(['span-a', 'span-b'], element);
    registry.register(['span-b'], other);
    cleanup();
    expect(registry.getElements('span-a')).toEqual([]);
    // span-b must still hold `other`.
    expect(registry.getElements('span-b')).toEqual([other]);
  });

  it('unmount cleanup removes stale elements (React unmount path)', () => {
    const registry = new RenderedSpanRegistry();
    const element = makeElement('run-1');
    const cleanup = registry.register(['span-1'], element);
    // Simulate React 19 ref-callback cleanup on unmount.
    cleanup();
    expect(registry.getElements('span-1')).toEqual([]);
    // A second cleanup call (defensive) stays a no-op.
    cleanup();
    expect(registry.getElements('span-1')).toEqual([]);
  });

  it('returns an empty collection for unknown span ids', () => {
    const registry = new RenderedSpanRegistry();
    registry.register(['span-1'], makeElement('run-1'));
    expect(registry.getElements('unknown-span')).toEqual([]);
    expect(registry.getElements('')).toEqual([]);
  });

  it('clear/reset drops every registration (document remount)', () => {
    const registry = new RenderedSpanRegistry();
    registry.register(['span-1'], makeElement('run-1'));
    registry.register(['span-2'], makeElement('run-2'));
    registry.clear();
    expect(registry.getElements('span-1')).toEqual([]);
    expect(registry.getElements('span-2')).toEqual([]);
    expect(registry.spanIdCount).toBe(0);
    // The registry stays usable after a reset.
    const fresh = makeElement('run-fresh');
    registry.register(['span-1'], fresh);
    expect(registry.getElements('span-1')).toEqual([fresh]);
  });

  it('keeps elements for spans that also had other elements removed', () => {
    const registry = new RenderedSpanRegistry();
    const first = makeElement('run-1');
    const second = makeElement('run-2');
    const cleanup = registry.register(['span-a', 'span-b'], first);
    registry.register(['span-a'], second);
    cleanup();
    // span-a still maps to second; span-b is now empty.
    expect(registry.getElements('span-a')).toEqual([second]);
    expect(registry.getElements('span-b')).toEqual([]);
  });
});
