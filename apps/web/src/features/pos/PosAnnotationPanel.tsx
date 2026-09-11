/**
 * M5 coarse POS annotation panel (ADR-013).
 *
 * One bounded Human-reviewed workflow over the CURRENT SAVED token layer:
 * choose an eligible word-like saved token, choose one frozen coarse POS value,
 * save, reload the authoritative workspace snapshot, edit explicitly, delete
 * explicitly.
 *
 * Saved authority only: rows are built exclusively from persisted
 * `LinguisticSegment` records of the persisted token `SegmentationLayer`
 * (`saved Segment.id`). An unsaved `TokenDraft` in the token editor is never a
 * POS target — the token panel's unsaved preview cannot reach this panel.
 *
 * The panel renders OUTSIDE `[data-text-content-root]`: canonical text markup,
 * selection semantics and render runs are untouched.
 *
 * Server state remains TanStack Query authority: every successful mutation
 * invalidates the workspace snapshot, and the panel always renders the
 * refetched values (no optimistic persisted POS state).
 *
 * Lemma/POS independence: this panel reads only the POS map. It neither reads
 * nor writes lemma state, and the two authorities are never merged.
 */

import { useEffect, useMemo, useState } from 'react';
import { isApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ErrorMessage } from '../../shared/ui/feedback';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
  TokenPosAnnotation,
} from '../workspace/api';
import { POS_TAGS } from '../workspace/api';
import { useDeleteTokenPos, usePosMutationPending, usePutTokenPos } from '../workspace/api';
import type { EditorSessionStatus } from '../workspace/workbenchIa';
import { useOccurrenceDrafts, type OccurrenceDraftEntry } from '../workspace/useOccurrenceDrafts';

interface Props {
  documentId: string;
  version: TextVersion;
  /** The CURRENT SAVED token layer; absent until token segmentation is saved. */
  tokenLayer?: SegmentationLayer;
  /** Persisted segments of that layer (never unsaved drafts). */
  tokenSegments: LinguisticSegment[];
  /** Authoritative POS lookup keyed by saved token Segment.id. */
  posAnnotationsByTokenSegmentId: Record<string, TokenPosAnnotation>;
  /**
   * Sibling lemma presence for the same saved token ids. Presentation only:
   * POS never derives, mutates or deletes lemma state.
   */
  lemmaTokenSegmentIds?: ReadonlySet<string>;
  onSessionStateChange?: (status: EditorSessionStatus) => void;
}

function targetHint(error: unknown): string | null {
  if (!isApiError(error)) {
    return null;
  }
  if (error.isCode('NOT_FOUND')) {
    return 'This token is no longer part of the saved token layer. Reload and annotate a current token.';
  }
  if (error.isCode('INVALID_POS_TARGET')) {
    return 'Only saved word-like tokens can carry a coarse POS annotation.';
  }
  if (error.isCode('INVALID_POS_VALUE')) {
    return 'Choose one of the fifteen frozen coarse POS values.';
  }
  return null;
}

