import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GraphemeSegmenterUnavailableError,
  graphemeBoundaryCodePointOffsets,
  type GraphemeSegmenterConstructor,
} from './grapheme';

// Observe real shared conversion work; return values and thrown errors are unchanged.
const conversionWork = vi.hoisted(() => ({
  calls: 0,
  textUtf16Units: 0,
  prefixUtf16Units: 0,
  codePoints: 0,
}));

vi.mock('./offset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./offset')>();
  return {
    ...actual,
    utf16OffsetToCodePointOffset(text: string, offset: number) {
      const result = actual.utf16OffsetToCodePointOffset(text, offset);
      conversionWork.calls += 1;
      conversionWork.textUtf16Units += text.length;
      conversionWork.prefixUtf16Units += offset;
      conversionWork.codePoints += result;
      return result;
    },
  };
});

beforeEach(() => {
  Object.assign(conversionWork, {
    calls: 0, textUtf16Units: 0, prefixUtf16Units: 0, codePoints: 0,
  });
});

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

describe('R3 work-budget regression', () => {
  it.each([1024, 2048])('keeps real ASCII conversion work linear at N=%i', (length) => {
    const text = 'a'.repeat(length);
    // For ASCII every integer boundary is legal; this oracle does not use offset helpers.
    expect(boundaries(text)).toEqual(Array.from({ length: length + 1 }, (_, index) => index));
    console.info('R3_WORK_BUDGET', JSON.stringify({ length, ...conversionWork }));
    expect(conversionWork.calls).toBeGreaterThan(0);
    expect(conversionWork.codePoints).toBeLessThanOrEqual(2 * length);
    expect(conversionWork.prefixUtf16Units).toBeLessThanOrEqual(2 * text.length);
    expect(conversionWork.textUtf16Units).toBeLessThanOrEqual(2 * text.length);
  });
});

