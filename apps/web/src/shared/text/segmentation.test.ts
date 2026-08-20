/**
 * Boundary segmentation tests (M0.4) — spec section 27 / report section 8.
 *
 * Overlapping persisted Spans are represented by membership sets on the same
 * minimal run; run text is code-point-safe; concatenated run text equals the
 * canonical content exactly.
 */

import { describe, expect, it } from 'vitest';
import { codePointLength } from './offset';
import { segmentText, type SpanBoundary } from './segmentation';

const NO_GROUPS = () => [] as string[];

function span(id: string, start: number, end: number): SpanBoundary {
  return { id, start_offset: start, end_offset: end };
}

function runSummary(
  content: string,
  spans: SpanBoundary[],
  groups: (spanId: string) => string[] = NO_GROUPS,
) {
  return segmentText(content, spans, groups).map((run) => ({
    start: run.start,
    end: run.end,
    text: run.text,
    spanIds: run.spanIds,
    alignmentGroupIds: run.alignmentGroupIds,
  }));
}

function assertTiling(content: string, runs: ReturnType<typeof runSummary>) {
  expect(runs.map((run) => run.text).join('')).toBe(content);
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    expect(run.start).toBeGreaterThanOrEqual(0);
    expect(run.end).toBeGreaterThan(run.start);
    expect(run.end).toBeLessThanOrEqual(codePointLength(content));
    expect(run.text).toBe(
      Array.from(content).slice(run.start, run.end).join(''),
    );
    if (i > 0) {
      expect(runs[i - 1].end).toBe(run.start);
    }
  }
}

describe('segmentText', () => {
  it('returns no runs for empty content (no invented run)', () => {
    expect(segmentText('', [], NO_GROUPS)).toEqual([]);
  });

  it('creates a single whole-content run when there are no spans', () => {
    const runs = segmentText('hello world', [], NO_GROUPS);
    expect(runs).toEqual([
      { start: 0, end: 11, text: 'hello world', spanIds: [], alignmentGroupIds: [] },
    ]);
  });

  it('splits around one Span', () => {
    const runs = runSummary('hello world', [span('s1', 0, 5)]);
    expect(runs).toEqual([
      { start: 0, end: 5, text: 'hello', spanIds: ['s1'], alignmentGroupIds: [] },
      { start: 5, end: 11, text: ' world', spanIds: [], alignmentGroupIds: [] },
    ]);
    assertTiling('hello world', runs);
  });

  it('supports adjacent Spans (allowed by the alignment invariant)', () => {
    const runs = runSummary('abcdef', [
      span('s1', 0, 3),
      span('s2', 3, 6),
    ]);
    expect(runs).toEqual([
      { start: 0, end: 3, text: 'abc', spanIds: ['s1'], alignmentGroupIds: [] },
      { start: 3, end: 6, text: 'def', spanIds: ['s2'], alignmentGroupIds: [] },
    ]);
    assertTiling('abcdef', runs);
  });

  it('represents overlapping Spans as membership sets on the same minimal run', () => {
    // A = [10,20), B = [15,25) -> boundaries 0,10,15,20,25,len
    const content = '0123456789abcdefghijklmnopqrstuvwxyz'; // len 36
    const runs = runSummary(content, [span('A', 10, 20), span('B', 15, 25)]);
    expect(runs.map((run) => [run.start, run.end])).toEqual([
      [0, 10],
      [10, 15],
      [15, 20],
      [20, 25],
      [25, 36],
    ]);
    expect(runs[1]).toMatchObject({ spanIds: ['A'] });
    expect(runs[2]).toMatchObject({ spanIds: ['A', 'B'] }); // [15,20) in both
    expect(runs[3]).toMatchObject({ spanIds: ['B'] });
    expect(runs[0].spanIds).toEqual([]);
    expect(runs[4].spanIds).toEqual([]);
    assertTiling(content, runs);
  });

  it('supports nested Spans', () => {
    const runs = runSummary('abcdefgh', [
      span('outer', 1, 7),
      span('inner', 3, 5),
    ]);
    expect(runs.map((run) => [run.start, run.end, run.spanIds])).toEqual([
      [0, 1, []],
      [1, 3, ['outer']],
      [3, 5, ['inner', 'outer']],
      [5, 7, ['outer']],
      [7, 8, []],
    ]);
    assertTiling('abcdefgh', runs);
  });

  it('handles multiple Spans sharing a boundary', () => {
    const runs = runSummary('abcdef', [
      span('a', 0, 2),
      span('b', 0, 2),
      span('c', 2, 4),
      span('d', 4, 6),
    ]);
    expect(runs[0]).toMatchObject({ start: 0, end: 2, spanIds: ['a', 'b'] });
    expect(runs[1]).toMatchObject({ start: 2, end: 4, spanIds: ['c'] });
    expect(runs[2]).toMatchObject({ start: 4, end: 6, spanIds: ['d'] });
    assertTiling('abcdef', runs);
  });

  it('supports Unicode / non-BMP boundaries without corrupting text', () => {
    const content = 'A🙂B'; // code points 0:A 1:🙂 2:B
    const runs = runSummary(content, [span('emoji', 1, 2)]);
    expect(runs).toEqual([
      { start: 0, end: 1, text: 'A', spanIds: [], alignmentGroupIds: [] },
      { start: 1, end: 2, text: '🙂', spanIds: ['emoji'], alignmentGroupIds: [] },
      { start: 2, end: 3, text: 'B', spanIds: [], alignmentGroupIds: [] },
    ]);
    assertTiling(content, runs);

    const mixed = 'Café 🙂 mañana für français';
    const mixedRuns = runSummary(mixed, [span('part', 5, 13)]);
    expect(mixedRuns[0].text).toBe('Café ');
    expect(mixedRuns[1]).toMatchObject({ start: 5, end: 13, text: '🙂 mañana' });
    expect(mixedRuns[2].text).toBe(' für français');
    assertTiling(mixed, mixedRuns);
  });

  it('aggregates alignment-group membership from the lookup', () => {
    const groups = (spanId: string): string[] => {
      const map: Record<string, string[]> = {
        a: ['g1'],
        b: ['g1', 'g2'],
        c: ['g2'],
      };
      return map[spanId] ?? [];
    };
    const runs = runSummary('abcdef', [span('a', 0, 2), span('b', 2, 4), span('c', 4, 6)], groups);
    expect(runs[0].alignmentGroupIds).toEqual(['g1']);
    expect(runs[1].alignmentGroupIds).toEqual(['g1', 'g2']);
    expect(runs[2].alignmentGroupIds).toEqual(['g2']);
  });

  it('is deterministic for the same input', () => {
    const spans = [span('b', 0, 2), span('a', 1, 3), span('c', 0, 4)];
    const first = segmentText('abcd', spans, NO_GROUPS);
    const second = segmentText('abcd', [...spans].reverse(), NO_GROUPS);
    expect(first).toEqual(second);
    expect(first.map((run) => run.spanIds)).toEqual([
      ['b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'c'],
      ['c'],
    ]);
  });

  it('rejects structurally invalid spans (fail closed)', () => {
    expect(() => segmentText('abc', [span('bad', 2, 1)], NO_GROUPS)).toThrow(RangeError);
    expect(() => segmentText('abc', [span('bad', -1, 2)], NO_GROUPS)).toThrow(RangeError);
    expect(() => segmentText('abc', [span('bad', 0, 5)], NO_GROUPS)).toThrow(RangeError);
    expect(() => segmentText('abc', [span('bad', 0.5, 2)], NO_GROUPS)).toThrow(RangeError);
  });
});
