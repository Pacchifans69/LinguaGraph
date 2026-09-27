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
    const parts = Array.from(segmenter.segment(text));

    if (text.length === 0) {
      if (parts.length !== 0) {
        throw new RangeError('empty canonical content must produce no grapheme segments');
      }
      return new Set<CodePointOffset>([0]);
    }

    if (parts.length === 0 || parts[0]?.index !== 0) {
      throw new RangeError('grapheme segmentation must begin at UTF-16 offset zero');
    }

    const boundaries = new Set<CodePointOffset>();
    let expectedUtf16Start = 0;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const nextUtf16 = parts[index + 1]?.index ?? text.length;

      if (
        !Number.isInteger(part.index) ||
        !Number.isInteger(nextUtf16) ||
        part.index !== expectedUtf16Start ||
        part.index < 0 ||
        nextUtf16 <= part.index ||
        nextUtf16 > text.length
      ) {
        throw new RangeError('grapheme segmentation contains incoherent UTF-16 boundaries');
      }
      if (text.slice(part.index, nextUtf16) !== part.segment) {
        throw new RangeError('grapheme segmentation does not tile canonical content exactly');
      }

      boundaries.add(utf16OffsetToCodePointOffset(text, part.index));
      boundaries.add(utf16OffsetToCodePointOffset(text, nextUtf16));
      expectedUtf16Start = nextUtf16;
    }

    const canonicalLength = codePointLength(text);
    if (
      expectedUtf16Start !== text.length ||
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
