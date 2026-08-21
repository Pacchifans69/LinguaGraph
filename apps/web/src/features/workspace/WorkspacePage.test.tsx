/**
 * Workspace page component tests (M0.3 + M0.4): panels, hide/reopen/reorder,
 * per-document preferences, stale-id reconciliation, error presentation and
 * the destructive delete confirmation flow (M0.3); selection capture,
 * explicit Add-to-Alignment staging, the pending tray, Escape semantics,
 * panel-hide lifecycle, stale content-hash reconciliation and document
 * change / remount clearing (M0.4).
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';
import { renderPageAt, createTestQueryClient } from '../../test/harness';
import { installFetchMock, json, type MockResponse } from '../../test/mockFetch';
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

  it('freezes tray/staging while the create request is in flight (G2-F01)', async () => {
    let current = snapshot();
    let createCalled = false;
    // Mutable container: property access is not flow-narrowed across the
    // fetch handler closure, so the test can resolve the deferred POST.
    const pendingCreate: { resolve: ((value: MockResponse) => void) | null } = {
      resolve: null,
    };
    installFetchMock([
      ['/workspace', () => json(200, current)],
      [
        '/alignments',
        () => {
          createCalled = true;
          // Deferred: the POST stays unresolved until the test resolves it.
          return new Promise<MockResponse>((resolve) => {
            pendingCreate.resolve = resolve;
          });
        },
      ],
    ]);
    const { container } = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );

    // Stage a valid alignment (EN + DE) through the real UI flow.
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
      focusOffset: 21,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );
    await screen.findByText('“freue mich darauf”');

    // Click Create Alignment; the POST stays pending.
    fireEvent.click(screen.getByRole('button', { name: 'Create Alignment' }));
    await waitFor(() => expect(createCalled).toBe(true));

    // While pending: Create, Clear, every Remove and Add-to-Alignment
    // staging are all disabled.
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear tray' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove “look forward to” from tray' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove “freue mich darauf” from tray' }),
    ).toBeDisabled();

    // Native selection capture stays active, but staging is frozen: every
    // panel's Add button is disabled and the tray cannot grow.
    stubEnglishSelection(container, 7, 17);
    fireEvent.mouseUp(
      container.querySelector('.text-panel [data-text-content-root]') as HTMLElement,
    );
    await screen.findByText('Selected 7–17: “forward to”');
    const addButtons = screen.getAllByRole('button', { name: 'Add to Alignment' });
    expect(addButtons.length).toBeGreaterThan(0);
    for (const button of addButtons) {
      expect(button).toBeDisabled();
    }
    expect(screen.getAllByRole('button', { name: /Remove “.*” from tray/ })).toHaveLength(2);

    // Resolve the request successfully; the snapshot refetch then carries
    // the persisted alignment.
    const data = snapshot();
    data.spans = [
      {
        id: 'sp-en', text_version_id: 'tv-en', start_offset: 2, end_offset: 17,
        exact_text: 'look forward to', prefix: 'I ', suffix: ' seeing you tomorrow.',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sp-de', text_version_id: 'tv-de', start_offset: 4, end_offset: 21,
        exact_text: 'freue mich darauf', prefix: 'Ich ', suffix: ', dich morgen zu sehen.',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    data.alignment_groups = [{
      id: 'al-1', document_id: 'doc-1', note: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }];
    data.alignment_members = [
      { id: 'am-en', alignment_group_id: 'al-1', span_id: 'sp-en', created_at: 'x' },
      { id: 'am-de', alignment_group_id: 'al-1', span_id: 'sp-de', created_at: 'x' },
    ];
    current = data;
    pendingCreate.resolve?.({
      status: 201,
      body: {
        id: 'al-1', document_id: 'doc-1', note: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        members: [
          { id: 'am-en', span_id: 'sp-en', text_version_id: 'tv-en', start: 2, end: 17, exact_text: 'look forward to' },
          { id: 'am-de', span_id: 'sp-de', text_version_id: 'tv-de', start: 4, end: 21, exact_text: 'freue mich darauf' },
        ],
      },
    });

    // Tray cleared only after success; persisted UI comes from the refetched
    // workspace snapshot; the tray is unfrozen again.
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
    expect(await screen.findByText('Alignment al-1')).toBeInTheDocument();
    expect(screen.getByText(/en — English: “look forward to”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled(); // empty tray
  });

  it('isolates the create mutation per document (HR-F01): a pending doc-A create never leaks into doc B', async () => {
    const doc2 = snapshot();
    doc2.document = { ...doc2.document, id: 'doc-2', title: 'Chapter 2' };
    doc2.text_versions = doc2.text_versions.map((version) => ({
      ...version,
      id: `tv-2-${version.id}`,
      document_id: 'doc-2',
      label: `${version.label} 2`,
    }));

    let createCalled = false;
    const pendingCreate: { resolve: ((value: MockResponse) => void) | null } = {
      resolve: null,
    };
    installFetchMock([
      [
        '/workspace',
        (url) => (url.includes('doc-2') ? json(200, doc2) : json(200, snapshot())),
      ],
      [
        '/alignments',
        () => {
          createCalled = true;
          // Deferred: doc A's POST stays pending until the test resolves it.
          return new Promise<MockResponse>((resolve) => {
            pendingCreate.resolve = resolve;
          });
        },
      ],
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

    // Stage a valid doc-A alignment (EN + DE) and start the create request.
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
      focusOffset: 21,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );
    await screen.findByText('“freue mich darauf”');
    fireEvent.click(screen.getByRole('button', { name: 'Create Alignment' }));
    await waitFor(() => expect(createCalled).toBe(true));

    // Proof precondition: the doc-A create mutation is genuinely in flight
    // (document-scoped mutation cache) when we navigate away.
    expect(
      client.isMutating({ mutationKey: ['alignment-create', 'doc-1'] }),
    ).toBe(1);

    // Doc A is frozen while its create is pending.
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();

    // Navigate the SAME mounted route to doc B while doc A's POST is still
    // pending.
    fireEvent.click(screen.getByRole('link', { name: 'Go to doc 2' }));
    await screen.findByRole('button', { name: /Open English 2/ });

    // Doc B must NOT inherit doc A's isPending/frozen mutation state:
    // staging works and the Add button is enabled.
    fireEvent.click(screen.getByRole('button', { name: /Open English 2/ }));
    await screen.findByText('I look forward to seeing you tomorrow.');
    stubEnglishSelection(container, 2, 17);
    fireEvent.mouseUp(
      container.querySelector('.text-panel [data-text-content-root]') as HTMLElement,
    );
    await screen.findByText('Selected 2–17: “look forward to”');
    const addButtons = screen.getAllByRole('button', { name: 'Add to Alignment' });
    for (const button of addButtons) {
      expect(button).toBeEnabled();
    }
    fireEvent.click(addButtons[0]);
    await screen.findByText('“look forward to”');

    // Resolve doc A's request.
    pendingCreate.resolve?.({
      status: 201,
      body: {
        id: 'al-1', document_id: 'doc-1', note: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        members: [
          { id: 'am-en', span_id: 'sp-en', text_version_id: 'tv-en', start: 2, end: 17, exact_text: 'look forward to' },
          { id: 'am-de', span_id: 'sp-de', text_version_id: 'tv-de', start: 4, end: 21, exact_text: 'freue mich darauf' },
        ],
      },
    });

    // Synchronize: promise resolution is asynchronous, so first wait until
    // the OLD doc-A alignment-create mutation has ACTUALLY settled (its
    // success lifecycle — including the workspace invalidation — has run),
    // then prove doc B's state was untouched by that settlement.
    await waitFor(() => {
      expect(
        client.isMutating({ mutationKey: ['alignment-create', 'doc-1'] }),
      ).toBe(0);
    });

    // Doc B state/tray/error UI remains completely untouched: its own tray
    // member survives, no doc-A saved alignment and no error appear.
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
    expect(screen.queryByText(/Alignment al-/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Doc B remains usable after the doc-A mutation settles: its tray can
    // still be cleared normally.
    fireEvent.click(screen.getByRole('button', { name: 'Clear tray' }));
    await waitFor(() =>
      expect(screen.queryByText('“look forward to”')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
  });

  it('does not display a stale doc-A create error after transitioning to doc B (HR-F01)', async () => {
    const doc2 = snapshot();
    doc2.document = { ...doc2.document, id: 'doc-2', title: 'Chapter 2' };
    doc2.text_versions = doc2.text_versions.map((version) => ({
      ...version,
      id: `tv-2-${version.id}`,
      document_id: 'doc-2',
      label: `${version.label} 2`,
    }));
    installFetchMock([
      [
        '/workspace',
        (url) => (url.includes('doc-2') ? json(200, doc2) : json(200, snapshot())),
      ],
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

    // Doc A: stage a valid alignment and fail the create request.
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
      focusOffset: 21,
      removeAllRanges: vi.fn(),
    }));
    fireEvent.mouseUp(germanRoot as HTMLElement);
    fireEvent.click(
      within(germanPanel as HTMLElement).getByRole('button', { name: 'Add to Alignment' }),
    );
    await screen.findByText('“freue mich darauf”');
    fireEvent.click(screen.getByRole('button', { name: 'Create Alignment' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'DUPLICATE_ALIGNMENT_MEMBER: a span cannot appear twice in the same alignment group',
    );

    // Transition to doc B: the stale doc-A mutation error must not be
    // displayed there (the document-scoped workspace remounts and brings a
    // fresh create mutation observer).
    fireEvent.click(screen.getByRole('link', { name: 'Go to doc 2' }));
    await screen.findByRole('button', { name: /Open English 2/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No saved alignments yet.')).toBeInTheDocument();
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

describe('WorkspacePage (M0.6 alignment visualization)', () => {
  // jsdom has no ResizeObserver; the ConnectorOverlay attaches one while an
  // effective alignment exists. A no-op stub keeps the page-level tests
  // exercising the real wiring without a layout engine.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
  /** Snapshot with one persisted alignment: EN [2,17) <-> DE [4,21). */
  function alignedSnapshot(): WorkspaceSnapshot {
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
    return data;
  }

  async function renderAlignedWorkspace() {
    installFetchMock([
      ['/workspace', () => json(200, alignedSnapshot())],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openEnglishPanel();
    // With persisted alignment data the canonical text is split across runs,
    // so wait on the root textContent (never a full-string match).
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-en"] [data-text-content-root]',
        )?.textContent,
      ).toBe('I look forward to seeing you tomorrow.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-de"] [data-text-content-root]',
        )?.textContent,
      ).toBe('Ich freue mich darauf, dich morgen zu sehen.'),
    );
    return view;
  }

  function alignedRuns(container: HTMLElement): {
    en: HTMLElement[];
    de: HTMLElement[];
  } {
    const panels = Array.from(container.querySelectorAll('.text-panel'));
    const enPanel = panels.find((p) =>
      p.textContent?.includes('I look forward to'),
    );
    const dePanel = panels.find((p) =>
      p.textContent?.includes('Ich freue mich darauf'),
    );
    const en = Array.from(
      enPanel?.querySelectorAll('[data-run]') ?? [],
    ) as HTMLElement[];
    const de = Array.from(
      dePanel?.querySelectorAll('[data-run]') ?? [],
    ) as HTMLElement[];
    return { en, de };
  }

  it('hover propagates across panels, activates on click, and drives the connector overlay', async () => {
    const { container } = await renderAlignedWorkspace();
    const { en, de } = alignedRuns(container);
    // EN runs: [0,2) plain, [2,17) aligned, [17,38) plain.
    expect(en[1].classList.contains('run-aligned')).toBe(true);
    expect(de[1].classList.contains('run-aligned')).toBe(true);
    // No overlay while idle.
    expect(screen.queryByTestId('connector-overlay')).toBeNull();

    // Hover the EN aligned run: counterpart highlight + overlay appear.
    fireEvent.pointerEnter(en[1]);
    expect(de[1].classList.contains('run-hovered')).toBe(true);
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();

    // Click activates: active styling persists after pointer leave; the
    // overlay stays because the ACTIVE alignment wins.
    fireEvent.click(en[1]);
    fireEvent.pointerLeave(en[1]);
    expect(en[1].classList.contains('run-active')).toBe(true);
    expect(de[1].classList.contains('run-active')).toBe(true);
    expect(de[1].classList.contains('run-hovered')).toBe(false);
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();

    // Canonical text is untouched by all visualization interactions.
    for (const panel of Array.from(container.querySelectorAll('.text-panel'))) {
      const root = panel.querySelector('[data-text-content-root]');
      const versionId = root?.getAttribute('data-text-version-id');
      const expected =
        versionId === 'tv-en'
          ? 'I look forward to seeing you tomorrow.'
          : 'Ich freue mich darauf, dich morgen zu sehen.';
      expect(root?.textContent).toBe(expected);
    }
  });

  it('the saved-alignment index activates a group and opens the overlay', async () => {
    const { container } = await renderAlignedWorkspace();
    expect(screen.queryByTestId('connector-overlay')).toBeNull();

    // Keyboard-accessible activation surface: the saved alignment button.
    const activate = screen.getByRole('button', {
      name: 'Activate alignment al-1',
    });
    fireEvent.focus(activate);
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();
    const { en } = alignedRuns(container);
    expect(en[1].classList.contains('run-hovered')).toBe(true);

    fireEvent.click(activate);
    expect(en[1].classList.contains('run-active')).toBe(true);
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();
  });

  it('overlay disappears when the hovered/active alignment is cleared by a snapshot without it', async () => {
    let current = alignedSnapshot();
    installFetchMock([
      [
        '/workspace',
        () => json(200, current),
      ],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openEnglishPanel();
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-en"] [data-text-content-root]',
        )?.textContent,
      ).toBe('I look forward to seeing you tomorrow.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-de"] [data-text-content-root]',
        )?.textContent,
      ).toBe('Ich freue mich darauf, dich morgen zu sehen.'),
    );

    const { en } = alignedRuns(view.container);
    fireEvent.click(en[1]);
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();

    // The snapshot refetches WITHOUT the alignment (deleted server-side):
    // the provider reconciles activeAlignmentId to null -> overlay unmounts.
    current = snapshot();
    await act(async () => {
      await view.queryClient.refetchQueries({ queryKey: ['workspace'] });
    });
    await waitFor(() =>
      expect(screen.queryByTestId('connector-overlay')).toBeNull(),
    );
    // The aligned run is now a plain run again (re-query: runs remounted;
    // without spans the whole text is ONE run, so index 0).
    const reruns = alignedRuns(view.container);
    expect(reruns.en[0].classList.contains('run-active')).toBe(false);
    expect(reruns.en[0].classList.contains('run-aligned')).toBe(false);
  });
});

