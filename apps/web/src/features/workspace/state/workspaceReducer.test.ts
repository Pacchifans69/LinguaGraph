/**
 * Workspace reducer tests (M0.3 + M0.4).
 *
 * M0.3: panel open/hide/reorder and stale-id reconciliation.
 * M0.4: currentSelection / pendingMembers — capture, explicit staging,
 * duplicate + same-version overlap rejection, adjacent/separated acceptance,
 * panel hide lifecycle, and stale TextVersion/content-hash reconciliation.
 */

import { describe, expect, it } from 'vitest';
import type { PendingSpan } from '../../../shared/text/types';
import {
  canStagePendingMember,
  initialWorkspaceState,
  pendingRangesOverlap,
  workspaceReducer,
  type WorkspaceState,
} from './workspaceReducer';

describe('workspaceReducer', () => {
  it('opens a panel (adds to order and visible)', () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    expect(state.panelOrder).toEqual(['tv-en']);
    expect(state.visiblePanels).toEqual(['tv-en']);
  });

  it('hides a panel but keeps its order position', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: 'tv-de' });
    state = workspaceReducer(state, { type: 'HIDE_PANEL', versionId: 'tv-en' });

    expect(state.visiblePanels).toEqual(['tv-de']);
    expect(state.panelOrder).toEqual(['tv-en', 'tv-de']); // order preserved
  });

  it('reopens a hidden panel without changing existing order', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: 'tv-fr' });
    state = workspaceReducer(state, { type: 'HIDE_PANEL', versionId: 'tv-en' });
    state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: 'tv-en' });

    expect(state.panelOrder).toEqual(['tv-en', 'tv-fr']);
    expect(state.visiblePanels).toEqual(['tv-fr', 'tv-en']);
  });

  it('reorders panels by index', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    for (const id of ['tv-de', 'tv-fr']) {
      state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: id });
    }
    expect(state.panelOrder).toEqual(['tv-en', 'tv-de', 'tv-fr']);

    state = workspaceReducer(state, {
      type: 'REORDER_PANELS',
      fromIndex: 0,
      toIndex: 2,
    });
    expect(state.panelOrder).toEqual(['tv-de', 'tv-fr', 'tv-en']);
  });

  it('ignores out-of-range reorders', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    const before = state.panelOrder;
    state = workspaceReducer(state, { type: 'REORDER_PANELS', fromIndex: 0, toIndex: 5 });
    expect(state.panelOrder).toEqual(before);
  });

  it('reconciles stale ids and incorporates new server versions', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-gone',
    });
    state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: 'tv-en' });
    state = workspaceReducer(state, {
      type: 'RECONCILE',
      serverVersionIds: ['tv-en', 'tv-new'],
    });

    expect(state.panelOrder).toEqual(['tv-en', 'tv-new']);
    expect(state.visiblePanels).toEqual(['tv-en']);
  });
});

function member(
  overrides: Partial<PendingSpan> = {},
): PendingSpan {
  return {
    textVersionId: 'tv-en',
    contentHash: 'hash-en',
    start: 2,
    end: 17,
    quote: 'look forward to',
    direction: 'forward',
    ...overrides,
  };
}

function withPending(
  state: WorkspaceState,
  ...members: PendingSpan[]
): WorkspaceState {
  return { ...state, pendingMembers: members };
}

