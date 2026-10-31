/**
 * M9 grapheme-boundary validation for NEW native TextPanel authoring.
 *
 * Persisted/API coordinates remain Unicode code-point offsets (ADR-001).
 * Intl.Segmenter reports UTF-16 indices, so every boundary is converted
 * through the shared offset utility before it can participate in authoring
 * validation. The complete canonical TextVersion.content is the only content
 * authority; language tags and rendered run boundaries are deliberately not
 * inputs.
 */

import {
  codePointLength,
  splitsSurrogatePair,
  utf16OffsetToCodePointOffset,
} from './offset';
import type { CodePointOffset } from './types';

interface GraphemePart {
  segment: string;
  index: number;
}

interface GraphemeSegmenter {
  segment(text: string): Iterable<GraphemePart>;
}

export interface GraphemeSegmenterConstructor {
  new (
    locale: string | undefined,
    options: { granularity: 'grapheme' },
  ): GraphemeSegmenter;
}

export class GraphemeSegmenterUnavailableError extends Error {
  constructor() {
    super('Intl.Segmenter grapheme capability is unavailable or unusable in this runtime');
    this.name = 'GraphemeSegmenterUnavailableError';
  }
}

function runtimeSegmenterConstructor(): GraphemeSegmenterConstructor | undefined {
  if (typeof Intl === 'undefined') {
    return undefined;
  }
  const candidate = (
    Intl as unknown as { Segmenter?: GraphemeSegmenterConstructor }
  ).Segmenter;
  return typeof candidate === 'function' ? candidate : undefined;
}

/**
 * One private primitive snapshot of a yielded segmentation record.
 *
 * The fields are deliberately `unknown`: their runtime types are validated
 * explicitly and are never coerced.
 */
interface GraphemeSnapshot {
  readonly index: unknown;
  readonly segment: unknown;
}

/**
 * Return every valid extended-grapheme boundary as a canonical code-point
 * offset. Any missing, throwing, malformed, non-tiling, or otherwise
 * incoherent platform segmentation result fails closed with one stable
 * capability error; there is no code-point-only fallback.
 */
export function graphemeBoundaryCodePointOffsets(
  text: string,
  constructor?: GraphemeSegmenterConstructor,
): ReadonlySet<CodePointOffset> {
  const Segmenter = constructor ?? runtimeSegmenterConstructor();
  if (Segmenter === undefined) {
    throw new GraphemeSegmenterUnavailableError();
  }

  try {
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });

    // I01: read each yielded record's index and segment exactly once, at the
    // moment the iterator yields it, and retain only those primitives. Later
    // validation and conversion never touch the yielded objects again, so an
    // iterator that reuses/mutates a record or exposes drifting accessors
    // cannot change an already-captured observation.
    const iterator = segmenter.segment(text)[Symbol.iterator]();
    const snapshots: GraphemeSnapshot[] = [];
    for (;;) {
      const step = iterator.next();
      if (typeof step !== 'object' || step === null) {
        throw new RangeError('grapheme segmentation iterator returned a non-object step');
      }
      if (step.done) {
        break;
      }
      const record: unknown = step.value;
      if (typeof record !== 'object' || record === null) {
        throw new RangeError('grapheme segmentation yielded a non-object record');
      }
      const fields = record as { index?: unknown; segment?: unknown };
      snapshots.push({ index: fields.index, segment: fields.segment });
    }

    if (text.length === 0) {
      if (snapshots.length !== 0) {
        throw new RangeError('empty canonical content must produce no grapheme segments');
      }
      return new Set<CodePointOffset>([0]);
    }

    if (snapshots.length === 0) {
      throw new RangeError('grapheme segmentation must expose at least one segment');
    }

    // Complete primitive type validation before any semantic validation.
    const indexes: number[] = [];
    const segments: string[] = [];
    for (const snapshot of snapshots) {
      const rawIndex = snapshot.index;
      const rawSegment = snapshot.segment;
      if (
        typeof rawIndex !== 'number' ||
        !Number.isInteger(rawIndex) ||
        !Number.isFinite(rawIndex)
      ) {
        throw new RangeError('grapheme segmentation index is not an integer');
      }
      if (typeof rawSegment !== 'string') {
        throw new RangeError('grapheme segmentation segment is not a string');
      }
      indexes.push(rawIndex);
      segments.push(rawSegment);
    }

    if (indexes[0] !== 0) {
      throw new RangeError('grapheme segmentation must begin at UTF-16 offset zero');
    }

    const boundaries = new Set<CodePointOffset>();
    const partCount = snapshots.length;
    let expectedUtf16Start = 0;
    let canonicalOffset: CodePointOffset = 0;

    for (let index = 0; index < partCount; index += 1) {
      const start = indexes[index]!;
      const segment = segments[index]!;
      // Adjacent starts/ends come from this same snapshot table; a nonlast
      // end is never replaced by a nullish fallback.
      const end = index + 1 < partCount ? indexes[index + 1]! : text.length;

      if (
        start !== expectedUtf16Start ||
        start < 0 ||
        end <= start ||
        end > text.length
      ) {
        throw new RangeError('grapheme segmentation contains incoherent UTF-16 boundaries');
      }
      if (text.slice(start, end) !== segment) {
        throw new RangeError('grapheme segmentation does not tile canonical content exactly');
      }

      if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
        throw new RangeError('grapheme segmentation splits a canonical surrogate pair');
      }

      // Exact tiling at full-content code-point boundaries makes the shared
      // segment-local conversions additive, without rescanning text prefixes.
      boundaries.add(canonicalOffset);
      canonicalOffset += utf16OffsetToCodePointOffset(segment, segment.length);
      boundaries.add(canonicalOffset);
      expectedUtf16Start = end;
    }

    const canonicalLength = codePointLength(text);
    if (
      expectedUtf16Start !== text.length ||
      canonicalOffset !== canonicalLength ||
      !boundaries.has(0) ||
      !boundaries.has(canonicalLength)
    ) {
      throw new RangeError('grapheme segmentation does not expose a complete boundary set');
    }

    return boundaries;
  } catch (cause) {
    if (cause instanceof GraphemeSegmenterUnavailableError) {
      throw cause;
    }
    throw new GraphemeSegmenterUnavailableError();
  }
}
