import { useEffect, useMemo, useState } from 'react';
import { sliceByCodePoints } from '../../shared/text/offset';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { ErrorMessage } from '../../shared/ui/feedback';
import type { LinguisticSegment, SegmentationLayer, TextVersion } from '../workspace/api';
import { useDeleteTokenSegmentation, usePutTokenSegmentation } from '../workspace/api';
import type { SegmentDraft } from './sentenceSuggestion';
import {
  hasIntlWordSegmenter,
  IntlWordSegmenterUnavailableError,
  manualTokenPartition,
  mergeTokenWithPrevious,
  splitToken,
  suggestTokens,
  type TokenDraft,
} from './tokenSuggestion';

interface Props {
  documentId: string;
  version: TextVersion;
  sentenceLayer?: SegmentationLayer;
  sentenceSegments: LinguisticSegment[];
  savedLayer?: SegmentationLayer;
  savedSegments: LinguisticSegment[];
}

function ranges(segments: LinguisticSegment[]): SegmentDraft[] {
  return [...segments]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((segment) => ({ start: segment.start_offset, end: segment.end_offset }));
}

function tokenRanges(segments: LinguisticSegment[]): TokenDraft[] {
  return [...segments]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((segment) => ({
      start: segment.start_offset,
      end: segment.end_offset,
      isWordLike: segment.is_word_like === true,
    }));
}

