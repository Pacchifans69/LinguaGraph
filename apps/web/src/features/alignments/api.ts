/**
 * Alignment server-state hooks (M0.5).
 *
 * The M0.5 persistence member boundary contains ONLY text_version_id /
 * start / end (frozen contract section 6/7): quote, direction and
 * contentHash are frontend-only metadata and are NEVER sent. The backend
 * derives exact_text/prefix/suffix from the canonical content.
 *
 * The create mutation invalidates the ['workspace', documentId] query so
 * the workspace refetches authoritative server state (the ['alignments',
 * documentId] key family is not implemented in M0.5, so it is not
 * invalidated).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../shared/api/client';
import { workspaceKeys } from '../workspace/api';

export interface AlignmentMemberInput {
  text_version_id: string;
  start: number;
  end: number;
}

export interface CreateAlignmentInput {
  note?: string | null;
  members: AlignmentMemberInput[];
}

export interface CreatedAlignmentMember {
  id: string;
  span_id: string;
  text_version_id: string;
  start: number;
  end: number;
  exact_text: string;
}

export interface CreatedAlignment {
  id: string;
  document_id: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  members: CreatedAlignmentMember[];
}

export function useCreateAlignment(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Document-scoped mutation key (HR-F01, defense in depth): mutation
    // cache/observer state is isolated per document even beyond the
    // keyed DocumentWorkspacePage remount.
    mutationKey: ['alignment-create', documentId],
    mutationFn: (input: CreateAlignmentInput) =>
      apiClient.post<CreatedAlignment>(
        `/api/v1/documents/${documentId}/alignments`,
        input,
      ),
    onSuccess: () => {
      // The workspace snapshot is the persisted read model: invalidating it
      // refetches the authoritative spans/groups/members.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

/**
 * Map the ephemeral PendingSpan tray state to the persistence boundary
 * (frozen contract section 7). quote/direction/contentHash are deliberately
 * dropped here — the API accepts coordinates only.
 */
export function pendingToMemberInput(
  member: { textVersionId: string; start: number; end: number },
): AlignmentMemberInput {
  return {
    text_version_id: member.textVersionId,
    start: member.start,
    end: member.end,
  };
}
