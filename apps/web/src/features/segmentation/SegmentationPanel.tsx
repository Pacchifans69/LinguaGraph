import { useEffect, useMemo, useState } from 'react';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
} from '../workspace/api';
import {
  useDeleteSentenceSegmentation,
  usePutSentenceSegmentation,
  useSegmentationMutationPending,
} from '../workspace/api';
import { sliceByCodePoints } from '../../shared/text/offset';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { ErrorMessage } from '../../shared/ui/feedback';
import {
  hasIntlSentenceSegmenter,
  IntlSegmenterUnavailableError,
  manualSentencePartition,
  mergeWithPrevious,
  splitSegment,
  suggestSentences,
  type SegmentDraft,
} from './sentenceSuggestion';
import type { EditorSessionStatus } from '../workspace/workbenchIa';

interface SegmentationPanelProps {
  documentId: string;
  version: TextVersion;
  savedLayer?: SegmentationLayer;
  savedSegments: LinguisticSegment[];
  onSessionStateChange?: (status: EditorSessionStatus) => void;
}

function savedRanges(segments: LinguisticSegment[]): SegmentDraft[] {
  return [...segments]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((segment) => ({
      start: segment.start_offset,
      end: segment.end_offset,
    }));
}

export function SegmentationPanel({
  documentId,
  version,
  savedLayer,
  savedSegments,
  onSessionStateChange,
}: SegmentationPanelProps) {
  const putMutation = usePutSentenceSegmentation(documentId);
  const deleteMutation = useDeleteSentenceSegmentation(documentId);
  const anySegmentationMutationPending = useSegmentationMutationPending(documentId);
  const authoritativeRangeKey = JSON.stringify(savedRanges(savedSegments));
  const authoritativeRanges = useMemo(
    () => JSON.parse(authoritativeRangeKey) as SegmentDraft[],
    [authoritativeRangeKey],
  );
  const authoritativeIdentity = [
    version.content_hash,
    savedLayer?.id ?? 'none',
    savedLayer?.updated_at ?? 'none',
    authoritativeRangeKey,
  ].join(':');
  const [draft, setDraft] = useState<SegmentDraft[]>(authoritativeRanges);
  const [draftContent, setDraftContent] = useState(version.content);
  const [draftIdentity, setDraftIdentity] = useState(authoritativeIdentity);
  const [origin, setOrigin] = useState<'manual' | 'intl_segmenter'>(
    savedLayer?.origin ?? 'manual',
  );
  const [resolvedLocale, setResolvedLocale] = useState(
    savedLayer?.resolved_locale ?? version.language_tag,
  );
  const [dirty, setDirty] = useState(false);
  const [splitInputs, setSplitInputs] = useState<Record<number, string>>({});
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [submittedDraftKey, setSubmittedDraftKey] = useState<string | null>(null);

  useEffect(() => {
    if (draftIdentity === authoritativeIdentity) {
      return;
    }
    if (dirty && submittedDraftKey === authoritativeRangeKey) {
      setDraft(authoritativeRanges);
      setDraftContent(version.content);
      setDraftIdentity(authoritativeIdentity);
      setOrigin(savedLayer?.origin ?? 'manual');
      setResolvedLocale(savedLayer?.resolved_locale ?? version.language_tag);
      setDirty(false);
      setConflict(false);
      setSubmittedDraftKey(null);
      setSplitInputs({});
      return;
    }
    if (dirty) {
      setConflict(true);
      setSubmittedDraftKey(null);
      return;
    }
    setDraft(authoritativeRanges);
    setDraftContent(version.content);
    setDraftIdentity(authoritativeIdentity);
    setOrigin(savedLayer?.origin ?? 'manual');
    setResolvedLocale(savedLayer?.resolved_locale ?? version.language_tag);
    setConflict(false);
    setSplitInputs({});
    setSuggestionError(null);
  }, [
    authoritativeRanges,
    authoritativeIdentity,
    authoritativeRangeKey,
    savedLayer?.origin,
    savedLayer?.resolved_locale,
    version.language_tag,
    version.content,
    draftIdentity,
    dirty,
    submittedDraftKey,
  ]);

  const activeDraft = draft;
  const activeOrigin = origin;
  const activeResolvedLocale = resolvedLocale;
  const activeDirty = dirty;
  // Same-domain exclusion (unchanged): any in-flight segmentation mutation in
  // this document keeps every segmentation control locked.
  const isMutating = anySegmentationMutationPending;
  // M6-G2-F12: the session summary reports the LIFE-CYCLE OF THIS SESSION's own
  // mutation, per TextVersion + layer kind (contract section 11) — not the
  // document-wide exclusion signal above.
  const sessionMutationPending = putMutation.isPending || deleteMutation.isPending;
  const suggestionSupported = hasIntlSentenceSegmenter();

  useEffect(() => {
    onSessionStateChange?.({
      dirty: activeDirty,
      pending: sessionMutationPending,
      error: putMutation.isError || deleteMutation.isError || suggestionError !== null,
      conflict,
      dialogOpen: confirmDelete,
    });
  }, [activeDirty, sessionMutationPending, putMutation.isError, deleteMutation.isError, suggestionError, conflict, confirmDelete, onSessionStateChange]);

  function beginManual() {
    setDraft(manualSentencePartition(version.content));
    setDraftContent(version.content);
    setDraftIdentity(authoritativeIdentity);
    setOrigin('manual');
    setResolvedLocale(version.language_tag);
    setDirty(true);
    setConflict(false);
    setSplitInputs({});
    setSuggestionError(null);
  }

  function generateSuggestion() {
    try {
      const suggestion = suggestSentences(
        version.content,
        version.language_tag,
      );
      setDraft(suggestion.ranges);
      setDraftContent(version.content);
      setDraftIdentity(authoritativeIdentity);
      setOrigin('intl_segmenter');
      setResolvedLocale(suggestion.resolvedLocale);
      setDirty(true);
      setConflict(false);
      setSplitInputs({});
      setSuggestionError(null);
    } catch (error) {
      if (error instanceof IntlSegmenterUnavailableError) {
        setSuggestionError(
          'Sentence suggestions are unavailable in this runtime. Manual construction remains available.',
        );
      } else {
        setSuggestionError(
          error instanceof Error
            ? error.message
            : 'Sentence suggestion failed validation.',
        );
      }
    }
  }

  function split(index: number) {
    const value = Number(splitInputs[index]);
    try {
      setDraft(splitSegment(version.content, activeDraft, index, value));
      setDraftIdentity(authoritativeIdentity);
      setDirty(true);
      setConflict(false);
      setSplitInputs({});
      setSuggestionError(null);
    } catch (error) {
      setSuggestionError(
        error instanceof Error ? error.message : 'Invalid split boundary.',
      );
    }
  }

  function merge(index: number) {
    try {
      setDraft(mergeWithPrevious(version.content, activeDraft, index));
      setDraftIdentity(authoritativeIdentity);
      setDirty(true);
      setConflict(false);
      setSplitInputs({});
      setSuggestionError(null);
    } catch (error) {
      setSuggestionError(
        error instanceof Error ? error.message : 'Invalid merge.',
      );
    }
  }

  function discard() {
    setDraft(authoritativeRanges);
    setDraftContent(version.content);
    setDraftIdentity(authoritativeIdentity);
    setOrigin(savedLayer?.origin ?? 'manual');
    setResolvedLocale(savedLayer?.resolved_locale ?? version.language_tag);
    setDirty(false);
    setConflict(false);
    setSubmittedDraftKey(null);
    setSplitInputs({});
    setSuggestionError(null);
  }

  function save() {
    if (!activeDirty || isMutating || conflict) {
      return;
    }
    setSubmittedDraftKey(JSON.stringify(activeDraft));
    putMutation.mutate({
      textVersionId: version.id,
      content_hash: version.content_hash,
      requested_locale: version.language_tag,
      resolved_locale: activeResolvedLocale,
      origin: activeOrigin,
      segments: activeDraft,
    });
  }

  function removeSavedLayer() {
    deleteMutation.mutate(version.id, {
      onSettled: () => setConfirmDelete(false),
    });
  }

  return (
    <section
      className="segmentation-panel"
      aria-labelledby={`segmentation-${version.id}`}
    >
      <div className="segmentation-panel-header">
        <div>
          <p className="section-kicker">Sentence segmentation</p>
          <h4 id={`segmentation-${version.id}`}>{version.label}</h4>
        </div>
        <span className="segmentation-status">
          {activeDirty ? 'Unsaved preview' : savedLayer ? 'Saved' : 'Not saved'}
        </span>
      </div>

      <p className="segmentation-provenance">
        Requested: <code>{version.language_tag}</code>
        {' · '}
        Resolved: <code>{activeResolvedLocale}</code>
        {' · '}
        Origin: <code>{activeOrigin}</code>
      </p>

      <div className="segmentation-actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isMutating || conflict}
          onClick={beginManual}
        >
          Start manual
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isMutating || conflict || !suggestionSupported}
          onClick={generateSuggestion}
        >
          Generate suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          disabled={isMutating || !activeDirty}
          onClick={discard}
        >
          Discard preview
        </Button>
      </div>

      {!suggestionSupported ? (
        <p className="segmentation-warning" role="status">
          Intl.Segmenter is unavailable. Manual construction remains available.
        </p>
      ) : null}
      {suggestionError ? (
        <p className="segmentation-warning" role="alert">
          {suggestionError}
        </p>
      ) : null}
      {conflict ? (
        <p className="segmentation-warning" role="alert">
          The saved sentence basis changed while this preview was unsaved. Discard the preview to load current data; stale boundaries cannot be submitted.
        </p>
      ) : null}
      {putMutation.isError ? <ErrorMessage error={putMutation.error} /> : null}
      {deleteMutation.isError ? (
        <ErrorMessage error={deleteMutation.error} />
      ) : null}

      {activeDraft.length === 0 ? (
        <p className="segmentation-empty">
          {version.content.length === 0
            ? 'Canonical content is empty; the saved partition contains no segments.'
            : 'No preview. Start manually or generate a suggestion.'}
        </p>
      ) : (
        <ol className="segmentation-list">
          {activeDraft.map((range, index) => {
            const splitValue = Number(splitInputs[index]);
            const splitIsValid =
              Number.isInteger(splitValue) &&
              splitValue > range.start &&
              splitValue < range.end;
            return (
              <li key={`${range.start}:${range.end}`} className="segmentation-row">
                <div className="segmentation-copy">
                  <span className="segmentation-range">
                    {index + 1}. [{range.start}, {range.end})
                  </span>
                  <span>{sliceByCodePoints(draftContent, range.start, range.end)}</span>
                </div>
                <div className="segmentation-row-actions">
                  <label>
                    Split at
                    <input
                      type="number"
                      min={range.start + 1}
                      max={range.end - 1}
                      value={splitInputs[index] ?? ''}
                      disabled={isMutating || conflict || range.end - range.start < 2}
                      onChange={(event) =>
                        setSplitInputs((current) => ({
                          ...current,
                          [index]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isMutating || conflict || !splitIsValid}
                    onClick={() => split(index)}
                  >
                    Split
                  </Button>
                  {index > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      disabled={isMutating || conflict}
                      onClick={() => merge(index)}
                    >
                      Merge previous
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="segmentation-footer">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isMutating || !activeDirty || conflict}
          onClick={save}
        >
          {putMutation.isPending ? 'Saving…' : 'Save segmentation'}
        </Button>
        {savedLayer ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={isMutating}
            onClick={() => setConfirmDelete(true)}
          >
            Delete segmentation
          </Button>
        ) : null}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          headingId={`delete-segmentation-${version.id}`}
          onClose={() => setConfirmDelete(false)}
          closeDisabled={deleteMutation.isPending}
        >
          <h3 id={`delete-segmentation-${version.id}`}>
            Delete saved sentence segmentation?
          </h3>
          <p>
            This removes the reviewed sentence partition for “{version.label}”.
            Alignment spans and groups are preserved.
          </p>
          <div className="confirm-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={removeSavedLayer}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete segmentation'}
            </Button>
          </div>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
