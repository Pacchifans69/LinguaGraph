/**
 * Small presentational helpers shared across feature pages (M0.3).
 */

import type { ReactNode } from 'react';
import { isApiError } from '../api/errors';

export function ErrorMessage({ error }: { error: unknown }) {
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong';
  const code = isApiError(error) ? error.code : undefined;
  return (
    <p role="alert" className="error-message" data-error-code={code}>
      {code ? `${code}: ${message}` : message}
    </p>
  );
}

export function LoadingMessage({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p role="status" className="loading-message">
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
