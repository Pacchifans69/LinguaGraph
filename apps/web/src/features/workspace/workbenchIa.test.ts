import { describe, expect, it } from 'vitest';
import {
  nextVisibleTarget,
  sameSessionStatus,
  sessionStatusPrecedence,
  type EditorSessionStatus,
} from './workbenchIa';

function status(overrides: Partial<EditorSessionStatus> = {}): EditorSessionStatus {
  return {
    dirty: false,
    pending: false,
    error: false,
    conflict: false,
    dialogOpen: false,
    ...overrides,
  };
}

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

describe('sessionStatusPrecedence', () => {
  it('returns null when nothing is noteworthy', () => {
    expect(sessionStatusPrecedence([])).toBeNull();
    expect(sessionStatusPrecedence([undefined, status(), undefined])).toBeNull();
  });

  it('reports the single noteworthy state it is given', () => {
    expect(sessionStatusPrecedence([status({ dirty: true })])).toBe('Unsaved');
    expect(sessionStatusPrecedence([status({ error: true })])).toBe('Error');
    expect(sessionStatusPrecedence([status({ pending: true })])).toBe('Pending');
    expect(sessionStatusPrecedence([status({ conflict: true })])).toBe('Conflict');
  });

  it('applies the global Conflict > Pending > Error > Unsaved precedence', () => {
    expect(
      sessionStatusPrecedence([status({ dirty: true }), status({ error: true })]),
    ).toBe('Error');
    expect(
      sessionStatusPrecedence([status({ error: true }), status({ pending: true })]),
    ).toBe('Pending');
    expect(
      sessionStatusPrecedence([status({ pending: true }), status({ conflict: true })]),
    ).toBe('Conflict');
  });

  it('is order-independent so a milder session can never win by being visited last', () => {
    // The exact hidden-badge case: sentence Conflict + POS Unsaved. Under the
    // previous last-mode-wins aggregate the POS session understated this as
    // "Unsaved"; the global precedence must report "Conflict" in BOTH orders.
    const conflicted = status({ conflict: true, dirty: true });
    const unsaved = status({ dirty: true });
    expect(sessionStatusPrecedence([conflicted, unsaved])).toBe('Conflict');
    expect(sessionStatusPrecedence([unsaved, conflicted])).toBe('Conflict');

    // And a milder state arriving later never weakens the aggregate.
    expect(
      sessionStatusPrecedence([status({ error: true }), status({ dirty: true })]),
    ).toBe('Error');
    expect(
      sessionStatusPrecedence([status({ dirty: true }), status({ pending: true })]),
    ).toBe('Pending');
  });
});
