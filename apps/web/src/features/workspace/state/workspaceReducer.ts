/**
 * Workspace UI state reducer (M0.3 + M0.4).
 *
 * M0.3 state: ``visiblePanels`` / ``panelOrder`` (local preference, persisted
 * per document). M0.4 adds the ephemeral selection state:
 *
 * - ``currentSelection`` — the last valid native selection captured in any
 *   panel (NOT auto-staged);
 * - ``pendingMembers`` — the explicit Alignment Tray (ADR-007): staged
 *   selections awaiting a future Create Alignment action.
 *
 * Ephemeral rules:
 *
 * - pending identity is ``(textVersionId, start, end)``; direction, quote and
 *   contentHash are NOT part of identity;
 * - exact duplicates (same version + start + end) are rejected;
 * - same-version overlap (``a.start < b.end && b.start < a.end``) is
 *   rejected; adjacent (``a.end === b.start``) and separated ranges are
 *   allowed; different TextVersions are never compared;
 * - HIDE_PANEL clears currentSelection when it belongs to the hidden panel
 *   but RETAINS its pending members;
 * - RECONCILE_PENDING drops current/pending ranges whose TextVersion
 *   disappeared or whose content hash changed; matching id+hash is retained;
 * - Escape clears currentSelection only (component layer), never the tray;
 * - currentSelection/pendingMembers are NEVER persisted to localStorage.
 */

import { reconcilePreferences } from './preferences';
import type { PendingSpan } from '../../../shared/text/types';

export interface WorkspaceState {
  panelOrder: string[];
  visiblePanels: string[];
  currentSelection: PendingSpan | null;
  pendingMembers: PendingSpan[];
}

export type WorkspaceAction =
  | { type: 'OPEN_PANEL'; versionId: string }
  | { type: 'HIDE_PANEL'; versionId: string }
  | { type: 'REORDER_PANELS'; fromIndex: number; toIndex: number }
  | { type: 'RECONCILE'; serverVersionIds: string[] }
  | {
      type: 'RECONCILE_PENDING';
      serverVersions: ReadonlyArray<{ id: string; contentHash: string }>;
    }
  | { type: 'CAPTURE_SELECTION'; member: PendingSpan }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'ADD_PENDING_MEMBER'; member: PendingSpan }
  | { type: 'REMOVE_PENDING_MEMBER'; member: PendingSpan }
  | { type: 'CLEAR_PENDING_MEMBERS' };

export type StageRejectionReason =
  | 'NO_SELECTION'
  | 'DUPLICATE'
  | 'OVERLAP'
  | 'FROZEN';

export type StageResult =
  | { ok: true }
  | { ok: false; reason: StageRejectionReason };

function addUnique(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

function move(list: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

/** Pending identity: (textVersionId, start, end) — the coordinate identity. */
export function pendingIdentity(member: PendingSpan): string {
  return `${member.textVersionId}:${member.start}:${member.end}`;
}

/**
 * Same-version overlap predicate: `a` and `b` overlap iff
 * `a.start < b.end && b.start < a.end`. Adjacent ranges
 * (`a.end === b.start`) do NOT overlap and are allowed.
 */
export function pendingRangesOverlap(
  a: Pick<PendingSpan, 'start' | 'end'>,
  b: Pick<PendingSpan, 'start' | 'end'>,
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Validate staging `member` into `state.pendingMembers` (pure; used by both
 * the reducer and the provider so the UI can surface the rejection reason).
 */
export function canStagePendingMember(
  state: Pick<WorkspaceState, 'currentSelection' | 'pendingMembers'>,
  member: PendingSpan,
): StageResult {
  const identities = new Set(state.pendingMembers.map(pendingIdentity));
  if (identities.has(pendingIdentity(member))) {
    return { ok: false, reason: 'DUPLICATE' };
  }
  for (const existing of state.pendingMembers) {
    if (
      existing.textVersionId === member.textVersionId &&
      pendingRangesOverlap(existing, member)
    ) {
      return { ok: false, reason: 'OVERLAP' };
    }
  }
  return { ok: true };
}

export const initialWorkspaceState: WorkspaceState = {
  panelOrder: [],
  visiblePanels: [],
  currentSelection: null,
  pendingMembers: [],
};

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        ...state,
        panelOrder: addUnique(state.panelOrder, action.versionId),
        visiblePanels: addUnique(state.visiblePanels, action.versionId),
      };
    case 'HIDE_PANEL':
      return {
        ...state,
        visiblePanels: state.visiblePanels.filter(
          (id) => id !== action.versionId,
        ),
        // A hidden panel can no longer be the current selection source, but
        // its already-staged pending members stay in the tray.
        currentSelection:
          state.currentSelection?.textVersionId === action.versionId
            ? null
            : state.currentSelection,
      };
    case 'REORDER_PANELS':
      return {
        ...state,
        panelOrder: move(state.panelOrder, action.fromIndex, action.toIndex),
      };
    case 'RECONCILE': {
      const reconciled = reconcilePreferences(
        { panelOrder: state.panelOrder, visiblePanels: state.visiblePanels },
        action.serverVersionIds,
      );
      return { ...state, panelOrder: reconciled.panelOrder, visiblePanels: reconciled.visiblePanels };
    }
    case 'RECONCILE_PENDING': {
      const currentById = new Map(
        action.serverVersions.map((version) => [version.id, version.contentHash]),
      );
      const currentSelection =
        state.currentSelection !== null &&
        currentById.get(state.currentSelection.textVersionId) ===
          state.currentSelection.contentHash
          ? state.currentSelection
          : null;
      const pendingMembers = state.pendingMembers.filter(
        (member) =>
          currentById.get(member.textVersionId) === member.contentHash,
      );
      return { ...state, currentSelection, pendingMembers };
    }
    case 'CAPTURE_SELECTION':
      return { ...state, currentSelection: action.member };
    case 'CLEAR_SELECTION':
      return { ...state, currentSelection: null };
    case 'ADD_PENDING_MEMBER': {
      // The reducer re-validates (defense in depth): invalid staging is a
      // no-op. The provider surfaces the rejection reason to the UI.
      if (!canStagePendingMember(state, action.member).ok) {
        return state;
      }
      return {
        ...state,
        pendingMembers: [...state.pendingMembers, action.member],
        // Successful staging consumes the current selection (explicit
        // Add-to-Alignment lifecycle; section 17).
        currentSelection: null,
      };
    }
    case 'REMOVE_PENDING_MEMBER':
      return {
        ...state,
        pendingMembers: state.pendingMembers.filter(
          (member) => pendingIdentity(member) !== pendingIdentity(action.member),
        ),
      };
    case 'CLEAR_PENDING_MEMBERS':
      return { ...state, pendingMembers: [] };
    default:
      return state;
  }
}
