import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest is configured with `globals: false`, so @testing-library/react
// cannot register its automatic DOM cleanup. Register it explicitly so every
// test starts from a clean document.
afterEach(() => {
  cleanup();
});
