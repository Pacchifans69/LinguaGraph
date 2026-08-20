/**
 * Selection engine (M0.4) — native browser Selection/Range <-> canonical
 * code-point offsets (spec section 28; report section 7).
 *
 * Forward mapping:
 *
 *   native Selection / Range
 *     -> [data-text-content-root] subtree
 *     -> flat [data-run] elements / Text nodes
 *     -> UTF-16 code-unit offsets
 *     -> canonical Unicode code-point offsets (ADR-001)
 *     -> PendingSpan
 *
 * Reverse mapping: canonical code-point range -> native DOM Range (M0.6
 * highlighting infrastructure; no geometry is built here).
 *
 * Fail-closed contract:
 *
 * - exactly one Range; non-collapsed;
 * - both endpoints inside the SAME [data-text-content-root];
 * - supported endpoint shapes ONLY: Text node inside a valid [data-run],
 *   [data-run] element child offsets 0/1, content-root child offsets
 *   (ALL internal child boundaries are supported — M0.4 contract section
 *   11C; at an internal boundary the previous run's end MUST equal the
 *   next run's start, otherwise DOM_INTEGRITY_ERROR);
 * - a boundary that splits a UTF-16 surrogate pair is rejected
 *   (INVALID_SELECTION_BOUNDARY);
 * - the canonical quote MUST equal the native Range text
 *   (SELECTION_TEXT_MISMATCH otherwise);
 * - the content root's textContent MUST equal the canonical content
 *   (DOM integrity witness; DOM_INTEGRITY_ERROR otherwise);
 * - stale DOM (version id / content hash mismatch) is rejected
 *   (STALE_TEXT_VERSION);
 * - unknown containers, nested text-bearing structures, Documents and
 *   DocumentFragments fail closed (UNSUPPORTED_SELECTION_BOUNDARY /
 *   DOM_INTEGRITY_ERROR).
 *
 * Direction (anchor vs focus) is provenance only and NEVER alters the
 * canonical range identity: backward selections normalize to the same
 * start/end as the equivalent forward selection.
 *
 * These are frontend selection-engine result codes; they are NOT backend
 * API error codes.
 */

import {
  codePointLength,
  codePointOffsetToUtf16Offset,
  sliceByCodePoints,
  splitsSurrogatePair,
  utf16OffsetToCodePointOffset,
} from './offset';
import type { CodePointOffset, SelectionDirection } from './types';

export type SelectionErrorCode =
  | 'EMPTY_SELECTION'
  | 'MULTI_RANGE_SELECTION'
  | 'OUTSIDE_TEXT_CONTENT'
  | 'CROSS_VERSION_SELECTION'
  | 'UNSUPPORTED_SELECTION_BOUNDARY'
  | 'INVALID_SELECTION_BOUNDARY'
  | 'SELECTION_TEXT_MISMATCH'
  | 'STALE_TEXT_VERSION'
  | 'DOM_INTEGRITY_ERROR';

/** Structural TextVersion input: the canonical server content is the source
 * of truth; the DOM string is only an integrity witness. */
export interface TextVersionLike {
  id: string;
  content: string;
  contentHash: string;
}

/** Canonical form of a native Range (direction is not part of a Range). */
export interface CanonicalRange {
  textVersionId: string;
  contentHash: string;
  start: CodePointOffset;
  end: CodePointOffset;
  quote: string;
}

export type CanonicalRangeResult =
  | ({ status: 'ok' } & CanonicalRange)
  | { status: 'error'; code: SelectionErrorCode; message: string };

/** Canonical form of a native Selection, including direction provenance. */
export type SelectionResult =
  | ({ status: 'ok' } & CanonicalRange & { direction: SelectionDirection })
  | { status: 'error'; code: SelectionErrorCode; message: string };

export interface SelectionLike {
  rangeCount: number;
  getRangeAt(index: number): Range;
  anchorNode: Node | null;
  focusNode: Node | null;
  anchorOffset: number;
  focusOffset: number;
}

export type DomRangeResult =
  | { status: 'ok'; range: Range }
  | { status: 'error'; code: SelectionErrorCode; message: string };