function PosRow({
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
  annotation?: TokenPosAnnotation;
  pending: boolean;
  activeMutationId: string | null;
  error: unknown;
  onChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onDiscard: () => void;
}) {
  const { segment } = entry;
  // Logical no-op: selecting the persisted value (or no value) issues no write.
  const dirty = entry.draft !== entry.savedValue;
  const hint = targetHint(error);

  return (
    <li className="pos-row" data-token-segment-id={segment.id}>
      <div className="pos-copy">
        <span className="pos-range">
          [{segment.start_offset}, {segment.end_offset})
        </span>
        <span className="pos-token">{JSON.stringify(segment.exact_text)}</span>
      </div>
      <div className="pos-current">
        {annotation ? (
          <>
            <span className="pos-saved-label">Saved POS</span>
            <span className="pos-saved-value">{annotation.pos_tag}</span>
          </>
        ) : (
          <span className="pos-empty">No POS saved</span>
        )}
      </div>
      <div className="pos-row-actions">
        <label>
          Coarse POS
          <select
            value={entry.draft}
            disabled={pending}
            aria-label={`Coarse POS for ${segment.exact_text}`}
            onChange={(event) => onChange(event.target.value)}
          >
            {/*
              The empty placeholder is not a tag value: it exists only so the
              unannotated state renders blank instead of defaulting to the
              first tag. It is disabled and therefore not selectable, leaving
              exactly the fifteen frozen values as the selectable set.
            */}
            <option value="" disabled>
              Select a coarse POS value
            </option>
            {POS_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!dirty || entry.draft === '' || pending || entry.conflict || entry.stale}
          onClick={onSave}
        >
          {pending && activeMutationId === segment.id ? 'Saving…' : 'Save POS'}
        </Button>
        {annotation ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={onDelete}
          >
            {pending && activeMutationId === segment.id ? 'Deleting…' : 'Delete POS'}
          </Button>
        ) : null}
        {dirty ? <Button type="button" size="sm" variant="quiet" disabled={pending} onClick={onDiscard}>Discard draft</Button> : null}
      </div>
      {entry.conflict ? <p className="pos-hint" role="alert">This token occurrence changed while the POS draft was unsaved. Discard the draft to load the current basis; stale targets cannot be submitted.</p> : null}
      {error ? (
        <div className="pos-row-error">
          <ErrorMessage error={error} />
          {hint ? (
            <p className="pos-hint" role="status">
              {hint}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function PosAnnotationPanel({
  documentId,
  version,
  tokenLayer,
  tokenSegments,
  posAnnotationsByTokenSegmentId,
  lemmaTokenSegmentIds,
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
    () => Object.fromEntries(Object.entries(posAnnotationsByTokenSegmentId).map(([id, annotation]) => [id, annotation.pos_tag])),
    [posAnnotationsByTokenSegmentId],
  );
  const drafts = useOccurrenceDrafts(tokenLayer?.id ?? 'none', eligible, savedValues);
  const put = usePutTokenPos(documentId);
  const remove = useDeleteTokenPos(documentId);
  const anyPosMutationPending = usePosMutationPending(documentId);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const entries = Object.values(drafts.entries);
  const dirty = entries.some((entry) => entry.draft !== entry.savedValue);
  const conflict = entries.some((entry) => entry.conflict);
  const pending = put.isPending || remove.isPending || anyPosMutationPending;
  const mutationError = put.error ?? remove.error ?? null;

  useEffect(() => {
    onSessionStateChange?.({ dirty, pending, error: mutationError !== null, conflict, dialogOpen: false });
  }, [dirty, pending, mutationError, conflict, onSessionStateChange]);

  if (!tokenLayer) {
    return (
      <section
        className="segmentation-panel pos-annotation-panel"
        aria-labelledby={`pos-${version.id}`}
      >
        <p className="section-kicker">Coarse POS annotation</p>
        <h4 id={`pos-${version.id}`}>{version.label}</h4>
        <p className="segmentation-empty">
          Save token segmentation before adding POS annotations.
        </p>
      </section>
    );
  }

  const annotated = eligible.filter(
    (segment) => posAnnotationsByTokenSegmentId[segment.id] !== undefined,
  );
  const siblingBlocked = eligible.filter(
    (segment) =>
      posAnnotationsByTokenSegmentId[segment.id] !== undefined ||
      lemmaTokenSegmentIds?.has(segment.id) === true,
  );

  return (
    <section
      className="segmentation-panel pos-annotation-panel"
      aria-labelledby={`pos-${version.id}`}
    >
      <div className="segmentation-panel-header">
        <div>
          <p className="section-kicker">Coarse POS annotation</p>
          <h4 id={`pos-${version.id}`}>{version.label}</h4>
        </div>
        <span className="segmentation-status">
          {annotated.length} annotated / {eligible.length} word-like
        </span>
      </div>
      <p className="segmentation-provenance">
        Saved tokens: <code>{tokenLayer.id.slice(0, 8)}</code> · one coarse POS
        per token occurrence
      </p>

      {entries.length === 0 ? (
        <p className="segmentation-empty">
          No saved word-like tokens are available for POS annotation.
        </p>
      ) : (
        <ol className="segmentation-list pos-list">
          {entries.map((entry) => (
            <PosRow
              key={entry.segment.id}
              entry={entry}
              annotation={posAnnotationsByTokenSegmentId[entry.segment.id]}
              pending={pending}
              activeMutationId={activeMutationId}
              error={activeMutationId === entry.segment.id ? mutationError : null}
              onChange={(value) => drafts.update(entry.segment.id, value)}
              onSave={() => {
                setActiveMutationId(entry.segment.id);
                remove.reset();
                put.mutate({ tokenSegmentId: entry.segment.id, pos_tag: entry.draft });
              }}
              onDelete={() => {
                setActiveMutationId(entry.segment.id);
                put.reset();
                remove.mutate(entry.segment.id);
              }}
              onDiscard={() => drafts.discard(entry.segment.id)}
            />
          ))}
        </ol>
      )}

      {siblingBlocked.length > 0 ? (
        <p className="pos-dependency-note" role="status">
          Saved tokens with lemma and/or POS annotations cannot be replaced or
          deleted until every one of those occurrence annotations is removed.
        </p>
      ) : null}
    </section>
  );
}
