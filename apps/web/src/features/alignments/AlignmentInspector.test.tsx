/**
 * AlignmentInspector tests (M0.6 Round 2).
 *
 * Covers: rendering from the current normalized workspace snapshot; note
 * editing (draft init, unchanged-disabled, exact PATCH bodies incl.
 * { note: null }, no trimming, 4000-char boundary, success/error behavior,
 * draft reconciliation); member removal (full-replacement coordinate-only
 * PATCH, preflight, confirmation, success/error); delete alignment
 * (confirmation, correct id, success/error); the mutation freeze; and
 * snapshot reconciliation (updated note/members, disappearing group).
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlignmentInspector, NOTE_MAX_LENGTH } from './AlignmentInspector';
import type {
  AlignmentGroup,
  AlignmentMember,
  TextVersion,
  WorkspaceSpan,
} from '../workspace/api';
import { WorkspaceProvider } from '../workspace/state/WorkspaceProvider';
import { useWorkspaceState } from '../workspace/state/workspaceContext';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json, type MockResponse } from '../../test/mockFetch';

// --- fixtures --------------------------------------------------------------

function version(id: string, tag: string, label: string): TextVersion {
  return {
    id,
    document_id: 'doc-1',
    language_tag: tag,
    label,
    content: 'content',
    content_hash: `h-${id}`,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function span(
  id: string,
  versionId: string,
  start: number,
  end: number,
  exactText: string,
): WorkspaceSpan {
  return {
    id,
    text_version_id: versionId,
    start_offset: start,
    end_offset: end,
    exact_text: exactText,
    prefix: '',
    suffix: '',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function member(id: string, spanId: string): AlignmentMember {
  return {
    id,
    alignment_group_id: 'g1',
    span_id: spanId,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function group(note: string | null = 'existing note'): AlignmentGroup {
  return {
    id: 'g1',
    document_id: 'doc-1',
    note,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

interface InspectorData {
  groupsById: Record<string, AlignmentGroup>;
  membersByGroup: Record<string, AlignmentMember[]>;
  spansById: Record<string, WorkspaceSpan>;
  versionsById: Record<string, TextVersion>;
}

function threeLanguageData(overrides: Partial<InspectorData> = {}): InspectorData {
  return {
    groupsById: { g1: group() },
    membersByGroup: {
      g1: [
        member('am-en', 'sp-en'),
        member('am-de', 'sp-de'),
        member('am-fr', 'sp-fr'),
      ],
    },
    spansById: {
      'sp-en': span('sp-en', 'tv-en', 2, 17, 'look forward to'),
      'sp-de': span('sp-de', 'tv-de', 4, 21, 'freue mich darauf'),
      'sp-fr': span('sp-fr', 'tv-fr', 2, 12, 'ai hâte de'),
    },
    versionsById: {
      'tv-en': version('tv-en', 'en', 'English'),
      'tv-de': version('tv-de', 'de', 'German'),
      'tv-fr': version('tv-fr', 'fr', 'French'),
    },
    ...overrides,
  };
}

/** Wait for a deferred promise; resolve it from the test to settle a request. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// --- harness ---------------------------------------------------------------

function InspectorHarness({
  data = threeLanguageData(),
  onClose,
}: {
  data?: InspectorData;
  onClose?: () => void;
}) {
  const { activeAlignmentId, setActiveAlignment } = useWorkspaceState();
  return (
    <div>
      <button type="button" onClick={() => setActiveAlignment('g1')}>
        activate g1
      </button>
      <span data-testid="active">{activeAlignmentId ?? '(null)'}</span>
      <AlignmentInspector
        documentId="doc-1"
        activeAlignmentId={activeAlignmentId}
        groupsById={data.groupsById}
        membersByGroup={data.membersByGroup}
        spansById={data.spansById}
        versionsById={data.versionsById}
        onClose={onClose ?? (() => setActiveAlignment(null))}
      />
    </div>
  );
}

function renderInspector(
  data: InspectorData = threeLanguageData(),
  groupIds: string[] = ['g1'],
) {
  const view = renderWithProviders(
    <WorkspaceProvider
      documentId="doc-1"
      serverVersions={[
        { id: 'tv-en', contentHash: 'h-tv-en' },
        { id: 'tv-de', contentHash: 'h-tv-de' },
        { id: 'tv-fr', contentHash: 'h-tv-fr' },
      ]}
      serverAlignmentGroupIds={groupIds}
    >
      <InspectorHarness data={data} />
    </WorkspaceProvider>,
  );
  return view;
}

function noteTextarea(): HTMLTextAreaElement {
  const textarea = screen.getByLabelText(/Note/) as HTMLTextAreaElement;
  return textarea;
}

/** Raw text of every .inspector-member row (language/label/quote/offsets). */
function memberRowTexts(inspector: HTMLElement): string[] {
  return Array.from(inspector.querySelectorAll('.inspector-member')).map(
    (element) => element.textContent ?? '',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('AlignmentInspector rendering', () => {
  it('is absent when no alignment is active', () => {
    renderInspector();
    expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull();
  });

  it('renders the active group from the CURRENT workspace snapshot', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    const inspector = screen.getByRole('region', {
      name: 'Alignment inspector',
    });
    expect(inspector).toBeInTheDocument();
    expect(within(inspector).getByText(/Alignment g1/)).toBeInTheDocument();
    // Note from the snapshot.
    expect(noteTextarea()).toHaveValue('existing note');
    // Members with language/label/quote/offsets (not just opaque UUIDs).
    const rows = memberRowTexts(inspector);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('en');
    expect(rows[0]).toContain('English');
    expect(rows[0]).toContain('look forward to');
    expect(rows[0]).toContain('[2, 17)');
    expect(rows[1]).toContain('de');
    expect(rows[1]).toContain('German');
    expect(rows[1]).toContain('freue mich darauf');
    expect(rows[1]).toContain('[4, 21)');
    expect(rows[2]).toContain('fr');
    expect(rows[2]).toContain('French');
    expect(rows[2]).toContain('ai hâte de');
    expect(rows[2]).toContain('[2, 12)');
  });

  it('Close clears the active alignment when idle (no toggle-off elsewhere)', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    expect(screen.getByRole('region', { name: 'Alignment inspector' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.getByTestId('active')).toHaveTextContent('(null)');
    expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull();
  });

  it('reconciles: updated note/members render after a refetch of the same group', () => {
    const view = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    const updated = threeLanguageData({
      groupsById: { g1: group('updated note') },
      membersByGroup: { g1: [member('am-en', 'sp-en'), member('am-de', 'sp-de')] },
    });
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-tv-en' },
          { id: 'tv-de', contentHash: 'h-tv-de' },
          { id: 'tv-fr', contentHash: 'h-tv-fr' },
        ]}
        serverAlignmentGroupIds={['g1']}
      >
        <InspectorHarness data={updated} />
      </WorkspaceProvider>,
    );
    const inspector = screen.getByRole('region', {
      name: 'Alignment inspector',
    });
    // The authoritative note is adopted (no unsaved edit).
    expect(noteTextarea()).toHaveValue('updated note');
    expect(within(inspector).getByText(/Members \(2\)/)).toBeInTheDocument();
    expect(
      within(inspector).queryByText(/ai hâte de/),
    ).not.toBeInTheDocument();
  });

  it('closes when the group disappears from the snapshot (active reconciled)', () => {
    const view = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    expect(screen.getByRole('region', { name: 'Alignment inspector' })).toBeInTheDocument();
    // Refetch without the group: the provider reconciles activeAlignmentId.
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-tv-en' },
          { id: 'tv-de', contentHash: 'h-tv-de' },
          { id: 'tv-fr', contentHash: 'h-tv-fr' },
        ]}
        serverAlignmentGroupIds={[]}
      >
        <InspectorHarness data={threeLanguageData({ groupsById: {} })} />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId('active')).toHaveTextContent('(null)');
    expect(screen.queryByRole('region', { name: 'Alignment inspector' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Note editing
// ---------------------------------------------------------------------------

describe('AlignmentInspector note editing', () => {
  it('initializes the draft from the server note and disables Save when unchanged', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    expect(noteTextarea()).toHaveValue('existing note');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
  });

  it('PATCHes the exact non-empty string when the draft changes (no trimming)', async () => {
    let patchedBody: unknown = null;
    installFetchMock([
      [
        '/alignments/',
        (_url, init) => {
          patchedBody = JSON.parse(String(init?.body));
          return json(200, { id: 'g1', document_id: 'doc-1', note: '  spaced  ', created_at: 'x', updated_at: 'x', members: [] });
        },
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: '  spaced  ' } });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody).toEqual({ note: '  spaced  ' });
  });

  it('clears the note with an explicit { note: null }', async () => {
    let patchedBody: unknown = null;
    installFetchMock([
      [
        '/alignments/',
        (_url, init) => {
          patchedBody = JSON.parse(String(init?.body));
          return json(200, { id: 'g1', document_id: 'doc-1', note: null, created_at: 'x', updated_at: 'x', members: [] });
        },
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody).toEqual({ note: null });
  });

  it('enforces the 4000-character boundary', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    expect(noteTextarea()).toHaveAttribute('maxlength', String(NOTE_MAX_LENGTH));

    fireEvent.change(noteTextarea(), { target: { value: 'x'.repeat(NOTE_MAX_LENGTH) } });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();

    // A programmatically set over-long value must disable Save and report.
    fireEvent.change(noteTextarea(), {
      target: { value: 'x'.repeat(NOTE_MAX_LENGTH + 1) },
    });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds 4000/);
  });

  it('keeps the draft and Inspector open on PATCH failure, and allows retry', async () => {
    let fail = true;
    installFetchMock([
      [
        '/alignments/',
        () =>
          fail
            ? json(422, {
                code: 'VALIDATION_ERROR',
                message: 'note too long',
                details: {},
              })
            : json(200, { id: 'g1', document_id: 'doc-1', note: 'ok', created_at: 'x', updated_at: 'x', members: [] }),
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'my draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/VALIDATION_ERROR/),
    );
    // Inspector stays open, draft preserved, Save re-enabled after settle.
    expect(screen.getByRole('region', { name: 'Alignment inspector' })).toBeInTheDocument();
    expect(noteTextarea()).toHaveValue('my draft');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();

    // Retry succeeds.
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('adopts the server note after a successful save (draft synced, Save disabled)', async () => {
    installFetchMock([
      [
        '/alignments/',
        () =>
          json(200, { id: 'g1', document_id: 'doc-1', note: 'saved note', created_at: 'x', updated_at: 'x', members: [] }),
      ],
    ]);
    const view = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'saved note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled());

    // The refetch brings the authoritative note: the draft synchronizes and
    // the unchanged state disables Save again.
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-tv-en' },
          { id: 'tv-de', contentHash: 'h-tv-de' },
          { id: 'tv-fr', contentHash: 'h-tv-fr' },
        ]}
        serverAlignmentGroupIds={['g1']}
      >
        <InspectorHarness data={threeLanguageData({ groupsById: { g1: group('saved note') } })} />
      </WorkspaceProvider>,
    );
    expect(noteTextarea()).toHaveValue('saved note');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
  });

  it('does not overwrite an unsaved user edit when a refetch changes the note', () => {
    const view = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'my unsaved edit' } });
    view.rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-tv-en' },
          { id: 'tv-de', contentHash: 'h-tv-de' },
          { id: 'tv-fr', contentHash: 'h-tv-fr' },
        ]}
        serverAlignmentGroupIds={['g1']}
      >
        <InspectorHarness
          data={threeLanguageData({ groupsById: { g1: group('server changed') } })}
        />
      </WorkspaceProvider>,
    );
    expect(noteTextarea()).toHaveValue('my unsaved edit');
  });
});

