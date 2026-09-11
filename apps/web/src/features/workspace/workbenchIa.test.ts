import { describe, expect, it } from 'vitest';
import { nextVisibleTarget, sameSessionStatus } from './workbenchIa';

describe('workbench IA reconciliation', () => {
  it('chooses the first visible panel deterministically', () => {
    expect(nextVisibleTarget(['v2', 'v1'], ['v1', 'v2'], null)).toBe('v2');
  });

  it('preserves a current visible target through reorder', () => {
    expect(nextVisibleTarget(['v2', 'v1'], ['v1', 'v2'], 'v1')).toBe('v1');
  });

  it('moves to the first surviving visible panel after hide or delete', () => {
    expect(nextVisibleTarget(['v1', 'v2'], ['v2'], 'v1')).toBe('v2');
    expect(nextVisibleTarget([], [], 'v1')).toBeNull();
  });

  it('compares every session-summary field', () => {
    const clean = { dirty: false, pending: false, error: false, conflict: false, dialogOpen: false };
    expect(sameSessionStatus(clean, clean)).toBe(true);
    expect(sameSessionStatus(clean, { ...clean, conflict: true })).toBe(false);
  });
});
