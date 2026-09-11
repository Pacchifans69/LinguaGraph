export const WORKBENCH_MODES = [
  'alignment',
  'sentence',
  'token',
  'lemma',
  'pos',
] as const;

export type WorkbenchMode = (typeof WORKBENCH_MODES)[number];
export type LinguisticMode = Exclude<WorkbenchMode, 'alignment'>;

export const LINGUISTIC_MODES: readonly LinguisticMode[] = [
  'sentence',
  'token',
  'lemma',
  'pos',
];

/** Single source of truth for the visible task-destination labels. */
export const WORKBENCH_MODE_LABELS: Record<WorkbenchMode, string> = {
  alignment: 'Alignment',
  sentence: 'Sentence',
  token: 'Token',
  lemma: 'Lemma',
  pos: 'POS',
};

/** Horizontal-tabs roving-focus keys (W3C ARIA Authoring Practices). */
export const TAB_NAVIGATION_KEYS = [
  'ArrowRight',
  'ArrowLeft',
  'Home',
  'End',
] as const;

export type TabNavigationKey = (typeof TAB_NAVIGATION_KEYS)[number];

export function isTabNavigationKey(key: string): key is TabNavigationKey {
  return (TAB_NAVIGATION_KEYS as readonly string[]).includes(key);
}

/**
 * M6-G2-F03: horizontal-tabs roving target. `enabledModes` are the
 * destinations that may currently receive the mode switch (disabled tabs are
 * excluded by the caller). Arrow keys wrap around; Home/End jump to the
 * first/last enabled destination. Returns null when nothing is enabled, so a
 * locked navigation can never be bypassed from the keyboard.
 */
export function nextWorkbenchTab(
  enabledModes: readonly WorkbenchMode[],
  current: WorkbenchMode,
  key: TabNavigationKey,
): WorkbenchMode | null {
  if (enabledModes.length === 0) {
    return null;
  }
  if (key === 'Home') {
    return enabledModes[0]!;
  }
  if (key === 'End') {
    return enabledModes[enabledModes.length - 1]!;
  }
  const index = enabledModes.indexOf(current);
  if (index === -1) {
    return enabledModes[0]!;
  }
  const step = key === 'ArrowRight' ? 1 : -1;
  return enabledModes[(index + step + enabledModes.length) % enabledModes.length]!;
}

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
