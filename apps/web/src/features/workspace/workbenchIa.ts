export const WORKBENCH_MODES = [
  'alignment',
  'sentence',
  'token',
  'lemma',
  'pos',
] as const;

export type WorkbenchMode = (typeof WORKBENCH_MODES)[number];
export type LinguisticMode = Exclude<WorkbenchMode, 'alignment'>;

export interface EditorSessionStatus {
  dirty: boolean;
  pending: boolean;
  error: boolean;
  conflict: boolean;
  dialogOpen: boolean;
}

export const EMPTY_SESSION_STATUS: EditorSessionStatus = {
  dirty: false,
  pending: false,
  error: false,
  conflict: false,
  dialogOpen: false,
};

export function sessionKey(versionId: string, mode: LinguisticMode): string {
  return `${versionId}:${mode}`;
}

export function nextVisibleTarget(
  panelOrder: readonly string[],
  visiblePanels: readonly string[],
  current: string | null,
): string | null {
  const visible = panelOrder.filter((id) => visiblePanels.includes(id));
  if (current !== null && visible.includes(current)) {
    return current;
  }
  return visible[0] ?? null;
}

export function sameSessionStatus(
  left: EditorSessionStatus | undefined,
  right: EditorSessionStatus,
): boolean {
  return (
    left?.dirty === right.dirty &&
    left.pending === right.pending &&
    left.error === right.error &&
    left.conflict === right.conflict &&
    left.dialogOpen === right.dialogOpen
  );
}
