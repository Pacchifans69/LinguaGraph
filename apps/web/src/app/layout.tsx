/**
 * App layout: fixed global header (with the API health indicator) and the
 * routed feature pages below it.
 */

import { Outlet } from 'react-router-dom';
import { HealthStatus } from './HealthStatus';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>LinguaGraph</h1>
        <HealthStatus />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
