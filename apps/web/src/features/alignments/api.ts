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

// ---------------------------------------------------------------------------
// M0.6 (Round 2): update / delete alignment mutations.
//
// The existing backend routes are authoritative:
//
//   PATCH  /api/v1/alignments/{alignment_id}
//   DELETE /api/v1/alignments/{alignment_id}
//
// PATCH semantics (frozen M0.5 contract): omission means unchanged,
// `note: null` clears the note, `members` is the FULL REPLACEMENT SET of
// coordinate-only members. No new GET/list endpoint is introduced.
// ---------------------------------------------------------------------------

/**
 * PATCH body for an existing AlignmentGroup. Omitted fields are unchanged;
 * `note: null` clears the nullable note; `members` (when present) is the
 * complete replacement member set.
 */
export interface UpdateAlignmentInput {
  note?: string | null;
  members?: AlignmentMemberInput[];
}

/** PATCH/POST response shape: the alignment with its member list. */
export type AlignmentWithMembers = CreatedAlignment;

/**
 * Update an existing alignment (note and/or full member replacement).
 *
 * - mutation key is alignment-scoped: ['alignment-update', alignmentId];
 * - on success the authoritative workspace snapshot is invalidated/refetched
 *   (NO optimistic persisted-domain state — the backend remains authority);
 * - `alignmentId` may be null (no active group): the hook is inert until a
 *   concrete id is provided and mutate() is called.
 */
export function useUpdateAlignment(
  documentId: string,
  alignmentId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['alignment-update', alignmentId],
    mutationFn: (input: UpdateAlignmentInput) =>
      apiClient.patch<AlignmentWithMembers>(
        `/api/v1/alignments/${alignmentId}`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

/**
 * Delete an existing alignment (destructive; requires explicit confirmation
 * at the call site).
 *
 * - mutation key is alignment-scoped: ['alignment-delete', alignmentId];
 * - on success the authoritative workspace snapshot is invalidated/refetched;
 *   the deleted group is reconciled out of active/hovered state by the
 *   existing snapshot reconciliation (never faked client-side).
 */
export function useDeleteAlignment(
  documentId: string,
  alignmentId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['alignment-delete', alignmentId],
    mutationFn: () =>
      apiClient.del<void>(`/api/v1/alignments/${alignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(documentId) });
    },
  });
}

/**
 * Convert one authoritative workspace AlignmentMember (via its span) into
 * the coordinate-only backend member shape. The member's span lookup is the
 * ONLY data source — exact_text/quote/prefix/suffix/contentHash/direction
 * are never sent.
 */
export function memberToMemberInput(
  member: { span_id: string },
  spansById: Record<string, { text_version_id: string; start_offset: number; end_offset: number }>,
): AlignmentMemberInput | null {
  const span = spansById[member.span_id];
  if (span === undefined) {
    return null;
  }
  return {
    text_version_id: span.text_version_id,
    start: span.start_offset,
    end: span.end_offset,
  };
}
