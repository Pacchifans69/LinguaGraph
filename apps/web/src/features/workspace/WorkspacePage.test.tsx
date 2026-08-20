/**
 * Workspace page component tests (M0.3 + M0.4): panels, hide/reopen/reorder,
 * per-document preferences, stale-id reconciliation, error presentation and
 * the destructive delete confirmation flow (M0.3); selection capture,
 * explicit Add-to-Alignment staging, the pending tray, Escape semantics,
 * panel-hide lifecycle, stale content-hash reconciliation and document
 * change / remount clearing (M0.4).
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';
import { renderPageAt, createTestQueryClient } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import { preferenceKey } from './state/preferences';
import type { WorkspaceSnapshot } from './api';

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1',
      project_id: 'proj-1',
      title: 'Chapter 1',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: [
      {
        id: 'tv-en',
        document_id: 'doc-1',
        language_tag: 'en',
        label: 'English',
        content: 'I look forward to seeing you tomorrow.',
        content_hash: 'h-en',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tv-de',
        document_id: 'doc-1',
        language_tag: 'de',
        label: 'German',
        content: 'Ich freue mich darauf, dich morgen zu sehen.',
        content_hash: 'h-de',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tv-fr',
        document_id: 'doc-1',
        language_tag: 'fr',
        label: 'French',
        content: 'J’ai hâte de te voir demain.',
        content_hash: 'h-fr',
        sort_order: 2,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    spans: [],
    alignment_groups: [],
    alignment_members: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Select a range inside the English panel's content root via a REAL Range. */
function stubEnglishSelection(
  container: HTMLElement,
  startUtf16: number,
  endUtf16: number,
) {
  const panel = container.querySelector('.text-panel');
  if (!panel) {
    throw new Error('no text panel rendered');
  }
  const root = panel.querySelector('[data-text-content-root]');
  const run = root?.firstChild;
  const textNode = run?.firstChild;
  if (textNode === null || textNode === undefined || textNode.nodeType !== Node.TEXT_NODE) {
    throw new Error('no text node in the content root');
  }
  const range = document.createRange();
  range.setStart(textNode, startUtf16);
  range.setEnd(textNode, endUtf16);
  const removeAllRanges = vi.fn();
  vi.stubGlobal('getSelection', () => ({
    rangeCount: 1,
    getRangeAt: () => range,
    anchorNode: textNode,
    focusNode: textNode,
    anchorOffset: startUtf16,
    focusOffset: endUtf16,
    removeAllRanges,
  }));
  return removeAllRanges;
}

async function openEnglishPanel() {
  // Wait for the workspace snapshot to load before interacting.
  await screen.findByRole('button', { name: 'Open English' });
  return fireEvent.click(screen.getByRole('button', { name: 'Open English' }));
}

