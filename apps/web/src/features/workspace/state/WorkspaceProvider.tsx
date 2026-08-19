/**
 * WorkspaceProvider (M0.3): owns ``visiblePanels`` / ``panelOrder`` for the
 * current document and persists them as a per-document preference.
 *
 * - initializes from localStorage under the accepted namespace;
 * - reconciles against the current server TextVersion ids whenever the
 *   snapshot changes (drops deleted ids, incorporates new versions);
 * - saves on every change, namespaced by documentId (no leakage between
 *   documents);
 * - exposes explicit open/hide/reorder actions. Panel reorder only changes
 *   the local preference — it never PATCHes TextVersion ``sort_order``.
 */

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { loadPreferences, savePreferences } from './preferences';
import {
  initialWorkspaceState,
  workspaceReducer,
} from './workspaceReducer';
import { WorkspaceContext, type WorkspaceContextValue } from './workspaceContext';

export function WorkspaceProvider({
  documentId,
  serverVersionIds,
  children,
}: {
  documentId: string;
  /** Current server TextVersion ids (for stale-id reconciliation). */
  serverVersionIds: string[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    documentId,
    (id) => loadPreferences(id) ?? initialWorkspaceState,
  );

  // Reconcile persisted preferences against current server versions. The
  // previous-key ref starts empty so the FIRST reconcile (mount, after the
  // snapshot loads) always runs — otherwise stale/incomplete stored ids
  // would be rendered as-is.
  const versionKey = serverVersionIds.join('|');
  const previousKey = useRef<string>('');
  useEffect(() => {
    if (previousKey.current === versionKey) {
      return;
    }
    previousKey.current = versionKey;
    dispatch({ type: 'RECONCILE', serverVersionIds });
  }, [versionKey, serverVersionIds]);

  // Persist per-document preferences on every change. Panel drag order is a
  // UI preference only — never PATCHed into TextVersion.sort_order.
  useEffect(() => {
    savePreferences(documentId, {
      panelOrder: state.panelOrder,
      visiblePanels: state.visiblePanels,
    });
  }, [documentId, state]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      panelOrder: state.panelOrder,
      visiblePanels: state.visiblePanels,
      openPanel: (versionId) => dispatch({ type: 'OPEN_PANEL', versionId }),
      hidePanel: (versionId) => dispatch({ type: 'HIDE_PANEL', versionId }),
      reorderPanels: (fromIndex, toIndex) =>
        dispatch({ type: 'REORDER_PANELS', fromIndex, toIndex }),
      isVisible: (versionId) => state.visiblePanels.includes(versionId),
    }),
    [state],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}
