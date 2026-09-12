/**
 * Shared test harness: fresh TanStack Query client + memory router.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';

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
 *
 * The application router is a DATA router (`createBrowserRouter`), so page
 * tests render under a memory data router of the same kind; data-router-only
 * APIs such as `useBlocker` then behave exactly as they do in the app.
 * `extraRoutes` lets a test provide real navigation destinations.
 */
export function renderPageAt(
  ui: ReactElement,
  path: string,
  initialEntry: string,
  queryClient?: QueryClient,
  extraRoutes: RouteObject[] = [],
) {
  const client = queryClient ?? createTestQueryClient();
  const router = createMemoryRouter(
    [{ path, element: ui }, ...extraRoutes],
    { initialEntries: [initialEntry] },
  );
  return {
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    queryClient: client,
    router,
  };
}
