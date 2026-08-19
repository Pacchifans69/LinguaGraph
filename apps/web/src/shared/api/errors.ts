/**
 * Shared API error boundary (M0.3).
 *
 * The backend exposes every expected failure through a stable envelope
 * `{ code, message, details }` (spec section 33 / report section 9). The
 * frontend NEVER parses database exception strings — it consumes this
 * envelope. Unexpected/transport failures are surfaced as ApiError with a
 * `code` of `NETWORK_ERROR` or `INTERNAL_ERROR`.
 */

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }

  isCode(code: string): boolean {
    return this.code === code;
  }
}

/** Build an ApiError from a non-OK HTTP response body, if it is parseable. */
export async function errorFromResponse(
  response: Response,
): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (
    payload !== null &&
    typeof payload === 'object' &&
    'code' in payload &&
    typeof (payload as ApiErrorEnvelope).code === 'string'
  ) {
    const envelope = payload as ApiErrorEnvelope;
    return new ApiError(
      response.status,
      envelope.code,
      envelope.message,
      envelope.details ?? {},
    );
  }
  // Defensive fallback: never leak response internals as a stable message.
  return new ApiError(
    response.status,
    'INTERNAL_ERROR',
    `Request failed with HTTP ${response.status}`,
  );
}

/** True when `error` is one of the frontend-consumable API errors. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
