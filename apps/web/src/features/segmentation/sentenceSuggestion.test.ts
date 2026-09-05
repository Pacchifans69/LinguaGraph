import { describe, expect, it } from 'vitest';
import {
  assertCompletePartition,
  manualSentencePartition,
  mergeWithPrevious,
  splitSegment,
  suggestSentences,
} from './sentenceSuggestion';

class FakeSegmenter {
  constructor(
    private readonly _locale: string,
    private readonly _options: { granularity: 'sentence' },
  ) {}

  segment(text: string) {
    if (this._options.granularity !== 'sentence') {
      throw new TypeError('expected sentence granularity');
    }
    if (text === 'A🙂. B!') {
      return [
        { segment: 'A🙂. ', index: 0 },
        { segment: 'B!', index: 5 },
      ];
    }
    if (text === '你好。再见！') {
      return [
        { segment: '你好。', index: 0 },
        { segment: '再见！', index: 3 },
      ];
    }
    return text.length === 0 ? [] : [{ segment: text, index: 0 }];
  }

  resolvedOptions() {
    return { locale: this._locale === 'en' ? 'en-US' : this._locale };
  }
}

describe('sentence suggestion adapter', () => {
  it('converts UTF-16 indices after astral emoji to code-point offsets', () => {
    const result = suggestSentences('A🙂. B!', 'en', FakeSegmenter);
    expect(result).toEqual({
      requestedLocale: 'en',
      resolvedLocale: 'en-US',
      ranges: [
        { start: 0, end: 4 },
        { start: 4, end: 6 },
      ],
    });
  });

  it('preserves CJK punctuation tiling without claiming universal boundaries', () => {
    expect(
      suggestSentences('你好。再见！', 'zh-Hans', FakeSegmenter).ranges,
    ).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ]);
  });

  it('represents empty canonical content with an empty partition', () => {
    expect(suggestSentences('', 'en', FakeSegmenter).ranges).toEqual([]);
    expect(manualSentencePartition('')).toEqual([]);
  });

  it('initializes, splits, and merges by canonical code-point offsets', () => {
    const text = 'A🙂. B!';
    const manual = manualSentencePartition(text);
    expect(manual).toEqual([{ start: 0, end: 6 }]);

    const split = splitSegment(text, manual, 0, 4);
    expect(split).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 6 },
    ]);
    expect(mergeWithPrevious(text, split, 1)).toEqual(manual);
  });

  it('fails closed for gaps, overlaps, zero-length, and invalid split/merge', () => {
    expect(() =>
      assertCompletePartition('abcd', [
        { start: 0, end: 2 },
        { start: 3, end: 4 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      assertCompletePartition('abcd', [
        { start: 0, end: 3 },
        { start: 2, end: 4 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      assertCompletePartition('abcd', [{ start: 0, end: 0 }]),
    ).toThrow(RangeError);
    expect(() =>
      splitSegment('abcd', [{ start: 0, end: 4 }], 0, 4),
    ).toThrow(RangeError);
    expect(() =>
      mergeWithPrevious('abcd', [{ start: 0, end: 4 }], 0),
    ).toThrow(RangeError);
  });

  it('rejects a suggestion boundary that splits a surrogate pair', () => {
    class BrokenSegmenter extends FakeSegmenter {
      override segment(text: string) {
        return [
          { segment: text.slice(0, 2), index: 0 },
          { segment: text.slice(2), index: 2 },
        ];
      }
    }
    expect(() =>
      suggestSentences('A🙂B', 'en', BrokenSegmenter),
    ).toThrow(/surrogate pair/);
  });
});