export function TokenSegmentationPanel({
  documentId,
  version,
  sentenceLayer,
  sentenceSegments,
  savedLayer,
  savedSegments,
}: Props) {
  const put = usePutTokenSegmentation(documentId);
  const remove = useDeleteTokenSegmentation(documentId);
  const sentenceKey = JSON.stringify(ranges(sentenceSegments));
  const sentences = useMemo(
    () => JSON.parse(sentenceKey) as SegmentDraft[],
    [sentenceKey],
  );
  const savedKey = JSON.stringify(tokenRanges(savedSegments));
  const authoritative = useMemo(
    () => JSON.parse(savedKey) as TokenDraft[],
    [savedKey],
  );
  const identity = `${version.content_hash}:${sentenceLayer?.id ?? 'none'}:${savedLayer?.id ?? 'none'}:${savedKey}`;
  const [draft, setDraft] = useState<TokenDraft[]>(authoritative);
  const [draftIdentity, setDraftIdentity] = useState(identity);
  const [origin, setOrigin] = useState<'manual' | 'intl_segmenter'>(savedLayer?.origin ?? 'manual');
  const [locale, setLocale] = useState(savedLayer?.resolved_locale ?? version.language_tag);
  const [dirty, setDirty] = useState(false);
  const [splits, setSplits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(authoritative);
    setDraftIdentity(identity);
    setOrigin(savedLayer?.origin ?? 'manual');
    setLocale(savedLayer?.resolved_locale ?? version.language_tag);
    setDirty(false);
    setSplits({});
    setError(null);
  }, [authoritative, identity, savedLayer?.origin, savedLayer?.resolved_locale, version.language_tag]);

  const current = draftIdentity === identity ? draft : authoritative;
  const changed = draftIdentity === identity && dirty;
  const pending = put.isPending || remove.isPending;

  function adopt(next: TokenDraft[]) {
    setDraft(next);
    setDraftIdentity(identity);
    setOrigin('manual');
    setDirty(true);
    setSplits({});
    setError(null);
  }

  function manual() {
    adopt(manualTokenPartition(version.content, sentences));
    setLocale(version.language_tag);
  }

  function suggest() {
    try {
      const result = suggestTokens(version.content, sentences, version.language_tag);
      setDraft(result.ranges);
      setDraftIdentity(identity);
      setOrigin('intl_segmenter');
      setLocale(result.resolvedLocale);
      setDirty(true);
      setSplits({});
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof IntlWordSegmenterUnavailableError
          ? 'Word suggestions are unavailable. Manual construction remains available.'
          : reason instanceof Error
            ? reason.message
            : 'Token suggestion failed validation.',
      );
    }
  }

  if (!sentenceLayer) {
    return (
      <section className="segmentation-panel token-segmentation-panel">
        <p className="section-kicker">Token segmentation</p>
        <p className="segmentation-empty">Save a sentence segmentation first. Tokens require its exact persisted identity.</p>
      </section>
    );
  }

  return (
    <section className="segmentation-panel token-segmentation-panel" aria-labelledby={`tokens-${version.id}`}>
      <div className="segmentation-panel-header">
        <div>
          <p className="section-kicker">Token segmentation</p>
          <h4 id={`tokens-${version.id}`}>{version.label}</h4>
        </div>
        <span className="segmentation-status">{changed ? 'Unsaved preview' : savedLayer ? 'Saved' : 'Not saved'}</span>
      </div>
      <p className="segmentation-provenance">
        Basis: <code>{sentenceLayer.id.slice(0, 8)}</code> · Resolved: <code>{locale}</code> · Origin: <code>{origin}</code>
      </p>
      <div className="segmentation-actions">
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={manual}>Start manual</Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending || !hasIntlWordSegmenter()} onClick={suggest}>Generate word suggestion</Button>
        <Button type="button" size="sm" variant="quiet" disabled={pending || !changed} onClick={() => {
          setDraft(authoritative); setDraftIdentity(identity); setDirty(false); setError(null);
        }}>Discard preview</Button>
      </div>
      {!hasIntlWordSegmenter() ? <p className="segmentation-warning" role="status">Intl.Segmenter word mode is unavailable. Manual construction remains available.</p> : null}
      {error ? <p className="segmentation-warning" role="alert">{error}</p> : null}
      {put.isError ? <ErrorMessage error={put.error} /> : null}
      {remove.isError ? <ErrorMessage error={remove.error} /> : null}

      {current.length === 0 ? (
        <p className="segmentation-empty">{version.content.length === 0 ? 'Canonical content is empty; the token partition is empty.' : 'No token preview.'}</p>
      ) : (
        <ol className="segmentation-list token-list">
          {current.map((token, index) => {
            const split = Number(splits[index]);
            const sentenceBoundary = sentences.some((sentence) => sentence.end === token.start);
            return (
              <li className="segmentation-row" key={`${token.start}:${token.end}`}>
                <div className="segmentation-copy">
                  <span className="segmentation-range">{index + 1}. [{token.start}, {token.end})</span>
                  <span className="token-preview">{JSON.stringify(sliceByCodePoints(version.content, token.start, token.end))}</span>
                </div>
                <div className="segmentation-row-actions">
                  <label><input type="checkbox" checked={token.isWordLike} disabled={pending} onChange={() => adopt(current.map((item, itemIndex) => itemIndex === index ? { ...item, isWordLike: !item.isWordLike } : item))} />Word-like</label>
                  <label>Split at<input type="number" min={token.start + 1} max={token.end - 1} value={splits[index] ?? ''} disabled={pending || token.end - token.start < 2} onChange={(event) => setSplits((value) => ({ ...value, [index]: event.target.value }))} /></label>
                  <Button type="button" size="sm" variant="secondary" disabled={pending || !Number.isInteger(split) || split <= token.start || split >= token.end} onClick={() => adopt(splitToken(version.content, sentences, current, index, split))}>Split</Button>
                  {index > 0 ? <Button type="button" size="sm" variant="quiet" disabled={pending || sentenceBoundary} onClick={() => adopt(mergeTokenWithPrevious(version.content, sentences, current, index))}>Merge previous</Button> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="segmentation-footer">
        <Button type="button" size="sm" variant="primary" disabled={pending || !changed} onClick={() => put.mutate({
          textVersionId: version.id,
          content_hash: version.content_hash,
          basis_sentence_layer_id: sentenceLayer.id,
          requested_locale: version.language_tag,
          resolved_locale: locale,
          origin,
          segments: current.map((token) => ({ start: token.start, end: token.end, is_word_like: token.isWordLike })),
        })}>{put.isPending ? 'Saving…' : 'Save tokens'}</Button>
        {savedLayer ? <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete tokens</Button> : null}
      </div>
      {confirmDelete ? <ConfirmDialog headingId={`delete-tokens-${version.id}`} onClose={() => setConfirmDelete(false)} closeDisabled={remove.isPending}>
        <h3 id={`delete-tokens-${version.id}`}>Delete saved token segmentation?</h3>
        <p>The sentence segmentation and all Alignment data are preserved.</p>
        <div className="confirm-dialog-actions">
          <Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(version.id, { onSettled: () => setConfirmDelete(false) })}>{remove.isPending ? 'Deleting…' : 'Delete tokens'}</Button>
        </div>
      </ConfirmDialog> : null}
    </section>
  );
}
