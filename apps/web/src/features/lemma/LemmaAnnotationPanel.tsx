/**
 * M4 lemma annotation panel (ADR-012).
 *
 * One bounded Human-reviewed workflow over the CURRENT SAVED token layer:
 * choose an eligible word-like saved token, enter a lemma, save, reload the
 * authoritative workspace snapshot, edit explicitly, delete explicitly.
 *
 * Saved authority only: rows are built exclusively from persisted
 * `LinguisticSegment` records of the persisted token `SegmentationLayer`
 * (`saved Segment.id`). An unsaved `TokenDraft` in the token editor is never
 * a lemma target — the token panel's unsaved preview cannot reach this panel.
 *
 * The panel renders OUTSIDE `[data-text-content-root]`: canonical text markup,
 * selection semantics and render runs are untouched.
 *
 * Server state remains TanStack Query authority: every successful mutation
 * invalidates the workspace snapshot, and the panel always renders the
 * refetched values (no optimistic persisted lemma state).
 */

import { useEffect, useMemo, useState } from 'react';
import { isApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ErrorMessage } from '../../shared/ui/feedback';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
  TokenLemmaAnnotation,
} from '../workspace/api';
import { useDeleteTokenLemma, usePutTokenLemma, useLemmaMutationPending } from '../workspace/api';
import type { EditorSessionStatus } from '../workspace/workbenchIa';
import { useOccurrenceDrafts, type OccurrenceDraftEntry } from '../workspace/useOccurrenceDrafts';

interface Props {
  documentId: string;
  version: TextVersion;
  /** The CURRENT SAVED token layer; absent until token segmentation is saved. */
  tokenLayer?: SegmentationLayer;
  /** Persisted segments of that layer (never unsaved drafts). */
  tokenSegments: LinguisticSegment[];
  /** Authoritative annotation lookup keyed by saved token Segment.id. */
  annotationsByTokenSegmentId: Record<string, TokenLemmaAnnotation>;
  onSessionStateChange?: (status: EditorSessionStatus) => void;
}

function dependencyHint(error: unknown): string | null {
  if (!isApiError(error)) {
    return null;
  }
  if (error.isCode('NOT_FOUND')) {
    return 'This token is no longer part of the saved token layer. Reload and annotate a current token.';
  }
  if (error.isCode('INVALID_LEMMA_TARGET')) {
    return 'Only saved word-like tokens can carry a lemma annotation.';
  }
  return null;
}

