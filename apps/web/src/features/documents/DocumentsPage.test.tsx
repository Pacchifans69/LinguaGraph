/**
 * Documents page tests (M0.3): document list rendering under a project,
 * navigation into the workspace, create, and error presentation.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from './DocumentsPage';
import { installFetchMock, json } from '../../test/mockFetch';
import { renderPageAt } from '../../test/harness';

const PROJECT = {
  id: 'proj-1',
  name: 'Corpus',
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DOCS = [
  {
    id: 'doc-1',
    project_id: 'proj-1',
    title: 'Le Petit Prince — Chapitre 1',
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentsPage', () => {
  it('renders the breadcrumb project, the document list and workspace links', async () => {
    installFetchMock([
      // Most specific first: the documents URL ends with .../documents.
      ['/projects/proj-1/documents', () => json(200, DOCS)],
      ['/projects/proj-1', () => json(200, PROJECT)],
    ]);
    renderPageAt(
      <DocumentsPage />,
      '/projects/:projectId/documents',
      '/projects/proj-1/documents',
    );

    expect(await screen.findByText('Le Petit Prince — Chapitre 1')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Le Petit Prince/ });
    expect(link.getAttribute('href')).toBe('/documents/doc-1/workspace');
    // Breadcrumb shows the project name.
    expect(screen.getByText('Corpus')).toBeInTheDocument();
  });

  it('creates a document and refreshes the list', async () => {
    let snapshot: typeof DOCS = [];
    installFetchMock([
      [
        '/projects/proj-1/documents',
        (_url, init) => {
          if (init?.method === 'POST') {
            snapshot = [{ ...DOCS[0], title: 'New Chapter' }];
            return json(201, snapshot[0]);
          }
          return json(200, snapshot);
        },
      ],
      ['/projects/proj-1', () => json(200, PROJECT)],
    ]);
    renderPageAt(
      <DocumentsPage />,
      '/projects/:projectId/documents',
      '/projects/proj-1/documents',
    );
    await screen.findByText(/No documents in this project yet/);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Chapter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));

    expect(await screen.findByText('New Chapter')).toBeInTheDocument();
  });

  it('presents file-not-found style errors via the error boundary', async () => {
    installFetchMock([
      [
        '/projects/proj-1/documents',
        () => json(404, { code: 'NOT_FOUND', message: 'project not found', details: { project_id: 'proj-1' } }),
      ],
    ]);
    renderPageAt(
      <DocumentsPage />,
      '/projects/:projectId/documents',
      '/projects/proj-1/documents',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('NOT_FOUND: project not found');
  });

  it('surfaces a failed document delete as a visible API error (M0.7 W3)', async () => {
    installFetchMock([
      [
        '/documents/',
        (_url, init) => {
          if (init?.method === 'DELETE') {
            return json(500, {
              code: 'INTERNAL_ERROR',
              message: 'an unexpected internal error occurred',
              details: {},
            });
          }
          return json(404, {
            code: 'NOT_FOUND',
            message: 'not found',
            details: {},
          });
        },
      ],
      [
        '/projects/proj-1/documents',
        () => json(200, DOCS),
      ],
      ['/projects/proj-1', () => json(200, PROJECT)],
    ]);
    renderPageAt(
      <DocumentsPage />,
      '/projects/:projectId/documents',
      '/projects/proj-1/documents',
    );
    await screen.findByText('Le Petit Prince — Chapitre 1');

    // The failing delete must NOT fail silently: the stable envelope is
    // displayed and the row survives.
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete document Le Petit Prince — Chapitre 1' }),
    );
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/INTERNAL_ERROR/)).toBeInTheDocument();
    expect(screen.getByText('Le Petit Prince — Chapitre 1')).toBeInTheDocument();
  });
});
