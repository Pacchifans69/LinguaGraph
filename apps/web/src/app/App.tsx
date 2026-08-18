import { HealthStatus } from './HealthStatus';
import { Providers } from './providers';

export function App() {
  return (
    <Providers>
      <div className="app-shell">
        <header className="app-header">
          <h1>LinguaGraph</h1>
        </header>
        <main className="app-main">
          <HealthStatus />
        </main>
      </div>
    </Providers>
  );
}