// ---------------------------------------------------------------------------
// Member removal
// ---------------------------------------------------------------------------

describe('AlignmentInspector member removal', () => {
  it('PATCHes the FULL replacement set with coordinate-only fields', async () => {
    let patchedBody: unknown = null;
    let patchedUrl = '';
    installFetchMock([
      [
        '/alignments/',
        (url, init) => {
          patchedUrl = url;
          patchedBody = JSON.parse(String(init?.body));
          return json(200, { id: 'g1', document_id: 'doc-1', note: null, created_at: 'x', updated_at: 'x', members: [] });
        },
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove member “ai hâte de”' }),
    );
    // Explicit confirmation is required.
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Remove this member\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm remove' }));

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedUrl).toContain('/api/v1/alignments/g1');
    expect(patchedBody).toEqual({
      members: [
        { text_version_id: 'tv-en', start: 2, end: 17 },
        { text_version_id: 'tv-de', start: 4, end: 21 },
      ],
    });
    // No extra fields anywhere in the payload.
    const serialized = JSON.stringify(patchedBody);
    for (const forbidden of ['exact_text', 'quote', 'prefix', 'suffix', 'contentHash', 'direction']) {
      expect(serialized).not.toContain(forbidden);
    }
    // Note is omitted: PATCH omission means unchanged.
    expect(serialized).not.toContain('"note"');
  });

  it('cancelling the confirmation sends no request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove member “ai hâte de”' }),
    );
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables removal when fewer than 2 members would remain', () => {
    const data = threeLanguageData({
      membersByGroup: { g1: [member('am-en', 'sp-en'), member('am-de', 'sp-de')] },
    });
    renderInspector(data);
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    const removeEn = screen.getByRole('button', { name: 'Remove member “look forward to”' });
    expect(removeEn).toBeDisabled();
    // Both members are non-removable (each removal would leave one member).
    expect(screen.getAllByText(/at least 2 members/)).toHaveLength(2);
  });

  it('disables removal when fewer than 2 distinct TextVersions would remain', () => {
    const data = threeLanguageData({
      membersByGroup: {
        g1: [
          member('am-1', 'sp-en'),
          member('am-2', 'sp-en-2'),
          member('am-3', 'sp-en-3'),
        ],
      },
      spansById: {
        'sp-en': span('sp-en', 'tv-en', 2, 17, 'look forward to'),
        'sp-en-2': span('sp-en-2', 'tv-en', 18, 28, 'seeing you'),
        'sp-en-3': span('sp-en-3', 'tv-en', 30, 35, 'tomorrow'),
      },
      versionsById: { 'tv-en': version('tv-en', 'en', 'English') },
    });
    renderInspector(data);
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    const remove = screen.getByRole('button', { name: 'Remove member “look forward to”' });
    expect(remove).toBeDisabled();
    // All three members are non-removable (each removal would leave one
    // distinct TextVersion).
    expect(screen.getAllByText(/at least 2 text versions/)).toHaveLength(3);
  });

  it('keeps the authoritative membership visible when removal fails', async () => {
    installFetchMock([
      [
        '/alignments/',
        () =>
          json(422, {
            code: 'INSUFFICIENT_ALIGNMENT_MEMBERS',
            message: 'an alignment group requires at least 2 members',
            details: {},
          }),
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove member “ai hâte de”' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/INSUFFICIENT_ALIGNMENT_MEMBERS/),
    );
    // Inspector stays open with ALL three authoritative members still listed.
    const inspector = screen.getByRole('region', { name: 'Alignment inspector' });
    expect(within(inspector).getByText(/Members \(3\)/)).toBeInTheDocument();
    expect(within(inspector).getByText(/ai hâte de/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete alignment
// ---------------------------------------------------------------------------

describe('AlignmentInspector delete alignment', () => {
  it('requires explicit confirmation before deleting the correct id', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    installFetchMock([
      [
        '/alignments/',
        (url, init) => {
          calls.push({ url, method: init?.method });
          return json(204, undefined);
        },
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    // First click only arms the confirmation.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    expect(calls).toHaveLength(0);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Delete this alignment\?/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toContain('/api/v1/alignments/g1');
  });

  it('cancelling the delete confirmation sends no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains the Inspector and active group when DELETE fails', async () => {
    installFetchMock([
      [
        '/alignments/',
        () =>
          json(404, {
            code: 'NOT_FOUND',
            message: 'alignment group not found',
            details: {},
          }),
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/NOT_FOUND/),
    );
    // The confirmation closed on settle, but the Inspector and active group
    // remain (nothing was deleted) and retry is possible.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Alignment inspector' })).toBeInTheDocument();
    expect(screen.getByTestId('active')).toHaveTextContent('g1');
    expect(screen.getByRole('button', { name: 'Delete Alignment' })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Mutation freeze
// ---------------------------------------------------------------------------

describe('AlignmentInspector mutation freeze', () => {
  it('disables every Inspector control while a mutation is pending and re-enables after settle', async () => {
    const d = deferred<MockResponse>();
    installFetchMock([
      [
        '/alignments/',
        () => d.promise,
      ],
    ]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'new note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    // While pending: Save / Remove / Delete / Close all disabled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Remove member “look forward to”' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Alignment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close inspector' })).toBeDisabled();

    // Settle: everything re-enabled; the draft is preserved.
    await waitFor(() => {
      d.resolve({ status: 200, body: { id: 'g1', document_id: 'doc-1', note: 'new note', created_at: 'x', updated_at: 'x', members: [] } });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled(),
    );
    expect(noteTextarea()).toHaveValue('new note');
  });

  it('cannot arm a second confirmation while a mutation is pending', async () => {
    const d = deferred<MockResponse>();
    installFetchMock([['/alignments/', () => d.promise]]);
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'new note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled(),
    );

    // Remove/Delete buttons are disabled, so no confirmation can arm.
    fireEvent.click(screen.getByRole('button', { name: 'Remove member “ai hâte de”' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    d.resolve({ status: 200, body: { id: 'g1', document_id: 'doc-1', note: 'new note', created_at: 'x', updated_at: 'x', members: [] } });
  });
});

// ---------------------------------------------------------------------------
// R2 fix-round regressions
// ---------------------------------------------------------------------------

import { useWorkspace, type WorkspaceSnapshot } from '../workspace/api';

function workspaceSnapshot(): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1',
      project_id: 'p',
      title: 'D',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: [
      version('tv-en', 'en', 'English'),
      version('tv-de', 'de', 'German'),
      version('tv-fr', 'fr', 'French'),
    ],
    spans: [
      span('sp-en', 'tv-en', 2, 17, 'look forward to'),
      span('sp-de', 'tv-de', 4, 21, 'freue mich darauf'),
      span('sp-fr', 'tv-fr', 2, 12, 'ai hâte de'),
    ],
    alignment_groups: [group()],
    alignment_members: [
      member('am-en', 'sp-en'),
      member('am-de', 'sp-de'),
      member('am-fr', 'sp-fr'),
    ],
  };
}

/**
 * Harness with a LIVE workspace observer (so invalidation triggers a real
 * refetch) plus Inspector, and buttons to activate g1/g2.
 */
function LiveInspectorHarness({
  data,
  extraGroupIds = [],
}: {
  data?: InspectorData;
  extraGroupIds?: string[];
}) {
  useWorkspace('doc-1');
  const { activeAlignmentId, setActiveAlignment } = useWorkspaceState();
  return (
    <div>
      <span data-testid="ws-fetches">live</span>
      <button type="button" onClick={() => setActiveAlignment('g1')}>
        activate g1
      </button>
      {extraGroupIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveAlignment(id)}
        >
          activate {id}
        </button>
      ))}
      <span data-testid="active">{activeAlignmentId ?? '(null)'}</span>
      <AlignmentInspector
        documentId="doc-1"
        activeAlignmentId={activeAlignmentId}
        groupsById={data?.groupsById ?? {}}
        membersByGroup={data?.membersByGroup ?? {}}
        spansById={data?.spansById ?? {}}
        versionsById={data?.versionsById ?? {}}
        onClose={() => setActiveAlignment(null)}
      />
    </div>
  );
}

function renderLiveInspector(data: InspectorData = threeLanguageData()) {
  return renderWithProviders(
    <WorkspaceProvider
      documentId="doc-1"
      serverVersions={[
        { id: 'tv-en', contentHash: 'h-tv-en' },
        { id: 'tv-de', contentHash: 'h-tv-de' },
        { id: 'tv-fr', contentHash: 'h-tv-fr' },
      ]}
      serverAlignmentGroupIds={['g1']}
    >
      <LiveInspectorHarness data={data} />
    </WorkspaceProvider>,
  );
}

describe('mutation freeze spans the authoritative refetch (R2-F01)', () => {
  it('keeps Inspector controls disabled until the refetch resolves (note save)', async () => {
    let workspaceCalls = 0;
    let resolveRefetch!: (v: MockResponse) => void;
    const refetchPromise = new Promise<MockResponse>((resolve) => {
      resolveRefetch = resolve;
    });
    let patched = false;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceCalls += 1;
          if (workspaceCalls === 1) {
            return json(200, workspaceSnapshot());
          }
          return refetchPromise;
        },
      ],
      [
        '/alignments/',
        () => {
          patched = true;
          return json(200, {
            id: 'g1',
            document_id: 'doc-1',
            note: 'new note',
            created_at: 'x',
            updated_at: 'x',
            members: [],
          });
        },
      ],
    ]);
    renderLiveInspector();
    await waitFor(() => expect(workspaceCalls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.change(noteTextarea(), { target: { value: 'new note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    // The HTTP PATCH has already succeeded, but the authoritative workspace
    // refetch is still unresolved: the freeze MUST stay active.
    await waitFor(() => expect(patched).toBe(true));
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove member “look forward to”' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Alignment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close inspector' })).toBeDisabled();

    // Only after the refetch resolves does the freeze clear.
    await waitFor(() => {
      resolveRefetch({ status: 200, body: workspaceSnapshot() });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled(),
    );
  });

  it('blocks a second full-replacement mutation until the first membership refresh lands (member removal)', async () => {
    let workspaceCalls = 0;
    let resolveRefetch!: (v: MockResponse) => void;
    const refetchPromise = new Promise<MockResponse>((resolve) => {
      resolveRefetch = resolve;
    });
    let patches = 0;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceCalls += 1;
          if (workspaceCalls === 1) {
            return json(200, workspaceSnapshot());
          }
          return refetchPromise;
        },
      ],
      [
        '/alignments/',
        () => {
          patches += 1;
          return json(200, {
            id: 'g1',
            document_id: 'doc-1',
            note: null,
            created_at: 'x',
            updated_at: 'x',
            members: [],
          });
        },
      ],
    ]);
    renderLiveInspector();
    await waitFor(() => expect(workspaceCalls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove member “ai hâte de”' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    // First removal PATCH succeeded; refetch still unresolved.
    await waitFor(() => expect(patches).toBe(1));
    // A second stale full-replacement mutation cannot be started: every
    // Remove control is disabled until the authoritative membership refresh.
    expect(
      screen.getByRole('button', { name: 'Remove member “look forward to”' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove member “freue mich darauf”' }),
    ).toBeDisabled();

    await waitFor(() => {
      resolveRefetch({ status: 200, body: workspaceSnapshot() });
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove member “look forward to”' }),
      ).toBeEnabled(),
    );
    // Still exactly one PATCH: no stale replacement was ever started.
    expect(patches).toBe(1);
  });
});

describe('confirmations bind to their targets (R2-F02)', () => {
  function twoGroupData(): InspectorData {
    const base = threeLanguageData();
    return {
      ...base,
      groupsById: {
        g1: group(),
        g2: { ...group(), id: 'g2' },
      },
      membersByGroup: {
        g1: base.membersByGroup.g1,
        g2: [member('am-en2', 'sp-en'), member('am-de2', 'sp-de')],
      },
    };
  }

  function renderTwoGroups() {
    return renderWithProviders(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[
          { id: 'tv-en', contentHash: 'h-tv-en' },
          { id: 'tv-de', contentHash: 'h-tv-de' },
          { id: 'tv-fr', contentHash: 'h-tv-fr' },
        ]}
        serverAlignmentGroupIds={['g1', 'g2']}
      >
        <LiveInspectorHarness data={twoGroupData()} extraGroupIds={['g2']} />
      </WorkspaceProvider>,
    );
  }

  it('a G1 delete confirmation closes on switching to G2, cannot delete G2, and does not resurrect', async () => {
    const deleteCalls: string[] = [];
    installFetchMock([
      ['/workspace', () => json(200, workspaceSnapshot())],
      [
        '/alignments/',
        (url, init) => {
          deleteCalls.push(`${init?.method} ${url}`);
          return json(204, undefined);
        },
      ],
    ]);
    renderTwoGroups();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    // Arm the delete confirmation for G1.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Switch the active alignment to G2: the G1 confirmation closes and
    // must not silently retarget to G2.
    fireEvent.click(screen.getByRole('button', { name: 'activate g2' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // A fresh confirmation on G2 deletes ONLY G2.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(deleteCalls).toHaveLength(1));
    expect(deleteCalls[0]).toBe('DELETE /api/v1/alignments/g2');

    // Switch back to G1: the old G1 confirmation must NOT resurrect.
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a member-removal confirmation does not resurrect after switching away and back', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderTwoGroups();
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove member “ai hâte de”' }),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'activate g2' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    // The old member confirmation does not resurrect.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('latest mutation error authority (R2-F03)', () => {
  function renderErrorHarness(
    handlers: Array<
      [string, (url: string, init?: RequestInit) => Promise<MockResponse>]
    >,
  ) {
    installFetchMock([
      ['/workspace', () => json(200, workspaceSnapshot())],
      ...handlers,
    ]);
    const view = renderLiveInspector();
    return view;
  }

  const patchError = () =>
    json(422, { code: 'PATCH_BROKEN', message: 'patch failed', details: {} });
  const deleteError = () =>
    json(500, { code: 'DELETE_BROKEN', message: 'delete failed', details: {} });
  const patchOk = () =>
    json(200, { id: 'g1', document_id: 'doc-1', note: 'ok', created_at: 'x', updated_at: 'x', members: [] });

  it('PATCH failure then DELETE failure shows the DELETE error (latest wins)', async () => {
    renderErrorHarness([
      ['/alignments/', (_url, init) => (init?.method === 'DELETE' ? deleteError() : patchError())],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    fireEvent.change(noteTextarea(), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/PATCH_BROKEN/),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/DELETE_BROKEN/),
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/PATCH_BROKEN/);
  });

  it('DELETE failure then PATCH failure shows the PATCH error (latest wins)', async () => {
    renderErrorHarness([
      ['/alignments/', (_url, init) => (init?.method === 'DELETE' ? deleteError() : patchError())],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/DELETE_BROKEN/),
    );

    fireEvent.change(noteTextarea(), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/PATCH_BROKEN/),
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/DELETE_BROKEN/);
  });

  it('a successful PATCH clears a stale DELETE error', async () => {
    renderErrorHarness([
      ['/alignments/', (_url, init) => (init?.method === 'DELETE' ? deleteError() : patchOk())],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'activate g1' }));
    await screen.findByRole('region', { name: 'Alignment inspector' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/DELETE_BROKEN/),
    );

    // A subsequent successful PATCH clears the stale DELETE error and the
    // draft/retry behavior is preserved.
    fireEvent.change(noteTextarea(), { target: { value: 'fine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(noteTextarea()).toHaveValue('fine');
  });
});