interface ResolvedRun {
  start: CodePointOffset;
  end: CodePointOffset;
  text: string;
  element: HTMLElement;
  textNode: Text;
}

type ValidationResult =
  | { ok: true }
  | { ok: false; code: SelectionErrorCode; message: string };

function error(code: SelectionErrorCode, message: string) {
  return { status: 'error' as const, code, message };
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

/**
 * The only DOM subtree from which canonical offsets may be derived:
 * `[data-text-content-root]`. Header/buttons/toolbar/tray are NOT canonical
 * text and must never resolve to an offset.
 */
function findContentRoot(container: Node): HTMLElement | null {
  if (isElement(container)) {
    return container.closest('[data-text-content-root]');
  }
  if (isText(container) && container.parentElement !== null) {
    return container.parentElement.closest('[data-text-content-root]');
  }
  return null;
}

/** Validate the root element, version identity/hash and the DOM text
 * witness. Runs are validated separately by `collectRuns`. */
function validateRoot(
  root: HTMLElement | null,
  version: TextVersionLike,
): ValidationResult {
  if (root === null || !root.hasAttribute('data-text-content-root')) {
    return {
      ok: false,
      code: 'DOM_INTEGRITY_ERROR',
      message: 'selection root must be a [data-text-content-root] element',
    };
  }
  if (
    root.dataset.textVersionId !== version.id ||
    root.dataset.contentHash !== version.contentHash
  ) {
    return {
      ok: false,
      code: 'STALE_TEXT_VERSION',
      message:
        'the rendered content root does not match the current TextVersion ' +
        '(id or content hash changed)',
    };
  }
  if (root.textContent !== version.content) {
    return {
      ok: false,
      code: 'DOM_INTEGRITY_ERROR',
      message: 'content root textContent does not equal the canonical content',
    };
  }
  return { ok: true };
}

/**
 * Collect and validate the flat run structure of the content root. Every
 * child MUST be a [data-run] element with exactly one Text node whose data
 * equals the canonical slice of its metadata, and runs must be contiguous.
 * Any other DOM shape is a fail-closed DOM_INTEGRITY_ERROR (nested/foreign
 * text-bearing nodes are unsupported in M0).
 *
 * The canonical content is materialized into a code-point array ONCE; every
 * run is validated against slices of that same array, so a content root
 * with T runs costs O(N + T) validation work instead of O(T * N) repeated
 * whole-string conversions. This sits on the native selection path, where
 * the practical target is ~100k Unicode code points per TextVersion with
 * hundreds of runs. Run text is still produced by a code-point-safe
 * operation (never String.slice with canonical offsets).
 */
function collectRuns(
  root: HTMLElement,
  content: string,
): { ok: true; runs: ResolvedRun[] } | { ok: false; code: SelectionErrorCode; message: string } {
  const codePoints = Array.from(content);
  const length = codePoints.length;
  const runs: ResolvedRun[] = [];

  for (const child of Array.from(root.childNodes)) {
    if (!isElement(child) || !child.hasAttribute('data-run')) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'every content root child must be a flat [data-run] element',
      };
    }
    const element = child as HTMLElement;
    const start = Number(element.dataset.start);
    const end = Number(element.dataset.end);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > length ||
      start >= end
    ) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: `run has invalid metadata [${element.dataset.start}, ${element.dataset.end})`,
      };
    }
    if (element.childNodes.length !== 1 || element.firstChild === null || !isText(element.firstChild)) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'a run must contain exactly one Text node (no nested markup)',
      };
    }
    const textNode = element.firstChild;
    const text = textNode.data;
    if (text !== codePoints.slice(start, end).join('')) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'run text does not equal the canonical content slice',
      };
    }
    if (runs.length > 0 && runs[runs.length - 1].end !== start) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'runs must be contiguous (next.start === previous.end)',
      };
    }
    runs.push({ start, end, text, element, textNode });
  }

  // Explicit tiling witness: a first run not starting at 0, or a last run not
  // reaching the canonical length, would break the contentRoot.textContent
  // invariant (the caller also checks textContent === content, but asserting
  // the tiling here keeps the run validation self-contained).
  if (runs.length > 0) {
    if (runs[0].start !== 0) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'runs must tile the canonical content from offset 0',
      };
    }
    if (runs[runs.length - 1].end !== length) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'runs must tile the canonical content to its full length',
      };
    }
  }

  return { ok: true, runs };
}

