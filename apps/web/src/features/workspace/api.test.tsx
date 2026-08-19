/**
 * Workspace query + mutation invalidation tests (M0.3): creating or importing
 * a TextVersion must invalidate the ['workspace', documentId] query so panels
 * refetch the canonical server content.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateTextVersion,
  useImportTextVersionFile,
  useWorkspace,
  type TextVersion,
  type WorkspaceSnapshot,
} from './api';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';

function version(id: string, label: string, language_tag: string): TextVersion {
  return {
    id,
    document_id: 'doc-1',
    language_tag,
    label,
    content: `${label} content`,
    content_hash: `h-${id}`,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function baseSnapshot(versions: TextVersion[]): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1',
      project_id: 'proj-1',
      title: 'Chapter 1',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: versions,
    spans: [],
    alignment_groups: [],
    alignment_members: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace query + mutation invalidation', () => {
  it('workspace hook resolves and create invalidates the workspace query', async () => {
    let versions = [version('tv-en', 'English', 'en')];
    let workspaceFetches = 0;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, baseSnapshot(versions));
        },
      ],
      [
        '/text-versions',
        (_url, init) => {
          if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body)) as {
              language_tag: string;
              label: string;
            };
            const created = version('tv-it', body.label, body.language_tag);
            versions = [...versions, created];
            return json(201, created);
          }
          return json(200, versions);
        },
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const create = useCreateTextVersion('doc-1');
      return (
        <div>
          <span data-testid="count">
            {workspace.data ? workspace.data.text_versions.length : 'loading'}
          </span>
          <button
            onClick={() =>
              create.mutate({
                language_tag: 'it',
                label: 'Italian',
                content: 'ciao',
              })
            }
          >
            create
          </button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    const fetchesBefore = workspaceFetches;
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    // Workspace invalidated and refetched; count reflects the new version.
    await waitFor(() => expect(workspaceFetches).toBeGreaterThan(fetchesBefore));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });

  it('file import invalidates the workspace query', async () => {
    let versions = [version('tv-en', 'English', 'en')];
    let workspaceFetches = 0;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, baseSnapshot(versions));
        },
      ],
      [
        '/text-versions',
        (_url, init) => {
          if (init?.method === 'POST' && init?.body instanceof FormData) {
            const languageTag = String(init.body.get('language_tag'));
            const label = String(init.body.get('label'));
            const created = version('tv-de', label, languageTag);
            versions = [...versions, created];
            return json(201, created);
          }
          return json(200, versions);
        },
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const importVersion = useImportTextVersionFile('doc-1');
      return (
        <div>
          <span data-testid="count">
            {workspace.data ? workspace.data.text_versions.length : 'loading'}
          </span>
          <button
            onClick={() =>
              importVersion.mutate({
                file: new File(['content'], 'de.txt', { type: 'text/plain' }),
                language_tag: 'de',
                label: 'German',
              })
            }
          >
            import
          </button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    const fetchesBefore = workspaceFetches;
    fireEvent.click(screen.getByRole('button', { name: 'import' }));

    await waitFor(() => expect(workspaceFetches).toBeGreaterThan(fetchesBefore));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });
});
