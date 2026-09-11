import { type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button } from '../../shared/ui/Button';
import type { TextVersion } from './api';
import {
  WORKBENCH_MODES,
  WORKBENCH_MODE_LABELS,
  isTabNavigationKey,
  nextWorkbenchTab,
  type EditorSessionStatus,
  type LinguisticMode,
  type WorkbenchMode,
  sessionKey,
} from './workbenchIa';

const MODE_LABELS = WORKBENCH_MODE_LABELS;

function statusLabel(status: EditorSessionStatus | undefined): string | null {
  if (status?.conflict) return 'Conflict';
  if (status?.pending) return 'Pending';
  if (status?.error) return 'Error';
  if (status?.dirty) return 'Unsaved';
  return null;
}

export function WorkbenchTaskNavigation({
  activeMode,
  activeTargetId,
  visibleVersions,
  versionsById,
  sessionStatuses,
  trayCount,
  canCreateAlignment,
  navigationLocked,
  onModeChange,
  onTargetChange,
}: {
  activeMode: WorkbenchMode;
  activeTargetId: string | null;
  visibleVersions: string[];
  versionsById: Record<string, TextVersion>;
  sessionStatuses: Record<string, EditorSessionStatus>;
  trayCount: number;
  canCreateAlignment: boolean;
  navigationLocked: boolean;
  onModeChange: (mode: WorkbenchMode) => void;
  onTargetChange: (versionId: string) => void;
}) {
  const activeStatus =
    activeMode === 'alignment' || activeTargetId === null
      ? undefined
      : sessionStatuses[sessionKey(activeTargetId, activeMode as LinguisticMode)];
  const activeStatusLabel = statusLabel(activeStatus);
  const noteworthySessions = Object.entries(sessionStatuses).filter(([, status]) => statusLabel(status) !== null);

  // M6-G2-F03: the next activated tab must receive visible focus synchronously
  // (all five destinations are always rendered, so the element already
  // exists). Resolved from the tablist itself — no extra ref plumbing.
  function focusTab(tablist: Element | null, mode: WorkbenchMode) {
    tablist?.querySelector<HTMLButtonElement>(`#workbench-tab-${mode}`)?.focus();
  }

  // A disabled destination never accepts a mode switch. The only current
  // disable source is the workspace navigation lock (session dialog or
  // workspace-owned destructive confirmation); every other destination is
  // enabled.
  const enabledModes: WorkbenchMode[] = navigationLocked ? [] : [...WORKBENCH_MODES];

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    mode: WorkbenchMode,
  ) {
    // Dialog/pending lock owns navigation: a locked tab deck never switches
    // mode from the keyboard (automatic activation included).
    if (!isTabNavigationKey(event.key)) {
      return;
    }
    const next = nextWorkbenchTab(enabledModes, mode, event.key);
    if (next === null) {
      return;
    }
    event.preventDefault();
    const tablist = event.currentTarget.closest('[role="tablist"]');
    // Recommended ARIA automatic activation: focus movement activates.
    onModeChange(next);
    focusTab(tablist, next);
  }

  function sessionName(key: string): string {
    if (key === 'alignment') return 'Alignment';
    if (key === 'import') return 'Add text version';
    const separator = key.lastIndexOf(':');
    const versionId = key.slice(0, separator);
    const mode = key.slice(separator + 1) as WorkbenchMode;
    return `${versionsById[versionId]?.label ?? versionId} · ${MODE_LABELS[mode] ?? mode}`;
  }

  return (
    <section className="workbench-navigation" aria-labelledby="workbench-tools-heading">
      <div className="workbench-navigation-heading">
        <div>
          <p className="section-kicker">Task deck</p>
          <h3 id="workbench-tools-heading">Workbench tools</h3>
        </div>
        {activeStatusLabel ? (
          <span className={`session-state session-state-${activeStatusLabel.toLowerCase()}`} role="status">
            {activeStatusLabel}
          </span>
        ) : null}
      </div>

      <div
        className="workbench-mode-tabs"
        role="tablist"
        aria-label="Workbench task"
        aria-orientation="horizontal"
      >
        {WORKBENCH_MODES.map((mode) => (
          <Button
            key={mode}
            id={`workbench-tab-${mode}`}
            type="button"
            variant={activeMode === mode ? 'primary' : 'quiet'}
            className="workbench-mode-tab"
            role="tab"
            aria-selected={activeMode === mode}
            aria-controls={`workbench-session-${mode}`}
            // Roving tabindex: only the active destination is in the tab
            // order; arrow keys move focus (and activate) within the deck.
            tabIndex={activeMode === mode ? 0 : -1}
            disabled={navigationLocked}
            onKeyDown={(event) => handleTabKeyDown(event, mode)}
            onClick={() => onModeChange(mode)}
          >
            {MODE_LABELS[mode]}
          </Button>
        ))}
      </div>

      {activeMode !== 'alignment' ? (
        <label className="workbench-target-picker">
          Active text version
          <select
            value={activeTargetId ?? ''}
            disabled={navigationLocked || visibleVersions.length === 0}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {visibleVersions.length === 0 ? (
              <option value="">No visible text versions</option>
            ) : null}
            {visibleVersions.map((id) => {
              const status = sessionStatuses[sessionKey(id, activeMode)];
              const suffix = statusLabel(status);
              return (
                <option key={id} value={id}>
                  {versionsById[id]?.label ?? id}{suffix ? ` — ${suffix}` : ''}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}

      <div className="compact-tray-status" aria-label="Pending alignment status">
        <span>
          {trayCount} pending selection{trayCount === 1 ? '' : 's'}
          {canCreateAlignment ? ' · ready to create' : ''}
        </span>
        {activeMode !== 'alignment' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={navigationLocked}
            onClick={() => onModeChange('alignment')}
          >
            Open Alignment
          </Button>
        ) : null}
      </div>

      {noteworthySessions.length > 0 ? (
        <ul className="session-summary-list" aria-label="Workbench session status">
          {noteworthySessions.map(([key, status]) => (
            <li key={key}>
              <span>{sessionName(key)}</span>
              <span>{statusLabel(status)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
