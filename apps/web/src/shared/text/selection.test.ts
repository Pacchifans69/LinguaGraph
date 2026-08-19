/**
 * Selection engine tests (M0.4) — native Range/Selection -> canonical
 * code-point offsets, and the reverse canonical -> DOM Range locator.
 *
 * Realistic jsdom Range objects are constructed wherever the browser
 * boundary representation matters (text-node offsets, run-element child
 * offsets, content-root child offsets). Fake Selection objects are used ONLY
 * to vary anchor/focus (direction) and rangeCount, which jsdom cannot
 * express.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { segmentText } from './segmentation';
import {
  canonicalRangeToDomRange,
  rangeToCanonical,
  selectionToCanonical,
  type SelectionLike,
  type TextVersionLike,
} from './selection';
import type { PendingSpan } from './types';

interface PanelOptions {
  versionId?: string;
  contentHash?: string;
}

afterEach(() => {
  document.body.replaceChildren();
});

function buildPanel(
  content: string,
  spans: Array<{ id: string; start: number; end: number }> = [],
  options: PanelOptions = {},
): { root: HTMLDivElement; version: TextVersionLike } {
  const root = document.createElement('div');
  root.setAttribute('data-text-content-root', '');
  root.setAttribute('data-text-version-id', options.versionId ?? 'tv-1');
  root.setAttribute('data-content-hash', options.contentHash ?? 'hash-1');
  const runs = segmentText(
    content,
    spans.map((span) => ({ id: span.id, start_offset: span.start, end_offset: span.end })),
    () => [],
  );
  for (const run of runs) {
    const element = document.createElement('span');
    element.setAttribute('data-run', '');
    element.setAttribute('data-start', String(run.start));
    element.setAttribute('data-end', String(run.end));
    element.textContent = run.text;
    root.appendChild(element);
  }
  // The root must be IN the document: jsdom treats ranges between nodes of
  // different root trees as collapsed, which would mask the real positions.
  document.body.appendChild(root);
  const version: TextVersionLike = {
    id: options.versionId ?? 'tv-1',
    content,
    contentHash: options.contentHash ?? 'hash-1',
  };
  return { root, version };
}

function runElement(root: HTMLElement, index: number): HTMLElement {
  const element = root.children[index] as HTMLElement | undefined;
  if (element === undefined) {
    throw new Error(`no run element at index ${index}`);
  }
  return element;
}

function runText(root: HTMLElement, index: number): Text {
  const element = runElement(root, index);
  const node = element.firstChild;
  if (node === null || node.nodeType !== Node.TEXT_NODE) {
    throw new Error('run must contain a Text node');
  }
  return node as Text;
}

function rangeBetween(
  a: { container: Node; offset: number },
  b: { container: Node; offset: number },
): Range {
  const range = document.createRange();
  range.setStart(a.container, a.offset);
  range.setEnd(b.container, b.offset);
  return range;
}

/**
 * Spec-shaped Range for boundaries a real Range constructor refuses (e.g. a
 * run element child offset other than 0/1, or a DocumentFragment endpoint).
 * Real browsers can only produce ranges with valid offsets, so these shapes
 * reach the engine only as a defensive boundary — the engine must still fail
 * closed instead of guessing.
 */
function fakeRange(
  startContainer: Node,
  startOffset: number,
  endContainer: Node,
  endOffset: number,
): Range {
  const range = Object.create(Range.prototype) as Range;
  Object.defineProperties(range, {
    startContainer: { value: startContainer },
    startOffset: { value: startOffset },
    endContainer: { value: endContainer },
    endOffset: { value: endOffset },
    collapsed: { value: false },
    toString: { value: () => '' },
  });
  return range;
}

function fakeSelection(
  range: Range,
  anchor: { node: Node | null; offset: number },
  focus: { node: Node | null; offset: number },
): SelectionLike {
  return {
    rangeCount: 1,
    getRangeAt: (index) => {
      if (index !== 0) {
        throw new Error('unexpected getRangeAt index');
      }
      return range;
    },
    anchorNode: anchor.node,
    focusNode: focus.node,
    anchorOffset: anchor.offset,
    focusOffset: focus.offset,
  };
}

const EN_TEXT = 'I look forward to seeing you tomorrow.';

