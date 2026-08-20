/**
 * TextPanel (M0.3 + M0.4): one independent, scrollable TextVersion panel.
 *
 * - header shows language tag, label and a hide/close control (accessible
 *   name);
 * - the BODY is the canonical content root ``[data-text-content-root]``:
 *   the ONLY DOM subtree from which canonical offsets may be derived. It
 *   renders the exact canonical server content as FLAT boundary-segmented
 *   runs (``<span data-run data-start data-end>`` with exactly one Text
 *   node each), with ``white-space: pre-wrap`` so whitespace/newlines are
 *   preserved; ``contentRoot.textContent === TextVersion.content`` always;
 * - NO ``dangerouslySetInnerHTML`` (XSS-like input renders as text);
 * - native selection is captured on mouseup/keyup inside the content root
 *   and resolved by the shared selection engine into a PendingSpan;
 * - the explicit "Add to Alignment" action lives OUTSIDE the content root
 *   (panel-local action bar) and stages the already-captured current
 *   selection — the native Selection is never re-read after the click;
 * - Escape / panel-hide cancellation is handled at the workspace level.
 */

import { useRef, useState } from 'react';
import { selectionToCanonical } from '../../shared/text/selection';
import type { PendingSpan, RunDescriptor } from '../../shared/text/types';
import type { TextVersion } from './api';
import { useWorkspaceState } from './state/workspaceContext';

export interface TextPanelProps {
  version: TextVersion;
  runs: RunDescriptor[];
  onHide: () => void;
}

export function TextPanel({ version, runs, onHide }: TextPanelProps) {
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const {
    currentSelection,
    captureSelection,
    clearSelection,
    addCurrentSelectionToTray,
  } = useWorkspaceState();
  const [stagingError, setStagingError] = useState<string | null>(null);

  const isCurrentSelection = currentSelection?.textVersionId === version.id;

  function handleSelectionEvent() {
    const rootElement = contentRootRef.current;
    if (rootElement === null) {
      return;
    }
    const selection = window.getSelection();
    const result = selectionToCanonical(selection, rootElement, {
      id: version.id,
      content: version.content,
      contentHash: version.content_hash,
    });
    if (result.status === 'ok') {
      setStagingError(null);
      const member: PendingSpan = {
        textVersionId: result.textVersionId,
        contentHash: result.contentHash,
        start: result.start,
        end: result.end,
        quote: result.quote,
        direction: result.direction,
      };
      captureSelection(member);
    } else if (result.code === 'EMPTY_SELECTION') {
      // Clicking/collapsing inside the panel cancels the current selection
      // without touching the staged tray.
      clearSelection();
    }
  }

  function handleAddToAlignment() {
    const result = addCurrentSelectionToTray();
    if (result.ok) {
      setStagingError(null);
      // The native Selection is cleared after successful staging; the
      // staged member is kept. Never re-read the native Selection here.
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (result.reason === 'DUPLICATE') {
      setStagingError('This selection is already in the tray.');
    } else if (result.reason === 'OVERLAP') {
      setStagingError(
        'This selection overlaps an existing pending selection in the tray.',
      );
    }
  }

  return (
    <section
      className="text-panel"
      data-text-version-id={version.id}
      aria-label={`Text version ${version.label} (${version.language_tag})`}
    >
      <header className="text-panel-header">
        <span className="language-tag">{version.language_tag}</span>
        <h3 className="panel-label" title={version.label}>
          {version.label}
        </h3>
        <button
          type="button"
          className="panel-close"
          aria-label={`Hide ${version.label} panel`}
          onClick={onHide}
        >
          ✕
        </button>
      </header>
      <div
        ref={contentRootRef}
        className="text-panel-body"
        data-text-content-root
        data-text-version-id={version.id}
        data-content-hash={version.content_hash}
        style={{ whiteSpace: 'pre-wrap' }}
        onMouseUp={handleSelectionEvent}
        onKeyUp={handleSelectionEvent}
      >
        {runs.map((run) => (
          <span
            key={`${run.start}-${run.end}`}
            data-run
            data-start={run.start}
            data-end={run.end}
          >
            {run.text}
          </span>
        ))}
      </div>
      <div className="text-panel-actions">
        {isCurrentSelection && currentSelection !== null ? (
          <p className="selection-status">
            Selected {currentSelection.start}–{currentSelection.end}: “
            {currentSelection.quote}”
          </p>
        ) : null}
        <button
          type="button"
          disabled={!isCurrentSelection}
          onClick={handleAddToAlignment}
        >
          Add to Alignment
        </button>
        {stagingError !== null ? (
          <p className="staging-error" role="alert">
            {stagingError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
