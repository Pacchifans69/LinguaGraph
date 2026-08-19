import { defineConfig } from '@playwright/test';

/**
 * LinguaGraph M0 Playwright configuration.
 *
 * Fail-closed E2E isolation (M0.3 final human review finding A):
 *
 * - the API webServer runs `app.e2e.server` (apps/api), which creates a
 *   uniquely-named disposable PostgreSQL database (linguagraph_e2e_<uuid>),
 *   migrates it to Alembic HEAD, serves uvicorn against ONLY that database
 *   and records its URL for the globalTeardown drop;
 * - `reuseExistingServer: false` for the API: an already-running backend
 *   whose DATABASE_URL cannot be proven to be the E2E database is NEVER
 *   reused;
 * - the Vite webServer is started fresh for every run
 *   (`reuseExistingServer: false`) with `--strictPort` (fails if the port is
 *   taken instead of silently moving), and its `/api` proxy target is set
 *   via `VITE_API_PROXY_TARGET` to EXACTLY the same
 *   `http://127.0.0.1:<PLAYWRIGHT_API_PORT>` the isolated API binds — both
 *   are derived from the single `API_PORT` constant below, so the browser's
 *   API requests can never reach a development backend on another port
 *   (e.g. the default 8000);
 * - the spec performs no cleanup of pre-existing data (it must not delete
 *   data it did not create); the disposable database is dropped after the
 *   run.
 *
 * Normal `npm run dev` is unaffected: without `VITE_API_PROXY_TARGET` it
 * keeps the ordinary development backend default (http://localhost:8000).
 */

const PORT = process.env.PLAYWRIGHT_PORT ?? '5173';
const API_PORT = process.env.PLAYWRIGHT_API_PORT ?? '8000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Runs after every run (even on failure/SIGKILL of the API webServer):
  // drops the disposable E2E database recorded by app.e2e.server.
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // E2E backend on an isolated disposable PostgreSQL database.
      command: `uv run python -m app.e2e.server --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../api',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Fresh Vite instance whose /api proxy targets the SAME isolated API
      // port (API_PORT). Never reused; fails closed if the port is taken.
      command: `npm run dev -- --port ${PORT} --host 127.0.0.1 --strictPort`,
      cwd: '.',
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
