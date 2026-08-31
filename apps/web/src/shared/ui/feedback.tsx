/** Shared semantic feedback states for feature pages and workbench flows. */

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
    <p
      role="alert"
      className="error-message feedback-state feedback-state--error"
      data-error-code={code}
    >
      <span className="feedback-state-label">Error</span>
      <span>{code ? `${code}: ${message}` : message}</span>
    </p>
  );
}

export function LoadingMessage({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p role="status" className="loading-message feedback-state feedback-state--loading">
      <span className="feedback-state-indicator" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="empty-state feedback-state feedback-state--empty">
      <span className="feedback-state-label">Empty</span>
      <span>{children}</span>
    </p>
  );
}