async function stageEnglishRange(container: HTMLElement, start: number, end: number) {
  const removeAllRanges = stubEnglishSelection(container, start, end);
  const root = container.querySelector('.text-panel [data-text-content-root]');
  fireEvent.mouseUp(root as HTMLElement);
  // Scope to the English panel: every panel has its own Add button.
  const englishPanel = Array.from(container.querySelectorAll('.text-panel')).find(
    (panel) => panel.textContent?.includes('I look forward to seeing you tomorrow.'),
  ) ?? container.querySelector('.text-panel');
  fireEvent.click(
    within(englishPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
  );
  return removeAllRanges;
}

describe('WorkspacePage', () => {
  it('renders hidden panels and opens them (hide + reopen)', async () => {
    // The provider records server version ids even with no stored prefs, so
    // all versions appear as openable hidden buttons initially.
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    expect(await screen.findByText(/No panels open/)).toBeInTheDocument();
    const openButtons = await screen.findAllByRole('button', { name: /^Open / });
    expect(openButtons).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Open English' }));
    expect(await screen.findByText('I look forward to seeing you tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open English' })).not.toBeInTheDocument();

    // Hide the English panel -> it reappears in the hidden list.
    fireEvent.click(screen.getByRole('button', { name: 'Hide English panel' }));
    expect(await screen.findByRole('button', { name: 'Open English' })).toBeInTheDocument();
    expect(screen.queryByText('I look forward to seeing you tomorrow.')).not.toBeInTheDocument();

    // Reopen again.
    fireEvent.click(screen.getByRole('button', { name: 'Open English' }));
    expect(await screen.findByText('I look forward to seeing you tomorrow.')).toBeInTheDocument();
  });

  it('reorders panels and persists the per-document preference', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open German' }));

    // Visible order: English, German. Move German left -> German, English.
    const germanMoveLeft = await screen.findByRole('button', { name: 'Move German left' });
    fireEvent.click(germanMoveLeft);

    const panels = document.querySelectorAll('.text-panel');
    expect(within(panels[0] as HTMLElement).getByText('German')).toBeInTheDocument();
    expect(within(panels[1] as HTMLElement).getByText('English')).toBeInTheDocument();

    // Per-document preference persisted under the accepted namespace.
    // panelOrder is the single layout-order source (all versions, including
    // the still-hidden tv-fr); visiblePanels is a membership set.
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(preferenceKey('doc-1')) ?? '{}');
      expect(saved.panelOrder).toEqual(['tv-de', 'tv-en', 'tv-fr']);
      expect(saved.visiblePanels).toEqual(['tv-en', 'tv-de']);
    });
  });

  it('does not leak panel state between documents', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    await screen.findByText('I look forward to seeing you tomorrow.');

    // The doc-1 preference key is written; no other document key exists.
    expect(window.localStorage.getItem(preferenceKey('doc-1'))).not.toBeNull();
    expect(window.localStorage.getItem(preferenceKey('doc-2'))).toBeNull();
    expect(window.localStorage.getItem(preferenceKey('doc-other'))).toBeNull();
  });

  it('reconciles stale localStorage ids against the current server versions', async () => {
    // Stored prefs reference a deleted version and an older subset.
    window.localStorage.setItem(
      preferenceKey('doc-1'),
      JSON.stringify({
        panelOrder: ['tv-gone', 'tv-en'],
        visiblePanels: ['tv-gone', 'tv-en'],
      }),
    );
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    // tv-gone is dropped; tv-en stays visible; tv-de/tv-fr are incorporated
    // (hidden, reopenable).
    expect(await screen.findByText('I look forward to seeing you tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open tv-gone' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open German' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open French' })).toBeInTheDocument();

    // The reconciled preference no longer contains the stale id (settled
    // through the provider's persist effect).
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(preferenceKey('doc-1')) ?? '{}');
      expect(saved.visiblePanels).toEqual(['tv-en']);
      expect(saved.panelOrder).not.toContain('tv-gone');
    });
  });

  it('presents API errors through the error boundary', async () => {
    installFetchMock([
      [
        '/workspace',
        () => json(404, { code: 'NOT_FOUND', message: 'document not found', details: { document_id: 'doc-1' } }),
      ],
    ]);
    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('NOT_FOUND: document not found');
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument();
  });

  it('requires explicit confirmation before a destructive force delete', async () => {
    const deleted = new Set<string>();
    installFetchMock([
      [
        '/workspace',
        () => {
          const data = snapshot();
          data.text_versions = data.text_versions.filter((v) => !deleted.has(v.id));
          return json(200, data);
        },
      ],
      [
        '/text-versions/',
        (url) => {
          const match = /\/text-versions\/([^/?]+)(\?force=true)?$/.exec(url);
          if (!match) {
            return json(404, { code: 'NOT_FOUND', message: 'x', details: {} });
          }
          if (match[2]) {
            deleted.add(match[1]);
            return Promise.resolve({ status: 204, body: null });
          }
          return json(409, {
            code: 'TEXT_HAS_ANNOTATIONS',
            message: 'text version is part of alignments',
            details: {},
          });
        },
      ],
    ]);

    renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    // Open English and delete it (annotated -> blocked).
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    await screen.findByText('I look forward to seeing you tomorrow.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));

    // The confirmation dialog warns about annotations/groups being removed.
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/permanently remove its annotations/i),
    ).toBeInTheDocument();

    // Cancel does nothing destructive.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    // Confirm -> force=true DELETE; the panel disappears after refetch.
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('I look forward to seeing you tomorrow.')).not.toBeInTheDocument(),
    );
  });
});
describe('WorkspacePage (M0.4 selection and pending tray)', () => {
  it('captures a selection, stages it explicitly and shows it in the tray', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');

    // 1. Native selection -> current selection (status in the EN panel).
    stubEnglishSelection(container, 2, 17);
    const root = container.querySelector('.text-panel [data-text-content-root]');
    fireEvent.mouseUp(root as HTMLElement);
    expect(
      await screen.findByText('Selected 2–17: “look forward to”'),
    ).toBeInTheDocument();

    // 2. Explicit Add to Alignment -> pending tray member; status consumed.
    fireEvent.click(screen.getByRole('button', { name: 'Add to Alignment' }));
    expect(
      await screen.findByText('“look forward to”'),
    ).toBeInTheDocument();
    expect(screen.getByText('en — English')).toBeInTheDocument();
    expect(screen.queryByText('Selected 2–17: “look forward to”')).not.toBeInTheDocument();
  });

  it('stages members from two TextVersions, removes one and clears the tray', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await screen.findByText('Ich freue mich darauf, dich morgen zu sehen.');

    await stageEnglishRange(container, 2, 17);
    // German: 'Ich freue mich darauf, dich morgen zu sehen.' -> [4,21).
    const germanPanel = container.querySelectorAll('.text-panel')[1];
    const germanRoot = germanPanel?.querySelector('[data-text-content-root]');
    const germanText = germanRoot?.firstChild?.firstChild as Text;
    const germanRange = document.createRange();
    germanRange.setStart(germanText, 4);
    germanRange.setEnd(germanText, 21);
    vi.stubGlobal('getSelection', () => ({
      rangeCount: 1,
      getRangeAt: () => germanRange,
      anchorNode: germanText,
      focusNode: germanText,
      anchorOffset: 4,
      focusOffset: 21,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );

    expect(await screen.findByText('“freue mich darauf”')).toBeInTheDocument();
    expect(screen.getByText('de — German')).toBeInTheDocument();

    // Remove the German member only.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove “freue mich darauf” from tray' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('“freue mich darauf”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();

    // Clear the tray.
    fireEvent.click(screen.getByRole('button', { name: 'Clear tray' }));
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
  });

  it('Escape clears the current selection only, never the staged tray', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');

    // Stage one member.
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // Capture a second current selection.
    stubEnglishSelection(container, 7, 17);
    fireEvent.mouseUp(
      container.querySelector('.text-panel [data-text-content-root]') as HTMLElement,
    );
    expect(
      await screen.findByText('Selected 7–17: “forward to”'),
    ).toBeInTheDocument();

    // Escape: current selection gone, tray member retained.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Selected 7–17: “forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
  });

  it('hiding a panel clears its current selection but retains its pending member', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // New current selection, then hide the panel.
    stubEnglishSelection(container, 7, 17);
    fireEvent.mouseUp(
      container.querySelector('.text-panel [data-text-content-root]') as HTMLElement,
    );
    expect(
      await screen.findByText('Selected 7–17: “forward to”'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide English panel' }));
    await waitFor(() =>
      expect(screen.queryByText('Selected 7–17: “forward to”')).not.toBeInTheDocument(),
    );
    // The staged member survives the panel hide.
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
  });

  it('drops pending state when a refetch reports a changed content hash', async () => {
    let current = snapshot();
    installFetchMock([['/workspace', () => json(200, current)]]);
    const { container, queryClient } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // Server returns the same TextVersion id with a NEW content hash.
    current = snapshot();
    current.text_versions = current.text_versions.map((version) =>
      version.id === 'tv-en'
        ? { ...version, content_hash: 'h-en-changed', content: 'I look forward to seeing you tomorrow!' }
        : version,
    );

    queryClient.invalidateQueries({ queryKey: ['workspace', 'doc-1'] });
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
  });

  it('drops pending state when a refetch reports the TextVersion deleted', async () => {
    let current = snapshot();
    installFetchMock([['/workspace', () => json(200, current)]]);
    const { container, queryClient } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    current = snapshot();
    current.text_versions = current.text_versions.filter((version) => version.id !== 'tv-en');
    queryClient.invalidateQueries({ queryKey: ['workspace', 'doc-1'] });
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
  });

  it('retains pending state across a refetch with identical id and hash', async () => {
    let current = snapshot();
    installFetchMock([['/workspace', () => json(200, current)]]);
    const { container, queryClient } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // Same ids + hashes: nothing is dropped.
    current = snapshot();
    queryClient.invalidateQueries({ queryKey: ['workspace', 'doc-1'] });
    await waitFor(() => expect(screen.getByText('“look forward to”')).toBeInTheDocument());
  });

  it('a document change clears pending state (provider remount)', async () => {
    const doc2 = snapshot();
    doc2.document = { ...doc2.document, id: 'doc-2', title: 'Chapter 2' };
    doc2.text_versions = doc2.text_versions.map((version) => ({
      ...version,
      id: `tv-2-${version.id}`,
      document_id: 'doc-2',
      label: `${version.label} 2`,
    }));
    installFetchMock([
      ['/workspace', (url) => (url.includes('doc-2') ? json(200, doc2) : json(200, snapshot()))],
    ]);

    function Harness() {
      return (
        <div>
          <Link to="/documents/doc-2/workspace">Go to doc 2</Link>
          <Routes>
            <Route path="/documents/:documentId/workspace" element={<WorkspacePage />} />
          </Routes>
        </div>
      );
    }
    const client = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/documents/doc-1/workspace']}>
          <Harness />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // Navigate to doc-2: the provider remounts -> pending tray is empty and
    // panel state re-initializes for the new document.
    fireEvent.click(screen.getByRole('link', { name: 'Go to doc 2' }));
    // Wait for the doc-2 workspace to load, then assert the tray is empty.
    await screen.findByRole('button', { name: /Open English 2/ });
    expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument();
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open English' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open English 2/ })).toBeInTheDocument();
  });

  it('a provider remount does not restore pending state (frontend-only)', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();

    // Simulate a reload: clean up the first render, then mount a fresh
    // provider. The persisted panel preference restores the open panel, but
    // the tray is empty.
    cleanup();
    const second = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    expect(
      await second.findByText('I look forward to seeing you tomorrow.'),
    ).toBeInTheDocument();
    expect(second.queryByText('“look forward to”')).not.toBeInTheDocument();
    expect(second.getByText('No pending selections.')).toBeInTheDocument();
  });

  it('does not persist current selection or pending members to localStorage', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    // A dedicated document id isolates this test's preference key from any
    // other test's provider persist timing.
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-persist/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    await stageEnglishRange(container, 2, 17);
    await screen.findByText('“look forward to”');

    const saved = JSON.parse(
      window.localStorage.getItem(preferenceKey('doc-persist')) ?? '{}',
    );
    expect(saved).not.toHaveProperty('currentSelection');
    expect(saved).not.toHaveProperty('pendingMembers');
    // Only the panel preferences are persisted.
    expect(saved).toHaveProperty('panelOrder');
    expect(saved).toHaveProperty('visiblePanels');
  });
});

