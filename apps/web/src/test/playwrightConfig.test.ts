/**
 * Guard test (M0.3 human review findings A + final review): the Playwright
 * E2E configuration must never be able to reach the normal development
 * backend/database.
 *
 * Mechanically verifies that:
 * - the API webServer runs the disposable-database wrapper
 *   (`app.e2e.server`) — never a bare `uvicorn app.main:app` on the default
 *   DATABASE_URL — and is never reused;
 * - the Vite webServer is started fresh for every run (never reused), fails
 *   closed on an occupied port (`--strictPort`), and its `/api` proxy target
 *   (`VITE_API_PROXY_TARGET`) is derived from the SAME port the isolated API
 *   binds — the browser's API requests cannot fall back to a development
 *   backend on another port (e.g. the default 8000);
 * - a `globalTeardown` is registered (Playwright kills webServers with
 *   SIGKILL, so the surviving Node teardown drops the disposable DB);
 * - the spec performs no cleanup of pre-existing data (it must not delete
 *   data it did not create).
 *
 * The actual database-name guard (exact `linguagraph_e2e_` namespace) is
 * enforced by `app.db.disposable.assert_disposable_db_url`, unit-tested in
 * `apps/api/app/tests/unit/test_disposable_db.py`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

const configRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webServers = (config as { webServer?: Array<Record<string, unknown>> })
  .webServer ?? [];

describe('Playwright E2E database isolation', () => {
  const apiServer = webServers.find((server) =>
    String(server.command).includes('app.e2e.server'),
  );
  const viteServer = webServers.find((server) =>
    String(server.command).includes('npm run dev'),
  );

  it('starts the API through the disposable-database wrapper', () => {
    expect(apiServer).toBeDefined();
    expect(String(apiServer?.command)).toContain('python -m app.e2e.server');
    expect(String(apiServer?.command)).not.toMatch(/uvicorn app\.main:app/);
  });

  it('never reuses an already-running backend', () => {
    expect(apiServer?.reuseExistingServer).toBe(false);
  });

  it('does not start a backend on the default DATABASE_URL anywhere', () => {
    for (const server of webServers) {
      expect(String(server.command)).not.toMatch(/uvicorn app\.main:app/);
    }
  });

  it('never reuses an arbitrary Vite dev server for E2E', () => {
    expect(viteServer).toBeDefined();
    // A reused Vite instance's proxy target cannot be proven to be the
    // isolated API, so E2E must always start its own.
    expect(viteServer?.reuseExistingServer).toBe(false);
    // Fail closed: an occupied port aborts the run instead of silently
    // moving to another port or falling back to a dev service.
    expect(String(viteServer?.command)).toContain('--strictPort');
  });

  it('proxies the E2E Vite instance to the SAME isolated API port', () => {
    const apiCommand = String(apiServer?.command);
    const apiPortMatch = /--port (\d+)/.exec(apiCommand);
    expect(apiPortMatch).not.toBeNull();
    const apiPort = apiPortMatch?.[1] as string;

    const viteEnv = (viteServer?.env ?? {}) as Record<string, string>;
    // The proxy target is derived from the SAME port the isolated API binds
    // (parsed from the API webServer command) — whatever that port is, the
    // browser's /api requests can only reach the isolated backend.
    expect(viteEnv.VITE_API_PROXY_TARGET).toBe(
      `http://127.0.0.1:${apiPort}`,
    );

    // The Vite command binds the same port its readiness URL checks.
    const vitePortMatch = /--port (\d+)/.exec(String(viteServer?.command));
    expect(vitePortMatch?.[1]).toBeDefined();
    expect(String(viteServer?.url)).toContain(
      `http://127.0.0.1:${vitePortMatch?.[1]}`,
    );
  });

  it('registers a globalTeardown that drops the disposable database', () => {
    const teardown = config.globalTeardown as string | undefined;
    expect(teardown).toBeDefined();
    const teardownPath = resolve(configRoot, String(teardown));
    expect(existsSync(teardownPath)).toBe(true);
    const source = readFileSync(teardownPath, 'utf-8');
    expect(source).toContain('app.e2e.drop');
  });

  it('runs the golden-path spec without cleanup of pre-existing data', () => {
    const spec = readFileSync(
      resolve(configRoot, 'e2e/golden-path.spec.ts'),
      'utf-8',
    );
    // The spec must not delete data it did not create (no clean-slate
    // deletion of pre-existing projects/documents).
    expect(spec).not.toContain('request.delete(');
  });
});
