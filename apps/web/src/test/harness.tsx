/**
 * Shared test harness: fresh TanStack Query client + memory router.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { transferableAbortController } from 'node:util';
import { afterEach } from 'vitest';
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

/**
 * React Router's data router constructs an `AbortController` for every
 * navigation and hands its `AbortSignal` to `new Request(url, { signal })`.
 * The jsdom environment installs jsdom's own `AbortController`, and Node's
 * undici `Request` brand-checks the signal against its internal class — so in
 * jsdom every navigation throws
 * `RequestInit: Expected signal ... to be an instance of AbortSignal`. No
 * signal reachable from the jsdom realm satisfies that check (not even
 * `new Request(url).signal`), so a navigation cannot be exercised under a data
 * router with the environment's controller.
 *
 * `node:util`'s `transferableAbortController()` returns a Node-native
 * controller. Its signal IS accepted by the native `Request`, so the request
 * keeps genuine cancellation semantics: `signal` stays the native prototype
 * accessor and the request's signal natively follows the controller's signal
 * (`aborted`, `reason` and abort listeners all behave as they do in a browser)
 * instead of being re-attached as an own property on a request that never
 * received it.
 *
 * The swap is scoped to tests that actually render a data router and is
 * restored after each test, so the rest of the suite keeps the environment's
 * own `AbortController`.
 */
const EnvironmentAbortController = globalThis.AbortController;
let dataRouterAbortControllerInstalled = false;

/** Node-native controller shaped like the DOM `AbortController` the router uses. */
class DataRouterAbortController {
  readonly #controller = transferableAbortController();

  get signal(): AbortSignal {
    return this.#controller.signal as unknown as AbortSignal;
  }

  abort(reason?: unknown): void {
    this.#controller.abort(reason);
  }
}

function installDataRouterAbortController(): void {
  if (dataRouterAbortControllerInstalled) {
    return;
  }
  globalThis.AbortController =
    DataRouterAbortController as unknown as typeof AbortController;
  dataRouterAbortControllerInstalled = true;
}

/** Restore the environment's own `AbortController` (idempotent). */
export function restoreDataRouterAbortController(): void {
  if (!dataRouterAbortControllerInstalled) {
    return;
  }
  globalThis.AbortController = EnvironmentAbortController;
  dataRouterAbortControllerInstalled = false;
}

afterEach(restoreDataRouterAbortController);

/**
 * Create a memory DATA router for page tests, installing the Node-native
 * navigation controller required to build React Router's per-navigation
 * `Request` in jsdom (see above).
 */
export function createPageRouter(
  routes: RouteObject[],
  initialEntries: string[],
) {
  installDataRouterAbortController();
  return createMemoryRouter(routes, { initialEntries });
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
  const router = createPageRouter(
    [{ path, element: ui }, ...extraRoutes],
    [initialEntry],
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
