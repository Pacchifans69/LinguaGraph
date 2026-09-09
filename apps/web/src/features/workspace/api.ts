/**
 * Workspace server state (M0.3) — TanStack Query hooks over the workspace
 * read model and the TextVersion create/delete endpoints.
 *
 * Query key follows the report (section 10): ['workspace', documentId].
 * Creating or deleting a TextVersion invalidates the workspace snapshot (and
 * the parent document), so panels always render the canonical server content.
 */

import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../shared/api/client';
import { documentKeys } from '../documents/api';
import type { ParallelDocument } from '../documents/api';

export interface TextVersion {
  id: string;
  document_id: string;
  language_tag: string;
  label: string;
  content: string;
  content_hash: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSpan {
  id: string;
  text_version_id: string;
  start_offset: number;
  end_offset: number;
  exact_text: string;
  prefix: string;
  suffix: string;
  created_at: string;
}

export interface AlignmentGroup {
  id: string;
  document_id: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlignmentMember {
  id: string;
  alignment_group_id: string;
  span_id: string;
  created_at: string;
}

export interface SegmentationLayer {
  id: string;
  text_version_id: string;
  granularity: 'sentence' | 'token';
  basis_layer_id: string | null;
  requested_locale: string;
  resolved_locale: string;
  origin: 'manual' | 'intl_segmenter';
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface LinguisticSegment {
  id: string;
  segmentation_layer_id: string;
  ordinal: number;
  start_offset: number;
  end_offset: number;
  exact_text: string;
  is_word_like: boolean | null;
  created_at: string;
}

/**
 * M4: one sparse Human-reviewed lemma annotation bound to an exact saved
 * token `Segment.id`. It carries no redundant token context — coordinates,
 * `exact_text`, `is_word_like` and the owning layer stay owned by the token
 * hierarchy. The workspace snapshot is the only read authority.
 */
export interface TokenLemmaAnnotation {
  id: string;
  token_segment_id: string;
  lemma: string;
  created_at: string;
  updated_at: string;
}

export interface LemmaAnnotationPutInput {
  tokenSegmentId: string;
  lemma: string;
}

/**
 * M5: one sparse Human-reviewed coarse POS annotation bound to an exact saved
 * token `Segment.id`. It is the SIBLING of `TokenLemmaAnnotation` — neither
 * owns nor derives the other — and carries no redundant token context:
 * coordinates, `exact_text`, `is_word_like` and the owning layer stay owned by
 * the token hierarchy. The workspace snapshot is the only read authority.
 */
export interface TokenPosAnnotation {
  id: string;
  token_segment_id: string;
  pos_tag: string;
  created_at: string;
  updated_at: string;
}

export interface PosAnnotationPutInput {
  tokenSegmentId: string;
  pos_tag: string;
}

/**
 * The frozen M5 coarse-POS vocabulary (contract section 4). The controlled
 * selector exposes exactly these fifteen values in this order; it is NOT a
 * language-specific or free-text tagset and deliberately excludes
 * `PUNCT`/`SYM`.
 */
export const POS_TAGS = [
  'ADJ',
  'ADP',
  'ADV',
  'AUX',
  'CCONJ',
  'DET',
  'INTJ',
  'NOUN',
  'NUM',
  'PART',
  'PRON',
  'PROPN',
  'SCONJ',
  'VERB',
  'X',
] as const;

export type PosTag = (typeof POS_TAGS)[number];

export interface SegmentCoordinates {
  start: number;
  end: number;
}

export interface SentenceSegmentation {
  layer: SegmentationLayer;
  segments: LinguisticSegment[];
}

export interface SentenceSegmentationPutInput {
  textVersionId: string;
  content_hash: string;
  requested_locale: string;
  resolved_locale: string;
  origin: 'manual' | 'intl_segmenter';
  segments: SegmentCoordinates[];
}

export interface TokenSegmentCoordinates extends SegmentCoordinates {
  is_word_like: boolean;
}

export interface TokenSegmentationPutInput {
  textVersionId: string;
  content_hash: string;
  basis_sentence_layer_id: string;
  requested_locale: string;
  resolved_locale: string;
  origin: 'manual' | 'intl_segmenter';
  segments: TokenSegmentCoordinates[];
}

/** The raw document-level snapshot returned by GET /workspace (flat arrays). */
export interface WorkspaceSnapshot {
  document: ParallelDocument;
  text_versions: TextVersion[];
  spans: WorkspaceSpan[];
  alignment_groups: AlignmentGroup[];
  alignment_members: AlignmentMember[];
  segmentation_layers?: SegmentationLayer[];
  segments?: LinguisticSegment[];
  token_lemma_annotations?: TokenLemmaAnnotation[];
  token_pos_annotations?: TokenPosAnnotation[];
}

export interface TextVersionCreateInput {
  language_tag: string;
  label: string;
  content: string;
  sort_order?: number;
}

export const workspaceKeys = {
  all: ['workspace'] as const,
  detail: (documentId: string) => ['workspace', documentId] as const,
};

const segmentationMutationKey = (documentId: string) =>
  ['segmentation-mutation', documentId] as const;

const lemmaMutationKey = (documentId: string) =>
  ['lemma-mutation', documentId] as const;

const posMutationKey = (documentId: string) =>
  ['pos-mutation', documentId] as const;

export function useSegmentationMutationPending(documentId: string): boolean {
  return useIsMutating({ mutationKey: segmentationMutationKey(documentId) }) > 0;
}

/** True while ANY lemma annotation mutation of this document is in flight. */
export function useLemmaMutationPending(documentId: string): boolean {
  return useIsMutating({ mutationKey: lemmaMutationKey(documentId) }) > 0;
}

/**
 * True while ANY POS annotation mutation of this document is in flight.
 *
 * Deliberately separate from the lemma pending signal: lemma and POS are
 * independent sibling lifecycles, so a pending POS write must not present the
 * lemma panel as pending (and vice versa).
 */
export function usePosMutationPending(documentId: string): boolean {
  return useIsMutating({ mutationKey: posMutationKey(documentId) }) > 0;
}

export function useWorkspace(documentId: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(documentId),
    queryFn: () =>
      apiClient.get<WorkspaceSnapshot>(`/api/v1/documents/${documentId}/workspace`),
    enabled: Boolean(documentId),
  });
}

export function useCreateTextVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TextVersionCreateInput) =>
      apiClient.post<TextVersion>(
        `/api/v1/documents/${documentId}/text-versions`,
        input,
      ),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
      queryClient.invalidateQueries({
        queryKey: documentKeys.detail(version.document_id),
      });
    },
  });
}

