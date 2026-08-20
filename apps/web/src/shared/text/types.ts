/**
 * Shared text/selection domain types (M0.4).
 *
 * These types are framework-light and deliberately have no dependency on the
 * workspace API types: the selection engine and segmentation operate on
 * structural inputs so they stay unit-testable outside React.
 */

/** A Unicode code-point offset into canonical TextVersion content (ADR-001). */
export type CodePointOffset = number;

/** Provenance of a native selection: where the user pressed vs released. */
export type SelectionDirection = 'forward' | 'backward';

/**
 * A captured selection staged for a future alignment (ADR-007).
 *
 * Authority:
 * - `textVersionId` / `start` / `end` are the coordinate identity;
 * - `quote` is derived display/integrity metadata;
 * - `contentHash` is a stale-selection guard;
 * - `direction` is interaction provenance.
 *
 * PendingSpan is FRONTEND-ONLY in M0.4: it is never persisted, never sent to
 * the API, and never written to localStorage.
 */
export interface PendingSpan {
  textVersionId: string;
  contentHash: string;
  start: CodePointOffset;
  end: CodePointOffset;
  quote: string;
  direction: SelectionDirection;
}

/**
 * One minimal flat run produced by boundary segmentation.
 *
 * Runs are contiguous (`next.start === previous.end`), non-empty and their
 * concatenated `text` equals the canonical content exactly. `spanIds` /
 * `alignmentGroupIds` are the membership sets of every persisted span (and
 * its alignment groups) covering `[start, end)`.
 */
export interface RunDescriptor {
  start: CodePointOffset;
  end: CodePointOffset;
  text: string;
  spanIds: string[];
  alignmentGroupIds: string[];
}
