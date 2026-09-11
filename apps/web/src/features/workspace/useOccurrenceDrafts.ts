import { useEffect, useMemo, useState } from 'react';
import type { LinguisticSegment } from './api';

export interface OccurrenceDraftEntry {
  segment: LinguisticSegment;
  basisId: string;
  savedValue: string;
  draft: string;
  conflict: boolean;
  stale: boolean;
}

export function reconcileOccurrenceDrafts(
  previous: Record<string, OccurrenceDraftEntry>,
  basisId: string,
  segments: LinguisticSegment[],
  savedValues: Record<string, string>,
): Record<string, OccurrenceDraftEntry> {
  const next: Record<string, OccurrenceDraftEntry> = {};
  const incomingIds = new Set(segments.map((segment) => segment.id));

  for (const segment of segments) {
    const savedValue = savedValues[segment.id] ?? '';
    const current = previous[segment.id];
    if (!current) {
      next[segment.id] = { segment, basisId, savedValue, draft: savedValue, conflict: false, stale: false };
      continue;
    }
    const dirty = current.draft !== current.savedValue;
    if (dirty && savedValue === current.draft) {
      next[segment.id] = { segment, basisId, savedValue, draft: savedValue, conflict: false, stale: false };
    } else if (dirty) {
      // M6-G2-F02: keep the Human's local draft until explicit disposition,
      // but adopt the LATEST authoritative basis/value/segment in the same
      // entry. Discard therefore reloads the current basis instead of
      // restoring a stale savedValue from before the authoritative change.
      next[segment.id] = {
        segment,
        basisId,
        savedValue,
        draft: current.draft,
        conflict: current.conflict || current.basisId !== basisId || current.savedValue !== savedValue,
        stale: false,
      };
    } else {
      next[segment.id] = { segment, basisId, savedValue, draft: savedValue, conflict: false, stale: false };
    }
  }

  for (const [id, current] of Object.entries(previous)) {
    if (!incomingIds.has(id) && current.draft !== current.savedValue) {
      next[id] = { ...current, conflict: true, stale: true };
    }
  }
  return next;
}

export function useOccurrenceDrafts(
  basisId: string,
  segments: LinguisticSegment[],
  savedValues: Record<string, string>,
) {
  const basisKey = JSON.stringify({
    basisId,
    segments: segments.map((segment) => [segment.id, segment.segmentation_layer_id, segment.start_offset, segment.end_offset, segment.exact_text, segment.is_word_like]),
    savedValues,
  });
  const initial = useMemo(
    () => reconcileOccurrenceDrafts({}, basisId, segments, savedValues),
    // basisKey is the canonical deep identity for these authoritative props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basisKey],
  );
  const [entries, setEntries] = useState(initial);

  useEffect(() => {
    setEntries((current) => reconcileOccurrenceDrafts(current, basisId, segments, savedValues));
  }, [basisKey, basisId, segments, savedValues]);

  return {
    entries,
    update(id: string, draft: string) {
      setEntries((current) => ({
        ...current,
        [id]: { ...current[id]!, draft },
      }));
    },
    discard(id: string) {
      setEntries((current) => {
        const entry = current[id];
        if (!entry) return current;
        if (entry.stale) {
          const rest = { ...current };
          delete rest[id];
          return rest;
        }
        return {
          ...current,
          [id]: { ...entry, draft: entry.savedValue, conflict: false },
        };
      });
    },
  };
}
