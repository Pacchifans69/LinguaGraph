import { Button } from '../../shared/ui/Button';
import type { TextVersion } from './api';
import {
  WORKBENCH_MODES,
  type EditorSessionStatus,
  type LinguisticMode,
  type WorkbenchMode,
  sessionKey,
} from './workbenchIa';

const MODE_LABELS: Record<WorkbenchMode, string> = {
  alignment: 'Alignment',
  sentence: 'Sentence',
  token: 'Token',
  lemma: 'Lemma',
  pos: 'POS',
};

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

      <div className="workbench-mode-tabs" role="tablist" aria-label="Workbench task">
        {WORKBENCH_MODES.map((mode) => (
          <Button
            key={mode}
            type="button"
            variant={activeMode === mode ? 'primary' : 'quiet'}
            className="workbench-mode-tab"
            role="tab"
            aria-selected={activeMode === mode}
            aria-controls={`workbench-session-${mode}`}
            disabled={navigationLocked}
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
