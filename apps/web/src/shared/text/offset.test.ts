/**
 * Unicode offset utility tests (M0.4) — the mandatory regression matrix
 * (spec section 29; report section 6). Exact values are asserted verbatim:
 * they are not approximate.
 *
 * Required regression values:
 *
 *   codePointLength('A🙂B') === 3
 *   codePointLength('für größere Häuser') === 18
 *   codePointLength('Café 🙂 mañana für français') === 26
 */

import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  codePointOffsetToUtf16Offset,
  sliceByCodePoints,
  splitsSurrogatePair,
  utf16OffsetToCodePointOffset,
} from './offset';

describe('codePointLength', () => {
  it('counts ASCII code points', () => {
    expect(codePointLength('hello world')).toBe(11);
    expect(codePointLength('')).toBe(0);
  });

  it('counts BMP accented characters (NFC composed)', () => {
    expect(codePointLength('café français')).toBe(13);
    expect(codePointLength('mañana')).toBe(6);
    expect(codePointLength('für größere Häuser')).toBe(18);
  });

  it('counts astral-plane characters as single code points', () => {
    expect(codePointLength('A🙂B')).toBe(3);
    expect(codePointLength('🙂')).toBe(1);
    expect(codePointLength('🙂🙂🙂')).toBe(3);
    expect(codePointLength('😀😁😂🤣😃')).toBe(5);
  });

  it('counts the mixed regression vector exactly', () => {
    expect(codePointLength('Café 🙂 mañana für français')).toBe(26);
  });

  it('counts combining sequences as multiple code points (no grapheme logic)', () => {
    expect(codePointLength('e\u0301')).toBe(2); // e + COMBINING ACUTE ACCENT
    expect(codePointLength('\u00e9')).toBe(1); // NFC composed é
    expect(codePointLength('Cafe\u0301')).toBe(5);
  });
});

describe('sliceByCodePoints', () => {
  it('slices ASCII by code-point offsets', () => {
    expect(sliceByCodePoints('hello world', 0, 5)).toBe('hello');
    expect(sliceByCodePoints('hello world', 6, 11)).toBe('world');
    expect(sliceByCodePoints('hello world', 0, 0)).toBe('');
    expect(sliceByCodePoints('hello world', 0, 11)).toBe('hello world');
  });

  it('slices astral-plane text without splitting surrogate pairs', () => {
    expect(sliceByCodePoints('A🙂B', 0, 1)).toBe('A');
    expect(sliceByCodePoints('A🙂B', 1, 2)).toBe('🙂');
    expect(sliceByCodePoints('A🙂B', 2, 3)).toBe('B');
    expect(sliceByCodePoints('A🙂B', 0, 3)).toBe('A🙂B');
    expect(sliceByCodePoints('🙂a🙂', 1, 2)).toBe('a');
  });

  it('slices the mixed regression vector exactly', () => {
    const text = 'Café 🙂 mañana für français';
    expect(sliceByCodePoints(text, 0, 26)).toBe(text);
    // Café = [0,4), space = 4, 🙂 = [5,6)
    expect(sliceByCodePoints(text, 0, 4)).toBe('Café');
    expect(sliceByCodePoints(text, 5, 6)).toBe('🙂');
    expect(sliceByCodePoints(text, 7, 13)).toBe('mañana');
    expect(sliceByCodePoints(text, 14, 17)).toBe('für');
  });

  it('rejects negative offsets', () => {
    expect(() => sliceByCodePoints('abc', -1, 2)).toThrow(RangeError);
  });

  it('rejects offsets beyond the string length', () => {
    expect(() => sliceByCodePoints('abc', 0, 4)).toThrow(RangeError);
    expect(() => sliceByCodePoints('abc', 3, 3)).not.toThrow();
  });

  it('rejects start > end', () => {
    expect(() => sliceByCodePoints('abc', 2, 1)).toThrow(RangeError);
  });

  it('rejects non-integer offsets', () => {
    expect(() => sliceByCodePoints('abc', 0.5, 2)).toThrow(RangeError);
    expect(() => sliceByCodePoints('abc', 0, 2.5)).toThrow(RangeError);
    expect(() => sliceByCodePoints('abc', Number.NaN, 2)).toThrow(RangeError);
  });
});

