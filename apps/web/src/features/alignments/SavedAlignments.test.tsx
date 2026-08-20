/**
 * SavedAlignments tests (M0.5): the minimal READ-ONLY persisted alignment
 * representation derived entirely from the workspace snapshot (frozen
 * contract section 21). It renders groups with their note and member
 * language/label + server-derived exact_text — never optimistic client
 * state.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
