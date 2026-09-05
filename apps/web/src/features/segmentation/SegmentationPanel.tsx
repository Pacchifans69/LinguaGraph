import { useEffect, useMemo, useState } from 'react';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
} from '../workspace/api';
import {
  useDeleteSentenceSegmentation,
  usePutSentenceSegmentation,
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

interface SegmentationPanelProps {
  documentId: string;
  version: TextVersion;
  savedLayer?: SegmentationLayer;
  savedSegments: LinguisticSegment[];
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
}: SegmentationPanelProps) {
  const putMutation = usePutSentenceSegmentation(documentId);
  const deleteMutation = useDeleteSentenceSegmentation(documentId);
  const authoritativeRanges = useMemo(
    () => savedRanges(savedSegments),
    [savedSegments],
  );
  const [draft, setDraft] = useState<SegmentDraft[]>(authoritativeRanges);
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

  const savedIdentity = savedLayer
    ? `${savedLayer.id}:${savedLayer.updated_at}`
    : 'none';
  useEffect(() => {
    setDraft(authoritativeRanges);
    setOrigin(savedLayer?.origin ?? 'manual');
    setResolvedLocale(savedLayer?.resolved_locale ?? version.language_tag);
    setDirty(false);
    setSplitInputs({});
    setSuggestionError(null);
  }, [
    authoritativeRanges,
    savedIdentity,
    savedLayer?.origin,
    savedLayer?.resolved_locale,
    version.language_tag,
  ]);

  const isMutating = putMutation.isPending || deleteMutation.isPending;
  const suggestionSupported = hasIntlSentenceSegmenter();

  function beginManual() {
    setDraft(manualSentencePartition(version.content));
    setOrigin('manual');
    setResolvedLocale(version.language_tag);
    setDirty(true);
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
      setOrigin('intl_segmenter');
      setResolvedLocale(suggestion.resolvedLocale);
      setDirty(true);
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
      setDraft(splitSegment(version.content, draft, index, value));
      setDirty(true);
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
      setDraft(mergeWithPrevious(version.content, draft, index));
      setDirty(true);
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
    setOrigin(savedLayer?.origin ?? 'manual');
    setResolvedLocale(savedLayer?.resolved_locale ?? version.language_tag);
    setDirty(false);
    setSplitInputs({});
    setSuggestionError(null);
  }

  function save() {
    if (!dirty || isMutating) {
      return;
    }
    putMutation.mutate({
      textVersionId: version.id,
      content_hash: version.content_hash,
      requested_locale: version.language_tag,
      resolved_locale: resolvedLocale,
      origin,
      segments: draft,
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
          {dirty ? 'Unsaved preview' : savedLayer ? 'Saved' : 'Not saved'}
        </span>
      </div>

      <p className="segmentation-provenance">
        Requested: <code>{version.language_tag}</code>
        {' · '}
        Resolved: <code>{resolvedLocale}</code>
        {' · '}
        Origin: <code>{origin}</code>
      </p>

      <div className="segmentation-actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isMutating}
          onClick={beginManual}
        >
          Start manual
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isMutating || !suggestionSupported}
          onClick={generateSuggestion}
        >
          Generate suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          disabled={isMutating || !dirty}
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
      {putMutation.isError ? <ErrorMessage error={putMutation.error} /> : null}
      {deleteMutation.isError ? (
        <ErrorMessage error={deleteMutation.error} />
      ) : null}

      {draft.length === 0 ? (
        <p className="segmentation-empty">
          {version.content.length === 0
            ? 'Canonical content is empty; the saved partition contains no segments.'
            : 'No preview. Start manually or generate a suggestion.'}
        </p>
      ) : (
        <ol className="segmentation-list">
          {draft.map((range, index) => {
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
                  <span>{sliceByCodePoints(version.content, range.start, range.end)}</span>
                </div>
                <div className="segmentation-row-actions">
                  <label>
                    Split at
                    <input
                      type="number"
                      min={range.start + 1}
                      max={range.end - 1}
                      value={splitInputs[index] ?? ''}
                      disabled={isMutating || range.end - range.start < 2}
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
                    disabled={isMutating || !splitIsValid}
                    onClick={() => split(index)}
                  >
                    Split
                  </Button>
                  {index > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      disabled={isMutating}
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
          disabled={isMutating || !dirty}
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
