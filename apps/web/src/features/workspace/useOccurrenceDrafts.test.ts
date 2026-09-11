import { describe, expect, it } from 'vitest';
import { reconcileOccurrenceDrafts } from './useOccurrenceDrafts';

const token = {
  id: 'token-1', segmentation_layer_id: 'layer-1', ordinal: 0,
  start_offset: 0, end_offset: 5, exact_text: 'Hello', is_word_like: true,
  created_at: '2026-01-01T00:00:00Z',
};

describe('occurrence draft reconciliation', () => {
  it('commits an own mutation only after authoritative equality', () => {
    const dirty = reconcileOccurrenceDrafts({}, 'layer-1', [token], { 'token-1': '' });
    dirty['token-1']!.draft = 'hello';
    const committed = reconcileOccurrenceDrafts(dirty, 'layer-1', [token], { 'token-1': 'hello' });
    expect(committed['token-1']).toMatchObject({ draft: 'hello', savedValue: 'hello', conflict: false });
  });

  it('retains and conflicts a dirty draft when its token basis disappears', () => {
    const dirty = reconcileOccurrenceDrafts({}, 'layer-1', [token], {});
    dirty['token-1']!.draft = 'hello';
    const conflicted = reconcileOccurrenceDrafts(dirty, 'layer-2', [], {});
    expect(conflicted['token-1']).toMatchObject({ draft: 'hello', conflict: true, stale: true });
  });

  // M6-G2-F02: while the local draft is preserved for explicit disposition,
  // the entry must simultaneously record the LATEST authoritative
  // basis/value/segment so an explicit discard loads the current basis
  // instead of restoring a stale savedValue.
  it('records the latest authoritative value and basis while preserving the local draft', () => {
    const withSaved = reconcileOccurrenceDrafts({}, 'layer-1', [token], {
      'token-1': 'house',
    });
    withSaved['token-1']!.draft = 'houses';

    const changedToken = { ...token, exact_text: 'Homes' };
    const conflicted = reconcileOccurrenceDrafts(
      withSaved,
      'layer-2',
      [changedToken],
      { 'token-1': 'home' },
    );

    expect(conflicted['token-1']).toMatchObject({
      // Human draft survives the unexpected authoritative change ...
      draft: 'houses',
      // ... alongside the current authoritative authority.
      savedValue: 'home',
      basisId: 'layer-2',
      conflict: true,
      stale: false,
    });
    expect(conflicted['token-1']!.segment).toBe(changedToken);

    // A discard reloads the CURRENT basis, so the session is clean and
    // editable from the authoritative value rather than the stale one.
    const discarded = {
      ...conflicted['token-1']!,
      draft: conflicted['token-1']!.savedValue,
      conflict: false,
    };
    expect(discarded.draft).toBe('home');
    expect(discarded.draft).toBe(discarded.savedValue);
  });

  it('keeps a same-basis authoritative value change conflicted too', () => {
    const withSaved = reconcileOccurrenceDrafts({}, 'layer-1', [token], {
      'token-1': 'house',
    });
    withSaved['token-1']!.draft = 'houses';
    const conflicted = reconcileOccurrenceDrafts(withSaved, 'layer-1', [token], {
      'token-1': 'home',
    });
    expect(conflicted['token-1']).toMatchObject({
      draft: 'houses',
      savedValue: 'home',
      basisId: 'layer-1',
      conflict: true,
    });
  });
});
