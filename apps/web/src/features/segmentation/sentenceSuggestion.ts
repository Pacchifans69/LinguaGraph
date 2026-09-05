/**
 * Locale-sensitive sentence suggestion adapter (M2).
 *
 * Intl.Segmenter reports UTF-16 code-unit indices. Every persisted candidate
 * boundary is converted through the shared canonical offset utility.
 */

import {
  codePointLength,
  utf16OffsetToCodePointOffset,
} from '../../shared/text/offset';

export interface SegmentDraft {
  start: number;
  end: number;
}

interface SegmentData {
  segment: string;
  index: number;
}

interface SentenceSegmenter {
  segment(text: string): Iterable<SegmentData>;
  resolvedOptions(): { locale: string };
}

interface SentenceSegmenterConstructor {
  new (
    locale: string,
    options: { granularity: 'sentence' },
  ): SentenceSegmenter;
}

export interface SentenceSuggestion {
  requestedLocale: string;
  resolvedLocale: string;
  ranges: SegmentDraft[];
}

export class IntlSegmenterUnavailableError extends Error {
  constructor() {
    super('Intl.Segmenter is unavailable in this runtime');
    this.name = 'IntlSegmenterUnavailableError';
  }
}

export function hasIntlSentenceSegmenter(): boolean {
  return (
    typeof Intl !== 'undefined' &&
    typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function'
  );
}

export function manualSentencePartition(text: string): SegmentDraft[] {
  const length = codePointLength(text);
  return length === 0 ? [] : [{ start: 0, end: length }];
}

export function suggestSentences(
  text: string,
  requestedLocale: string,
  constructor?: SentenceSegmenterConstructor,
): SentenceSuggestion {
  const Segmenter =
    constructor ??
    ((Intl as unknown as { Segmenter?: SentenceSegmenterConstructor }).Segmenter);
  if (!Segmenter) {
    throw new IntlSegmenterUnavailableError();
  }

  const segmenter = new Segmenter(requestedLocale, {
    granularity: 'sentence',
  });
  const parts = Array.from(segmenter.segment(text));

  if (text.length === 0) {
    if (parts.length !== 0) {
      throw new RangeError('sentence suggestion for empty text must be empty');
    }
    return {
      requestedLocale,
      resolvedLocale: segmenter.resolvedOptions().locale,
      ranges: [],
    };
  }
  if (parts.length === 0 || parts[0]?.index !== 0) {
    throw new RangeError('sentence suggestion does not begin at canonical offset zero');
  }
  if (parts.map((part) => part.segment).join('') !== text) {
    throw new RangeError('sentence suggestion does not tile canonical text');
  }

  const ranges = parts.map((part, index) => {
    const next = parts[index + 1];
    const endUtf16 = next?.index ?? text.length;
    if (part.index < 0 || endUtf16 <= part.index || endUtf16 > text.length) {
      throw new RangeError('sentence suggestion contains invalid UTF-16 boundaries');
    }
    if (text.slice(part.index, endUtf16) !== part.segment) {
      throw new RangeError('sentence suggestion segment text is inconsistent');
    }
    return {
      start: utf16OffsetToCodePointOffset(text, part.index),
      end: utf16OffsetToCodePointOffset(text, endUtf16),
    };
  });

  assertCompletePartition(text, ranges);
  return {
    requestedLocale,
    resolvedLocale: segmenter.resolvedOptions().locale,
    ranges,
  };
}

export function assertCompletePartition(
  text: string,
  ranges: readonly SegmentDraft[],
): void {
  const length = codePointLength(text);
  if (length === 0) {
    if (ranges.length !== 0) {
      throw new RangeError('empty text must have no segments');
    }
    return;
  }
  if (ranges.length === 0) {
    throw new RangeError('non-empty text requires at least one segment');
  }

  let expectedStart = 0;
  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start !== expectedStart ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > length
    ) {
      throw new RangeError('segments must form one ordered complete partition');
    }
    expectedStart = range.end;
  }
  if (expectedStart !== length) {
    throw new RangeError('segments must end at canonical text length');
  }
}

export function splitSegment(
  text: string,
  ranges: readonly SegmentDraft[],
  index: number,
  offset: number,
): SegmentDraft[] {
  assertCompletePartition(text, ranges);
  const target = ranges[index];
  if (
    !target ||
    !Number.isInteger(offset) ||
    offset <= target.start ||
    offset >= target.end
  ) {
    throw new RangeError('split offset must be inside the selected segment');
  }
  const next = [
    ...ranges.slice(0, index),
    { start: target.start, end: offset },
    { start: offset, end: target.end },
    ...ranges.slice(index + 1),
  ];
  assertCompletePartition(text, next);
  return next;
}

export function mergeWithPrevious(
  text: string,
  ranges: readonly SegmentDraft[],
  index: number,
): SegmentDraft[] {
  assertCompletePartition(text, ranges);
  if (index <= 0 || index >= ranges.length) {
    throw new RangeError('merge target must have a previous adjacent segment');
  }
  const previous = ranges[index - 1]!;
  const current = ranges[index]!;
  if (previous.end !== current.start) {
    throw new RangeError('only adjacent segments can be merged');
  }
  const next = [
    ...ranges.slice(0, index - 1),
    { start: previous.start, end: current.end },
    ...ranges.slice(index + 1),
  ];
  assertCompletePartition(text, next);
  return next;
}
