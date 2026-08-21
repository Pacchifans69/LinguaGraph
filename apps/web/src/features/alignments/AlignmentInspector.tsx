/**
 * AlignmentInspector (M0.6 Round 2) — the read/edit surface for the ACTIVE
 * AlignmentGroup.
 *
 * - exists only while ``activeAlignmentId !== null`` (returns null
 *   otherwise; hooks stay unconditional because the component is always
 *   mounted by the workspace);
 * - ALL persisted data is derived from the CURRENT normalized workspace
 *   snapshot (groupsById / membersByGroup / spansById / versionsById) —
 *   the TanStack Query workspace snapshot remains the server-state
 *   authority; no second long-lived client-side domain store;
 * - note editing: textarea + explicit Save (no autosave), max 4000 chars,
 *   no trimming; ``{ note: null }`` clears; omission means unchanged;
 * - member removal: PATCH with the FULL REPLACEMENT member set
 *   (coordinate-only ``{ text_version_id, start, end }``), explicit
 *   confirmation, frontend preflight mirror (>=2 members, >=2 distinct
 *   TextVersions) with the backend remaining authoritative;
 * - delete alignment: explicit destructive confirmation; on success the
 *   authoritative refetch + existing snapshot reconciliation clears
 *   active/hovered state and closes the Inspector;
 * - mutation serialization: while ANY mutation for the active group is
 *   pending, every Inspector control (Save / Remove / Delete / Close) is
 *   disabled and the workspace-level freeze flag
 *   (``isMutatingAlignment``) is set synchronously so SavedAlignments
 *   activation, ambiguity chooser activation and run-click activation are
 *   disabled too;
 * - failures keep the Inspector open, the authoritative members visible and
 *   the note draft intact; the stable API error is displayed and retry is
 *   possible once the pending state clears.
 */

import { useEffect, useState } from 'react';
import {
  memberToMemberInput,
  useDeleteAlignment,
  useUpdateAlignment,
  type AlignmentMemberInput,
  type UpdateAlignmentInput,
} from './api';
import type {
  AlignmentGroup,
  AlignmentMember,
  TextVersion,
  WorkspaceSpan,
} from '../workspace/api';
import { useWorkspaceState } from '../workspace/state/workspaceContext';
import { ErrorMessage } from '../../shared/ui/feedback';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';

/** Backend-enforced note length (mirrored at the UI boundary). */
export const NOTE_MAX_LENGTH = 4000;

export interface AlignmentInspectorProps {
  documentId: string;
  activeAlignmentId: string | null;
  groupsById: Record<string, AlignmentGroup>;
  membersByGroup: Record<string, AlignmentMember[]>;
  spansById: Record<string, WorkspaceSpan>;
  versionsById: Record<string, TextVersion>;
  /** Close the Inspector (clears activeAlignmentId — no click-to-toggle-off). */
  onClose: () => void;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function AlignmentInspector({
  documentId,
  activeAlignmentId,
  groupsById,
  membersByGroup,
  spansById,
  versionsById,
  onClose,
}: AlignmentInspectorProps) {
  const { isMutatingAlignment, setAlignmentMutationPending } =
    useWorkspaceState();

  const group =
    activeAlignmentId !== null ? (groupsById[activeAlignmentId] ?? null) : null;
  const members =
    activeAlignmentId !== null ? (membersByGroup[activeAlignmentId] ?? []) : [];

  const updateMutation = useUpdateAlignment(documentId, activeAlignmentId);
  const deleteMutation = useDeleteAlignment(documentId, activeAlignmentId);

  // ---- note draft (ephemeral form state; NOT persisted) ------------------
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);

  // Fresh activation of a group: drop any stale edit flag.
  useEffect(() => {
    setNoteDirty(false);
  }, [group?.id]);

  // Draft reconciliation with the authoritative note:
  // - with no unsaved edit, adopt the server note;
  // - once the server note matches the draft (our own save's refetch has
  //   landed), the draft is committed and future authoritative changes may
  //   be adopted again. Until that refetch confirms, an unsaved edit is
  //   NEVER overwritten by a stale snapshot.
  useEffect(() => {
    const serverNote = group?.note ?? '';
    if (noteDirty && serverNote === noteDraft) {
      setNoteDirty(false);
    } else if (!noteDirty) {
      setNoteDraft(serverNote);
    }
  }, [group?.note, noteDirty, noteDraft]);