function LemmaRow({
  entry,
  annotation,
  pending,
  activeMutationId,
  error,
  onChange,
  onSave,
  onDelete,
  onDiscard,
}: {
  entry: OccurrenceDraftEntry;
  annotation?: TokenLemmaAnnotation;
  pending: boolean;
  activeMutationId: string | null;
  error: unknown;
  onChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onDiscard: () => void;
}) {
  const { segment } = entry;
  const dirty = entry.draft !== entry.savedValue;
  const hint = dependencyHint(error);

  return (
    <li className="lemma-row" data-token-segment-id={segment.id}>
      <div className="lemma-copy">
        <span className="lemma-range">
          [{segment.start_offset}, {segment.end_offset})
        </span>
        <span className="lemma-token">{JSON.stringify(segment.exact_text)}</span>
      </div>
      <div className="lemma-current">
        {annotation ? (
          <>
            <span className="lemma-saved-label">Saved lemma</span>
            <span className="lemma-saved-value">{annotation.lemma}</span>
          </>
        ) : (
          <span className="lemma-empty">No lemma saved</span>
        )}
      </div>
      <div className="lemma-row-actions">
        <label>
          Lemma
          <input
            type="text"
            value={entry.draft}
            disabled={pending}
            aria-label={`Lemma for ${segment.exact_text}`}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!dirty || pending || entry.conflict || entry.stale}
          onClick={onSave}
        >
          {pending && activeMutationId === segment.id ? 'Saving…' : 'Save lemma'}
        </Button>
        {annotation ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={onDelete}
          >
            {pending && activeMutationId === segment.id ? 'Deleting…' : 'Delete lemma'}
          </Button>
        ) : null}
        {dirty ? <Button type="button" size="sm" variant="quiet" disabled={pending} onClick={onDiscard}>Discard draft</Button> : null}
      </div>
      {entry.conflict ? <p className="lemma-hint" role="alert">This token occurrence changed while the lemma draft was unsaved. Discard the draft to load the current basis; stale targets cannot be submitted.</p> : null}
      {error ? (
        <div className="lemma-row-error">
          <ErrorMessage error={error} />
          {hint ? (
            <p className="lemma-hint" role="status">
              {hint}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function LemmaAnnotationPanel({
  documentId,
  version,
  tokenLayer,
  tokenSegments,
  annotationsByTokenSegmentId,
  onSessionStateChange,
}: Props) {
  const eligible = useMemo(
    () =>
      [...tokenSegments]
        .sort((left, right) => left.ordinal - right.ordinal)
        .filter((segment) => segment.is_word_like === true),
    [tokenSegments],
  );
  const savedValues = useMemo(
    () => Object.fromEntries(Object.entries(annotationsByTokenSegmentId).map(([id, annotation]) => [id, annotation.lemma])),
    [annotationsByTokenSegmentId],
  );
  const drafts = useOccurrenceDrafts(tokenLayer?.id ?? 'none', eligible, savedValues);
  const put = usePutTokenLemma(documentId);
  const remove = useDeleteTokenLemma(documentId);
  const anyLemmaMutationPending = useLemmaMutationPending(documentId);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const entries = Object.values(drafts.entries);
  const dirty = entries.some((entry) => entry.draft !== entry.savedValue);
  const conflict = entries.some((entry) => entry.conflict);
  // M6-G2-F12: the session summary reports the LIFE-CYCLE OF THIS SESSION's own
  // mutation, per TextVersion + layer kind (contract section 11); the
  // document-wide same-domain signal below only locks the row controls.
  const sessionPending = put.isPending || remove.isPending;
  const pending = sessionPending || anyLemmaMutationPending;
  const mutationError = put.error ?? remove.error ?? null;

  useEffect(() => {
    onSessionStateChange?.({ dirty, pending: sessionPending, error: mutationError !== null, conflict, dialogOpen: false });
  }, [dirty, sessionPending, mutationError, conflict, onSessionStateChange]);

  const draftRows = entries.map((entry) => (
    <LemmaRow
      key={entry.segment.id}
      entry={entry}
      annotation={annotationsByTokenSegmentId[entry.segment.id]}
      pending={pending}
      activeMutationId={activeMutationId}
      error={activeMutationId === entry.segment.id ? mutationError : null}
      onChange={(value) => drafts.update(entry.segment.id, value)}
      onSave={() => {
        setActiveMutationId(entry.segment.id);
        remove.reset();
        put.mutate({ tokenSegmentId: entry.segment.id, lemma: entry.draft });
      }}
      onDelete={() => {
        setActiveMutationId(entry.segment.id);
        put.reset();
        remove.mutate(entry.segment.id);
      }}
      onDiscard={() => drafts.discard(entry.segment.id)}
    />
  ));

  if (!tokenLayer) {
    return (
      <section
        className="segmentation-panel lemma-annotation-panel"
        aria-labelledby={`lemma-${version.id}`}
      >
        <p className="section-kicker">Lemma annotation</p>
        <h4 id={`lemma-${version.id}`}>{version.label}</h4>
        <p className="segmentation-empty">
          Save token segmentation before adding lemma annotations.
        </p>
        {/* M6-G2-F09: a dirty draft outlives the token layer it targeted.
            The preserved rows stay visible (stale, non-submittable and
            explicitly discardable) instead of disappearing behind the
            prerequisite notice. */}
        {entries.length > 0 ? (
          <ol className="segmentation-list lemma-list">{draftRows}</ol>
        ) : null}
      </section>
    );
  }

  const annotated = eligible.filter(
    (segment) => annotationsByTokenSegmentId[segment.id] !== undefined,
  );

  return (
    <section
      className="segmentation-panel lemma-annotation-panel"
      aria-labelledby={`lemma-${version.id}`}
    >
      <div className="segmentation-panel-header">
        <div>
          <p className="section-kicker">Lemma annotation</p>
          <h4 id={`lemma-${version.id}`}>{version.label}</h4>
        </div>
        <span className="segmentation-status">
          {annotated.length} annotated / {eligible.length} word-like
        </span>
      </div>
      <p className="segmentation-provenance">
        Saved tokens: <code>{tokenLayer.id.slice(0, 8)}</code> · one lemma per
        token occurrence
      </p>

      {entries.length === 0 ? (
        <p className="segmentation-empty">
          No saved word-like tokens are available for lemma annotation.
        </p>
      ) : (
        <ol className="segmentation-list lemma-list">{draftRows}</ol>
      )}

      {annotated.length > 0 ? (
        <p className="lemma-dependency-note" role="status">
          Saved tokens with lemma annotations cannot be replaced or deleted
          until those annotations are removed.
        </p>
      ) : null}
    </section>
  );
}
