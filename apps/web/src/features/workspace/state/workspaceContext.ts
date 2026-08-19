/**
 * Workspace context + hook (M0.3). Split from the provider file so the
 * provider module only exports a component (react-refresh friendliness).
 */

import { createContext, useContext } from 'react';

export interface WorkspaceContextValue {
  panelOrder: string[];
  visiblePanels: string[];
  openPanel: (versionId: string) => void;
  hidePanel: (versionId: string) => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  isVisible: (versionId: string) => boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceState(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error('useWorkspaceState must be used within a WorkspaceProvider');
  }
  return value;
}
