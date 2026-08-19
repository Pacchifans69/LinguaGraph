/**
 * Workspace reducer tests (M0.3): panel open/hide/reorder and stale-id
 * reconciliation. The reducer owns ONLY visiblePanels/panelOrder.
 */

import { describe, expect, it } from 'vitest';
import {
  initialWorkspaceState,
  workspaceReducer,
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
