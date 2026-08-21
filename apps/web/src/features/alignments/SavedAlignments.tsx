/**
 * SavedAlignments (M0.5 + M0.6): the minimal read-only persisted alignment
 * representation (frozen contract section 21), derived entirely from the
 * normalized workspace snapshot — never from optimistic client state.
 *
 * Each saved alignment shows its note (when present) and its members as
 * `language_tag — label: "exact_text"`.
 *
 * M0.6 (Round 1): this list is ALSO the minimal keyboard-accessible
 * alignment activation/index surface (frozen contract section G): every
 * persisted AlignmentGroup gets a semantic activation path — an "Activate"
 * button (tab-focusable; Enter/Space activate natively). Activating sets the
 * workspace activeAlignmentId; hovering/focusing the row or button previews
 * the group via hoveredAlignmentId. The index remains derived from the
 * workspace snapshot — no second server-state source.
 *
 * M0.5/M0.6 deliberately do NOT own: editable Inspector, note-edit UI,
 * member-edit UI, delete-from-Inspector UI (all Round 2+).
 */

import type { AlignmentGroup, AlignmentMember, TextVersion, WorkspaceSpan } from '../workspace/api';

export interface SavedAlignmentsProps {
  groups: AlignmentGroup[];
  membersByGroup: Record<string, AlignmentMember[]>;
  spansById: Record<string, WorkspaceSpan>;
  versionsById: Record<string, TextVersion>;
  /** M0.6: activate a persisted alignment (sets activeAlignmentId). */
  onActivate?: (groupId: string) => void;
  /** M0.6: preview a persisted alignment (sets/clears hoveredAlignmentId). */
  onHover?: (groupId: string | null) => void;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function SavedAlignments({
  groups,
  membersByGroup,
  spansById,
  versionsById,
  onActivate,
  onHover,
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
            <li
              key={group.id}
              className="saved-alignment"
              onPointerEnter={() => onHover?.(group.id)}
              onPointerLeave={() => onHover?.(null)}
            >
              <span className="saved-alignment-id">
                Alignment {shortId(group.id)}
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
              {onActivate !== undefined ? (
                <button
                  type="button"
                  className="saved-alignment-activate"
                  aria-label={`Activate alignment ${shortId(group.id)}`}
                  onPointerEnter={() => onHover?.(group.id)}
                  onPointerLeave={() => onHover?.(null)}
                  onFocus={() => onHover?.(group.id)}
                  onBlur={() => onHover?.(null)}
                  onClick={() => onActivate(group.id)}
                >
                  Activate
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
