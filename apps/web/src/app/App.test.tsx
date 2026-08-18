import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the application shell and reports API status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      })),
    );

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'LinguaGraph' }),
    ).toBeInTheDocument();
    // TanStack Query resolves the health request against the mocked fetch.
    expect(await screen.findByText('API ok')).toBeInTheDocument();
  });
});
