/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * API proxy target.
 *
 * - Normal `npm run dev`: defaults to the ordinary development backend on
 *   `http://localhost:8000`.
 * - Playwright E2E: `playwright.config.ts` starts this same Vite dev server
 *   with `VITE_API_PROXY_TARGET` set to the ISOLATED disposable API
 *   (http://127.0.0.1:<PLAYWRIGHT_API_PORT>), so the browser's `/api`
 *   requests can only reach the isolated backend — never a development
 *   backend on a different port. The Playwright Vite instance is never
 *   reused (`reuseExistingServer: false`) and fails on an unavailable port
 *   (`--strictPort`), so there is no path back to the development backend.
 */
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev proxy: /api -> FastAPI backend (apps/api).
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Restrict Vitest to the source tree: the Playwright specs under e2e/
    // must only run through `playwright test`, not Vitest.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