describe('workspaceReducer — M0.4 pending selection state', () => {
  it('captures a current selection and clears it', () => {
    const captured = workspaceReducer(initialWorkspaceState, {
      type: 'CAPTURE_SELECTION',
      member: member(),
    });
    expect(captured.currentSelection).toEqual(member());
    expect(captured.pendingMembers).toEqual([]);

    const cleared = workspaceReducer(captured, { type: 'CLEAR_SELECTION' });
    expect(cleared.currentSelection).toBeNull();
  });

  it('stages the current selection and consumes it on success', () => {
    const captured = workspaceReducer(initialWorkspaceState, {
      type: 'CAPTURE_SELECTION',
      member: member(),
    });
    const staged = workspaceReducer(captured, {
      type: 'ADD_PENDING_MEMBER',
      member: member(),
    });
    expect(staged.pendingMembers).toEqual([member()]);
    expect(staged.currentSelection).toBeNull();
  });

  it('rejects an exact duplicate pending member (state unchanged)', () => {
    const state = withPending(initialWorkspaceState, member());
    const after = workspaceReducer(state, {
      type: 'ADD_PENDING_MEMBER',
      member: member(),
    });
    expect(after.pendingMembers).toHaveLength(1);
    expect(after).toBe(state);
  });

  it('rejects same-version overlap but allows adjacent and separated ranges', () => {
    const base = member({ start: 0, end: 10 });
    const overlap = member({ start: 5, end: 15 });
    const adjacent = member({ start: 10, end: 20 });
    const separated = member({ start: 20, end: 30 });

    expect(pendingRangesOverlap(base, overlap)).toBe(true);
    expect(pendingRangesOverlap(base, adjacent)).toBe(false);
    expect(pendingRangesOverlap(base, separated)).toBe(false);

    let state = withPending(initialWorkspaceState, base);
    state = workspaceReducer(state, { type: 'ADD_PENDING_MEMBER', member: overlap });
    expect(state.pendingMembers).toHaveLength(1);

    state = workspaceReducer(state, { type: 'ADD_PENDING_MEMBER', member: adjacent });
    expect(state.pendingMembers).toHaveLength(2);
    state = workspaceReducer(state, { type: 'ADD_PENDING_MEMBER', member: separated });
    expect(state.pendingMembers).toHaveLength(3);
  });

  it('does not compare coordinate overlap across different TextVersions', () => {
    const en = member({ textVersionId: 'tv-en', start: 0, end: 10 });
    const de = member({ textVersionId: 'tv-de', start: 0, end: 10 });
    const state = withPending(initialWorkspaceState, en);
    const result = canStagePendingMember(state, de);
    expect(result).toEqual({ ok: true });
  });

  it('removes a pending member by identity (textVersionId, start, end)', () => {
    const a = member({ start: 0, end: 5 });
    const b = member({ start: 10, end: 20 });
    const state = withPending(initialWorkspaceState, a, b);
    const after = workspaceReducer(state, {
      type: 'REMOVE_PENDING_MEMBER',
      member: { ...a, quote: 'different quote' },
    });
    expect(after.pendingMembers).toEqual([b]);
  });

  it('clears the whole pending tray', () => {
    const state = withPending(
      initialWorkspaceState,
      member({ start: 0, end: 5 }),
      member({ start: 10, end: 20 }),
    );
    const after = workspaceReducer(state, { type: 'CLEAR_PENDING_MEMBERS' });
    expect(after.pendingMembers).toEqual([]);
  });

  it('hiding a panel clears its current selection but retains its pending members', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'OPEN_PANEL',
      versionId: 'tv-en',
    });
    state = workspaceReducer(state, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en' }),
    });
    state = workspaceReducer(state, {
      type: 'ADD_PENDING_MEMBER',
      member: member({ textVersionId: 'tv-en' }),
    });
    state = workspaceReducer(state, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en', start: 20, end: 25 }),
    });
    expect(state.currentSelection?.start).toBe(20);

    state = workspaceReducer(state, { type: 'HIDE_PANEL', versionId: 'tv-en' });
    expect(state.currentSelection).toBeNull();
    expect(state.pendingMembers).toHaveLength(1);
  });

  it('hiding a different panel does not clear the current selection', () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en' }),
    });
    state = workspaceReducer(state, { type: 'HIDE_PANEL', versionId: 'tv-de' });
    expect(state.currentSelection).toEqual(member({ textVersionId: 'tv-en' }));
  });

  it('showing a panel keeps its pending members intact', () => {
    let state = withPending(initialWorkspaceState, member({ textVersionId: 'tv-en' }));
    state = workspaceReducer(state, { type: 'OPEN_PANEL', versionId: 'tv-en' });
    expect(state.pendingMembers).toHaveLength(1);
  });

  it('drops pending/current state when a TextVersion disappears', () => {
    let state = withPending(
      initialWorkspaceState,
      member({ textVersionId: 'tv-en' }),
      member({ textVersionId: 'tv-de', contentHash: 'hash-de' }),
    );
    state = workspaceReducer(state, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en', start: 20, end: 25 }),
    });
    state = workspaceReducer(state, {
      type: 'RECONCILE_PENDING',
      serverVersions: [{ id: 'tv-de', contentHash: 'hash-de' }],
    });
    expect(state.pendingMembers.map((m) => m.textVersionId)).toEqual(['tv-de']);
    expect(state.currentSelection).toBeNull();
  });

  it('drops pending/current state when the content hash changes', () => {
    let state = withPending(initialWorkspaceState, member({ textVersionId: 'tv-en' }));
    state = workspaceReducer(state, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en', start: 20, end: 25 }),
    });
    state = workspaceReducer(state, {
      type: 'RECONCILE_PENDING',
      serverVersions: [{ id: 'tv-en', contentHash: 'hash-en-new' }],
    });
    expect(state.pendingMembers).toEqual([]);
    expect(state.currentSelection).toBeNull();
  });

  it('retains pending/current state when id and hash are unchanged', () => {
    let state = withPending(initialWorkspaceState, member({ textVersionId: 'tv-en' }));
    state = workspaceReducer(state, {
      type: 'CAPTURE_SELECTION',
      member: member({ textVersionId: 'tv-en', start: 20, end: 25 }),
    });
    state = workspaceReducer(state, {
      type: 'RECONCILE_PENDING',
      serverVersions: [
        { id: 'tv-en', contentHash: 'hash-en' },
        { id: 'tv-de', contentHash: 'hash-de' },
      ],
    });
    expect(state.pendingMembers).toHaveLength(1);
    expect(state.currentSelection?.start).toBe(20);
  });

  it('starts with empty ephemeral state (never restored from storage)', () => {
    expect(initialWorkspaceState.currentSelection).toBeNull();
    expect(initialWorkspaceState.pendingMembers).toEqual([]);
  });
});
