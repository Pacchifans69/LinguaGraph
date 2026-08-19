import { defineConfig } from '@playwright/test';

/**
 * LinguaGraph M0 Playwright configuration.
 *
 * Backend isolation (M0.3 human review finding A):
 * - the API webServer runs `app.e2e.server` (apps/api), which creates a
 *   uniquely-named disposable PostgreSQL database (linguagraph_e2e_<uuid>),
 *   migrates it to Alembic HEAD, serves uvicorn against ONLY that database
 *   and drops it on exit;
 * - `reuseExistingServer: false` for the API: an already-running backend
 *   whose DATABASE_URL cannot be proven to be the E2E database is NEVER
 *   reused;
 * - the spec performs no cross-database cleanup (it must not delete data it
 *   did not create); the disposable database is dropped after the run.
 *
 * The Vite dev server (static/proxy only, no database access) may be reused
 * when already running for local iteration.
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
      command: `npm run dev -- --port ${PORT} --host 127.0.0.1`,
      cwd: '.',
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
