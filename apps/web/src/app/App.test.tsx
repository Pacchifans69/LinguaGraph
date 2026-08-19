import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { routes } from './router';

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        };
      }
      if (url.endsWith('/api/v1/projects')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      throw new Error(`unexpected fetch in App test: ${url}`);
    }),
  );
}

describe('App shell with routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the shell, reports API status, and renders the projects route', async () => {
    stubApi();
    // Start directly at /projects: the memory (data) router would otherwise
    // build a native Request for the index redirect, which clashes with the
    // jsdom AbortSignal realm under Vitest. The redirect itself is exercised
    // by the Playwright golden path in a real browser.
    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ['/projects'],
    });
    render(<App routerOverride={memoryRouter} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'LinguaGraph' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('API ok')).toBeInTheDocument();
    expect(
      await screen.findByText(/No projects yet/),
    ).toBeInTheDocument();
  });
});