describe('WorkspacePage (M0.6 Round 2 Alignment Inspector)', () => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  const EN_TEXT = 'I look forward to seeing you tomorrow.';
  const DE_TEXT = 'Ich freue mich darauf, dich morgen zu sehen.';

  function alignedSnapshot(): WorkspaceSnapshot {
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
    return data;
  }

  /** Install the aligned workspace snapshot mock (plus extra handlers). */
  function installAlignedWorkspaceMock(
    extraHandlers: Array<[string, (url: string, init?: RequestInit) => Promise<MockResponse>]> = [],
    workspaceHandler?: () => Promise<MockResponse>,
  ) {
    installFetchMock([
      ['/workspace', workspaceHandler ?? (() => json(200, alignedSnapshot()))],
      ...extraHandlers,
    ]);
  }

  async function renderAligned() {
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openEnglishPanel();
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-en"] [data-text-content-root]',
        )?.textContent,
      ).toBe(EN_TEXT),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-text-version-id="tv-de"] [data-text-content-root]',
        )?.textContent,
      ).toBe(DE_TEXT),
    );
    return view;
  }

  function enAlignedRun(container: HTMLElement): HTMLElement {
    const panels = Array.from(container.querySelectorAll('.text-panel'));
    const enPanel = panels.find((p) => p.textContent?.includes('I look forward to'));
    const runs = Array.from(enPanel?.querySelectorAll('[data-run]') ?? []);
    return runs[1] as HTMLElement;
  }

  it('opens the Inspector on activation and closes it via Close', async () => {
    installAlignedWorkspaceMock();
    const view = await renderAligned();
    expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull();

    fireEvent.click(enAlignedRun(view.container));
    const inspector = await screen.findByRole('region', {
      name: 'Alignment inspector',
    });
    // Snapshot-derived members, human-readable.
    expect(inspector).toHaveTextContent('look forward to');
    expect(inspector).toHaveTextContent('freue mich darauf');
    expect(inspector).toHaveTextContent('English');
    expect(inspector).toHaveTextContent('German');

    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull();
    // Connector overlay also disappears (active cleared).
    expect(screen.queryByTestId('connector-overlay')).toBeNull();
  });

  it('saves a note via PATCH and renders the authoritative refreshed note', async () => {
    let current = alignedSnapshot();
    let patchedBody: unknown = null;
    installAlignedWorkspaceMock([
      [
        '/alignments/',
        (_url, init) => {
          patchedBody = JSON.parse(String(init?.body));
          current = alignedSnapshot();
          current.alignment_groups[0].note = 'Phrase-level correspondence';
          return json(200, {
            id: 'al-1',
            document_id: 'doc-1',
            note: 'Phrase-level correspondence',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            members: [],
          });
          },
        ],
      ],
      () => json(200, current),
    );
    const view = await renderAligned();
    fireEvent.click(enAlignedRun(view.container));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    const textarea = screen.getByLabelText(/Note/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Phrase-level correspondence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(patchedBody).toEqual({ note: 'Phrase-level correspondence' }));
    // Authoritative refetch: the Inspector and the saved list show the note.
    await waitFor(() =>
      expect(screen.getByLabelText(/Note/)).toHaveValue(
        'Phrase-level correspondence',
      ),
    );
    expect(screen.getByText('“Phrase-level correspondence”')).toBeInTheDocument();
  });

  it('deletes the alignment with confirmation; refetch reconciles Inspector and state closed', async () => {
    let current = alignedSnapshot();
    let deleted = false;
    installAlignedWorkspaceMock(
      [
        [
          '/alignments/',
          (_url, init) => {
            expect(String(init?.method)).toBe('DELETE');
            deleted = true;
            current = snapshot(); // group + spans + members gone
            return json(204, undefined);
          },
        ],
      ],
      () => json(200, current),
    );
    const view = await renderAligned();
    fireEvent.click(enAlignedRun(view.container));
    await screen.findByRole('region', { name: 'Alignment inspector' });
    expect(screen.getByTestId('connector-overlay')).toBeInTheDocument();

    // Confirmation is required; cancel first, then confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    // Re-query the fresh dialog (the first one was unmounted by Cancel).
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Confirm delete',
      }),
    );

    // After the authoritative refetch: Inspector closed, overlay gone,
    // indicators gone, saved list empty.
    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull(),
    );
    expect(screen.queryByTestId('connector-overlay')).toBeNull();
    expect(screen.getByText('No saved alignments yet.')).toBeInTheDocument();
    const reruns = Array.from(
      view.container.querySelectorAll('[data-run]'),
    ) as HTMLElement[];
    expect(reruns.every((run) => !run.classList.contains('run-aligned'))).toBe(true);
  });
});
