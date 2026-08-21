/**
 * Workspace context + hook (M0.3 + M0.4 + M0.6). Split from the provider file
 * so the provider module only exports a component (react-refresh friendliness).
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
  /**
   * M0.6: the AlignmentGroup id currently hovered by the pointer (or by a
   * concrete ambiguity-chooser option). Ephemeral — never persisted.
   */
  hoveredAlignmentId: string | null;
  /**
   * M0.6: the user-activated AlignmentGroup id. Active visualization
   * persists after pointer leave; Round 1 has no click-to-toggle-off.
   * Ephemeral — never persisted.
   */
  activeAlignmentId: string | null;
  /**
   * M0.5 (Gate 2 fix): true while a Create Alignment request is in flight.
   * The pending tray is FROZEN against growth: STAGING is rejected by
   * WorkspaceProvider with the FROZEN reason, and the user-facing Remove /
   * Clear tray controls are disabled — so a member staged after the request
   * began can never be silently discarded by the success-path tray clear.
   * (Programmatic clearPendingTray remains usable; the create success path
   * itself relies on it.)
   */
  isCreatingAlignment: boolean;
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
   * same-version overlap / tray frozen during an in-flight create), so the
   * UI can surface it.
   */
  addCurrentSelectionToTray: () => StageResult;
  /** Remove one pending member by identity (textVersionId, start, end). */
  removePendingMember: (member: PendingSpan) => void;
  /** Clear the whole pending tray (explicit action only). */
  clearPendingTray: () => void;
  /** M0.6: set the hovered AlignmentGroup id (null clears). */
  setHoveredAlignment: (alignmentId: string | null) => void;
  /** M0.6: activate an AlignmentGroup id (null clears; no toggle in Round 1). */
  setActiveAlignment: (alignmentId: string | null) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceState(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error('useWorkspaceState must be used within a WorkspaceProvider');
  }
  return value;
}
