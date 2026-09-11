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
});
