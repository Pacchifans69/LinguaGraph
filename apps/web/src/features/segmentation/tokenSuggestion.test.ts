import { describe, expect, it } from 'vitest';
import {
  manualTokenPartition,
  mergeTokenWithPrevious,
  splitToken,
  suggestTokens,
} from './tokenSuggestion';

class FakeWordSegmenter {
  constructor(locale: string, options: { granularity: 'word' }) {
    expect(locale).toBe('en');
    expect(options).toEqual({ granularity: 'word' });
  }

  segment(text: string) {
    if (text === 'A🙂 ') {
      return [
        { segment: 'A', index: 0, isWordLike: true },
        { segment: '🙂', index: 1, isWordLike: false },
        { segment: ' ', index: 3, isWordLike: false },
      ];
    }
    return [
      { segment: 'café', index: 0, isWordLike: true },
      { segment: '!', index: 4, isWordLike: false },
    ];
  }

  resolvedOptions() {
    return { locale: 'en-US' };
  }
}

describe('M3 token suggestion', () => {
  it('converts sentence-local UTF-16 indices into global code-point offsets', () => {
    const result = suggestTokens(
      'A🙂 café!',
      [{ start: 0, end: 3 }, { start: 3, end: 8 }],
      'en',
      FakeWordSegmenter,
    );
    expect(result.resolvedLocale).toBe('en-US');
    expect(result.ranges).toEqual([
      { start: 0, end: 1, isWordLike: true },
      { start: 1, end: 2, isWordLike: false },
      { start: 2, end: 3, isWordLike: false },
      { start: 3, end: 7, isWordLike: true },
      { start: 7, end: 8, isWordLike: false },
    ]);
  });

  it('constructs one editable token per saved sentence', () => {
    expect(
      manualTokenPartition('Hello. !!!', [
        { start: 0, end: 7 },
        { start: 7, end: 10 },
      ]),
    ).toEqual([
      { start: 0, end: 7, isWordLike: true },
      { start: 7, end: 10, isWordLike: false },
    ]);
  });

  it('preserves classification on split and blocks cross-sentence merge', () => {
    const sentences = [{ start: 0, end: 2 }, { start: 2, end: 4 }];
    const tokens = [
      { start: 0, end: 2, isWordLike: true },
      { start: 2, end: 4, isWordLike: false },
    ];
    expect(splitToken('abcd', sentences, tokens, 0, 1)).toEqual([
      { start: 0, end: 1, isWordLike: true },
      { start: 1, end: 2, isWordLike: true },
      { start: 2, end: 4, isWordLike: false },
    ]);
    expect(() => mergeTokenWithPrevious('abcd', sentences, tokens, 1)).toThrow(
      /sentence boundary/,
    );
  });
});
