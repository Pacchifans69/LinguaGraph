/**
 * TextPanel (M0.3 + M0.4 + M0.6): one independent, scrollable TextVersion
 * panel.
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
 *
 * M0.6 (Round 1) visualization:
 *
 * - every run element registers itself in the RenderedSpanRegistry for its
 *   ``run.spanIds`` (the canonical span->DOM bridge; NO data-span-id
 *   selector discovery);
 * - run elements carry ONLY class-based annotation/hover/active presentation
 *   (no per-character DOM, no buttons/icons/text inside the content root),
 *   so the canonical textContent invariant and native text selection are
 *   untouched;
 * - a run in exactly one alignment group: pointer enter hovers that group,
 *   pointer leave clears it, click activates it (persists after leave; no
 *   click-to-toggle-off in Round 1);
 * - a run in several groups: pointer enter sets NO group (ambiguous cue
 *   only), click opens a minimal explicit group chooser OUTSIDE the content
 *   root; hovering/focusing an option previews that group, activating it
 *   sets activeAlignmentId and closes the chooser;
 * - R1-F02: a click that is the tail of a native drag selection inside the
 *   canonical content root NEVER activates an alignment or opens the
 *   chooser (the selection is inspected, never mutated);
 * - R1-F03: the chooser stores only the stable ``{start, end}`` run locator
 *   and re-resolves the CURRENT run from the current runs array on every
 *   render, so its candidates always reflect current alignment membership.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { selectionToCanonical } from '../../shared/text/selection';
import type { PendingSpan, RunDescriptor } from '../../shared/text/types';
import { runClassNames } from '../../shared/rendering/runStates';
import type { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';
import type { TextVersion } from './api';
import { useWorkspaceState } from './state/workspaceContext';

export interface TextPanelProps {
  version: TextVersion;
  runs: RunDescriptor[];
  onHide: () => void;
  /** M0.6: canonical span->DOM registry (registered per run.spanIds). */
  spanRegistry: RenderedSpanRegistry;
  /**
   * M0.6: AlignmentGroup ids surviving in the CURRENT workspace snapshot.
   * The ambiguity chooser lists only actual surviving groups.
   */
  survivingGroupIds?: ReadonlySet<string>;
}

/**
 * R1-F02: a native drag selection inside this panel's canonical content root
 * must NOT be interpreted as alignment activation. A normal browser text
 * drag ends with ``mousedown -> drag -> mouseup -> click``; without this
 * guard the trailing click would activate an alignment (or open the
 * ambiguity chooser) right after the user merely selected text.
 *
 * A selection is relevant to THIS panel when at least one range endpoint
 * lies inside the canonical content root (the containment authority). A
 * collapsed/empty selection or a selection living entirely elsewhere on the
 * page never blocks local activation. The selection is never mutated here.
 */
function hasNonCollapsedSelectionInRoot(
  selection: Selection | null,
  root: Node,
): boolean {
  if (selection === null || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return false;
  }
  return (
    root.contains(range.startContainer) || root.contains(range.endContainer)
  );
}

/** Deterministic chooser candidate ordering: explicit sort at the boundary. */
function candidateGroupIds(
  run: RunDescriptor,
  survivingGroupIds: ReadonlySet<string> | undefined,
): string[] {
  const candidates = survivingGroupIds
    ? run.alignmentGroupIds.filter((id) => survivingGroupIds.has(id))
    : [...run.alignmentGroupIds];
  // Never rely on an incidental upstream array ordering contract — the
  // chooser boundary orders its own candidates deterministically.
  return candidates.sort();
}

