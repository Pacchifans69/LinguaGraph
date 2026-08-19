/**
 * Workspace context + hook (M0.3 + M0.4). Split from the provider file so the
 * provider module only exports a component (react-refresh friendliness).
 */

import { createContext, useContext } from 'react';
import type { PendingSpan } from '../../../shared/text/types';
import type { StageResult } from './workspaceReducer';

export interface WorkspaceContextValue {
  /** M0.3 panel layout state (local preference, persisted per document). */
  panelOrder: string[];
  visiblePanels: string[];
  /** M0.4: last captured native selection (never persisted). */
  currentSelection: PendingSpan | null;
  /** M0.4: explicitly staged pending members (Alignment Tray, never persisted). */
  pendingMembers: PendingSpan[];
  openPanel: (versionId: string) => void;
  hidePanel: (versionId: string) => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  isVisible: (versionId: string) => boolean;
  /** Capture a validated native selection as the current selection. */
  captureSelection: (member: PendingSpan) => void;
  /** Clear the current selection (Escape / explicit cancel). */
  clearSelection: () => void;
  /**
   * Stage the current selection into the pending tray. Returns the
   * rejection reason when staging fails (no selection / duplicate /
   * same-version overlap), so the UI can surface it.
   */
  addCurrentSelectionToTray: () => StageResult;
  /** Remove one pending member by identity (textVersionId, start, end). */
  removePendingMember: (member: PendingSpan) => void;
  /** Clear the whole pending tray (explicit action only). */
  clearPendingTray: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceState(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error('useWorkspaceState must be used within a WorkspaceProvider');
  }
  return value;
}