describe('utf16OffsetToCodePointOffset', () => {
  it('maps ASCII UTF-16 offsets 1:1', () => {
    expect(utf16OffsetToCodePointOffset('hello', 0)).toBe(0);
    expect(utf16OffsetToCodePointOffset('hello', 2)).toBe(2);
    expect(utf16OffsetToCodePointOffset('hello', 5)).toBe(5);
  });

  it('maps astral-plane boundaries exactly (A🙂B)', () => {
    // A🙂B UTF-16 layout: A(0) high(1) low(2) B(3); code points: 0,1,2,3
    expect(utf16OffsetToCodePointOffset('A🙂B', 0)).toBe(0);
    expect(utf16OffsetToCodePointOffset('A🙂B', 1)).toBe(1);
    expect(utf16OffsetToCodePointOffset('A🙂B', 3)).toBe(2);
    expect(utf16OffsetToCodePointOffset('A🙂B', 4)).toBe(3);
  });

  it('rejects a boundary inside a surrogate pair', () => {
    expect(() => utf16OffsetToCodePointOffset('A🙂B', 2)).toThrow(RangeError);
    expect(() => utf16OffsetToCodePointOffset('🙂x', 1)).toThrow(RangeError);
    expect(splitsSurrogatePair('A🙂B', 2)).toBe(true);
    expect(splitsSurrogatePair('A🙂B', 1)).toBe(false);
    expect(splitsSurrogatePair('A🙂B', 3)).toBe(false);
    expect(splitsSurrogatePair('plain', 2)).toBe(false);
  });

  it('maps the mixed regression vector boundaries exactly', () => {
    const text = 'Café 🙂 mañana für français';
    // UTF-16 layout: Café(0-3) ' '(4) high(5) low(6) ' '(7) mañana(8-13)
    // ' '(14) für(15-17) ' '(18) français(19-26)
    expect(utf16OffsetToCodePointOffset(text, 0)).toBe(0);
    expect(utf16OffsetToCodePointOffset(text, 4)).toBe(4);
    expect(utf16OffsetToCodePointOffset(text, 5)).toBe(5);
    expect(utf16OffsetToCodePointOffset(text, 7)).toBe(6);
    expect(utf16OffsetToCodePointOffset(text, 8)).toBe(7);
    expect(utf16OffsetToCodePointOffset(text, 14)).toBe(13);
    expect(utf16OffsetToCodePointOffset(text, 15)).toBe(14);
    expect(utf16OffsetToCodePointOffset(text, 18)).toBe(17);
    expect(utf16OffsetToCodePointOffset(text, 19)).toBe(18);
    expect(utf16OffsetToCodePointOffset(text, 27)).toBe(26);
  });

  it('accepts beginning/end boundaries', () => {
    expect(utf16OffsetToCodePointOffset('A🙂B', 0)).toBe(0);
    expect(utf16OffsetToCodePointOffset('A🙂B', 4)).toBe(3);
    expect(utf16OffsetToCodePointOffset('', 0)).toBe(0);
  });

  it('rejects negative and out-of-range offsets', () => {
    expect(() => utf16OffsetToCodePointOffset('abc', -1)).toThrow(RangeError);
    expect(() => utf16OffsetToCodePointOffset('abc', 4)).toThrow(RangeError);
    expect(() => utf16OffsetToCodePointOffset('A🙂B', 5)).toThrow(RangeError);
  });

  it('rejects non-integer offsets', () => {
    expect(() => utf16OffsetToCodePointOffset('abc', 1.5)).toThrow(RangeError);
    expect(() => utf16OffsetToCodePointOffset('abc', Number.NaN)).toThrow(RangeError);
  });
});