describe('WorkspacePage (M0.5 alignment persistence)', () => {
  it('stages, creates, clears the tray and shows the saved alignment from server state', async () => {
    let current = snapshot();
    const postedBodies: Array<{ members: unknown[] }> = [];
    installFetchMock([
      [
        '/workspace',
        () => {
          const data = current;
          return json(200, data);
        },
      ],
      [
        '/alignments',
        (_url, init) => {
          postedBodies.push(JSON.parse(String(init?.body)) as { members: unknown[] });
          // Server-authoritative persistence: the snapshot now contains the
          // created span/group/member rows.
          const data = snapshot();
          data.spans = [
            {
              id: 'sp-en',
              text_version_id: 'tv-en',
              start_offset: 2,
              end_offset: 17,
              exact_text: 'look forward to',
              prefix: 'I ',
              suffix: ' seeing you tomorrow.',
              created_at: '2026-01-01T00:00:00Z',
            },
            {
              id: 'sp-de',
              text_version_id: 'tv-de',
              start_offset: 4,
              end_offset: 21,
              exact_text: 'freue mich darauf',
              prefix: 'Ich ',
              suffix: ', dich morgen zu sehen.',
              created_at: '2026-01-01T00:00:00Z',
            },
          ];
          data.alignment_groups = [
            {
              id: 'al-1',
              document_id: 'doc-1',
              note: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ];
          data.alignment_members = [
            { id: 'am-en', alignment_group_id: 'al-1', span_id: 'sp-en', created_at: 'x' },
            { id: 'am-de', alignment_group_id: 'al-1', span_id: 'sp-de', created_at: 'x' },
          ];
          current = data;
          return json(201, {
            id: 'al-1',
            document_id: 'doc-1',
            note: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            members: [
              { id: 'am-en', span_id: 'sp-en', text_version_id: 'tv-en', start: 2, end: 17, exact_text: 'look forward to' },
              { id: 'am-de', span_id: 'sp-de', text_version_id: 'tv-de', start: 4, end: 21, exact_text: 'freue mich darauf' },
            ],
          });
        },
      ],
    ]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    // Stage EN [2,17) and DE [4,22) through the real UI flow.
    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await screen.findByText('Ich freue mich darauf, dich morgen zu sehen.');

    await stageEnglishRange(container, 2, 17);
    expect(await screen.findByText('“look forward to”')).toBeInTheDocument();
    const germanPanel = container.querySelectorAll('.text-panel')[1];
    const germanRoot = germanPanel?.querySelector('[data-text-content-root]');
    const germanText = germanRoot?.firstChild?.firstChild as Text;
    const germanRange = document.createRange();
    germanRange.setStart(germanText, 4);
    germanRange.setEnd(germanText, 21);
    vi.stubGlobal('getSelection', () => ({
      rangeCount: 1,
      getRangeAt: () => germanRange,
      anchorNode: germanText,
      focusNode: germanText,
      anchorOffset: 4,
      focusOffset: 22,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );
    await screen.findByText('“freue mich darauf”');

    // Create Alignment is enabled and fires exactly one request.
    const createButton = screen.getByRole('button', { name: 'Create Alignment' });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);
    await waitFor(() => expect(postedBodies).toHaveLength(1));
    // Coordinates only — quote/direction/contentHash never sent.
    expect(postedBodies[0]).toEqual({
      members: [
        { text_version_id: 'tv-en', start: 2, end: 17 },
        { text_version_id: 'tv-de', start: 4, end: 21 },
      ],
    });

    // Tray cleared only AFTER success; saved alignment appears from the
    // refetched server snapshot.
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
    expect(await screen.findByText('Alignment al-1')).toBeInTheDocument();
    expect(
      screen.getByText(/de — German: “freue mich darauf”/),
    ).toBeInTheDocument();
    expect(screen.getByText(/en — English: “look forward to”/)).toBeInTheDocument();
  });

  it('keeps the tray and shows the error when creation fails', async () => {
    const current = snapshot();
    installFetchMock([
      ['/workspace', () => json(200, current)],
      [
        '/alignments',
        () =>
          json(409, {
            code: 'DUPLICATE_ALIGNMENT_MEMBER',
            message: 'a span cannot appear twice in the same alignment group',
            details: {},
          }),
      ],
    ]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await screen.findByText('Ich freue mich darauf, dich morgen zu sehen.');

    await stageEnglishRange(container, 2, 17);
    await screen.findByText('“look forward to”');
    const germanPanel = container.querySelectorAll('.text-panel')[1];
    const germanRoot = germanPanel?.querySelector('[data-text-content-root]');
    const germanText = germanRoot?.firstChild?.firstChild as Text;
    const germanRange = document.createRange();
    germanRange.setStart(germanText, 4);
    germanRange.setEnd(germanText, 21);
    vi.stubGlobal('getSelection', () => ({
      rangeCount: 1,
      getRangeAt: () => germanRange,
      anchorNode: germanText,
      focusNode: germanText,
      anchorOffset: 4,
      focusOffset: 22,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );
    await screen.findByText('“freue mich darauf”');

    fireEvent.click(screen.getByRole('button', { name: 'Create Alignment' }));

    // Stable envelope error displayed; tray retained for retry; no fake
    // saved alignment appears (the snapshot still has none).
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'DUPLICATE_ALIGNMENT_MEMBER: a span cannot appear twice in the same alignment group',
    );
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
    expect(screen.getByText('“freue mich darauf”')).toBeInTheDocument();
    expect(screen.queryByText(/Alignment al-/)).not.toBeInTheDocument();
    expect(screen.getByText('No saved alignments yet.')).toBeInTheDocument();
  });

  it('Create Alignment is disabled with two members from one TextVersion', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');

    // Two separated EN spans: 2 members, but only ONE distinct version.
    await stageEnglishRange(container, 2, 17);
    await screen.findByText('“look forward to”');
    await stageEnglishRange(container, 18, 28);

    expect(await screen.findByText('“seeing you”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /two different text versions/,
    );
  });
});

describe('WorkspacePage (M0.4 preference-write discipline)', () => {
  it('does not write preferences on ephemeral-only transitions', async () => {
    installFetchMock([['/workspace', () => json(200, snapshot())]]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    await openEnglishPanel();
    await screen.findByText('I look forward to seeing you tomorrow.');

    // Preference state has stabilized (panel open + reconcile settled).
    // From here on, ONLY ephemeral transitions happen (capture -> stage ->
    // capture -> Escape-clear): none of them may touch localStorage.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    setItemSpy.mockClear();

    await stageEnglishRange(container, 2, 17);
    await screen.findByText('“look forward to”');

    stubEnglishSelection(container, 7, 17);
    fireEvent.mouseUp(
      container.querySelector('.text-panel [data-text-content-root]') as HTMLElement,
    );
    await screen.findByText('Selected 7–17: “forward to”');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Selected 7–17: “forward to”')).not.toBeInTheDocument(),
    );

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