describe('R3 cumulative conversion correctness and fail-closed validation', () => {
  it('keeps every canonical boundary of mixed-width and non-uniform graphemes', () => {
    const text = 'A🙂👍🏽👨‍👩‍👧‍👦x\u0301🇺🇳B';
    expect(boundaries(text)).toEqual([0, 1, 2, 4, 11, 13, 15, 16]);
    expect(conversionWork.calls).toBeGreaterThan(0);
    expect(conversionWork.codePoints).toBeLessThanOrEqual(32);
    expect(conversionWork.prefixUtf16Units).toBeLessThanOrEqual(2 * text.length);
  });

  it('uses the complete RI context when an odd indicator remains', () => {
    expect(boundaries('🇦🇧🇨')).toEqual([0, 2, 3]);
  });

  it('segments complete canonical content once and never individual fragments', () => {
    const segment = vi.fn((text: string) => {
      expect(text).toBe('A👍🏽B');
      return [
        { segment: 'A', index: 0 },
        { segment: '👍🏽', index: 1 },
        { segment: 'B', index: 5 },
      ];
    });
    class RecordingSegmenter {
      constructor(locale: string | undefined, options: { granularity: 'grapheme' }) {
        expect(locale).toBeUndefined();
        expect(options).toEqual({ granularity: 'grapheme' });
      }
      segment = segment;
    }
    expect([...graphemeBoundaryCodePointOffsets('A👍🏽B', RecordingSegmenter)])
      .toEqual([0, 1, 3, 4]);
    expect(segment).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'duplicate indices', text: 'ab', parts: [
      { segment: 'a', index: 0 }, { segment: 'a', index: 0 }, { segment: 'b', index: 1 },
    ] },
    { name: 'descending indices after a valid prefix', text: 'abc', parts: [
      { segment: 'ab', index: 0 }, { segment: 'c', index: 2 }, { segment: 'b', index: 1 },
    ] },
    { name: 'out-of-range index', text: 'ab', parts: [
      { segment: 'ab', index: 0 }, { segment: 'x', index: 3 },
    ] },
    { name: 'negative index', text: 'ab', parts: [
      { segment: 'a', index: 0 }, { segment: 'b', index: -1 },
    ] },
    { name: 'fractional index', text: 'ab', parts: [
      { segment: 'a', index: 0 }, { segment: 'b', index: 1.5 },
    ] },
    { name: 'nonzero first index', text: 'ab', parts: [{ segment: 'b', index: 1 }] },
    { name: 'gap in exact tiling', text: 'abc', parts: [
      { segment: 'a', index: 0 }, { segment: 'c', index: 2 },
    ] },
    { name: 'overlapping segment text', text: 'abc', parts: [
      { segment: 'ab', index: 0 }, { segment: 'bc', index: 1 },
    ] },
    { name: 'incorrect segment text', text: 'ab', parts: [
      { segment: 'x', index: 0 }, { segment: 'b', index: 1 },
    ] },
    { name: 'late incorrect text after two valid segments', text: 'abc', parts: [
      { segment: 'a', index: 0 }, { segment: 'b', index: 1 }, { segment: 'x', index: 2 },
    ] },
    { name: 'truncated tiling', text: 'ab', parts: [{ segment: 'a', index: 0 }] },
    { name: 'empty output for nonempty content', text: 'ab', parts: [] },
    { name: 'nonempty output for empty content', text: '', parts: [{ segment: '', index: 0 }] },
    { name: 'surrogate pair split into locally valid halves', text: '🙂', parts: [
      { segment: '\ud83d', index: 0 }, { segment: '\ude42', index: 1 },
    ] },
  ])('fails closed for $name', ({ text, parts }) => {
    class MalformedSegmenter {
      segment() { return parts; }
    }
    expect(() => graphemeBoundaryCodePointOffsets(text, MalformedSegmenter))
      .toThrow(GraphemeSegmenterUnavailableError);
    // Failure cannot expose or cache a partial Set that contaminates recapture.
    expect(boundaries('A👍🏽B')).toEqual([0, 1, 3, 4]);
  });

  it('fails closed when Segmenter construction throws', () => {
    class ThrowingSegmenter {
      constructor() { throw new Error('unusable constructor'); }
      segment() { return []; }
    }
    expect(() => graphemeBoundaryCodePointOffsets('ab', ThrowingSegmenter))
      .toThrow(GraphemeSegmenterUnavailableError);
  });

  it('fails closed when segment() throws', () => {
    class ThrowingSegmenter {
      segment(): never { throw new Error('unusable segment'); }
    }
    expect(() => graphemeBoundaryCodePointOffsets('ab', ThrowingSegmenter))
      .toThrow(GraphemeSegmenterUnavailableError);
  });

  it('fails closed if the iterator throws after producing a valid prefix', () => {
    class ThrowingSegmenter {
      *segment() {
        yield { segment: 'a', index: 0 };
        throw new Error('late iterator failure');
      }
    }
    expect(() => graphemeBoundaryCodePointOffsets('ab', ThrowingSegmenter))
      .toThrow(GraphemeSegmenterUnavailableError);
  });
});

describe('R3 SCALE deterministic work verification (not browser timing)', () => {
  it('keeps real shared-conversion work bounded at 100000 ASCII code points', () => {
    const length = 100_000;
    const text = 'a'.repeat(length);
    expect(boundaries(text)).toEqual(Array.from({ length: length + 1 }, (_, index) => index));
    console.info('R3_SCALE_WORK', JSON.stringify({ length, ...conversionWork }));
    expect(conversionWork.calls).toBeGreaterThan(0);
    expect(conversionWork.codePoints).toBeLessThanOrEqual(2 * length);
    expect(conversionWork.prefixUtf16Units).toBeLessThanOrEqual(2 * text.length);
    expect(conversionWork.textUtf16Units).toBeLessThanOrEqual(2 * text.length);
  }, 15_000);
});