  // ---- confirmation state (R2-F02: bound to their targets) ----------------
  // Destructive confirmations are NEVER targetless booleans: each stores the
  // identity of the group (and for member removal, the member) it was armed
  // for. A confirmation renders and may execute only while its target still
  // matches the CURRENT authoritative active group/member set; when the
  // active group changes, stale confirmations close and are reset so they
  // cannot resurrect when switching back.
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<
    string | null
  >(null);
  const [pendingRemove, setPendingRemove] = useState<{
    groupId: string;
    memberId: string;
  } | null>(null);

  // Active group changed: stale confirmations must close and never reappear.
  useEffect(() => {
    setPendingDeleteGroupId(null);
    setPendingRemove(null);
  }, [group?.id]);

  // ---- note editing -------------------------------------------------------
  const noteUnchanged = (group?.note ?? '') === noteDraft;
  const noteTooLong = noteDraft.length > NOTE_MAX_LENGTH;
  const saveDisabled =
    group === null || isMutatingAlignment || noteUnchanged || noteTooLong;

  function handleSaveNote() {
    if (group === null || saveDisabled) {
      return;
    }
    // Empty draft clears the nullable note; non-empty sends the EXACT
    // string (no trimming). Omission semantics are handled by PATCH itself.
    // The workspace freeze flag is set synchronously (before the request
    // starts) so no second same-group mutation can be started. The draft
    // stays dirty until the refetched server note confirms the save (see
    // the reconciliation effect above). R2-F03: starting a PATCH clears any
    // stale DELETE error so the latest operation owns the error surface.
    deleteMutation.reset();
    setAlignmentMutationPending(true);
    updateMutation.mutate(
      { note: noteDraft === '' ? null : noteDraft },
      {
        onSettled: () => setAlignmentMutationPending(false),
      },
    );
  }

  // ---- member removal -----------------------------------------------------
  function removalPreflight(
    memberId: string,
  ): { ok: true } | { ok: false; reason: string } {
    const remaining = members.filter((member) => member.id !== memberId);
    if (remaining.length < 2) {
      return { ok: false, reason: 'An alignment needs at least 2 members.' };
    }
    const versionIds = new Set<string>();
    for (const member of remaining) {
      const span = spansById[member.span_id];
      if (span !== undefined) {
        versionIds.add(span.text_version_id);
      }
    }
    if (versionIds.size < 2) {
      return {
        ok: false,
        reason:
          'An alignment needs members from at least 2 text versions.',
      };
    }
    return { ok: true };
  }

  function handleConfirmRemove() {
    if (
      group === null ||
      isMutatingAlignment ||
      pendingRemove === null ||
      // The confirmation only executes for the group/member it was armed
      // for, and the member must still exist in the CURRENT authoritative
      // member set (R2-F02).
      pendingRemove.groupId !== group.id ||
      !members.some((member) => member.id === pendingRemove.memberId)
    ) {
      return;
    }
    // FULL REPLACEMENT SET semantics: read the CURRENT authoritative
    // members, remove X, convert the rest to coordinates only.
    const remaining = members.filter(
      (member) => member.id !== pendingRemove.memberId,
    );
    const replacement: AlignmentMemberInput[] = remaining
      .map((member) => memberToMemberInput(member, spansById))
      .filter((input): input is AlignmentMemberInput => input !== null);
    const payload: UpdateAlignmentInput = { members: replacement };
    // R2-F03: starting a PATCH clears any stale DELETE error.
    deleteMutation.reset();
    setAlignmentMutationPending(true);
    updateMutation.mutate(payload, {
      onSettled: () => {
        setAlignmentMutationPending(false);
        setPendingRemove(null);
      },
    });
  }

  // ---- delete alignment ---------------------------------------------------
  function handleConfirmDelete() {
    if (
      group === null ||
      isMutatingAlignment ||
      // The confirmation only executes for the group it was armed for
      // (R2-F02): a stale G1 confirmation can never delete G2.
      pendingDeleteGroupId !== group.id
    ) {
      return;
    }
    // R2-F03: starting a DELETE clears any stale PATCH error.
    updateMutation.reset();
    setAlignmentMutationPending(true);
    deleteMutation.mutate(undefined, {
      // Success path: the authoritative refetch + snapshot reconciliation
      // clears active/hovered state and closes the Inspector. The
      // confirmation closes on settle (success OR error — errors remain
      // visible in the Inspector with retry available).
      onSettled: () => {
        setAlignmentMutationPending(false);
        setPendingDeleteGroupId(null);
      },
    });
  }

  // R2-F03: with stale errors reset when the other operation starts, only
  // the LATEST failing operation can own the error surface.
  const mutationError = updateMutation.isError
    ? updateMutation.error
    : deleteMutation.isError
      ? deleteMutation.error
      : null;

