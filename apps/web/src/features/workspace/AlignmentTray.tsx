/** Pending client-side Alignment Tray (ADR-007). */

import type { PendingSpan } from '../../shared/text/types';
import type { TextVersion } from './api';
import { Button } from '../../shared/ui/Button';
import { Toolbar } from '../../shared/ui/Toolbar';

export interface AlignmentTrayProps {
  members: PendingSpan[];
  versionsById: Record<string, TextVersion>;
  onRemove: (member: PendingSpan) => void;
  onClear: () => void;
  canCreate: boolean;
  onCreate: () => void;
  isCreating: boolean;
}

export function AlignmentTray({
  members,
  versionsById,
  onRemove,
  onClear,
  canCreate,
  onCreate,
  isCreating,
}: AlignmentTrayProps) {
  return (
    <section className="alignment-tray workbench-surface" aria-label="Alignment tray">
      <header className="alignment-tray-header workbench-surface-header">
        <div>
          <p className="section-kicker">Pending alignment</p>
          <h3>Alignment tray</h3>
        </div>
        <span className="count-badge" aria-label={`${members.length} pending selections`}>
          {members.length}
        </span>
      </header>
      <p className="tray-note">
        Stage selections here before creating a persisted alignment. Pending
        selections are browser only until creation succeeds.
      </p>

      {members.length === 0 ? (
        <p className="tray-empty">No pending selections.</p>
      ) : (
        <ul className="tray-list">
          {members.map((member) => {
            const version = versionsById[member.textVersionId];
            const label = version
              ? `${version.language_tag} — ${version.label}`
              : member.textVersionId;
            return (
              <li
                key={`${member.textVersionId}:${member.start}:${member.end}`}
                className="tray-member"
              >
                <span className="tray-member-label">{label}</span>
                <span className="tray-member-quote">“{member.quote}”</span>
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  className="tray-remove"
                  aria-label={`Remove “${member.quote}” from tray`}
                  disabled={isCreating}
                  onClick={() => onRemove(member)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Toolbar label="Alignment tray actions" className="tray-actions" density="compact">
        <Button
          type="button"
          variant="secondary"
          className="tray-clear"
          disabled={members.length === 0 || isCreating}
          onClick={onClear}
        >
          Clear tray
        </Button>
        <Button
          type="button"
          variant="primary"
          className="tray-create"
          aria-label="Create Alignment"
          disabled={!canCreate}
          isPending={isCreating}
          onClick={onCreate}
        >
          <span>{isCreating ? 'Creating…' : 'Create Alignment'}</span>
          <kbd className="shortcut-hint" aria-hidden="true">Ctrl/⌘+Enter</kbd>
        </Button>
      </Toolbar>

      {members.length > 0 && !canCreate ? (
        <p className="tray-hint" role="status">
          Select at least two spans from two different text versions to create
          an alignment.
        </p>
      ) : null}
    </section>
  );
}
