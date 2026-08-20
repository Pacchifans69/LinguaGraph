/**
 * SavedAlignments (M0.5): the MINIMAL read-only persisted alignment
 * representation (frozen contract section 21).
 *
 * Derived entirely from the normalized workspace snapshot — never from
 * optimistic client state. Each saved alignment shows its note (when
 * present) and its members as `language_tag — label: "exact_text"`.
 *
 * M0.5 deliberately does NOT own: editable Inspector, hover/active
 * visualization, connectors, note-edit UI, member-edit UI, or
 * delete-from-Inspector UI (all M0.6).
 */

import type { AlignmentGroup, AlignmentMember, TextVersion, WorkspaceSpan } from '../workspace/api';

export interface SavedAlignmentsProps {
  groups: AlignmentGroup[];
  membersByGroup: Record<string, AlignmentMember[]>;
  spansById: Record<string, WorkspaceSpan>;
  versionsById: Record<string, TextVersion>;
}

export function SavedAlignments({
  groups,
  membersByGroup,
  spansById,
  versionsById,
}: SavedAlignmentsProps) {
  if (groups.length === 0) {
    return (
      <section className="saved-alignments" aria-label="Saved alignments">
        <header className="saved-alignments-header">
          <h3>Saved alignments</h3>
        </header>
        <p className="saved-empty">No saved alignments yet.</p>
      </section>
    );
  }

  return (
    <section className="saved-alignments" aria-label="Saved alignments">
      <header className="saved-alignments-header">
        <h3>Saved alignments</h3>
      </header>
      <ul className="saved-alignment-list">
        {groups.map((group) => {
          const members = membersByGroup[group.id] ?? [];
          return (
            <li key={group.id} className="saved-alignment">
              <span className="saved-alignment-id">
                Alignment {group.id.slice(0, 8)}
              </span>
              {group.note !== null && group.note !== '' ? (
                <span className="saved-alignment-note">“{group.note}”</span>
              ) : null}
              <ul className="saved-alignment-members">
                {members.map((member) => {
                  const span = spansById[member.span_id];
                  const version = span
                    ? versionsById[span.text_version_id]
                    : undefined;
                  return (
                    <li key={member.id} className="saved-alignment-member">
                      {version
                        ? `${version.language_tag} — ${version.label}: `
                        : ''}
                      “{span?.exact_text ?? ''}”
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