function unsupportedContainer(container: Node): boolean {
  return !isElement(container) && !isText(container);
}

/**
 * Resolve one Range endpoint (container + UTF-16 offset) to a canonical
 * code-point offset.
 *
 * Supported shapes (M0.4 contract 11A-11D):
 *
 * - Text node whose parent is a valid [data-run]: runStartCP +
 *   utf16OffsetToCodePointOffset(runText, offset);
 * - [data-run] element child offset 0 -> data-start, offset 1 -> data-end;
 * - content-root element child offset 0 -> 0, childCount -> content length,
 *   and EVERY internal child offset -> previous run's end (which must equal
 *   the next run's start);
 * - anything else fails closed.
 */
function resolveEndpoint(
  container: Node,
  offset: number,
  root: HTMLElement,
  content: string,
  runs: ResolvedRun[],
): { ok: true; offset: CodePointOffset } | { ok: false; code: SelectionErrorCode; message: string } {
  if (isText(container)) {
    const parent = container.parentElement;
    if (parent === null || !parent.hasAttribute('data-run')) {
      return {
        ok: false,
        code: 'UNSUPPORTED_SELECTION_BOUNDARY',
        message: 'a Text node endpoint must live directly inside a [data-run] element',
      };
    }
    const run = runs.find((candidate) => candidate.textNode === container);
    if (run === undefined) {
      return {
        ok: false,
        code: 'DOM_INTEGRITY_ERROR',
        message: 'Text node is inside a [data-run] that is not part of the content root',
      };
    }
    if (!Number.isInteger(offset)) {
      return {
        ok: false,
        code: 'INVALID_SELECTION_BOUNDARY',
        message: 'text node offsets must be integers',
      };
    }
    if (offset < 0 || offset > container.data.length) {
      return {
        ok: false,
        code: 'INVALID_SELECTION_BOUNDARY',
        message: `text node offset ${offset} is out of range`,
      };
    }
    if (splitsSurrogatePair(container.data, offset)) {
      return {
        ok: false,
        code: 'INVALID_SELECTION_BOUNDARY',
        message: `offset ${offset} splits a UTF-16 surrogate pair`,
      };
    }
    const local = utf16OffsetToCodePointOffset(container.data, offset);
    return { ok: true, offset: run.start + local };
  }

  if (isElement(container)) {
    if (container === root) {
      if (!Number.isInteger(offset)) {
        return {
          ok: false,
          code: 'INVALID_SELECTION_BOUNDARY',
          message: 'content root child offsets must be integers',
        };
      }
      if (offset === 0) {
        return { ok: true, offset: 0 };
      }
      if (offset === root.childNodes.length) {
        return { ok: true, offset: codePointLength(content) };
      }
      if (offset < 0 || offset > root.childNodes.length) {
        return {
          ok: false,
          code: 'INVALID_SELECTION_BOUNDARY',
          message: `content root child offset ${offset} is out of range`,
        };
      }
      // Internal child boundary: 0 < offset < childCount -> previous run end.
      const previous = runs[offset - 1];
      const next = runs[offset];
      if (previous === undefined || next === undefined) {
        return {
          ok: false,
          code: 'DOM_INTEGRITY_ERROR',
          message: 'internal content root boundary does not sit between two runs',
        };
      }
      if (previous.end !== next.start) {
        return {
          ok: false,
          code: 'DOM_INTEGRITY_ERROR',
          message: 'adjacent run metadata disagrees at the content root boundary',
        };
      }
      return { ok: true, offset: previous.end };
    }

    if (container.hasAttribute('data-run')) {
      const run = runs.find((candidate) => candidate.element === container);
      if (run === undefined) {
        return {
          ok: false,
          code: 'DOM_INTEGRITY_ERROR',
          message: '[data-run] endpoint is not part of the content root',
        };
      }
      if (!Number.isInteger(offset)) {
        return {
          ok: false,
          code: 'INVALID_SELECTION_BOUNDARY',
          message: 'run element offsets must be integers',
        };
      }
      if (offset === 0) {
        return { ok: true, offset: run.start };
      }
      if (offset === 1) {
        return { ok: true, offset: run.end };
      }
      return {
        ok: false,
        code: 'UNSUPPORTED_SELECTION_BOUNDARY',
        message: 'a run element has exactly one Text child; only offsets 0 and 1 are supported',
      };
    }

    return {
      ok: false,
      code: 'UNSUPPORTED_SELECTION_BOUNDARY',
      message: 'unknown element container is not a supported selection boundary',
    };
  }

  return {
    ok: false,
    code: 'UNSUPPORTED_SELECTION_BOUNDARY',
    message: 'unsupported node type as selection boundary',
  };
}