describe('rangeToCanonical — basic selections', () => {
  it('resolves a single-run selection', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({
      status: 'ok',
      textVersionId: 'tv-1',
      contentHash: 'hash-1',
      start: 2,
      end: 17,
      quote: 'look forward to',
    });
  });

  it('resolves a multi-run selection', () => {
    // runs: [0,2) 'ab', [2,4) 'cd', [4,8) 'efgh'
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 1 },
      { container: runText(root, 2), offset: 2 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 1, end: 6, quote: 'bcdef' });
  });

  it('resolves a whole-content selection', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const range = rangeBetween(
      { container: root, offset: 0 },
      { container: root, offset: root.childNodes.length },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 0, end: EN_TEXT.length, quote: EN_TEXT });
  });

  it('resolves a selection at content start (root child offset 0)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const range = rangeBetween(
      { container: root, offset: 0 },
      { container: runText(root, 0), offset: 5 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 0, end: 5, quote: 'I loo' });
  });

  it('resolves a selection at content end (root child offset childCount)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 29 },
      { container: root, offset: root.childNodes.length },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({
      status: 'ok',
      start: 29,
      end: EN_TEXT.length,
      quote: 'tomorrow.',
    });
  });

  it('resolves run-element child offsets 0 and 1 (exact run boundaries)', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    // start = run1 element offset 0 (canonical 2), end = run1 element offset 1
    // (canonical 4): the exact [2,4) run.
    const range = rangeBetween(
      { container: runElement(root, 1), offset: 0 },
      { container: runElement(root, 1), offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 2, end: 4, quote: 'cd' });
  });

  it('rejects a run-element child offset other than 0/1', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const range = fakeRange(
      runElement(root, 0),
      0,
      runElement(root, 0),
      2,
    );
    const result = rangeToCanonical(range, root, version);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('UNSUPPORTED_SELECTION_BOUNDARY');
    }
  });

  it('supports internal content-root child boundaries (previous run end)', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    // (root, 1) sits between run0 and run1 -> canonical 2 (previous run end).
    const range = rangeBetween(
      { container: root, offset: 1 },
      { container: runText(root, 2), offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 2, end: 5, quote: 'cde' });
  });

  it('resolves text-node offsets at the beginning and end of a run', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 0 },
      { container: runText(root, 2), offset: 4 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 0, end: 8, quote: 'abcdefgh' });
  });

  it('resolves a multiline selection (LF is an ordinary code point)', () => {
    const content = 'line one\nline two';
    const { root, version } = buildPanel(content);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 5 }, { container: text, offset: 13 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 5, end: 13, quote: 'one\nline' });
  });

  it('resolves emoji/non-BMP text with exact code-point offsets', () => {
    // 'A🙂B' runs via span [1,2): A | 🙂 | B
    const { root, version } = buildPanel('A🙂B', [{ id: 's1', start: 1, end: 2 }]);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 0 },
      { container: runText(root, 2), offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 0, end: 3, quote: 'A🙂B' });

    // Inside the emoji run: text node offsets are UTF-16 units; canonical
    // offsets are code points. '🙂' has UTF-16 length 2.
    const inner = rangeBetween(
      { container: runText(root, 1), offset: 0 },
      { container: runText(root, 1), offset: 2 },
    );
    const innerResult = rangeToCanonical(inner, root, version);
    expect(innerResult).toMatchObject({ status: 'ok', start: 1, end: 2, quote: '🙂' });
  });

  it('resolves the mixed Unicode regression vector exactly', () => {
    const content = 'Café 🙂 mañana für français';
    const { root, version } = buildPanel(content);
    const text = runText(root, 0);
    // '🙂 mañana' — 🙂 is one code point at canonical 5; UTF-16 offsets: 5..7.
    const range = rangeBetween({ container: text, offset: 5 }, { container: text, offset: 14 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 5, end: 13, quote: '🙂 mañana' });
  });

  it('handles combining marks as ordinary code points (no grapheme logic)', () => {
    const content = 'café'; // NFC composed
    const { root, version } = buildPanel(content);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 1 }, { container: text, offset: 4 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 1, end: 4, quote: 'afé' });

    const decomposed = 'e\u0301'; // e + COMBINING ACUTE ACCENT (2 code points)
    const { root: root2, version: version2 } = buildPanel(decomposed);
    const text2 = runText(root2, 0);
    const range2 = rangeBetween({ container: text2, offset: 0 }, { container: text2, offset: 2 });
    const result2 = rangeToCanonical(range2, root2, version2);
    expect(result2).toMatchObject({ status: 'ok', start: 0, end: 2, quote: decomposed });
  });
});

