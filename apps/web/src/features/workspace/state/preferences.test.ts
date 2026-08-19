/**
 * Per-document workspace preference persistence + reconciliation tests (M0.3).
 */

import { describe, expect, it } from 'vitest';
import {
  loadPreferences,
  preferenceKey,
  reconcilePreferences,
  savePreferences,
  type WorkspacePreferences,
} from './preferences';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

describe('preference namespace', () => {
  it('uses the accepted per-document namespace', () => {
    expect(preferenceKey('doc-abc')).toBe(
      'linguagraph.workspace.preferences.v1.doc-abc',
    );
  });

  it('round-trips preferences and keeps documents isolated', () => {
    const storage = memoryStorage();
    const prefs: WorkspacePreferences = { panelOrder: ['a', 'b'], visiblePanels: ['a'] };
    savePreferences('doc-1', prefs, storage);
    savePreferences('doc-2', { panelOrder: ['x'], visiblePanels: ['x'] }, storage);

    expect(loadPreferences('doc-1', storage)).toEqual(prefs);
    expect(loadPreferences('doc-2', storage)).toEqual({ panelOrder: ['x'], visiblePanels: ['x'] });
    expect(storage.getItem(preferenceKey('doc-1'))).not.toContain('doc-2');
  });

  it('returns null for absent and corrupt payloads', () => {
    const storage = memoryStorage();
    expect(loadPreferences('doc-1', storage)).toBeNull();
    storage.setItem(preferenceKey('doc-1'), '{not json');
    expect(loadPreferences('doc-1', storage)).toBeNull();
    storage.setItem(preferenceKey('doc-1'), JSON.stringify({ panelOrder: 'nope' }));
    expect(loadPreferences('doc-1', storage)).toBeNull();
  });
});

describe('reconcilePreferences', () => {
  const base: WorkspacePreferences = {
    panelOrder: ['tv-en', 'tv-fr'],
    visiblePanels: ['tv-en'],
  };

  it('keeps existing order and appends newly-created server versions', () => {
    const result = reconcilePreferences(base, ['tv-en', 'tv-de', 'tv-fr']);
    // tv-de is new: appended after existing preferred order.
    expect(result.panelOrder).toEqual(['tv-en', 'tv-fr', 'tv-de']);
    // New versions are incorporated but start hidden.
    expect(result.visiblePanels).toEqual(['tv-en']);
  });

  it('drops deleted ids from both lists', () => {
    const result = reconcilePreferences(
      { panelOrder: ['tv-en', 'tv-gone', 'tv-fr'], visiblePanels: ['tv-gone'] },
      ['tv-en', 'tv-fr'],
    );
    expect(result.panelOrder).toEqual(['tv-en', 'tv-fr']);
    expect(result.visiblePanels).toEqual([]);
  });

  it('appends in server order while keeping preferred relative order', () => {
    const result = reconcilePreferences(
      { panelOrder: ['tv-fr', 'tv-en'], visiblePanels: [] },
      ['tv-en', 'tv-de', 'tv-fr', 'tv-es'],
    );
    // Preferred order [tv-fr, tv-en] preserved; new ones follow in server order.
    expect(result.panelOrder).toEqual(['tv-fr', 'tv-en', 'tv-de', 'tv-es']);
  });

  it('does not leak state between documents (different server id sets)', () => {
    const result = reconcilePreferences(
      { panelOrder: ['other-doc-version'], visiblePanels: ['other-doc-version'] },
      ['tv-en'],
    );
    expect(result.panelOrder).toEqual(['tv-en']);
    expect(result.visiblePanels).toEqual([]);
  });
});