  if (group === null) {
    return null;
  }

  const pendingRemoveMember =
    pendingRemove !== null && pendingRemove.groupId === group.id
      ? (members.find((member) => member.id === pendingRemove.memberId) ??
        null)
      : null;

  return (
    <section
      className="alignment-inspector"
      aria-label="Alignment inspector"
    >
      <header className="alignment-inspector-header">
        <h3>Alignment {shortId(group.id)}</h3>
        <button
          type="button"
          className="inspector-close"
          aria-label="Close inspector"
          disabled={isMutatingAlignment}
          onClick={onClose}
        >
          Close
        </button>
      </header>

      {mutationError !== null ? <ErrorMessage error={mutationError} /> : null}

      <div className="inspector-note">
        <label htmlFor="inspector-note-input">
          Note{' '}
          <span className="inspector-note-length">
            ({noteDraft.length}/{NOTE_MAX_LENGTH})
          </span>
        </label>
        <textarea
          id="inspector-note-input"
          value={noteDraft}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          onChange={(event) => {
            setNoteDraft(event.target.value);
            setNoteDirty(true);
          }}
        />
        {noteTooLong ? (
          <p className="inspector-validation" role="alert">
            Note exceeds {NOTE_MAX_LENGTH} characters.
          </p>
        ) : null}
        <button
          type="button"
          className="inspector-save-note"
          disabled={saveDisabled}
          onClick={handleSaveNote}
        >
          Save note
        </button>
      </div>

      <div className="inspector-members">
        <h4>Members ({members.length})</h4>
        <ul className="inspector-member-list">
          {members.map((member) => {
            const span = spansById[member.span_id];
            const version = span
              ? versionsById[span.text_version_id]
              : undefined;
            const preflight = removalPreflight(member.id);
            return (
              <li key={member.id} className="inspector-member">
                <span className="inspector-member-info">
                  {version ? (
                    <>
                      <span className="inspector-member-language">
                        {version.language_tag}
                      </span>{' '}
                      — {version.label}: “{span?.exact_text ?? ''}”
                    </>
                  ) : (
                    'Unknown text version'
                  )}
                  {span ? (
                    <span className="inspector-member-offsets">
                      {' '}
                      [{span.start_offset}, {span.end_offset})
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="inspector-remove-member"
                  aria-label={`Remove member “${span?.exact_text ?? ''}”`}
                  disabled={isMutatingAlignment || !preflight.ok}
                  onClick={() =>
                    setPendingRemove({ groupId: group.id, memberId: member.id })
                  }
                >
                  Remove
                </button>
                {!preflight.ok ? (
                  <p className="inspector-validation">{preflight.reason}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="inspector-actions">
        <button
          type="button"
          className="danger"
          disabled={isMutatingAlignment}
          onClick={() => setPendingDeleteGroupId(group.id)}
        >
          Delete Alignment
        </button>
      </div>

      {/* R2-F02: dialogs render ONLY while their stored target still matches
          the CURRENT active group (and member). A stale confirmation from a
          previous group is invisible and can never execute. */}
      {pendingRemoveMember !== null ? (
        <ConfirmDialog
          headingId="inspector-remove-heading"
          onClose={() => setPendingRemove(null)}
        >
          <h3 id="inspector-remove-heading">Remove this member?</h3>
          <p>
            “{spansById[pendingRemoveMember.span_id]?.exact_text ?? ''}”
            will be removed from this alignment. This cannot be undone
            without re-adding it.
          </p>
          <div className="confirm-dialog-actions">
            <button
              type="button"
              onClick={() => setPendingRemove(null)}
              disabled={isMutatingAlignment}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={isMutatingAlignment}
              onClick={handleConfirmRemove}
            >
              Confirm remove
            </button>
          </div>
        </ConfirmDialog>
      ) : null}

      {pendingDeleteGroupId !== null && pendingDeleteGroupId === group.id ? (
        <ConfirmDialog
          headingId="inspector-delete-heading"
          onClose={() => setPendingDeleteGroupId(null)}
        >
          <h3 id="inspector-delete-heading">Delete this alignment?</h3>
          <p>
            Alignment {shortId(group.id)} and all its members will be
            permanently deleted. This cannot be undone.
          </p>
          <div className="confirm-dialog-actions">
            <button
              type="button"
              onClick={() => setPendingDeleteGroupId(null)}
              disabled={isMutatingAlignment}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={isMutatingAlignment}
              onClick={handleConfirmDelete}
            >
              Confirm delete
            </button>
          </div>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
