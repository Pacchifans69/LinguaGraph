/**
 * ParallelDocument server state (M0.3) — TanStack Query hooks over /api/v1
 * document endpoints. Query keys follow the report (section 10):
 * ['documents', projectId], ['document', id].
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../shared/api/client';

export interface ParallelDocument {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentCreateInput {
  title: string;
  description?: string | null;
}

export interface DocumentUpdateInput {
  title?: string;
  description?: string | null;
}

export const documentKeys = {
  forProject: (projectId: string) => ['documents', projectId] as const,
  detail: (documentId: string) => ['document', documentId] as const,
};

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: documentKeys.forProject(projectId),
    queryFn: () =>
      apiClient.get<ParallelDocument[]>(`/api/v1/projects/${projectId}/documents`),
    enabled: Boolean(projectId),
  });
}

export function useDocument(documentId: string) {
  return useQuery({
    queryKey: documentKeys.detail(documentId),
    queryFn: () => apiClient.get<ParallelDocument>(`/api/v1/documents/${documentId}`),
    enabled: Boolean(documentId),
  });
}

export function useCreateDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentCreateInput) =>
      apiClient.post<ParallelDocument>(
        `/api/v1/projects/${projectId}/documents`,
        input,
      ),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.forProject(projectId) });
      queryClient.setQueryData(documentKeys.detail(document.id), document);
    },
  });
}

export function useDeleteDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiClient.del(`/api/v1/documents/${documentId}`),
    onSuccess: () => {
      // The deleted document's workspace disappears with it.
      queryClient.invalidateQueries({ queryKey: documentKeys.forProject(projectId) });
      queryClient.removeQueries({ queryKey: ['workspace'] });
    },
  });
}
