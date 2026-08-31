/**
 * App layout: global product identity and routed feature pages.
 */

import { Outlet } from 'react-router-dom';
import { HealthStatus } from './HealthStatus';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">LG</span>
          <div>
            <h1>LinguaGraph</h1>
            <p className="app-subtitle">Manual Alignment Workbench</p>
          </div>
        </div>
        <HealthStatus />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
