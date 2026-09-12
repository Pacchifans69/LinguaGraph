import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * React Router's data router builds a client-side `Request` for every
 * navigation. Node's undici `Request` brand-checks the `AbortSignal` it is
 * handed, while the jsdom environment installs its own
 * `AbortController`/`AbortSignal` pair that fails that check — so every
 * client-side navigation would throw
 * `RequestInit: Expected signal ... to be an instance of AbortSignal`.
 *
 * Page tests render under a memory DATA router (the application uses
 * `createBrowserRouter`), so make `Request` tolerate the environment's signal
 * while still exposing it on the instance for the router's abort handling.
 * Application code never constructs a `Request` itself.
 */
const NativeRequest = globalThis.Request;

class EnvironmentTolerantRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal, ...rest } = init ?? {};
    super(input, rest);
    if (signal !== undefined && signal !== null) {
      Object.defineProperty(this, 'signal', { value: signal, configurable: true });
    }
  }
}

globalThis.Request = EnvironmentTolerantRequest as unknown as typeof Request;

// Vitest is configured with `globals: false`, so @testing-library/react
// cannot register its automatic DOM cleanup. Register it explicitly so every
// test starts from a clean document.
afterEach(() => {
  cleanup();
});
