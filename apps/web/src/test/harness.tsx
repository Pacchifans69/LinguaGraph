/**
 * Shared test harness: fresh TanStack Query client + memory router.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient,
    route = '/',
    initialEntries = [route],
  }: { queryClient?: QueryClient; route?: string; initialEntries?: string[] } = {},
) {
  const client = queryClient ?? createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper }), queryClient: client };
}

/**
 * Render a page under a real route so `useParams`/navigation resolve.
 * `path` is the Route path pattern (e.g. '/documents/:documentId/workspace').
 */
export function renderPageAt(
  ui: ReactElement,
  path: string,
  initialEntry: string,
  queryClient?: QueryClient,
) {
  const client = queryClient ?? createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path={path} element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper }), queryClient: client };
}
