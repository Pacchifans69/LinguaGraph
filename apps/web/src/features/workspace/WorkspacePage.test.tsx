/**
 * Workspace page component tests (M0.3): panels, hide/reopen/reorder,
 * per-document preferences, stale-id reconciliation, error presentation and
 * the destructive delete confirmation flow.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePage } from './WorkspacePage';
import { renderPageAt } from '../../test/harness';
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
