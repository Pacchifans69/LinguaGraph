/**
 * AlignmentTray (M0.4 + M0.5): the pending tray of staged selections
 * (ADR-007; spec section 24).
 *
 * - lists pending members with their TextVersion language tag, label and
 *   selected quote;
 * - supports explicit remove-one and clear-all;
 * - M0.5: the persistence-capable "Create Alignment" action. It is enabled
 *   only when the tray holds at least 2 members from at least 2 distinct
 *   TextVersions (frontend UX mirror of the backend invariants — the
 *   backend remains authoritative). The tray is cleared ONLY after the
 *   server mutation succeeds (WorkspacePage owns that lifecycle);
 * - Escape never clears the tray; removal is always explicit.
 */

import type { PendingSpan } from '../../shared/text/types';
import type { TextVersion } from './api';

export interface AlignmentTrayProps {
  members: PendingSpan[];
  versionsById: Record<string, TextVersion>;
  onRemove: (member: PendingSpan) => void;
  onClear: () => void;
  /** M0.5: true when >=2 members from >=2 distinct TextVersions are staged. */
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
        <button
          type="button"
          className="tray-create"
          disabled={!canCreate || isCreating}
          onClick={onCreate}
        >
          Create Alignment
        </button>
      </div>
      {members.length > 0 && !canCreate ? (
        <p className="tray-hint" role="status">
          Select at least two spans from two different text versions to
          create an alignment.
        </p>
      ) : null}
    </section>
  );
}
