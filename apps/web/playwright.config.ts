import { defineConfig } from '@playwright/test';

/**
 * LinguaGraph M0 Playwright configuration.
 *
 * Starts the FastAPI backend (apps/api, port 8000) and the Vite dev server
 * (port 5173, proxying /api to the backend) before running the E2E slice.
 * Servers are reused when already running (`reuseExistingServer`), which is
 * handy for local iteration.
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
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../api',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
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