/**
 * Multipart UTF-8 `.txt` import (form fields: file, language_tag, label).
 * The server returns the canonical content; callers display/refetch it.
 */
export async function importTextVersionFile(
  documentId: string,
  input: { file: File; language_tag: string; label: string },
): Promise<TextVersion> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('language_tag', input.language_tag);
  form.append('label', input.label);
  return apiClient.request<TextVersion>(
    `/api/v1/documents/${documentId}/text-versions`,
    { method: 'POST', body: form },
  );
}

export function useImportTextVersionFile(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; language_tag: string; label: string }) =>
      importTextVersionFile(documentId, input),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
      queryClient.invalidateQueries({
        queryKey: documentKeys.detail(version.document_id),
      });
    },
  });
}

export function useDeleteTextVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, force }: { versionId: string; force: boolean }) =>
      apiClient.del(
        `/api/v1/text-versions/${versionId}${force ? '?force=true' : ''}`,
      ),
    onSuccess: () => {
      // The deleted version's id is reconciled out of the persisted panel
      // preferences by the WorkspaceProvider when the snapshot refetches.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
      queryClient.invalidateQueries({ queryKey: documentKeys.detail(documentId) });
    },
  });
}


export function usePutSentenceSegmentation(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: segmentationMutationKey(documentId),
    mutationFn: ({
      textVersionId,
      ...payload
    }: SentenceSegmentationPutInput) =>
      apiClient.put<SentenceSegmentation>(
        `/api/v1/text-versions/${textVersionId}/segmentations/sentence`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

export function useDeleteSentenceSegmentation(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: segmentationMutationKey(documentId),
    mutationFn: (textVersionId: string) =>
      apiClient.del(
        `/api/v1/text-versions/${textVersionId}/segmentations/sentence`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

export function usePutTokenSegmentation(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: segmentationMutationKey(documentId),
    mutationFn: ({ textVersionId, ...payload }: TokenSegmentationPutInput) =>
      apiClient.put<SentenceSegmentation>(
        `/api/v1/text-versions/${textVersionId}/segmentations/token`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

export function useDeleteTokenSegmentation(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: segmentationMutationKey(documentId),
    mutationFn: (textVersionId: string) =>
      apiClient.del(`/api/v1/text-versions/${textVersionId}/segmentations/token`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

/**
 * M4 lemma mutation hooks. The server response is never adopted as local
 * authority: every success invalidates the authoritative workspace snapshot,
 * which is the only source the panels read.
 */
export function usePutTokenLemma(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: lemmaMutationKey(documentId),
    mutationFn: ({ tokenSegmentId, lemma }: LemmaAnnotationPutInput) =>
      apiClient.put<TokenLemmaAnnotation>(
        `/api/v1/token-segments/${tokenSegmentId}/lemma`,
        { lemma },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

export function useDeleteTokenLemma(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: lemmaMutationKey(documentId),
    mutationFn: (tokenSegmentId: string) =>
      apiClient.del(`/api/v1/token-segments/${tokenSegmentId}/lemma`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

/**
 * M5 POS mutation hooks. Like the lemma hooks, the server response is never
 * adopted as local authority: every success invalidates the authoritative
 * workspace snapshot, which is the only source the panels read.
 */
export function usePutTokenPos(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: posMutationKey(documentId),
    mutationFn: ({ tokenSegmentId, pos_tag }: PosAnnotationPutInput) =>
      apiClient.put<TokenPosAnnotation>(
        `/api/v1/token-segments/${tokenSegmentId}/pos`,
        { pos_tag },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

export function useDeleteTokenPos(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: posMutationKey(documentId),
    mutationFn: (tokenSegmentId: string) =>
      apiClient.del(`/api/v1/token-segments/${tokenSegmentId}/pos`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}
