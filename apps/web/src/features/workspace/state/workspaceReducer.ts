/**
 * Workspace UI state reducer (M0.3).
 *
 * M0.3 workspace state contains ONLY what M0.3 needs: ``visiblePanels`` and
 * ``panelOrder`` (report section 10; CURRENT_STATE.md). Selection/pending
 * member/alignment state is deliberately NOT built here — it belongs to
 * M0.4/M0.5. Panel order is a local UI preference and is never pushed to the
 * TextVersion ``sort_order`` server field.
 */

import { reconcilePreferences } from './preferences';

export interface WorkspaceState {
  panelOrder: string[];
  visiblePanels: string[];
}

export type WorkspaceAction =
  | { type: 'OPEN_PANEL'; versionId: string }
  | { type: 'HIDE_PANEL'; versionId: string }
  | { type: 'REORDER_PANELS'; fromIndex: number; toIndex: number }
  | { type: 'RECONCILE'; serverVersionIds: string[] };

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

export const initialWorkspaceState: WorkspaceState = {
  panelOrder: [],
  visiblePanels: [],
};

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        panelOrder: addUnique(state.panelOrder, action.versionId),
        visiblePanels: addUnique(state.visiblePanels, action.versionId),
      };
    case 'HIDE_PANEL':
      return {
        ...state,
        visiblePanels: state.visiblePanels.filter(
          (id) => id !== action.versionId,
        ),
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
      return { panelOrder: reconciled.panelOrder, visiblePanels: reconciled.visiblePanels };
    }
    default:
      return state;
  }
}