describe('rangeToCanonical — fail-closed rejection', () => {
  it('rejects a collapsed selection (EMPTY_SELECTION)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 3 }, { container: text, offset: 3 });
    expect(range.collapsed).toBe(true);
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'EMPTY_SELECTION' });
  });

  it('rejects a selection outside the canonical content root', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const outside = document.createElement('header');
    outside.textContent = 'Panel header UI';
    // Must precede the root in document order: setStart/setEnd follow the
    // spec, so a range whose start is AFTER its end collapses instead.
    document.body.insertBefore(outside, root);
    const range = rangeBetween(
      { container: outside.firstChild as Node, offset: 1 },
      { container: runText(root, 0), offset: 5 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'OUTSIDE_TEXT_CONTENT' });
    outside.remove();
  });

  it('rejects a selection ending in header/control UI', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const button = document.createElement('button');
    button.textContent = 'Add to Alignment';
    document.body.insertBefore(button, root);
    const range = rangeBetween(
      { container: button.firstChild as Node, offset: 4 },
      { container: runText(root, 0), offset: 2 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'OUTSIDE_TEXT_CONTENT' });
    button.remove();
  });

  it('rejects a cross-panel / cross-TextVersion selection', () => {
    const panelA = buildPanel('first panel');
    const panelB = buildPanel('second panel', [], { versionId: 'tv-2', contentHash: 'hash-2' });
    const range = rangeBetween(
      { container: runText(panelA.root, 0), offset: 1 },
      { container: runText(panelB.root, 0), offset: 2 },
    );
    const result = rangeToCanonical(range, panelA.root, panelA.version);
    expect(result).toMatchObject({ status: 'error', code: 'CROSS_VERSION_SELECTION' });
  });

  it('rejects a surrogate-pair split endpoint', () => {
    const { root, version } = buildPanel('A🙂B');
    const text = runText(root, 0);
    // 'A🙂B' UTF-16 layout: A(0) high(1) low(2) B(3). Offset 2 splits the pair.
    const range = rangeBetween({ container: text, offset: 1 }, { container: text, offset: 2 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'INVALID_SELECTION_BOUNDARY' });
  });

  it('rejects nested inline text-bearing nodes inside a run (DOM integrity)', () => {
    const { root, version } = buildPanel('abcdef');
    const run = runElement(root, 0);
    const em = document.createElement('em');
    em.textContent = 'X';
    run.appendChild(em);
    const range = rangeBetween(
      { container: run.firstChild as Node, offset: 0 },
      { container: em.firstChild as Node, offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'DOM_INTEGRITY_ERROR' });
  });

  it('rejects unsupported element shapes in the content root', () => {
    const { root, version } = buildPanel('abcdef');
    const foreign = document.createElement('b');
    foreign.textContent = 'X';
    root.appendChild(foreign);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 0 },
      { container: foreign.firstChild as Node, offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'DOM_INTEGRITY_ERROR' });
  });

  it('rejects unsupported container types (DocumentFragment endpoint)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createTextNode('x'));
    const range = fakeRange(fragment, 0, runText(root, 0), 1);
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'UNSUPPORTED_SELECTION_BOUNDARY' });
  });

  it('rejects a stale content hash (STALE_TEXT_VERSION)', () => {
    const { root } = buildPanel(EN_TEXT);
    const staleVersion: TextVersionLike = {
      id: 'tv-1',
      content: EN_TEXT,
      contentHash: 'other-hash',
    };
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 0 }, { container: text, offset: 5 });
    const result = rangeToCanonical(range, root, staleVersion);
    expect(result).toMatchObject({ status: 'error', code: 'STALE_TEXT_VERSION' });
  });

  it('rejects a stale text version id', () => {
    const { root } = buildPanel(EN_TEXT);
    const staleVersion: TextVersionLike = {
      id: 'tv-old',
      content: EN_TEXT,
      contentHash: 'hash-1',
    };
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 0 }, { container: text, offset: 5 });
    const result = rangeToCanonical(range, root, staleVersion);
    expect(result).toMatchObject({ status: 'error', code: 'STALE_TEXT_VERSION' });
  });

  it('rejects a content-root DOM integrity violation (textContent mismatch)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    root.appendChild(document.createTextNode('extra'));
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 0 }, { container: text, offset: 5 });
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'DOM_INTEGRITY_ERROR' });
  });

  it('rejects a non-content-root selection root', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 0 }, { container: text, offset: 5 });
    const result = rangeToCanonical(range, document.createElement('div'), version);
    expect(result).toMatchObject({ status: 'error', code: 'DOM_INTEGRITY_ERROR' });
  });

  it('rejects a canonical/DOM quote mismatch (SELECTION_TEXT_MISMATCH)', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    // Simulate a browser/DOM divergence the integrity check guards against:
    // the range reports different text than the canonical quote.
    const originalToString = range.toString.bind(range);
    (range as unknown as { toString: () => string }).toString = () => 'garbage';
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'SELECTION_TEXT_MISMATCH' });
    (range as unknown as { toString: () => string }).toString = originalToString;
  });

  it('rejects ranges with inconsistent run metadata at an internal root boundary', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    // Corrupt run1's data-end so previous.end !== next.start.
    runElement(root, 0).setAttribute('data-end', '3');
    const range = rangeBetween(
      { container: root, offset: 1 },
      { container: runText(root, 1), offset: 1 },
    );
    const result = rangeToCanonical(range, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'DOM_INTEGRITY_ERROR' });
  });
});