/**
 * Convert one native DOM Range into a canonical code-point range.
 *
 * A valid selection must contain exactly one Range whose endpoints both
 * belong to the SAME `[data-text-content-root]`. Canonical coordinates are
 * always normalized to `start < end`.
 */
export function rangeToCanonical(
  range: Range,
  root: HTMLElement,
  version: TextVersionLike,
): CanonicalRangeResult {
  const rootValidation = validateRoot(root, version);
  if (!rootValidation.ok) {
    return error(rootValidation.code, rootValidation.message);
  }

  const runsResult = collectRuns(root, version.content);
  if (!runsResult.ok) {
    return error(runsResult.code, runsResult.message);
  }
  const { runs } = runsResult;

  if (range.collapsed) {
    return error('EMPTY_SELECTION', 'collapsed selection has no canonical range');
  }

  if (unsupportedContainer(range.startContainer) || unsupportedContainer(range.endContainer)) {
    return error(
      'UNSUPPORTED_SELECTION_BOUNDARY',
      'Range endpoints must be Text nodes or Elements',
    );
  }

  const startRoot = findContentRoot(range.startContainer);
  const endRoot = findContentRoot(range.endContainer);
  if (startRoot === null || endRoot === null) {
    return error(
      'OUTSIDE_TEXT_CONTENT',
      'selection endpoint is outside any canonical text content root',
    );
  }
  if (startRoot !== endRoot) {
    return error(
      'CROSS_VERSION_SELECTION',
      'selection spans two different text content roots (TextVersions)',
    );
  }
  if (startRoot !== root) {
    return error(
      'OUTSIDE_TEXT_CONTENT',
      'selection is inside a different content root than the requested one',
    );
  }

  const startResolution = resolveEndpoint(
    range.startContainer,
    range.startOffset,
    root,
    version.content,
    runs,
  );
  if (!startResolution.ok) {
    return error(startResolution.code, startResolution.message);
  }
  const endResolution = resolveEndpoint(
    range.endContainer,
    range.endOffset,
    root,
    version.content,
    runs,
  );
  if (!endResolution.ok) {
    return error(endResolution.code, endResolution.message);
  }

  const start = Math.min(startResolution.offset, endResolution.offset);
  const end = Math.max(startResolution.offset, endResolution.offset);
  if (start === end) {
    return error('EMPTY_SELECTION', 'selection resolves to an empty canonical range');
  }

  const quote = sliceByCodePoints(version.content, start, end);
  if (range.toString() !== quote) {
    return error(
      'SELECTION_TEXT_MISMATCH',
      'native Range text does not equal the canonical quote',
    );
  }

  return {
    status: 'ok',
    textVersionId: version.id,
    contentHash: version.contentHash,
    start,
    end,
    quote,
  };
}

/**
 * Direction of a native Selection: 'forward' when the anchor (press point)
 * precedes the focus (release point), 'backward' otherwise. Informational
 * provenance only — it never alters the canonical range identity.
 */
