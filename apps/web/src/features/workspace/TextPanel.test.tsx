/**
 * TextPanel tests (M0.3 + M0.4).
 *
 * M0.3: canonical plain-text rendering, panel header, hide control,
 * whitespace/newline preservation and XSS-safe rendering.
 *
 * M0.4: the canonical content root ([data-text-content-root]) is isolated
 * from header/controls, renders FLAT boundary-segmented runs with exact
 * canonical substrings, and captures native selections into the workspace
 * current-selection state; "Add to Alignment" stages explicitly and reports
 * duplicate/overlap rejections.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { segmentText } from '../../shared/text/segmentation';
import type { RunDescriptor } from '../../shared/text/types';
import { TextPanel } from './TextPanel';
import type { TextVersion } from './api';
import { WorkspaceProvider } from './state/WorkspaceProvider';

function version(overrides: Partial<TextVersion> = {}): TextVersion {
  return {
    id: 'tv-en',
    document_id: 'doc-1',
    language_tag: 'en',
    label: 'English A',
    content: 'I look forward to seeing you tomorrow.',
    content_hash: 'abc',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function runsFor(content: string, spans: Array<{ id: string; start: number; end: number }> = []): RunDescriptor[] {
  return segmentText(
    content,
    spans.map((span) => ({ id: span.id, start_offset: span.start, end_offset: span.end })),
    () => [],
  );
}

function renderPanel(version: TextVersion, runs: RunDescriptor[]) {
  return render(
    <WorkspaceProvider
      documentId="doc-1"
      serverVersions={[{ id: version.id, contentHash: version.content_hash }]}
    >
      <TextPanel version={version} runs={runs} onHide={() => {}} />
    </WorkspaceProvider>,
  );
}

function contentRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('[data-text-content-root]');
  if (!(root instanceof HTMLElement)) {
    throw new Error('missing [data-text-content-root]');
  }
  return root;
}

/**
 * Stub window.getSelection with a spec-shaped Selection over a REAL Range.
 * `removeAllRanges` is a spy so tests can assert the post-staging clear.
 */
function stubSelection(range: Range) {
  const removeAllRanges = vi.fn();
  const selection = {
    rangeCount: 1,
    getRangeAt: (index: number) => {
      if (index !== 0) {
        throw new Error('unexpected getRangeAt index');
      }
      return range;
    },
    anchorNode: range.startContainer,
    focusNode: range.endContainer,
    anchorOffset: range.startOffset,
    focusOffset: range.endOffset,
    removeAllRanges,
  };
  vi.stubGlobal('getSelection', () => selection);
  return { selection, removeAllRanges };
}

function stubEmptySelection() {
  const selection = {
    rangeCount: 0,
    getRangeAt: () => {
      throw new Error('no range');
    },
    anchorNode: null,
    focusNode: null,
    anchorOffset: 0,
    focusOffset: 0,
    removeAllRanges: vi.fn(),
  };
  vi.stubGlobal('getSelection', () => selection);
}

function selectInRun(root: HTMLElement, runIndex: number, startUtf16: number, endUtf16: number): Range {
  const run = root.children[runIndex];
  const textNode = run?.firstChild;
  if (textNode === null || textNode === undefined || textNode.nodeType !== Node.TEXT_NODE) {
    throw new Error('run must contain a Text node');
  }
  const range = document.createRange();
  range.setStart(textNode, startUtf16);
  range.setEnd(textNode, endUtf16);
  return range;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('TextPanel (M0.3 behavior preserved)', () => {
  it('shows language tag, label and a hide control', () => {
    renderPanel(version(), runsFor('I look forward to seeing you tomorrow.'));
    expect(screen.getByText('en')).toBeInTheDocument();
    expect(screen.getByText('English A')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide English A panel' }),
    ).toBeInTheDocument();
  });

  it('calls onHide when the hide control is activated', () => {
    const onHide = vi.fn();
    render(
      <WorkspaceProvider documentId="doc-1" serverVersions={[{ id: 'tv-en', contentHash: 'abc' }]}>
        <TextPanel version={version()} runs={runsFor('I look forward to seeing you tomorrow.')} onHide={onHide} />
      </WorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide English A panel' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('renders the exact canonical content as plain text', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    expect(contentRoot(container).textContent).toBe(
      'I look forward to seeing you tomorrow.',
    );
    expect(screen.getByText('I look forward to seeing you tomorrow.')).toBeInTheDocument();
  });

  it('preserves whitespace and newlines (pre-wrap, plain text nodes)', () => {
    const content = 'line one\nline two\tend';
    const { container } = renderPanel(version({ content }), runsFor(content));
    const root = contentRoot(container);
    expect(root.style.whiteSpace).toBe('pre-wrap');
    expect(root.textContent).toBe(content);
  });

  it('renders XSS-like input as inert text (no script, no html execution)', () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const { container } = renderPanel(version({ content: payload }), runsFor(payload));
    expect(contentRoot(container).textContent).toBe(payload);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });
});

