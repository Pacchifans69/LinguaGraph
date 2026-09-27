import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GraphemeSegmenterUnavailableError,
  graphemeBoundaryCodePointOffsets,
  type GraphemeSegmenterConstructor,
} from './grapheme';

function boundaries(text: string): number[] {
  return [...graphemeBoundaryCodePointOffsets(text)].sort((a, b) => a - b);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('graphemeBoundaryCodePointOffsets (M9)', () => {
  it('G-01 keeps ordinary Latin boundaries valid', () => {
    expect(boundaries('abc')).toEqual([0, 1, 2, 3]);
  });

  it('G-02 keeps a standalone non-BMP emoji as one grapheme', () => {
    expect(boundaries('🙂')).toEqual([0, 1]);
  });

  it('G-03 rejects the code-point boundary inside emoji + skin tone', () => {
    expect(boundaries('👍🏽')).toEqual([0, 2]);
  });

  it('G-04 rejects every internal code-point boundary of a ZWJ family', () => {
    expect(boundaries('👨‍👩‍👧‍👦')).toEqual([0, 7]);
  });

  it('G-05 rejects the internal regional-indicator flag boundary', () => {
    expect(boundaries('🇺🇳')).toEqual([0, 2]);
  });

  it('G-06 keeps an NFC-stable combining grapheme indivisible', () => {
    const text = 'x\u0301';
    expect(text.normalize('NFC')).toBe(text);
    expect(Array.from(text)).toHaveLength(2);
    expect(boundaries(text)).toEqual([0, 2]);
  });

  it('G-07 exposes exact outer boundaries around a complex grapheme', () => {
    expect(boundaries('A👍🏽B')).toEqual([0, 1, 3, 4]);
  });

  it('G-08 includes content start and end boundaries', () => {
    const text = 'ab🙂';
    const result = boundaries(text);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(Array.from(text).length);
  });

  it('G-09 exposes only boundary zero for empty content', () => {
    expect(boundaries('')).toEqual([0]);
  });

  it('G-10 fails closed when Intl.Segmenter is unavailable', () => {
    vi.stubGlobal('Intl', { Segmenter: undefined });
    expect(() => graphemeBoundaryCodePointOffsets('abc')).toThrow(
      GraphemeSegmenterUnavailableError,
    );
  });

  it('G-11 converts Segmenter UTF-16 indices into code-point offsets', () => {
    // Native UTF-16 boundaries are [0, 2, 3]; canonical boundaries are [0, 1, 2].
    expect(boundaries('🙂a')).toEqual([0, 1, 2]);
  });

  it('fails closed when a Segmenter result is malformed or non-tiling', () => {
    class BrokenSegmenter {
      segment(): Iterable<{ segment: string; index: number }> {
        return [{ segment: 'a', index: 1 }];
      }
    }
    expect(() =>
      graphemeBoundaryCodePointOffsets(
        'a',
        BrokenSegmenter as unknown as GraphemeSegmenterConstructor,
      ),
    ).toThrow(GraphemeSegmenterUnavailableError);
  });

  it('G-12 derives validity from content alone, without a language-tag input', () => {
    const text = 'A👍🏽B';
    expect(boundaries(text)).toEqual([0, 1, 3, 4]);
  });
});
