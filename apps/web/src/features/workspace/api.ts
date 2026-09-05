/**
 * Workspace server state (M0.3) — TanStack Query hooks over the workspace
 * read model and the TextVersion create/delete endpoints.
 *
 * Query key follows the report (section 10): ['workspace', documentId].
 * Creating or deleting a TextVersion invalidates the workspace snapshot (and
 * the parent document), so panels always render the canonical server content.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  granularity: 'sentence';
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
  created_at: string;
}

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

/** The raw document-level snapshot returned by GET /workspace (flat arrays). */
export interface WorkspaceSnapshot {
  document: ParallelDocument;
  text_versions: TextVersion[];
  spans: WorkspaceSpan[];
  alignment_groups: AlignmentGroup[];
  alignment_members: AlignmentMember[];
  segmentation_layers?: SegmentationLayer[];
  segments?: LinguisticSegment[];
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
    mutationFn: (textVersionId: string) =>
      apiClient.del(
        `/api/v1/text-versions/${textVersionId}/segmentations/sentence`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}
