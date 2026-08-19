/**
 * Guard test (M0.3 human review finding A): the Playwright E2E configuration
 * must never be able to target the normal development database.
 *
 * Mechanically verifies that:
 * - the API webServer runs the disposable-database wrapper
 *   (`app.e2e.server`) — never a bare `uvicorn app.main:app` on the default
 *   DATABASE_URL;
 * - `reuseExistingServer` is NOT enabled for the API webServer (an
 *   already-running backend whose DATABASE_URL cannot be proven to be the
 *   E2E database must never be reused);
 * - a `globalTeardown` is registered (Playwright kills webServers with
 *   SIGKILL, so the surviving Node teardown drops the disposable DB);
 * - the spec performs no cleanup of pre-existing data (it must not delete
 *   data it did not create).
 *
 * The actual database-name guard (fail-closed on the linguagraph_e2e prefix)
 * is enforced by `app.db.disposable.assert_disposable_db_url`, unit-tested
 * in `apps/api/app/tests/unit/test_disposable_db.py`.
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