export function selectionDirection(
  selection: SelectionLike,
): SelectionDirection {
  const { anchorNode, focusNode, anchorOffset, focusOffset } = selection;
  if (anchorNode === null || focusNode === null) {
    return 'forward';
  }
  if (anchorNode === focusNode) {
    return anchorOffset <= focusOffset ? 'forward' : 'backward';
  }
  const position = anchorNode.compareDocumentPosition(focusNode);
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
    return 'forward';
  }
  if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
    return 'backward';
  }
  return 'forward';
}

/**
 * Convert a native browser Selection into a canonical selection result.
 *
 * Exactly one Range is required (MULTI_RANGE_SELECTION otherwise); the
 * collapsed/no-selection cases are EMPTY_SELECTION. All other selection
 * engine errors propagate unchanged.
 */
export function selectionToCanonical(
  selection: SelectionLike | null,
  root: HTMLElement,
  version: TextVersionLike,
): SelectionResult {
  if (selection === null || selection.rangeCount === 0) {
    return error('EMPTY_SELECTION', 'no native selection');
  }
  if (selection.rangeCount !== 1) {
    return error('MULTI_RANGE_SELECTION', 'exactly one Range is required');
  }
  const base = rangeToCanonical(selection.getRangeAt(0), root, version);
  if (base.status === 'error') {
    return base;
  }
  return {
    ...base,
    direction: selectionDirection(selection),
  };
}

/**
 * First run whose end is >= `position` (runs are contiguous, so this is the
 * run containing `position`, or the run ending at `position` when it sits
 * exactly on a run boundary). `position === content length` resolves to the
 * last run.
 */
function findRunAt(runs: ResolvedRun[], position: CodePointOffset): ResolvedRun | null {
  let low = 0;
  let high = runs.length - 1;
  let answer: ResolvedRun | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (runs[mid].end >= position) {
      answer = runs[mid];
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return answer;
}

/**
 * Reverse locator (M0.4 infrastructure only): canonical code-point range ->
 * native DOM Range over the rendered content root.
 *
 * - validates the canonical range (integers, 0 <= start <= end <= length);
 * - locates the containing runs (boundary positions resolve to the run
 *   ending at the boundary — a valid DOM position);
 * - converts local code-point offsets to UTF-16 offsets (never splitting a
 *   surrogate pair);
 * - supports boundaries exactly between runs and whole-content ranges;
 * - for empty content only the collapsed [0,0) range is valid.
 *
 * No highlighting or connector geometry is built on top of this in M0.4.
 */
export function canonicalRangeToDomRange(
  root: HTMLElement,
  version: TextVersionLike,
  start: CodePointOffset,
  end: CodePointOffset,
): DomRangeResult {
  const rootValidation = validateRoot(root, version);
  if (!rootValidation.ok) {
    return error(rootValidation.code, rootValidation.message);
  }
  const runsResult = collectRuns(root, version.content);
  if (!runsResult.ok) {
    return error(runsResult.code, runsResult.message);
  }
  const { runs } = runsResult;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return error('INVALID_SELECTION_BOUNDARY', 'canonical offsets must be integers');
  }
  const length = codePointLength(version.content);
  if (start < 0 || end < start || end > length) {
    return error(
      'INVALID_SELECTION_BOUNDARY',
      `canonical range [${start}, ${end}) is outside [0, ${length}]`,
    );
  }

  if (runs.length === 0) {
    if (start === 0 && end === 0) {
      const range = new Range();
      range.setStart(root, 0);
      range.setEnd(root, 0);
      return { status: 'ok', range };
    }
    return error(
      'INVALID_SELECTION_BOUNDARY',
      'non-empty canonical range cannot map to empty content',
    );
  }

  const startRun = findRunAt(runs, start);
  const endRun = findRunAt(runs, end);
  if (startRun === null || endRun === null) {
    return error('DOM_INTEGRITY_ERROR', 'could not locate runs for the canonical range');
  }

  const localStart = codePointOffsetToUtf16Offset(startRun.text, start - startRun.start);
  const localEnd = codePointOffsetToUtf16Offset(endRun.text, end - endRun.start);

  const range = new Range();
  range.setStart(startRun.textNode, localStart);
  range.setEnd(endRun.textNode, localEnd);
  return { status: 'ok', range };
}
