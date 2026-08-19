/**
 * Projects page tests (M0.3): project list/navigation rendering, create and
 * delete mutations through the API boundary, and error presentation.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';
import { installFetchMock, json } from '../../test/mockFetch';
import { renderWithProviders } from '../../test/harness';

const PROJECT = {
  id: 'proj-1',
  name: 'Corpus',
  description: 'Main corpus',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPage', () => {
  it('navigates and renders the project list', async () => {
    installFetchMock([['/projects', () => json(200, [PROJECT])]]);
    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText('Corpus')).toBeInTheDocument();
    expect(screen.getByText('Main corpus')).toBeInTheDocument();
    // Navigation link to that project's documents.
    const link = screen.getByRole('link', { name: /Corpus/ });
    expect(link.getAttribute('href')).toBe('/projects/proj-1/documents');
  });

  it('renders an empty state when there are no projects', async () => {
    installFetchMock([['/projects', () => json(200, [])]]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
  });

  it('creates a project and refreshes the list', async () => {
    let projects: typeof PROJECT[] = [];
    let listFetches = 0;
    installFetchMock([
      [
        '/projects',
        (_url, init) => {
          if (init?.method === 'POST') {
            projects = [{ ...PROJECT, name: 'New Corpus' }];
            return json(201, projects[0]);
          }
          listFetches += 1;
          return json(200, projects);
        },
      ],
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText(/No projects yet/);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New Corpus' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    // Mutation succeeded -> the list refetch includes the new project.
    expect(await screen.findByText('New Corpus')).toBeInTheDocument();
    expect(listFetches).toBeGreaterThanOrEqual(2);
  });

  it('deletes a project', async () => {
    const deleteCalls: string[] = [];
    let projects = [PROJECT];
    installFetchMock([
      [
        '/projects',
        (_url, init) => {
          if (init?.method === 'DELETE') {
            deleteCalls.push(_url);
            projects = [];
            return json(204, null);
          }
          return json(200, projects);
        },
      ],
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText('Corpus');

    fireEvent.click(screen.getByRole('button', { name: 'Delete project Corpus' }));
    await waitFor(() => expect(deleteCalls).toEqual(['/api/v1/projects/proj-1']));
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
  });

  it('presents API errors via the error boundary', async () => {
    installFetchMock([
      [
        '/projects',
        () =>
          json(500, {
            code: 'INTERNAL_ERROR',
            message: 'an unexpected internal error occurred',
            details: {},
          }),
      ],
    ]);
    renderWithProviders(<ProjectsPage />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/INTERNAL_ERROR/)).toBeInTheDocument();
  });
});
