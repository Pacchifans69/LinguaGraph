/**
 * AlignmentTray (M0.4): the pending-only tray of staged selections
 * (ADR-007; spec section 24).
 *
 * - lists pending members with their TextVersion language tag, label and
 *   selected quote;
 * - supports explicit remove-one and clear-all;
 * - shows that the tray is CLIENT STATE ONLY: nothing is persisted, and
 *   there is deliberately NO persistence-capable "Create Alignment" action
 *   (that belongs to M0.5);
 * - Escape never clears the tray; removal is always explicit.
 */

import type { PendingSpan } from '../../shared/text/types';
import type { TextVersion } from './api';

export interface AlignmentTrayProps {
  members: PendingSpan[];
  versionsById: Record<string, TextVersion>;
  onRemove: (member: PendingSpan) => void;
  onClear: () => void;
}

export function AlignmentTray({
  members,
  versionsById,
  onRemove,
  onClear,
}: AlignmentTrayProps) {
  return (
    <section className="alignment-tray" aria-label="Alignment tray">
      <header className="alignment-tray-header">
        <h3>Alignment tray</h3>
        <p className="tray-note">
          Pending selections are kept in the browser only — nothing has been
          saved.
        </p>
      </header>
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
                <button
                  type="button"
                  className="tray-remove"
                  aria-label={`Remove “${member.quote}” from tray`}
                  onClick={() => onRemove(member)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="tray-actions">
        <button
          type="button"
          className="tray-clear"
          disabled={members.length === 0}
          onClick={onClear}
        >
          Clear tray
        </button>
      </div>
    </section>
  );
}
