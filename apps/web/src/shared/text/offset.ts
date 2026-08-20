/**
 * Unicode code-point offset utilities (M0.4) — the SINGLE conversion strategy
 * between JavaScript UTF-16 code-unit positions (DOM Range / String) and
 * canonical Unicode code-point offsets (ADR-001).
 *
 * Contract:
 *
 * - persisted/API offsets are Unicode code-point offsets: zero-based,
 *   start-inclusive, end-exclusive;
 * - JavaScript UTF-16 offsets must NEVER be persisted or sent to the API;
 * - a boundary that splits a UTF-16 surrogate pair is invalid and MUST be
 *   rejected (fail closed, never guessed);
 * - every utility validates its inputs: integers only, no negative offsets,
 *   no offsets beyond the string;
 * - React components must never reimplement this conversion logic.
 *
 * M0 enforces code-point boundaries only: combining sequences are preserved
 * as-is and are NOT a boundary authority (no grapheme-cluster editing).
 */

/** A Unicode code-point offset into a string. */
export type CodePointOffset = number;

function assertIntegerOffset(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer, got ${value}`);
  }
}

function assertRange(value: number, min: number, max: number, name: string): void {
  if (value < min || value > max) {
    throw new RangeError(`${name} out of range: ${value} not in [${min}, ${max}]`);
  }
}

/**
 * Number of Unicode code points in `text`.
 *
 * Never use `String.length` for this: it counts UTF-16 code units
 * (`'A🙂B'.length === 4`, `codePointLength('A🙂B') === 3`).
 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Code-point-safe slice: returns the substring covering code points
 * `[start, end)`. Validates integer/range inputs; throws RangeError on
 * invalid offsets. Never pass code-point offsets to `String.slice`.
 */
export function sliceByCodePoints(
  text: string,
  start: CodePointOffset,
  end: CodePointOffset,
): string {
  assertIntegerOffset(start, 'start');
  assertIntegerOffset(end, 'end');
  const length = codePointLength(text);
  assertRange(start, 0, length, 'start');
  assertRange(end, 0, length, 'end');
  if (start > end) {
    throw new RangeError(`start (${start}) must not exceed end (${end})`);
  }
  return Array.from(text).slice(start, end).join('');
}

/** True when `utf16Offset` splits a UTF-16 surrogate pair in `text`. */
export function splitsSurrogatePair(text: string, utf16Offset: number): boolean {
  if (utf16Offset <= 0 || utf16Offset >= text.length) {
    return false;
  }
  const previous = text.charCodeAt(utf16Offset - 1);
  const current = text.charCodeAt(utf16Offset);
  return previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff;
}

/**
 * Convert a JavaScript UTF-16 code-unit offset into a canonical code-point
 * offset into the same string.
 *
 * Rejects:
 *
 * - non-integer offsets;
 * - offsets outside `[0, text.length]`;
 * - a boundary that splits a UTF-16 surrogate pair (INVALID boundary).
 */
export function utf16OffsetToCodePointOffset(
  text: string,
  utf16Offset: number,
): CodePointOffset {
  assertIntegerOffset(utf16Offset, 'utf16Offset');
  assertRange(utf16Offset, 0, text.length, 'utf16Offset');
  if (splitsSurrogatePair(text, utf16Offset)) {
    throw new RangeError(
      `utf16Offset ${utf16Offset} splits a UTF-16 surrogate pair; ` +
        'a code-point boundary is required',
    );
  }
  return Array.from(text.slice(0, utf16Offset)).length;
}

/**
 * Convert a canonical code-point offset into the equivalent JavaScript
 * UTF-16 code-unit offset into the same string.
 *
 * Validates that the requested boundary is a real code-point boundary of
 * `text` (integer, within `[0, codePointLength(text)]`). The returned
 * UTF-16 offset is guaranteed NOT to split a surrogate pair.
 */
export function codePointOffsetToUtf16Offset(
  text: string,
  codePointOffset: CodePointOffset,
): number {
  assertIntegerOffset(codePointOffset, 'codePointOffset');
  const length = codePointLength(text);
  assertRange(codePointOffset, 0, length, 'codePointOffset');
  return Array.from(text)
    .slice(0, codePointOffset)
    .join('').length;
}