describe('TextPanel (M0.4 content root and runs)', () => {
  it('exposes the canonical content root with version id and content hash', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    expect(root.getAttribute('data-text-version-id')).toBe('tv-en');
    expect(root.getAttribute('data-content-hash')).toBe('abc');
    expect(root.classList.contains('text-panel-body')).toBe(true);
  });

  it('isolates the content root from header and controls', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    expect(container.querySelector('.text-panel-header')).not.toBeNull();
    expect(container.querySelector('.text-panel-header')?.contains(root)).toBe(false);
    // Header text (language tag, label) and the hide button are OUTSIDE the
    // canonical root: textContent of the root is exactly the canonical text.
    expect(root.textContent).toBe('I look forward to seeing you tomorrow.');
    expect(container.querySelector('.text-panel-header')?.textContent).toContain('English A');
  });

  it('renders flat runs, each with exactly one Text node', () => {
    const content = 'abcdefgh';
    const { container } = renderPanel(
      version({ content }),
      runsFor(content, [
        { id: 's1', start: 0, end: 2 },
        { id: 's2', start: 2, end: 4 },
      ]),
    );
    const root = contentRoot(container);
    const runs = root.querySelectorAll('[data-run]');
    expect(runs).toHaveLength(3);
    for (const run of Array.from(runs)) {
      expect(run.childNodes).toHaveLength(1);
      expect(run.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(run.querySelector('*')).toBeNull(); // no nested markup
    }
    // Contiguity + exact canonical substrings via the data attributes.
    expect(runs[0].getAttribute('data-start')).toBe('0');
    expect(runs[0].getAttribute('data-end')).toBe('2');
    expect(runs[0].textContent).toBe('ab');
    expect(runs[1].getAttribute('data-start')).toBe('2');
    expect(runs[1].getAttribute('data-end')).toBe('4');
    expect(runs[1].textContent).toBe('cd');
    expect(runs[2].getAttribute('data-start')).toBe('4');
    expect(runs[2].getAttribute('data-end')).toBe('8');
    expect(runs[2].textContent).toBe('efgh');
  });

  it('keeps Unicode text uncorrupted across runs', () => {
    const content = 'A🙂B';
    const { container } = renderPanel(
      version({ content }),
      runsFor(content, [{ id: 'emoji', start: 1, end: 2 }]),
    );
    const root = contentRoot(container);
    const runs = root.querySelectorAll('[data-run]');
    expect(runs).toHaveLength(3);
    expect(runs[0].textContent).toBe('A');
    expect(runs[1].textContent).toBe('🙂');
    expect(runs[2].textContent).toBe('B');
    expect(root.textContent).toBe('A🙂B');
  });

  it('renders empty content with no invented runs', () => {
    const { container } = renderPanel(version({ content: '' }), runsFor(''));
    const root = contentRoot(container);
    expect(root.querySelectorAll('[data-run]')).toHaveLength(0);
    expect(root.textContent).toBe('');
  });

  it('keeps the selection action UI outside the canonical content root', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    const addButton = screen.getByRole('button', { name: 'Add to Alignment' });
    expect(root.contains(addButton)).toBe(false);
    expect(container.querySelector('.text-panel-actions')?.contains(addButton)).toBe(true);
    expect(root.textContent).not.toContain('Add to Alignment');
  });
});

describe('TextPanel (M0.4 selection capture and staging)', () => {
  it('captures a valid selection and enables Add to Alignment', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);

    expect(
      screen.getByText('Selected 2–17: “look forward to”'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Alignment' })).toBeEnabled();
  });

  it('captures Unicode selections with exact code-point coordinates', () => {
    const content = 'Café 🙂 mañana für français';
    const { container } = renderPanel(version({ content }), runsFor(content));
    const root = contentRoot(container);
    // '🙂 mañana': UTF-16 [5,14) -> canonical [5,13).
    stubSelection(selectInRun(root, 0, 5, 14));
    fireEvent.mouseUp(root);
    expect(
      screen.getByText('Selected 5–13: “🙂 mañana”'),
    ).toBeInTheDocument();
  });

  it('stages the selection via Add to Alignment and clears current + native selection', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    const { removeAllRanges } = stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);
    expect(screen.getByText('Selected 2–17: “look forward to”')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    // Staging consumes the current selection.
    expect(screen.queryByText('Selected 2–17: “look forward to”')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Alignment' })).toBeDisabled();
  });

  it('rejects an exact duplicate with a visible error', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);

    stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));

    // Select the same range again and try to stage it again.
    stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));

    expect(screen.getByRole('alert')).toHaveTextContent('already in the tray');
  });

  it('rejects a same-version overlap with a visible error', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);

    stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));

    // Overlapping range [5,15).
    stubSelection(selectInRun(root, 0, 5, 15));
    fireEvent.mouseUp(root);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));

    expect(screen.getByRole('alert')).toHaveTextContent('overlaps');
  });

  it('clears the current selection when the selection collapses', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);

    stubSelection(selectInRun(root, 0, 2, 17));
    fireEvent.mouseUp(root);
    expect(screen.getByText('Selected 2–17: “look forward to”')).toBeInTheDocument();

    // A collapsed selection cancels the current selection.
    const collapsed = selectInRun(root, 0, 4, 4);
    stubSelection(collapsed);
    fireEvent.mouseUp(root);
    expect(screen.queryByText('Selected 2–17: “look forward to”')).not.toBeInTheDocument();
  });

  it('ignores an empty selection without crashing', () => {
    const { container } = renderPanel(
      version(),
      runsFor('I look forward to seeing you tomorrow.'),
    );
    const root = contentRoot(container);
    stubEmptySelection();
    fireEvent.mouseUp(root);
    expect(screen.getByRole('button', { name: 'Add to Alignment' })).toBeDisabled();
  });
});
