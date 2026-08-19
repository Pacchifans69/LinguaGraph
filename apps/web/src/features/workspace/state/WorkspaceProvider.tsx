/**
 * WorkspaceProvider (M0.3 + M0.4): owns panel layout preferences AND the
 * ephemeral selection state for the current document.
 *
 * - panel layout (``visiblePanels`` / ``panelOrder``) initializes from
 *   localStorage under the accepted per-document namespace and persists on
 *   every change;
 * - currentSelection / pendingMembers are FRONTEND-ONLY: initialized empty,
 *   never read from or written to localStorage, and lost on provider
 *   remount (browser reload / document change via the ``key``);
 * - the provider is keyed by ``documentId`` at the call site so a document
 *   change remounts it: ephemeral state is cleared and panel preferences are
 *   re-initialized for the new document;
 * - server reconciliation: whenever the server version set (id + content
 *   hash) changes, panel preferences are reconciled against the ids and
 *   current/pending selections are dropped for versions that disappeared or
 *   whose content hash changed;
 * - panel reorder only changes the local preference — it never PATCHes
 *   TextVersion ``sort_order``.
 */

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { PendingSpan } from '../../../shared/text/types';
import { loadPreferences, savePreferences } from './preferences';
import {
  canStagePendingMember,
  initialWorkspaceState,
  workspaceReducer,
  type StageResult,
} from './workspaceReducer';
import { WorkspaceContext, type WorkspaceContextValue } from './workspaceContext';

export interface ServerVersionRef {
  id: string;
  contentHash: string;
}

export function WorkspaceProvider({
  documentId,
  serverVersions,
  children,
}: {
  documentId: string;
  /** Current server TextVersions (id + content hash) for reconciliation. */
  serverVersions: ReadonlyArray<ServerVersionRef>;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    documentId,
    (id) => ({
      ...initialWorkspaceState,
      ...(loadPreferences(id) ?? {}),
    }),
  );

  // Reconcile against the current server versions. The key includes the
  // content hash so a same-id content change also reconciles (and drops)
  // stale current/pending selections. The previous-key ref starts empty so
  // the FIRST reconcile (mount, after the snapshot loads) always runs.
  const versionKey = serverVersions
    .map((version) => `${version.id}:${version.contentHash}`)
    .join('|');
  const previousKey = useRef<string>('');
  useEffect(() => {
    if (previousKey.current === versionKey) {
      return;
    }
    previousKey.current = versionKey;
    dispatch({
      type: 'RECONCILE',
      serverVersionIds: serverVersions.map((version) => version.id),
    });
    dispatch({ type: 'RECONCILE_PENDING', serverVersions });
  }, [versionKey, serverVersions]);

  // Persist per-document preferences on every change. Panel drag order is a
  // UI preference only — never PATCHed into TextVersion.sort_order.
  // currentSelection/pendingMembers are deliberately NOT persisted.
  useEffect(() => {
    savePreferences(documentId, {
      panelOrder: state.panelOrder,
      visiblePanels: state.visiblePanels,
    });
  }, [documentId, state]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const stageResult = (): StageResult => {
      if (state.currentSelection === null) {
        return { ok: false, reason: 'NO_SELECTION' };
      }
      const result = canStagePendingMember(state, state.currentSelection);
      if (result.ok) {
        dispatch({ type: 'ADD_PENDING_MEMBER', member: state.currentSelection });
      }
      return result;
    };

    return {
      panelOrder: state.panelOrder,
      visiblePanels: state.visiblePanels,
      currentSelection: state.currentSelection,
      pendingMembers: state.pendingMembers,
      openPanel: (versionId) => dispatch({ type: 'OPEN_PANEL', versionId }),
      hidePanel: (versionId) => dispatch({ type: 'HIDE_PANEL', versionId }),
      reorderPanels: (fromIndex, toIndex) =>
        dispatch({ type: 'REORDER_PANELS', fromIndex, toIndex }),
      isVisible: (versionId) => state.visiblePanels.includes(versionId),
      captureSelection: (member: PendingSpan) =>
        dispatch({ type: 'CAPTURE_SELECTION', member }),
      clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
      addCurrentSelectionToTray: stageResult,
      removePendingMember: (member: PendingSpan) =>
        dispatch({ type: 'REMOVE_PENDING_MEMBER', member }),
      clearPendingTray: () => dispatch({ type: 'CLEAR_PENDING_MEMBERS' }),
    };
  }, [state]);

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}
