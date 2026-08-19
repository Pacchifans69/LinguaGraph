/**
 * Playwright global teardown (M0.3 review finding A).
 *
 * Playwright kills webServer processes with SIGKILL, so the E2E backend
 * process cannot guarantee its own database cleanup. This teardown runs in
 * the (surviving) Node process after every run and drops the disposable E2E
 * database recorded by `app.e2e.server` in `apps/api/.e2e-db-url`.
 *
 * The drop shells back into the API's Python (app.e2e.drop), which fails
 * closed unless the database name carries the reserved `linguagraph_e2e_`
 * prefix — the development database can never be targeted.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = resolve(configRoot, '../api/.e2e-db-url');
const apiRoot = resolve(configRoot, '../api');

export default function globalTeardown() {
  if (!existsSync(stateFile)) {
    return;
  }
  try {
    const url = readFileSync(stateFile, 'utf-8').trim();
    if (!url) {
      return;
    }
    execFileSync(
      'uv',
      ['run', 'python', '-m', 'app.e2e.drop', '--url', url],
      { cwd: apiRoot, stdio: 'inherit', timeout: 60_000 },
    );
  } finally {
    rmSync(stateFile, { force: true });
  }
}