describe('codePointOffsetToUtf16Offset', () => {
  it('maps ASCII code-point offsets 1:1', () => {
    expect(codePointOffsetToUtf16Offset('hello', 0)).toBe(0);
    expect(codePointOffsetToUtf16Offset('hello', 2)).toBe(2);
    expect(codePointOffsetToUtf16Offset('hello', 5)).toBe(5);
  });

  it('maps astral-plane boundaries exactly (A🙂B)', () => {
    expect(codePointOffsetToUtf16Offset('A🙂B', 0)).toBe(0);
    expect(codePointOffsetToUtf16Offset('A🙂B', 1)).toBe(1);
    expect(codePointOffsetToUtf16Offset('A🙂B', 2)).toBe(3);
    expect(codePointOffsetToUtf16Offset('A🙂B', 3)).toBe(4);
  });

  it('maps the mixed regression vector boundaries exactly', () => {
    const text = 'Café 🙂 mañana für français';
    expect(codePointOffsetToUtf16Offset(text, 0)).toBe(0);
    expect(codePointOffsetToUtf16Offset(text, 4)).toBe(4);
    expect(codePointOffsetToUtf16Offset(text, 5)).toBe(5);
    expect(codePointOffsetToUtf16Offset(text, 6)).toBe(7);
    expect(codePointOffsetToUtf16Offset(text, 7)).toBe(8);
    expect(codePointOffsetToUtf16Offset(text, 13)).toBe(14);
    expect(codePointOffsetToUtf16Offset(text, 14)).toBe(15);
    expect(codePointOffsetToUtf16Offset(text, 17)).toBe(18);
    expect(codePointOffsetToUtf16Offset(text, 18)).toBe(19);
    expect(codePointOffsetToUtf16Offset(text, 26)).toBe(27);
  });

  it('accepts beginning/end boundaries', () => {
    expect(codePointOffsetToUtf16Offset('A🙂B', 0)).toBe(0);
    expect(codePointOffsetToUtf16Offset('A🙂B', 3)).toBe(4);
    expect(codePointOffsetToUtf16Offset('', 0)).toBe(0);
  });

  it('rejects negative and out-of-range offsets', () => {
    expect(() => codePointOffsetToUtf16Offset('abc', -1)).toThrow(RangeError);
    expect(() => codePointOffsetToUtf16Offset('abc', 4)).toThrow(RangeError);
    expect(() => codePointOffsetToUtf16Offset('A🙂B', 4)).toThrow(RangeError);
  });

  it('rejects non-integer offsets', () => {
    expect(() => codePointOffsetToUtf16Offset('abc', 1.5)).toThrow(RangeError);
  });
});

describe('round trips', () => {
  it('valid UTF-16 -> CP -> UTF-16 boundaries round-trip', () => {
    const vectors = ['A🙂B', 'Café 🙂 mañana für français', 'hello', '', '🙂🙂'];
    for (const text of vectors) {
      for (let utf16 = 0; utf16 <= text.length; utf16 += 1) {
        if (splitsSurrogatePair(text, utf16)) {
          continue; // not a valid boundary
        }
        const cp = utf16OffsetToCodePointOffset(text, utf16);
        expect(codePointOffsetToUtf16Offset(text, cp)).toBe(utf16);
      }
    }
  });

  it('valid CP -> UTF-16 -> CP boundaries round-trip', () => {
    const vectors = ['A🙂B', 'Café 🙂 mañana für français', 'hello', '', '🙂🙂'];
    for (const text of vectors) {
      const length = codePointLength(text);
      for (let cp = 0; cp <= length; cp += 1) {
        const utf16 = codePointOffsetToUtf16Offset(text, cp);
        expect(utf16OffsetToCodePointOffset(text, utf16)).toBe(cp);
      }
    }
  });

  it('sliceByCodePoints equals the canonical substring for every valid boundary pair', () => {
    const text = 'Café 🙂 mañana für français';
    const length = codePointLength(text);
    for (let start = 0; start <= length; start += 1) {
      for (let end = start; end <= length; end += 1) {
        const sliced = sliceByCodePoints(text, start, end);
        expect(codePointLength(sliced)).toBe(end - start);
      }
    }
  });
});