describe('selectionToCanonical — direction and selection-level rules', () => {
  it('records forward direction when anchor precedes focus', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    const selection = fakeSelection(
      range,
      { node: text, offset: 2 },
      { node: text, offset: 17 },
    );
    const result = selectionToCanonical(selection, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 2, end: 17, direction: 'forward' });
  });

  it('records backward direction without altering the canonical range', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    // Backward: anchor (press point) is AFTER focus (release point).
    const selection = fakeSelection(
      range,
      { node: text, offset: 17 },
      { node: text, offset: 2 },
    );
    const result = selectionToCanonical(selection, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 2, end: 17, direction: 'backward' });
  });

  it('detects backward direction across nodes', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const range = rangeBetween(
      { container: runText(root, 0), offset: 1 },
      { container: runText(root, 2), offset: 2 },
    );
    const selection = fakeSelection(
      range,
      { node: runText(root, 2), offset: 2 },
      { node: runText(root, 0), offset: 1 },
    );
    const result = selectionToCanonical(selection, root, version);
    expect(result).toMatchObject({ status: 'ok', start: 1, end: 6, direction: 'backward' });
  });

  it('returns EMPTY_SELECTION for a null selection and rangeCount 0', () => {
    const { root, version } = buildPanel(EN_TEXT);
    expect(selectionToCanonical(null, root, version)).toMatchObject({
      status: 'error',
      code: 'EMPTY_SELECTION',
    });
    const selection = {
      rangeCount: 0,
      getRangeAt: () => {
        throw new Error('no range');
      },
      anchorNode: null,
      focusNode: null,
      anchorOffset: 0,
      focusOffset: 0,
    };
    expect(selectionToCanonical(selection, root, version)).toMatchObject({
      status: 'error',
      code: 'EMPTY_SELECTION',
    });
  });

  it('returns MULTI_RANGE_SELECTION when the selection holds more than one Range', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    const selection: SelectionLike = {
      rangeCount: 2,
      getRangeAt: () => range,
      anchorNode: text,
      focusNode: text,
      anchorOffset: 2,
      focusOffset: 17,
    };
    const result = selectionToCanonical(selection, root, version);
    expect(result).toMatchObject({ status: 'error', code: 'MULTI_RANGE_SELECTION' });
  });

  it('produces a PendingSpan-shaped result from a valid selection', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const text = runText(root, 0);
    const range = rangeBetween({ container: text, offset: 2 }, { container: text, offset: 17 });
    const selection = fakeSelection(
      range,
      { node: text, offset: 2 },
      { node: text, offset: 17 },
    );
    const result = selectionToCanonical(selection, root, version);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const pending: PendingSpan = {
        textVersionId: result.textVersionId,
        contentHash: result.contentHash,
        start: result.start,
        end: result.end,
        quote: result.quote,
        direction: result.direction,
      };
      expect(pending).toEqual({
        textVersionId: 'tv-1',
        contentHash: 'hash-1',
        start: 2,
        end: 17,
        quote: 'look forward to',
        direction: 'forward',
      });
    }
  });
});