export function TextPanel({
  version,
  runs,
  onHide,
  spanRegistry,
  survivingGroupIds,
}: TextPanelProps) {
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const {
    currentSelection,
    captureSelection,
    clearSelection,
    addCurrentSelectionToTray,
    isCreatingAlignment,
    hoveredAlignmentId,
    activeAlignmentId,
    setHoveredAlignment,
    setActiveAlignment,
  } = useWorkspaceState();
  const [stagingError, setStagingError] = useState<string | null>(null);
  // M0.6 ambiguity chooser (R1-F03): only the STABLE run LOCATOR is kept in
  // local state — never a full RunDescriptor. The run is re-resolved from
  // the CURRENT runs array on every render, so chooser candidates always
  // reflect the CURRENT alignment membership of these coordinates.
  const [ambiguousRunLocator, setAmbiguousRunLocator] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Resolve the current run for the stored locator (coordinates are a unique
  // deterministic identity: segmentation boundaries strictly increase).
  const ambiguousRun = useMemo(
    () =>
      ambiguousRunLocator === null
        ? null
        : (runs.find(
            (run) =>
              run.start === ambiguousRunLocator.start &&
              run.end === ambiguousRunLocator.end,
          ) ?? null),
    [ambiguousRunLocator, runs],
  );
  const ambiguousCandidates = useMemo(
    () =>
      ambiguousRun === null
        ? []
        : candidateGroupIds(ambiguousRun, survivingGroupIds),
    [ambiguousRun, survivingGroupIds],
  );
  // Close the chooser when the run disappeared or is no longer ambiguous
  // (fewer than 2 surviving candidate groups on the CURRENT run).
  useEffect(() => {
    if (ambiguousRunLocator !== null && ambiguousCandidates.length < 2) {
      setAmbiguousRunLocator(null);
    }
  }, [ambiguousRunLocator, ambiguousCandidates]);

  const isCurrentSelection = currentSelection?.textVersionId === version.id;

  function handleSelectionEvent() {
    // Native selection capture stays active while a create is in flight —
    // only STAGING is frozen (the Add action below and the provider guard).
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
        {runs.map((run) => {
          const groupCount = run.alignmentGroupIds.length;
          return (
            <span
              key={`${run.start}-${run.end}`}
              ref={(element) => {
                if (element === null) {
                  return;
                }
                // React 19 ref-callback cleanup: unregisters this element
                // from every span bucket on unmount.
                return spanRegistry.register(run.spanIds, element);
              }}
              data-run
              data-start={run.start}
              data-end={run.end}
              className={runClassNames(
                run,
                hoveredAlignmentId,
                activeAlignmentId,
              )}
              onPointerEnter={() => {
                // Unambiguous target: hover the single group. Ambiguous /
                // unaligned runs never set hoveredAlignmentId.
                if (groupCount === 1) {
                  setHoveredAlignment(run.alignmentGroupIds[0]);
                }
              }}
              onPointerLeave={() => {
                // Clear the hover this run established — unless another
                // concrete target (e.g. a chooser option) already hovered a
                // different group.
                if (
                  groupCount === 1 &&
                  hoveredAlignmentId === run.alignmentGroupIds[0]
                ) {
                  setHoveredAlignment(null);
                }
              }}
              onClick={() => {
                // R1-F02: the trailing click of a native drag selection must
                // never activate an alignment or open the chooser. Only a
                // collapsed/no selection (an ordinary click) may activate.
                const rootElement = contentRootRef.current;
                if (
                  rootElement !== null &&
                  hasNonCollapsedSelectionInRoot(
                    window.getSelection(),
                    rootElement,
                  )
                ) {
                  return;
                }
                if (groupCount === 1) {
                  // Activate the unambiguous group; active visualization
                  // persists after pointer leave (no toggle-off in Round 1).
                  setActiveAlignment(run.alignmentGroupIds[0]);
                  setAmbiguousRunLocator(null);
                } else if (groupCount > 1) {
                  // Ambiguous target: open the explicit chooser instead of
                  // arbitrarily picking run.alignmentGroupIds[0]. Only the
                  // stable coordinates are stored (R1-F03).
                  setAmbiguousRunLocator({ start: run.start, end: run.end });
                }
              }}
            >
              {run.text}
            </span>
          );
        })}
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
          disabled={!isCurrentSelection || isCreatingAlignment}
          onClick={handleAddToAlignment}
        >
          Add to Alignment
        </button>
        {stagingError !== null ? (
          <p className="staging-error" role="alert">
            {stagingError}
          </p>
        ) : null}
        {ambiguousRun !== null && ambiguousCandidates.length >= 2 ? (
          <div
            className="alignment-chooser"
            role="group"
            aria-label="Choose an alignment group for this text"
          >
            <p className="alignment-chooser-hint">
              This text belongs to {ambiguousCandidates.length} alignments.
              Choose one:
            </p>
            <ul className="alignment-chooser-list">
              {ambiguousCandidates.map((groupId) => (
                <li key={groupId}>
                  <button
                    type="button"
                    className="alignment-chooser-option"
                    aria-label={`Activate alignment ${groupId.slice(0, 8)}`}
                    onPointerEnter={() => setHoveredAlignment(groupId)}
                    onPointerLeave={() => {
                      if (hoveredAlignmentId === groupId) {
                        setHoveredAlignment(null);
                      }
                    }}
                    onFocus={() => setHoveredAlignment(groupId)}
                    onBlur={() => {
                      if (hoveredAlignmentId === groupId) {
                        setHoveredAlignment(null);
                      }
                    }}
                    onClick={() => {
                      // Successful activation closes the chooser.
                      setActiveAlignment(groupId);
                      setAmbiguousRunLocator(null);
                    }}
                  >
                    Alignment {groupId.slice(0, 8)}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="alignment-chooser-cancel"
              onClick={() => {
                setAmbiguousRunLocator(null);
                setHoveredAlignment(null);
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