describe('R5 S01 same-value validation and conversion', () => {
  it('keeps the validated canonical boundaries when segment accessors change on later reads', () => {
    function changingPart(index: number, initial: string, subsequent: string) {
      let reads = 0;
      return {
        index,
        get segment() {
          reads += 1;
          return reads === 1 ? initial : subsequent;
        },
      };
    }
    class ChangingSegmenter {
      segment() {
        return [
          changingPart(0, 'A', 'AA'),
          changingPart(1, '👍🏽', 'x'),
          { index: 5, segment: 'B' },
        ];
      }
    }
    const actual = [...graphemeBoundaryCodePointOffsets('A👍🏽B', ChangingSegmenter)];
    console.info('R5_S01_BOUNDARIES', JSON.stringify({ actual, ...conversionWork }));
    // Literal full-content oracle; neither final length nor counters can prove this Set.
    expect(new Set(actual)).toEqual(new Set([0, 1, 3, 4]));
  });

  it('fails closed when reading a segment accessor throws', () => {
    class ThrowingAccessorSegmenter {
      segment() {
        return [{
          index: 0,
          get segment(): string { throw new Error('unusable segment accessor'); },
        }];
      }
    }
    expect(() => graphemeBoundaryCodePointOffsets('a', ThrowingAccessorSegmenter))
      .toThrow(GraphemeSegmenterUnavailableError);
  });
});


