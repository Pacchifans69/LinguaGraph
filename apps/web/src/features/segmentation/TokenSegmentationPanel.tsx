import { useEffect, useMemo, useState } from 'react';
import { sliceByCodePoints } from '../../shared/text/offset';
import { isApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { ErrorMessage } from '../../shared/ui/feedback';
import type { LinguisticSegment, SegmentationLayer, TextVersion } from '../workspace/api';
import { useDeleteTokenSegmentation, usePutTokenSegmentation, useSegmentationMutationPending } from '../workspace/api';
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

/**
 * M4/M5 token-occurrence annotation dependency identifiers and their
 * Human-readable names. This is the complete recognized set — there is no
 * generic dependency ontology here: an occurrence annotation is either a lemma
 * annotation or a coarse POS annotation (ADR-012 / ADR-013).
 *
 * Insertion order is the canonical contract order, so a multi-dependent
 * conflict is always presented as "lemma and POS" regardless of the order the
 * server happened to report.
 */
const OCCURRENCE_ANNOTATION_NAMES: ReadonlyMap<string, string> = new Map([
  ['lemma_annotations', 'lemma'],
  ['pos_annotations', 'POS'],
]);

/** True only for one of the two recognized occurrence-annotation identifiers. */
function isOccurrenceAnnotationIdentifier(value: unknown): value is string {
  return typeof value === 'string' && OCCURRENCE_ANNOTATION_NAMES.has(value);
}

/**
 * Validate and canonicalize a ``dependency_types`` value as the COMPLETE
 * authoritative dependency set.
 *
 * The set is accepted only when it is a non-empty array whose every member is
 * one of the two recognized identifiers. Every other value — an empty array, a
 * non-array, or an array with any unknown or non-string member — is a malformed
 * set and yields ``null`` rather than a filtered subset, so a partially
 * recognized payload can never be presented as if it were complete (G2-F02).
 *
 * Accepted duplicates are collapsed, and the result is returned in canonical
 * contract order regardless of the reported order.
 */
function completeDependencyIdentifiers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const members: unknown[] = value;
  if (!members.every((member) => isOccurrenceAnnotationIdentifier(member))) {
    return null;
  }
  return [...OCCURRENCE_ANNOTATION_NAMES.keys()].filter((identifier) =>
    members.includes(identifier),
  );
}

/**
 * Normalize the token-occurrence annotation dependency set of a
 * ``SEGMENTATION_HAS_DEPENDENTS`` payload.
 *
 * - ``details.dependency_types`` is the complete authoritative set whenever the
 *   property is present: it is either valid as a whole or the payload yields no
 *   specialized guidance at all;
 * - the inherited legacy scalar ``details.dependency_type`` is consulted only
 *   when the property is absent, and then only when it is exactly one
 *   recognized identifier, which normalizes to a one-element set;
 * - unknown, malformed or unrelated details (for example the inherited
 *   sentence→token shape, which carries neither field) yield an empty list so
 *   the caller keeps the generic stable error rendering and never infers a
 *   dependency that was not reported.
 */
function tokenAnnotationDependencyNames(details: unknown): string[] {
  if (details === null || typeof details !== 'object') {
    return [];
  }
  const record = details as Record<string, unknown>;
  let identifiers: string[] | null;
  if (Object.prototype.hasOwnProperty.call(record, 'dependency_types')) {
    // Present — authoritative. A malformed set suppresses the legacy scalar
    // instead of falling through to it.
    identifiers = completeDependencyIdentifiers(record.dependency_types);
  } else {
    // Absent — only now may the scalar compatibility path apply.
    const scalar = record.dependency_type;
    identifiers = isOccurrenceAnnotationIdentifier(scalar) ? [scalar] : null;
  }
  if (identifiers === null) {
    return [];
  }
  return identifiers.map(
    (identifier) => OCCURRENCE_ANNOTATION_NAMES.get(identifier)!,
  );
}

/**
 * Human-readable cleanup instruction for a token-layer mutation blocked by
 * saved occurrence annotations, or ``null`` when the error is not that case.
 * Only ``SEGMENTATION_HAS_DEPENDENTS`` is specialized.
 */
function tokenAnnotationDependencyGuidance(error: unknown): string | null {
  if (!isApiError(error) || !error.isCode('SEGMENTATION_HAS_DEPENDENTS')) {
    return null;
  }
  const names = tokenAnnotationDependencyNames(error.details);
  if (names.length === 0) {
    return null;
  }
  const joined =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Delete the dependent ${joined} annotations before changing token segmentation.`;
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
  const anySegmentationMutationPending = useSegmentationMutationPending(documentId);
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
  const pending = anySegmentationMutationPending;

  // Human-readable cleanup state for a token-layer mutation blocked by saved
  // occurrence annotations. The stable error envelope (code + message) is
  // still rendered by ErrorMessage below; this only names the actual
  // dependency set so "lemma only", "POS only" and "lemma + POS" are
  // distinguishable. Malformed/unknown details produce no guidance.
  //
  // HSDR-F01: the replacement PUT and the token-layer DELETE are separate
  // TanStack mutations, so each stores its own error independently. Starting
  // either operation therefore resets the OTHER mutation's stored state (see
  // the two mutation handlers below), which is what makes only the latest
  // backend response authoritative here. Without that reset a stale, larger
  // dependency set from an earlier failed replacement could outlive a later
  // failed deletion and keep naming siblings the backend no longer reports.
  // The backend response stays the sole authority: nothing here infers a
  // dependency from frontend sibling state.
  const dependencyGuidance =
    tokenAnnotationDependencyGuidance(put.error) ??
    tokenAnnotationDependencyGuidance(remove.error);

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
      {dependencyGuidance ? (
        <p className="segmentation-warning token-annotation-dependency" role="status">
          {dependencyGuidance}
        </p>
      ) : null}

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
        <Button type="button" size="sm" variant="primary" disabled={pending || !changed} onClick={() => {
          // HSDR-F01: a new replacement supersedes any stored deletion
          // outcome before it starts, so only this operation's response can
          // become Human-visible dependency guidance.
          remove.reset();
          put.mutate({
            textVersionId: version.id,
            content_hash: version.content_hash,
            basis_sentence_layer_id: sentenceLayer.id,
            requested_locale: version.language_tag,
            resolved_locale: locale,
            origin,
            segments: current.map((token) => ({ start: token.start, end: token.end, is_word_like: token.isWordLike })),
          });
        }}>{put.isPending ? 'Saving…' : 'Save tokens'}</Button>
        {savedLayer ? <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete tokens</Button> : null}
      </div>
      {confirmDelete ? <ConfirmDialog headingId={`delete-tokens-${version.id}`} onClose={() => setConfirmDelete(false)} closeDisabled={remove.isPending}>
        <h3 id={`delete-tokens-${version.id}`}>Delete saved token segmentation?</h3>
        <p>The sentence segmentation and all Alignment data are preserved.</p>
        <div className="confirm-dialog-actions">
          <Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => {
            // HSDR-F01: the confirmed deletion supersedes any stored
            // replacement outcome when it actually starts — opening the
            // confirmation dialog above deliberately does not.
            put.reset();
            remove.mutate(version.id, { onSettled: () => setConfirmDelete(false) });
          }}>{remove.isPending ? 'Deleting…' : 'Delete tokens'}</Button>
        </div>
      </ConfirmDialog> : null}
    </section>
  );
}
