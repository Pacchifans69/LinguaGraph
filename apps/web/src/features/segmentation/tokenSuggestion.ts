import {
  codePointLength,
  sliceByCodePoints,
  utf16OffsetToCodePointOffset,
} from '../../shared/text/offset';
import { assertCompletePartition, type SegmentDraft } from './sentenceSuggestion';

export interface TokenDraft extends SegmentDraft {
  isWordLike: boolean;
}

interface WordPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface WordSegmenter {
  segment(text: string): Iterable<WordPart>;
  resolvedOptions(): { locale: string };
}

interface WordSegmenterConstructor {
  new (locale: string, options: { granularity: 'word' }): WordSegmenter;
}

export class IntlWordSegmenterUnavailableError extends Error {}

export function hasIntlWordSegmenter(): boolean {
  return typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function';
}

export function manualTokenPartition(
  text: string,
  sentences: readonly SegmentDraft[],
): TokenDraft[] {
  assertCompletePartition(text, sentences);
  return sentences.map((sentence) => ({
    ...sentence,
    isWordLike: /[\p{L}\p{N}]/u.test(
      sliceByCodePoints(text, sentence.start, sentence.end),
    ),
  }));
}

export function suggestTokens(
  text: string,
  sentences: readonly SegmentDraft[],
  locale: string,
  constructor?: WordSegmenterConstructor,
): { resolvedLocale: string; ranges: TokenDraft[] } {
  assertCompletePartition(text, sentences);
  const Segmenter =
    constructor ??
    (Intl as unknown as { Segmenter?: WordSegmenterConstructor }).Segmenter;
  if (!Segmenter) throw new IntlWordSegmenterUnavailableError();
  const segmenter = new Segmenter(locale, { granularity: 'word' });
  const ranges: TokenDraft[] = [];
  for (const sentence of sentences) {
    const sentenceText = sliceByCodePoints(text, sentence.start, sentence.end);
    const parts = Array.from(segmenter.segment(sentenceText));
    if (sentenceText.length > 0 && (parts.length === 0 || parts[0]?.index !== 0)) {
      throw new RangeError('token suggestion does not begin at the sentence boundary');
    }
    if (parts.map((part) => part.segment).join('') !== sentenceText) {
      throw new RangeError('token suggestion does not tile its sentence');
    }
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const endUtf16 = parts[index + 1]?.index ?? sentenceText.length;
      if (sentenceText.slice(part.index, endUtf16) !== part.segment) {
        throw new RangeError('token suggestion text is inconsistent');
      }
      ranges.push({
        start: sentence.start + utf16OffsetToCodePointOffset(sentenceText, part.index),
        end: sentence.start + utf16OffsetToCodePointOffset(sentenceText, endUtf16),
        isWordLike: part.isWordLike === true,
      });
    }
  }
  assertTokenPartition(text, sentences, ranges);
  return { resolvedLocale: segmenter.resolvedOptions().locale, ranges };
}

export function assertTokenPartition(
  text: string,
  sentences: readonly SegmentDraft[],
  tokens: readonly TokenDraft[],
): void {
  assertCompletePartition(text, sentences);
  assertCompletePartition(text, tokens);
  const tokenBoundaries = new Set(tokens.flatMap((token) => [token.start, token.end]));
  for (const sentence of sentences) {
    if (!tokenBoundaries.has(sentence.start) || !tokenBoundaries.has(sentence.end)) {
      throw new RangeError('every sentence boundary must be a token boundary');
    }
  }
  for (const token of tokens) {
    if (typeof token.isWordLike !== 'boolean') {
      throw new RangeError('every token requires a word-like classification');
    }
    if (!sentences.some((sentence) => token.start >= sentence.start && token.end <= sentence.end)) {
      throw new RangeError('a token cannot cross a sentence boundary');
    }
  }
  if (codePointLength(text) === 0 && tokens.length !== 0) {
    throw new RangeError('empty text must have no tokens');
  }
}

export function splitToken(
  text: string,
  sentences: readonly SegmentDraft[],
  tokens: readonly TokenDraft[],
  index: number,
  offset: number,
): TokenDraft[] {
  assertTokenPartition(text, sentences, tokens);
  const token = tokens[index];
  if (!token || !Number.isInteger(offset) || offset <= token.start || offset >= token.end) {
    throw new RangeError('split offset must be inside the selected token');
  }
  const next = [
    ...tokens.slice(0, index),
    { start: token.start, end: offset, isWordLike: token.isWordLike },
    { start: offset, end: token.end, isWordLike: token.isWordLike },
    ...tokens.slice(index + 1),
  ];
  assertTokenPartition(text, sentences, next);
  return next;
}

export function mergeTokenWithPrevious(
  text: string,
  sentences: readonly SegmentDraft[],
  tokens: readonly TokenDraft[],
  index: number,
): TokenDraft[] {
  assertTokenPartition(text, sentences, tokens);
  const previous = tokens[index - 1];
  const current = tokens[index];
  if (!previous || !current || previous.end !== current.start) {
    throw new RangeError('only adjacent tokens can be merged');
  }
  if (sentences.some((sentence) => sentence.end === current.start)) {
    throw new RangeError('tokens cannot be merged across a sentence boundary');
  }
  const next = [
    ...tokens.slice(0, index - 1),
    {
      start: previous.start,
      end: current.end,
      isWordLike: previous.isWordLike && current.isWordLike,
    },
    ...tokens.slice(index + 1),
  ];
  assertTokenPartition(text, sentences, next);
  return next;
}
