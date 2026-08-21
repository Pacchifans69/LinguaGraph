/**
 * SavedAlignments tests (M0.5): the minimal READ-ONLY persisted alignment
 * representation derived entirely from the workspace snapshot (frozen
 * contract section 21). It renders groups with their note and member
 * language/label + server-derived exact_text — never optimistic client
 * state.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SavedAlignments } from './SavedAlignments';
import type { TextVersion, WorkspaceSpan } from '../workspace/api';

function version(overrides: Partial<TextVersion> = {}): TextVersion {
  return {
    id: 'tv-en',
    document_id: 'doc-1',
    language_tag: 'en',
    label: 'English',
    content: 'I look forward to seeing you tomorrow.',
    content_hash: 'abc',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function span(overrides: Partial<WorkspaceSpan> = {}): WorkspaceSpan {
  return {
    id: 'sp-1',
    text_version_id: 'tv-en',
    start_offset: 2,
    end_offset: 17,
    exact_text: 'look forward to',
    prefix: 'I ',
    suffix: ' seeing you tomorrow.',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SavedAlignments', () => {
  it('shows an empty state when the snapshot has no alignment groups', () => {
    render(
      <SavedAlignments
        groups={[]}
        membersByGroup={{}}
        spansById={{}}
        versionsById={{}}
      />,
    );
    expect(screen.getByText('No saved alignments yet.')).toBeInTheDocument();
  });

  it('renders persisted alignments with note and server-derived member text', () => {
    const versionsById = {
      'tv-en': version(),
      'tv-de': version({
        id: 'tv-de',
        language_tag: 'de',
        label: 'German',
        content_hash: 'h-de',
      }),
    };
    const spansById = {
      'sp-1': span(),
      'sp-2': span({
        id: 'sp-2',
        text_version_id: 'tv-de',
        start_offset: 4,
        end_offset: 22,
        exact_text: 'freue mich darauf,',
      }),
    };
    render(
      <SavedAlignments
        groups={[
          {
            id: 'al-1',
            document_id: 'doc-1',
            note: 'phrase level',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]}
        membersByGroup={{
          'al-1': [
            { id: 'am-1', alignment_group_id: 'al-1', span_id: 'sp-1', created_at: 'x' },
            { id: 'am-2', alignment_group_id: 'al-1', span_id: 'sp-2', created_at: 'x' },
          ],
        }}
        spansById={spansById}
        versionsById={versionsById}
      />,
    );

    expect(screen.getByText('Alignment al-1')).toBeInTheDocument();
    expect(screen.getByText('“phrase level”')).toBeInTheDocument();
    expect(screen.getByText(/en — English: “look forward to”/)).toBeInTheDocument();
    expect(
      screen.getByText(/de — German: “freue mich darauf,”/),
    ).toBeInTheDocument();
  });

  it('omits the note line when the group has no note', () => {
    render(
      <SavedAlignments
        groups={[
          {
            id: 'al-1',
            document_id: 'doc-1',
            note: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]}
        membersByGroup={{
          'al-1': [{ id: 'am-1', alignment_group_id: 'al-1', span_id: 'sp-1', created_at: 'x' }],
        }}
        spansById={{ 'sp-1': span() }}
        versionsById={{ 'tv-en': version() }}
      />,
    );
    // No note element at all; the member quote is still rendered.
    expect(document.querySelector('.saved-alignment-note')).toBeNull();
    expect(screen.getByText(/en — English: “look forward to”/)).toBeInTheDocument();
  });
});

describe('SavedAlignments (M0.6 keyboard-accessible activation index)', () => {
  const groups = [
    {
      id: 'group-aa111',
      document_id: 'doc-1',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'group-bb222',
      document_id: 'doc-1',
      note: 'second',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  const membersByGroup = {
    'group-aa111': [
      { id: 'am-1', alignment_group_id: 'group-aa111', span_id: 'sp-1', created_at: 'x' },
    ],
    'group-bb222': [
      { id: 'am-2', alignment_group_id: 'group-bb222', span_id: 'sp-1', created_at: 'x' },
    ],
  };

  function renderIndex() {
    const onActivate = vi.fn();
    const onHover = vi.fn();
    render(
      <SavedAlignments
        groups={groups}
        membersByGroup={membersByGroup}
        spansById={{ 'sp-1': span() }}
        versionsById={{ 'tv-en': version() }}
        onActivate={onActivate}
        onHover={onHover}
      />,
    );
    return { onActivate, onHover };
  }

  it('gives every persisted group a semantic keyboard activation path', () => {
    renderIndex();
    const activateButtons = screen.getAllByRole('button', {
      name: /Activate alignment group-/,
    });
    // One activation surface per persisted group (the index stays derived
    // from the workspace snapshot — no second server-state source).
    expect(activateButtons).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Activate alignment group-aa' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Activate alignment group-bb' }),
    ).toBeInTheDocument();
  });

  it('activating a group calls onActivate with the concrete group id', () => {
    const { onActivate } = renderIndex();
    screen.getByRole('button', { name: 'Activate alignment group-bb' }).click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('group-bb222');
  });

  it('hovering/focusing a saved alignment previews its group via onHover', () => {
    const { onHover } = renderIndex();
    const row = document.querySelector('.saved-alignment');
    expect(row).not.toBeNull();
    fireEvent.pointerEnter(row as HTMLElement);
    expect(onHover).toHaveBeenLastCalledWith('group-aa111');
    fireEvent.pointerLeave(row as HTMLElement);
    expect(onHover).toHaveBeenLastCalledWith(null);

    // Focusing the activation button also previews (keyboard path).
    const button = screen.getByRole('button', {
      name: 'Activate alignment group-bb',
    });
    fireEvent.focus(button);
    expect(onHover).toHaveBeenLastCalledWith('group-bb222');
    fireEvent.blur(button);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('keeps M0.5 read-only rendering when no callbacks are wired', () => {
    render(
      <SavedAlignments
        groups={groups}
        membersByGroup={membersByGroup}
        spansById={{ 'sp-1': span() }}
        versionsById={{ 'tv-en': version() }}
      />,
    );
    expect(screen.getByText('Alignment group-aa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activate alignment/ })).toBeNull();
  });
});
