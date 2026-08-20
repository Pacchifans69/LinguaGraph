/**
 * Boundary segmentation (M0.4) — canonical text + persisted spans -> flat
 * minimal runs (spec section 27; report section 8).
 *
 * Boundaries are `0`, `codePointLength(content)`, and every span
 * start/end. Each adjacent boundary pair becomes one RunDescriptor whose
 * `spanIds` / `alignmentGroupIds` are the membership sets of every span
 * covering the run, so overlapping persisted Spans are represented by
 * membership sets on the same minimal run (never by duplicated DOM text).
 *
 * Complexity (output-sensitive; dense overlap can make total emitted
 * membership cardinality quadratic in the number of spans):
 *
 *   S   = input span count
 *   N   = canonical content code points
 *   T   = run count (T <= 2S + 1)
 *   A_r = active span count for run r (the run's spanIds cardinality)
 *   G_r = group-membership entries inspected for run r
 *   H_r = unique emitted alignment-group ids for run r
 *
 *   O( S log S
 *      + N
 *      + T
 *      + sum_r( A_r log A_r      // [...active].sort() per run
 *             + G_r              // membership inspection
 *             + H_r log H_r ) )  // [...groupIdSet].sort() per run
 *
 * Dense overlap is therefore quadratic only in the EMITTED membership
 * cardinality (every run lists every overlapping span), which no
 * segmentation can avoid; this is not the same as scanning all S spans for
 * every run regardless of activity, and the sweep-set keeps inactive spans
 * out of the per-run work entirely.
 *
 * Deterministic output: spans are processed in (start, end, id) order;
 * `spanIds` and `alignmentGroupIds` are sorted.
 */

import { codePointLength } from './offset';
import type { CodePointOffset, RunDescriptor } from './types';

/** Minimal structural span input (persisted WorkspaceSpan coordinates). */
export interface SpanBoundary {
  id: string;
  start_offset: CodePointOffset;
  end_offset: CodePointOffset;
}

function byStartEndId(a: SpanBoundary, b: SpanBoundary): number {
  return (
    a.start_offset - b.start_offset ||
    a.end_offset - b.end_offset ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function assertValidSpan(span: SpanBoundary): void {
  if (!Number.isInteger(span.start_offset) || !Number.isInteger(span.end_offset)) {
    throw new RangeError(`span ${span.id} offsets must be integers`);
  }
  if (span.start_offset < 0 || span.end_offset <= span.start_offset) {
    throw new RangeError(
      `span ${span.id} has invalid bounds [${span.start_offset}, ${span.end_offset})`,
    );
  }
}

/**
 * Segment `content` into minimal runs using the given span boundaries.
 *
 * `alignmentGroupIdsOfSpan` maps one span id to the alignment-group ids it
 * participates in (from the workspace memberships); the membership set of a
 * run is the union of its spans' group ids.
 *
 * For empty content, no run is invented (returns []).
 * Throws RangeError when a span is structurally invalid (fail closed).
 */
export function segmentText(
  content: string,
  spans: SpanBoundary[],
  alignmentGroupIdsOfSpan: (spanId: string) => string[],
): RunDescriptor[] {
  const length = codePointLength(content);

  const sorted = [...spans].sort(byStartEndId);
  for (const span of sorted) {
    assertValidSpan(span);
    if (span.end_offset > length) {
      throw new RangeError(
        `span ${span.id} end ${span.end_offset} exceeds content length ${length}`,
      );
    }
  }

  if (length === 0) {
    return [];
  }

  // Event tables: spans entering/leaving the active set at each boundary.
  const addsAt = new Map<number, SpanBoundary[]>();
  const removesAt = new Map<number, SpanBoundary[]>();
  const boundaries = new Set<number>([0, length]);
  for (const span of sorted) {
    (addsAt.get(span.start_offset) ?? addsAt.set(span.start_offset, []).get(span.start_offset)!)
      .push(span);
    (removesAt.get(span.end_offset) ?? removesAt.set(span.end_offset, []).get(span.end_offset)!)
      .push(span);
    boundaries.add(span.start_offset);
    boundaries.add(span.end_offset);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);

  // One code-point array serves every run: O(N) total, no per-run
  // full-string re-conversion (report section 8).
  const codePoints = Array.from(content);

  const active = new Set<string>();
  const runs: RunDescriptor[] = [];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const boundary = ordered[i];
    const next = ordered[i + 1];

    // Spans ending exactly at `boundary` do not cover (boundary, next);
    // spans starting exactly at `boundary` do. Remove-then-add keeps the
    // membership set exact at shared boundaries.
    for (const span of removesAt.get(boundary) ?? []) {
      active.delete(span.id);
    }
    for (const span of addsAt.get(boundary) ?? []) {
      active.add(span.id);
    }

    const spanIds = [...active].sort();
    const groupIdSet = new Set<string>();
    for (const spanId of spanIds) {
      for (const groupId of alignmentGroupIdsOfSpan(spanId)) {
        groupIdSet.add(groupId);
      }
    }

    runs.push({
      start: boundary,
      end: next,
      text: codePoints.slice(boundary, next).join(''),
      spanIds,
      alignmentGroupIds: [...groupIdSet].sort(),
    });
  }

  return runs;
}
