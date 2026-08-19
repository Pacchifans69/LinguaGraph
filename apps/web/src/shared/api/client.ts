/**
 * Minimal shared HTTP client for the LinguaGraph API (M0.3).
 *
 * Wraps `fetch` with JSON serialization and the standard error-envelope
 * parsing. Mutations are plain typed functions; TanStack Query hooks wrap
 * them for server-state ownership (features/.../api.ts).
 */

import { ApiError, errorFromResponse } from './errors';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  return (await response.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, jsonInit('POST', body));
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, jsonInit('PATCH', body));
  },

  del<T = void>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },

  /** Utility exposed for tests and custom (e.g. multipart) requests. */
  request,
};

export { ApiError };