describe('R7 I01 per-yield primitive snapshot validation', () => {
  type ObservedPart = { index?: unknown; segment?: unknown };

  function offsetsWith(text: string, Segmenter: unknown): number[] {
    return [...graphemeBoundaryCodePointOffsets(text, Segmenter as GraphemeSegmenterConstructor)];
  }

  function expectFailClosed(text: string, Segmenter: unknown, label = 'unspecified'): void {
    let returned: number[] | undefined;
    let thrown: unknown;
    try {
      returned = offsetsWith(text, Segmenter);
    } catch (error) {
      thrown = error;
    }
    console.info('R7_I01_FAIL_CLOSED', JSON.stringify({ label, returned, thrownName: thrown instanceof Error ? thrown.name : null }));
    expect(returned).toBeUndefined();
    expect(thrown).toBeInstanceOf(GraphemeSegmenterUnavailableError);
    expect((thrown as Error).name).toBe('GraphemeSegmenterUnavailableError');
    // A rejected capture must not publish or cache a partial boundary set.
    expect(boundaries('A👍🏽B')).toEqual([0, 1, 3, 4]);
  }

  function fixedParts(parts: ObservedPart[]): unknown {
    return class FixedPartsSegmenter {
      segment() {
        return parts;
      }
    };
  }

  it('I01-01 rejects the R6 dynamic index schedule instead of accepting the incoherent set', () => {
    const readCounts = [0, 0, 0];
    const indexSchedules = [
      [0],
      [3, 3, 3, 3, 1, 1, 3],
      [3, 3, 3, 3, 3, 5, 5],
    ];
    const segmentValues = ['A👍', '👍', 'B'];
    class DynamicIndexSegmenter {
      segment() {
        return indexSchedules.map((schedule, part) => ({
          get index(): number {
            const position = Math.min(readCounts[part]!, schedule.length - 1);
            readCounts[part] = readCounts[part]! + 1;
            return schedule[position]!;
          },
          segment: segmentValues[part]!,
        }));
      }
    }
    let returned: number[] = [];
    let thrown: unknown;
    try {
      returned = offsetsWith('A👍🏽B', DynamicIndexSegmenter);
    } catch (error) {
      thrown = error;
    }
    console.info(
      'R7_I01_SCHEDULE_OBSERVATION',
      JSON.stringify({ returned, thrownName: thrown instanceof Error ? thrown.name : null, readCounts }),
    );
    // The legitimate complete boundary set for A👍🏽B is exactly {0,1,3,4}.
    // The inconsistent dynamic-index output {0,2,3,4} must fail closed.
    expect(thrown).toBeInstanceOf(GraphemeSegmenterUnavailableError);
    expect(returned).toEqual([]);
    // Design A captures each yielded index field exactly once.
    expect(readCounts).toEqual([1, 1, 1]);
  });

  it('I01-02 snapshots each yield when an iterator reuses one mutable record', () => {
    const yields = [
      { index: 0, segment: 'A' },
      { index: 1, segment: '👍🏽' },
      { index: 5, segment: 'B' },
    ];
    class ReusingRecordSegmenter {
      segment() {
        const record = { index: 0, segment: '' };
        let position = 0;
        return {
          [Symbol.iterator]() {
            return this;
          },
          next(): IteratorResult<{ index: number; segment: string }> {
            const next = yields[position];
            if (next === undefined) {
              return { done: true, value: undefined };
            }
            record.index = next.index;
            record.segment = next.segment;
            position += 1;
            return { done: false, value: record };
          },
        };
      }
    }
    expect(offsetsWith('A👍🏽B', ReusingRecordSegmenter)).toEqual([0, 1, 3, 4]);
  });

  it('I01-03 validates only the first captured observation of each field', () => {
    const indexReads = [0, 0, 0];
    const segmentReads = [0, 0, 0];
    const firstIndexes = [0, 1, 5];
    const laterIndexes = [0, 3, 1];
    const segmentValues = ['A', '👍🏽', 'B'];
    class DriftingAccessorsSegmenter {
      segment() {
        return segmentValues.map((segmentValue, part) => ({
          get index(): number {
            const read = indexReads[part]!;
            indexReads[part] = read + 1;
            return read === 0 ? firstIndexes[part]! : laterIndexes[part]!;
          },
          get segment(): string {
            segmentReads[part] = segmentReads[part]! + 1;
            return segmentValue;
          },
        }));
      }
    }
    expect(offsetsWith('A👍🏽B', DriftingAccessorsSegmenter)).toEqual([0, 1, 3, 4]);
    expect(indexReads).toEqual([1, 1, 1]);
    expect(segmentReads).toEqual([1, 1, 1]);
  });

  it('I01-04 never performs a forbidden second index read', () => {
    const indexReads = [0, 0, 0];
    const indexValues = [0, 1, 5];
    const segmentValues = ['A', '👍🏽', 'B'];
    class SecondReadThrowsSegmenter {
      segment() {
        return segmentValues.map((segmentValue, part) => ({
          get index(): number {
            const read = indexReads[part]!;
            indexReads[part] = read + 1;
            if (read > 0) {
              throw new Error('index must only be read once per yielded record');
            }
            return indexValues[part]!;
          },
          segment: segmentValue,
        }));
      }
    }
    expect(offsetsWith('A👍🏽B', SecondReadThrowsSegmenter)).toEqual([0, 1, 3, 4]);
    expect(indexReads).toEqual([1, 1, 1]);
  });

  it.each([0, 1, 2])('I01-05 fails closed when first capture of part %i throws', (position) => {
    const parts = [
      { index: 0, segment: 'A' },
      { index: 1, segment: '👍🏽' },
      { index: 5, segment: 'B' },
    ];
    class ThrowingIndexSegmenter {
      segment() {
        return parts.map((part, partIndex) =>
          partIndex === position
            ? {
                get index(): number {
                  throw new Error('unusable index accessor');
                },
                segment: part.segment,
              }
            : part,
        );
      }
    }
    expectFailClosed('A👍🏽B', ThrowingIndexSegmenter, 'throwing index accessor at ' + String(position));
    class ThrowingSegmentSegmenter {
      segment() {
        return parts.map((part, partIndex) =>
          partIndex === position
            ? {
                index: part.index,
                get segment(): string {
                  throw new Error('unusable segment accessor');
                },
              }
            : part,
        );
      }
    }
    expectFailClosed('A👍🏽B', ThrowingSegmentSegmenter, 'throwing segment accessor at ' + String(position));
  });

  it.each([
    { label: 'undefined', badIndex: undefined },
    { label: 'null', badIndex: null },
    { label: 'string', badIndex: '1' },
    { label: 'boxed number', badIndex: Object(1) },
    { label: 'plain object', badIndex: { value: 1 } },
    { label: 'bigint', badIndex: 1n },
    { label: 'NaN', badIndex: Number.NaN },
    { label: 'Infinity', badIndex: Number.POSITIVE_INFINITY },
    { label: 'fractional', badIndex: 1.5 },
    { label: 'negative', badIndex: -1 },
    { label: 'out of range', badIndex: 99 },
  ])('I01-06 rejects a $label nonlast index without coercion', ({ label, badIndex }) => {
    class WrongIndexSegmenter {
      segment() {
        return [
          { index: 0, segment: 'A' },
          { index: badIndex, segment: 'B' },
          { index: 2, segment: 'C' },
        ];
      }
    }
    expectFailClosed('ABC', WrongIndexSegmenter, 'wrong index type: ' + label);
  });

  it.each([
    { label: 'undefined', badSegment: undefined },
    { label: 'null', badSegment: null },
    { label: 'number', badSegment: 123 },
    { label: 'boxed string', badSegment: Object('A') },
    { label: 'plain object', badSegment: { text: 'A' } },
    { label: 'array', badSegment: [] },
  ])('I01-07 rejects a $label segment value without coercion', ({ label, badSegment }) => {
    class WrongSegmentSegmenter {
      segment() {
        return [{ index: 0, segment: badSegment }];
      }
    }
    expectFailClosed('A', WrongSegmentSegmenter, 'wrong segment type: ' + label);
  });

  it.each([
    { name: 'duplicate index', text: 'ABC', indexes: [0, 0, 2], segments: ['A', 'B', 'C'] },
    { name: 'descending index', text: 'ABC', indexes: [0, 2, 1], segments: ['AB', 'C', 'B'] },
    { name: 'out-of-range index', text: 'ABC', indexes: [0, 9, 2], segments: ['A', 'B', 'C'] },
    { name: 'gap in tiling', text: 'ABC', indexes: [0, 1], segments: ['A', 'C'] },
    { name: 'overlap in tiling', text: 'ABC', indexes: [0, 1], segments: ['AB', 'BC'] },
    { name: 'incomplete tiling', text: 'ABC', indexes: [0], segments: ['A'] },
    { name: 'repeated start tiling', text: 'ABC', indexes: [0, 0], segments: ['A', 'A'] },
    { name: 'nonzero first index', text: 'ABC', indexes: [1], segments: ['ABC'] },
  ])('I01-08 rejects $name', ({ name, text, indexes, segments }) => {
    const parts = indexes.map((index, part) => ({ index, segment: segments[part] }));
    expectFailClosed(text, fixedParts(parts), name);
  });

  it('I01-09 rejects a globally surrogate-splitting boundary even when every local slice matches', () => {
    class SurrogateCutSegmenter {
      segment() {
        return [
          { index: 0, segment: 'A' },
          { index: 1, segment: '\ud83d' },
          { index: 2, segment: '\udc4d' },
          { index: 3, segment: '🏽' },
          { index: 5, segment: 'B' },
        ];
      }
    }
    expectFailClosed('A👍🏽B', SurrogateCutSegmenter, 'surrogate internal cut');
  });

  it('I01-10 keeps the complete valid A👍🏽B boundary set', () => {
    class StableSegmenter {
      segment() {
        return [
          { index: 0, segment: 'A' },
          { index: 1, segment: '👍🏽' },
          { index: 5, segment: 'B' },
        ];
      }
    }
    expect(offsetsWith('A👍🏽B', StableSegmenter)).toEqual([0, 1, 3, 4]);
    expect(boundaries('A👍🏽B')).toEqual([0, 1, 3, 4]);
  });

  it('I01-11 keeps the empty-content rules exact', () => {
    class EmptyPartsSegmenter {
      segment() {
        return [];
      }
    }
    expect(offsetsWith('', EmptyPartsSegmenter)).toEqual([0]);
    class NonEmptyPartsSegmenter {
      segment() {
        return [{ index: 0, segment: '' }];
      }
    }
    expectFailClosed('', NonEmptyPartsSegmenter, 'nonempty parts for empty content');
  });

  it('I01-12 fails closed for malformed iterator protocol values', () => {
    class NonObjectStepSegmenter {
      segment() {
        return {
          [Symbol.iterator]() {
            let emitted = false;
            return {
              next(): IteratorResult<ObservedPart> {
                if (!emitted) {
                  emitted = true;
                  return 42 as unknown as IteratorResult<ObservedPart>;
                }
                return { done: true, value: undefined };
              },
            };
          },
        };
      }
    }
    expectFailClosed('A', NonObjectStepSegmenter, 'non-object iterator step');
    class NonObjectRecordSegmenter {
      segment() {
        return {
          [Symbol.iterator]() {
            let emitted = false;
            return {
              next(): IteratorResult<ObservedPart> {
                if (!emitted) {
                  emitted = true;
                  return { done: false, value: 'A' as unknown as ObservedPart };
                }
                return { done: true, value: undefined };
              },
            };
          },
        };
      }
    }
    expectFailClosed('A', NonObjectRecordSegmenter, 'non-object yielded record');
  });
});

