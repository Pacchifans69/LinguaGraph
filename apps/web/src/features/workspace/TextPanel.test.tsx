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
import { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';
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
      <TextPanel
        version={version}
        runs={runs}
        onHide={() => {}}
        spanRegistry={new RenderedSpanRegistry()}
      />
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
        <TextPanel
          version={version()}
          runs={runsFor('I look forward to seeing you tomorrow.')}
          onHide={onHide}
          spanRegistry={new RenderedSpanRegistry()}
        />
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

describe('TextPanel (M0.6 alignment visualization)', () => {
  const EN_CONTENT = 'I look forward to seeing you tomorrow.';
  const DE_CONTENT = 'Ich freue mich darauf, dich morgen zu sehen.';

  interface SpanSpec {
    id: string;
    start: number;
    end: number;
    groups: string[];
  }

  function runsWithGroups(
    content: string,
    spans: SpanSpec[],
  ): RunDescriptor[] {
    const groupsBySpan = new Map(spans.map((s) => [s.id, s.groups]));
    return segmentText(
      content,
      spans.map((s) => ({ id: s.id, start_offset: s.start, end_offset: s.end })),
      (spanId) => groupsBySpan.get(spanId) ?? [],
    );
  }

  const enVersion = version({ id: 'tv-en', label: 'English A' });
  const deVersion = version({
    id: 'tv-de',
    label: 'German A',
    language_tag: 'de',
    content: DE_CONTENT,
    content_hash: 'h-de',
  });

  function runElements(container: HTMLElement): HTMLElement[] {
    // Collect runs from ALL canonical content roots (one per panel).
    const roots = Array.from(
      container.querySelectorAll('[data-text-content-root]'),
    );
    return roots.flatMap((root) =>
      Array.from(root.querySelectorAll('[data-run]')),
    ) as HTMLElement[];
  }

  /** All canonical content roots in render order (EN first, then DE). */
  function allContentRoots(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll('[data-text-content-root]'),
    ) as HTMLElement[];
  }

  /**
   * Render EN + DE panels under ONE WorkspaceProvider (shared hovered/active
   * state), with the EN span [2,17) in `enGroups` and optional DE spans.
   */
  function renderTwoPanels(options: {
    enGroups: string[];
    deSpans?: SpanSpec[];
    groupIds?: string[];
  }) {
    const registry = new RenderedSpanRegistry();
    const enRuns = runsWithGroups(EN_CONTENT, [
      { id: 'span-en', start: 2, end: 17, groups: options.enGroups },
    ]);
    const deRuns = runsWithGroups(DE_CONTENT, options.deSpans ?? []);
    const view = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={
          options.groupIds ?? ['group-alpha', 'group-beta']
        }
      >
        <TextPanel
          version={enVersion}
          runs={enRuns}
          onHide={() => {}}
          spanRegistry={registry}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
        />
      </WorkspaceProvider>,
    );
    const enRunsDom = runElements(view.container).filter(
      (el) => el.closest('[data-text-version-id="tv-en"]') !== null,
    );
    const deRunsDom = runElements(view.container).filter(
      (el) => el.closest('[data-text-version-id="tv-de"]') !== null,
    );
    return { ...view, registry, enRuns: enRunsDom, deRuns: deRunsDom };
  }

  it('shows an idle persisted-alignment indicator without touching canonical text', () => {
    const { container, enRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    expect(enRuns[0].classList.contains('run-aligned')).toBe(false);
    expect(enRuns[1].classList.contains('run-aligned')).toBe(true);
    expect(enRuns[1].classList.contains('run-hovered')).toBe(false);
    expect(enRuns[1].classList.contains('run-active')).toBe(false);
    const [enRoot, deRoot] = allContentRoots(container);
    expect(enRoot.textContent).toBe(EN_CONTENT);
    expect(deRoot.textContent).toBe(DE_CONTENT);
  });

  it('hovers the single group on pointer enter and propagates to ALL its runs', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    fireEvent.pointerEnter(enRuns[1]);
    // Counterpart hover styling on the DE member (cross-panel propagation).
    expect(deRuns[1].classList.contains('run-hovered')).toBe(true);
    // Non-members stay untouched.
    expect(enRuns[0].classList.contains('run-hovered')).toBe(false);
    expect(deRuns[0].classList.contains('run-hovered')).toBe(false);
  });

  it('clears hover on pointer leave', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    fireEvent.pointerEnter(enRuns[1]);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(true);
    fireEvent.pointerLeave(enRuns[1]);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(false);
  });

  it('hovering an unaligned run never sets a hovered alignment', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    fireEvent.pointerEnter(enRuns[0]);
    expect(enRuns[1].classList.contains('run-hovered')).toBe(false);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(false);
  });

  it('clicking an unambiguous target activates it; active persists after leave', () => {
    const { enRuns, deRuns, container } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    fireEvent.click(enRuns[1]);
    expect(enRuns[1].classList.contains('run-active')).toBe(true);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);

    // Active visualization persists after pointer leave.
    fireEvent.pointerLeave(enRuns[1]);
    expect(enRuns[1].classList.contains('run-active')).toBe(true);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);
    const [enRoot, deRoot] = allContentRoots(container);
    expect(enRoot.textContent).toBe(EN_CONTENT);
    expect(deRoot.textContent).toBe(DE_CONTENT);
  });

  it('active + secondary hover coexist and are distinguishable', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [
        { id: 'span-de-1', start: 4, end: 21, groups: ['group-alpha'] },
        { id: 'span-de-2', start: 25, end: 30, groups: ['group-beta'] },
      ],
    });
    // Activate group-alpha via the EN member.
    fireEvent.click(enRuns[1]);
    // Hover group-beta via its DE member (DE runs: [0,4) [4,21) [21,25)
    // [25,30) [30,44) — the beta run is index 3).
    fireEvent.pointerEnter(deRuns[3]);

    // Active group members keep ACTIVE styling...
    expect(enRuns[1].classList.contains('run-active')).toBe(true);
    expect(enRuns[1].classList.contains('run-hovered')).toBe(false);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);
    // ...while the hovered group's member gets SECONDARY hover styling.
    expect(deRuns[3].classList.contains('run-hovered')).toBe(true);
    expect(deRuns[3].classList.contains('run-active')).toBe(false);
  });

  it('a multi-group run never chooses a group on plain hover (ambiguous cue only)', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha', 'group-beta'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    expect(enRuns[1].classList.contains('run-ambiguous')).toBe(true);
    fireEvent.pointerEnter(enRuns[1]);
    // No arbitrary first-group selection: hovered stays null.
    expect(enRuns[1].classList.contains('run-hovered')).toBe(false);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(false);
    expect(enRuns[1].classList.contains('run-active')).toBe(false);
  });

  it('clicking an ambiguous run opens a chooser OUTSIDE the content root with exact candidates', () => {
    const { container, enRuns } = renderTwoPanels({
      enGroups: ['group-zeta', 'group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    fireEvent.click(enRuns[1]);

    const chooser = container.querySelector('.alignment-chooser');
    expect(chooser).not.toBeNull();
    // Located OUTSIDE the canonical text root.
    expect(contentRoot(container).contains(chooser)).toBe(false);
    // Exact candidate groups, deterministic (sorted) order — NOT [0].
    const options = Array.from(
      container.querySelectorAll('.alignment-chooser-option'),
    ).map((el) => el.textContent);
    expect(options).toEqual([
      'Alignment group-al',
      'Alignment group-ze',
    ]);
    // Canonical text stays byte-identical.
    const [enRoot, deRoot] = allContentRoots(container);
    expect(enRoot.textContent).toBe(EN_CONTENT);
    expect(deRoot.textContent).toBe(DE_CONTENT);
  });

  it('hovering/focusing a concrete chooser option previews that group', () => {
    const { container, enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha', 'group-beta'],
      deSpans: [
        { id: 'span-de-1', start: 4, end: 21, groups: ['group-alpha'] },
        { id: 'span-de-2', start: 25, end: 30, groups: ['group-beta'] },
      ],
    });
    fireEvent.click(enRuns[1]);
    const options = Array.from(
      container.querySelectorAll('.alignment-chooser-option'),
    ) as HTMLElement[];

    // Option order: group-alpha, group-beta. Hover the beta option (DE
    // runs: [0,4) [4,21) [21,25) [25,30) [30,44) — beta run is index 3).
    fireEvent.pointerEnter(options[1]);
    expect(deRuns[3].classList.contains('run-hovered')).toBe(true);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(false);
    fireEvent.pointerLeave(options[1]);
    expect(deRuns[3].classList.contains('run-hovered')).toBe(false);

    // Focusing the alpha option previews alpha (keyboard path).
    fireEvent.focus(options[0]);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(true);
    expect(deRuns[3].classList.contains('run-hovered')).toBe(false);
    fireEvent.blur(options[0]);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(false);
  });

  it('activating a concrete chooser option sets activeAlignmentId and closes', () => {
    const { container, enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha', 'group-beta'],
      deSpans: [
        { id: 'span-de-1', start: 4, end: 21, groups: ['group-alpha'] },
        { id: 'span-de-2', start: 25, end: 30, groups: ['group-beta'] },
      ],
    });
    fireEvent.click(enRuns[1]);
    const options = Array.from(
      container.querySelectorAll('.alignment-chooser-option'),
    ) as HTMLElement[];

    // Activate the beta option: the beta member becomes ACTIVE.
    fireEvent.click(options[1]);
    expect(deRuns[3].classList.contains('run-active')).toBe(true);
    expect(deRuns[1].classList.contains('run-active')).toBe(false);
    // The chooser closes after successful activation.
    expect(container.querySelector('.alignment-chooser')).toBeNull();
  });

  it('supports keyboard activation of chooser options (semantic buttons)', () => {
    const { container, enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha', 'group-beta'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-beta'] }],
    });
    fireEvent.click(enRuns[1]);
    const options = Array.from(
      container.querySelectorAll('.alignment-chooser-option'),
    ) as HTMLElement[];

    // Real buttons: keyboard-focusable with accessible names.
    for (const option of options) {
      expect(option.tagName).toBe('BUTTON');
      expect(option.getAttribute('aria-label')).toMatch(/^Activate alignment /);
    }
    fireEvent.focus(options[1]);
    expect(deRuns[1].classList.contains('run-hovered')).toBe(true);
    // Native button activation (Enter/Space dispatch click) activates.
    fireEvent.click(options[1]);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);
    expect(container.querySelector('.alignment-chooser')).toBeNull();
  });

  it('the chooser lists only surviving groups after a snapshot change', () => {
    const registry = new RenderedSpanRegistry();
    const enRuns = runsWithGroups(EN_CONTENT, [
      { id: 'span-en', start: 2, end: 17, groups: ['group-alpha', 'group-beta'] },
    ]);
    const deRuns = runsWithGroups(DE_CONTENT, [
      { id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] },
    ]);
    const groupIds = new Set(['group-alpha', 'group-beta']);
    const view = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha', 'group-beta']}
      >
        <TextPanel
          version={enVersion}
          runs={enRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
      </WorkspaceProvider>,
    );
    const enRun = Array.from(
      contentRoot(view.container).querySelectorAll('[data-run]'),
    )[1] as HTMLElement;
    fireEvent.click(enRun);
    expect(view.container.querySelectorAll('.alignment-chooser-option')).toHaveLength(2);

    // Snapshot change: group-beta is deleted. The chooser re-renders with
    // the surviving set; with only ONE surviving candidate there is no
    // ambiguity left to resolve, so it closes.
    const survivingOnly = new Set(['group-alpha']);
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha']}
      >
        <TextPanel
          version={enVersion}
          runs={runsWithGroups(EN_CONTENT, [
            { id: 'span-en', start: 2, end: 17, groups: ['group-alpha'] },
          ])}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={survivingOnly}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={survivingOnly}
        />
      </WorkspaceProvider>,
    );
    expect(view.container.querySelector('.alignment-chooser')).toBeNull();
  });

  it('does not activate an alignment when a native drag selection is present (R1-F02)', () => {
    const { container, enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    // A non-collapsed native selection INSIDE the EN content root — the tail
    // of a text drag that ends with a click event.
    const textNode = enRuns[1].firstChild;
    const range = document.createRange();
    range.setStart(textNode as Node, 0);
    range.setEnd(textNode as Node, 4);
    const { removeAllRanges } = stubSelection(range);

    fireEvent.click(enRuns[1]);
    // No activation anywhere in the group.
    expect(enRuns[1].classList.contains('run-active')).toBe(false);
    expect(deRuns[1].classList.contains('run-active')).toBe(false);
    // The native selection was NOT mutated just to make activation work.
    expect(removeAllRanges).not.toHaveBeenCalled();
    expect(contentRoot(container).textContent).toBe(EN_CONTENT);
  });

  it('does not open the ambiguity chooser when a native drag selection is present (R1-F02)', () => {
    const { container, enRuns } = renderTwoPanels({
      enGroups: ['group-alpha', 'group-beta'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    const textNode = enRuns[1].firstChild;
    const range = document.createRange();
    range.setStart(textNode as Node, 0);
    range.setEnd(textNode as Node, 4);
    stubSelection(range);

    fireEvent.click(enRuns[1]);
    expect(container.querySelector('.alignment-chooser')).toBeNull();
  });

  it('still activates on an ordinary click with a collapsed selection (R1-F02)', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    const textNode = enRuns[1].firstChild;
    const collapsed = document.createRange();
    collapsed.setStart(textNode as Node, 2);
    collapsed.setEnd(textNode as Node, 2);
    stubSelection(collapsed);

    fireEvent.click(enRuns[1]);
    expect(enRuns[1].classList.contains('run-active')).toBe(true);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);
  });

  it('does not block activation for an unrelated selection elsewhere on the page (R1-F02)', () => {
    const { enRuns, deRuns } = renderTwoPanels({
      enGroups: ['group-alpha'],
      deSpans: [{ id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] }],
    });
    // A non-collapsed selection living ENTIRELY outside the canonical
    // content root (e.g. another panel) must not block local activation.
    const outside = document.createElement('div');
    outside.textContent = 'unrelated text';
    document.body.appendChild(outside);
    const range = document.createRange();
    range.setStart(outside.firstChild as Node, 0);
    range.setEnd(outside.firstChild as Node, 9);
    stubSelection(range);

    fireEvent.click(enRuns[1]);
    expect(enRuns[1].classList.contains('run-active')).toBe(true);
    expect(deRuns[1].classList.contains('run-active')).toBe(true);
    outside.remove();
  });

  it('chooser candidates come from CURRENT run membership, not the stored run (R1-F03)', () => {
    const registry = new RenderedSpanRegistry();
    const enRuns = runsWithGroups(EN_CONTENT, [
      { id: 'span-en', start: 2, end: 17, groups: ['group-alpha', 'group-beta'] },
    ]);
    const deRuns = runsWithGroups(DE_CONTENT, [
      { id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] },
    ]);
    const groupIds = new Set(['group-alpha', 'group-beta', 'group-gamma']);
    const view = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha', 'group-beta', 'group-gamma']}
      >
        <TextPanel
          version={enVersion}
          runs={enRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
      </WorkspaceProvider>,
    );
    const enRun = Array.from(
      contentRoot(view.container).querySelectorAll('[data-run]'),
    )[1] as HTMLElement;
    fireEvent.click(enRun);
    const optionTexts = () =>
      Array.from(view.container.querySelectorAll('.alignment-chooser-option')).map(
        (el) => el.textContent,
      );
    expect(optionTexts()).toEqual(['Alignment group-al', 'Alignment group-be']);

    // t1: the SAME coordinates now belong to group-alpha + group-gamma.
    // group-beta is still globally alive (survivingGroupIds keeps it) but no
    // longer belongs to this run — it must NOT be offered.
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha', 'group-beta', 'group-gamma']}
      >
        <TextPanel
          version={enVersion}
          runs={runsWithGroups(EN_CONTENT, [
            { id: 'span-en', start: 2, end: 17, groups: ['group-gamma', 'group-alpha'] },
          ])}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
      </WorkspaceProvider>,
    );
    expect(optionTexts()).toEqual(['Alignment group-al', 'Alignment group-ga']);
    expect(optionTexts()).not.toContain('Alignment group-be');
  });

  it('closes the chooser when the current run is no longer ambiguous (R1-F03)', () => {
    const registry = new RenderedSpanRegistry();
    const enRuns = runsWithGroups(EN_CONTENT, [
      { id: 'span-en', start: 2, end: 17, groups: ['group-alpha', 'group-beta'] },
    ]);
    const deRuns = runsWithGroups(DE_CONTENT, [
      { id: 'span-de', start: 4, end: 21, groups: ['group-alpha'] },
    ]);
    const groupIds = new Set(['group-alpha', 'group-beta']);
    const view = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha', 'group-beta']}
      >
        <TextPanel
          version={enVersion}
          runs={enRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
      </WorkspaceProvider>,
    );
    const enRun = Array.from(
      contentRoot(view.container).querySelectorAll('[data-run]'),
    )[1] as HTMLElement;
    fireEvent.click(enRun);
    expect(view.container.querySelectorAll('.alignment-chooser-option')).toHaveLength(2);

    // Same coordinates, but the membership changed to a SINGLE group: the
    // ambiguity is gone and the chooser must close.
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-en' },
          { id: 'tv-de', contentHash: 'h-de' },
        ]}
        serverAlignmentGroupIds={['group-alpha', 'group-beta']}
      >
        <TextPanel
          version={enVersion}
          runs={runsWithGroups(EN_CONTENT, [
            { id: 'span-en', start: 2, end: 17, groups: ['group-alpha'] },
          ])}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
        <TextPanel
          version={deVersion}
          runs={deRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={groupIds}
        />
      </WorkspaceProvider>,
    );
    expect(view.container.querySelector('.alignment-chooser')).toBeNull();
  });

  it('orders chooser candidates deterministically at the boundary (R1-F03)', () => {
    const registry = new RenderedSpanRegistry();
    // Deliberately UNSORTED membership — segmentation would pre-sort, but the
    // chooser boundary must order its own candidates deterministically.
    const unsortedRuns: RunDescriptor[] = [
      { start: 0, end: 2, text: 'I ', spanIds: [], alignmentGroupIds: [] },
      {
        start: 2,
        end: 17,
        text: 'look forward to',
        spanIds: ['s1'],
        alignmentGroupIds: ['group-zeta', 'group-alpha'],
      },
      { start: 17, end: 38, text: ' seeing you tomorrow.', spanIds: [], alignmentGroupIds: [] },
    ];
    const view = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[{ id: 'tv-en', contentHash: 'h-en' }]}
        serverAlignmentGroupIds={['group-zeta', 'group-alpha']}
      >
        <TextPanel
          version={enVersion}
          runs={unsortedRuns}
          onHide={() => {}}
          spanRegistry={registry}
          survivingGroupIds={new Set(['group-zeta', 'group-alpha'])}
        />
      </WorkspaceProvider>,
    );
    const enRun = Array.from(
      contentRoot(view.container).querySelectorAll('[data-run]'),
    )[1] as HTMLElement;
    fireEvent.click(enRun);
    const options = Array.from(
      view.container.querySelectorAll('.alignment-chooser-option'),
    ).map((el) => el.textContent);
    expect(options).toEqual(['Alignment group-al', 'Alignment group-ze']);
  });
});
