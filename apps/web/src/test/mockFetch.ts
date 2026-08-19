/**
 * fetch mocking helper for frontend component/hook tests.
 */

import { vi } from 'vitest';

export interface MockResponse {
  status: number;
  body: unknown;
}

export type Handler = (url: string, init?: RequestInit) => Promise<MockResponse>;

/** Installs a global fetch that dispatches by URL substring, in order. */
export function installFetchMock(handlers: Array<[pattern: string, Handler]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({ url, init });
      for (const [pattern, handler] of handlers) {
        if (url.includes(pattern)) {
          const { status, body } = await handler(url, init);
          return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
          } as Response;
        }
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({
          code: 'NOT_FOUND',
          message: 'not found',
          details: {},
        }),
      } as Response;
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export function json<T>(status: number, body: T): Promise<MockResponse> {
  return Promise.resolve({ status, body });
}