describe('canonicalRangeToDomRange — reverse mapping', () => {
  it('maps a range within one run', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const result = canonicalRangeToDomRange(root, version, 2, 17);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('look forward to');
    }
  });

  it('maps a range spanning multiple runs', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const result = canonicalRangeToDomRange(root, version, 1, 6);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('bcdef');
    }
  });

  it('handles emoji before and inside the requested range', () => {
    const { root, version } = buildPanel('A🙂B');
    const result = canonicalRangeToDomRange(root, version, 1, 2);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('🙂');
    }
    const whole = canonicalRangeToDomRange(root, version, 0, 3);
    expect(whole.status).toBe('ok');
    if (whole.status === 'ok') {
      expect(whole.range.toString()).toBe('A🙂B');
    }
  });

  it('maps a range beginning exactly at a run boundary', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const result = canonicalRangeToDomRange(root, version, 2, 6);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('cdef');
    }
  });

  it('maps a range ending exactly at a run boundary', () => {
    const { root, version } = buildPanel('abcdefgh', [
      { id: 's1', start: 0, end: 2 },
      { id: 's2', start: 2, end: 4 },
    ]);
    const result = canonicalRangeToDomRange(root, version, 0, 4);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('abcd');
    }
  });

  it('maps the whole-content range', () => {
    const { root, version } = buildPanel('Café 🙂 mañana für français');
    const length = Array.from(version.content).length;
    const result = canonicalRangeToDomRange(root, version, 0, length);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe(version.content);
    }
  });

  it('maps the mixed Unicode vector and yields the expected canonical quote', () => {
    const content = 'Café 🙂 mañana für français';
    const { root, version } = buildPanel(content);
    const result = canonicalRangeToDomRange(root, version, 5, 13);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.range.toString()).toBe('🙂 mañana');
    }
  });

  it('rejects invalid canonical coordinates', () => {
    const { root, version } = buildPanel(EN_TEXT);
    const cases: Array<[number, number]> = [
      [-1, 2],
      [0, EN_TEXT.length + 1],
      [10, 5],
    ];
    for (const [start, end] of cases) {
      const result = canonicalRangeToDomRange(root, version, start, end);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_SELECTION_BOUNDARY');
      }
    }
    expect(canonicalRangeToDomRange(root, version, 0.5, 2).status).toBe('error');
    expect(canonicalRangeToDomRange(root, version, Number.NaN, 2).status).toBe('error');
  });

  it('rejects stale versions and DOM integrity violations', () => {
    const { root } = buildPanel(EN_TEXT);
    const stale: TextVersionLike = { id: 'tv-1', content: EN_TEXT, contentHash: 'nope' };
    expect(canonicalRangeToDomRange(root, stale, 0, 2)).toMatchObject({
      status: 'error',
      code: 'STALE_TEXT_VERSION',
    });
    const { root: root2, version: version2 } = buildPanel(EN_TEXT);
    root2.appendChild(document.createTextNode('x'));
    expect(canonicalRangeToDomRange(root2, version2, 0, 2)).toMatchObject({
      status: 'error',
      code: 'DOM_INTEGRITY_ERROR',
    });
  });

  it('supports empty content only as the collapsed [0,0) range', () => {
    const { root, version } = buildPanel('');
    const collapsed = canonicalRangeToDomRange(root, version, 0, 0);
    expect(collapsed.status).toBe('ok');
    if (collapsed.status === 'ok') {
      expect(collapsed.range.collapsed).toBe(true);
    }
    expect(canonicalRangeToDomRange(root, version, 0, 1)).toMatchObject({
      status: 'error',
      code: 'INVALID_SELECTION_BOUNDARY',
    });
  });
});
