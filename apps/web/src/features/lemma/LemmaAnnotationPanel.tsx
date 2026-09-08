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

interface Props {
  documentId: string;
  version: TextVersion;
  /** The CURRENT SAVED token layer; absent until token segmentation is saved. */
  tokenLayer?: SegmentationLayer;
  /** Persisted segments of that layer (never unsaved drafts). */
  tokenSegments: LinguisticSegment[];
  /** Authoritative annotation lookup keyed by saved token Segment.id. */
  annotationsByTokenSegmentId: Record<string, TokenLemmaAnnotation>;
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
  documentId,
  segment,
  annotation,
}: {
  documentId: string;
  segment: LinguisticSegment;
  annotation?: TokenLemmaAnnotation;
}) {
  const put = usePutTokenLemma(documentId);
  const remove = useDeleteTokenLemma(documentId);
  const anyLemmaMutationPending = useLemmaMutationPending(documentId);
  const savedLemma = annotation?.lemma ?? '';
  const [draft, setDraft] = useState(savedLemma);

  // Re-adopt the authoritative server value whenever the snapshot changes
  // (including after a successful mutation or an external refetch).
  useEffect(() => {
    setDraft(annotation?.lemma ?? '');
  }, [annotation?.lemma, annotation?.updated_at, segment.id]);

  // One lemma mutation at a time across the panel: every row locks while any
  // lemma write is in flight, mirroring the segmentation panel discipline.
  const pending = put.isPending || remove.isPending || anyLemmaMutationPending;
  const dirty = draft !== savedLemma;
  const error = put.error ?? remove.error ?? null;
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
            value={draft}
            disabled={pending}
            aria-label={`Lemma for ${segment.exact_text}`}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            put.mutate({ tokenSegmentId: segment.id, lemma: draft })
          }
        >
          {put.isPending ? 'Saving…' : 'Save lemma'}
        </Button>
        {annotation ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => remove.mutate(segment.id)}
          >
            {remove.isPending ? 'Deleting…' : 'Delete lemma'}
          </Button>
        ) : null}
      </div>
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
}: Props) {
  const eligible = useMemo(
    () =>
      [...tokenSegments]
        .sort((left, right) => left.ordinal - right.ordinal)
        .filter((segment) => segment.is_word_like === true),
    [tokenSegments],
  );

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

      {eligible.length === 0 ? (
        <p className="segmentation-empty">
          No saved word-like tokens are available for lemma annotation.
        </p>
      ) : (
        <ol className="segmentation-list lemma-list">
          {eligible.map((segment) => (
            <LemmaRow
              key={segment.id}
              documentId={documentId}
              segment={segment}
              annotation={annotationsByTokenSegmentId[segment.id]}
            />
          ))}
        </ol>
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
