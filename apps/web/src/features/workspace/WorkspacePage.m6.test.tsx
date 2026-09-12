import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import { renderPageAt, restoreDataRouterAbortController } from '../../test/harness';
import { installFetchMock, json, type Handler, type MockResponse } from '../../test/mockFetch';
import type { WorkspaceSnapshot } from './api';
import { WorkspacePage } from './WorkspacePage';

function m6Snapshot(): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1', project_id: 'project-1', title: 'M6 document', description: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: [
      {
        id: 'tv-en', document_id: 'doc-1', language_tag: 'en', label: 'English',
        content: 'One sentence.', content_hash: 'h-en', sort_order: 0,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tv-de', document_id: 'doc-1', language_tag: 'de', label: 'German',
        content: 'Ein Satz.', content_hash: 'h-de', sort_order: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    spans: [], alignment_groups: [], alignment_members: [],
    segmentation_layers: [
      {
        id: 'sentence-en', text_version_id: 'tv-en', granularity: 'sentence', basis_layer_id: null,
        requested_locale: 'en', resolved_locale: 'en', origin: 'manual', content_hash: 'h-en',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'token-en', text_version_id: 'tv-en', granularity: 'token', basis_layer_id: 'sentence-en',
        requested_locale: 'en', resolved_locale: 'en', origin: 'manual', content_hash: 'h-en',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    segments: [
      { id: 'sentence-1', segmentation_layer_id: 'sentence-en', ordinal: 0, start_offset: 0, end_offset: 13, exact_text: 'One sentence.', is_word_like: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'token-one', segmentation_layer_id: 'token-en', ordinal: 0, start_offset: 0, end_offset: 3, exact_text: 'One', is_word_like: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'token-space', segmentation_layer_id: 'token-en', ordinal: 1, start_offset: 3, end_offset: 4, exact_text: ' ', is_word_like: false, created_at: '2026-01-01T00:00:00Z' },
      { id: 'token-sentence', segmentation_layer_id: 'token-en', ordinal: 2, start_offset: 4, end_offset: 12, exact_text: 'sentence', is_word_like: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'token-period', segmentation_layer_id: 'token-en', ordinal: 3, start_offset: 12, end_offset: 13, exact_text: '.', is_word_like: false, created_at: '2026-01-01T00:00:00Z' },
    ],
    token_lemma_annotations: [],
    token_pos_annotations: [],
  };
}

function alignedM6Snapshot(): WorkspaceSnapshot {
  const data = m6Snapshot();
  data.spans = [
    { id: 'span-en', text_version_id: 'tv-en', start_offset: 0, end_offset: 3, exact_text: 'One', prefix: '', suffix: ' sentence.', created_at: '2026-01-01T00:00:00Z' },
    { id: 'span-de', text_version_id: 'tv-de', start_offset: 0, end_offset: 3, exact_text: 'Ein', prefix: '', suffix: ' Satz.', created_at: '2026-01-01T00:00:00Z' },
  ];
  data.alignment_groups = [
    { id: 'alignment-1', document_id: 'doc-1', note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  data.alignment_members = [
    { id: 'member-en', alignment_group_id: 'alignment-1', span_id: 'span-en', created_at: '2026-01-01T00:00:00Z' },
    { id: 'member-de', alignment_group_id: 'alignment-1', span_id: 'span-de', created_at: '2026-01-01T00:00:00Z' },
  ];
  return data;
}

/** The active alignment plus a third version that is NOT one of its members. */
function alignedM6SnapshotWithThird(): WorkspaceSnapshot {
  const data = alignedM6Snapshot();
  data.text_versions = [
    ...data.text_versions,
    {
      id: 'tv-fr', document_id: 'doc-1', language_tag: 'fr', label: 'French',
      content: 'Trois.', content_hash: 'h-fr', sort_order: 2,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  return data;
}

/** Authoritative result of a successful force deletion of `tv-en`. */
function snapshotWithoutEnglish(): WorkspaceSnapshot {
  const data = m6Snapshot();
  data.text_versions = data.text_versions.filter((version) => version.id !== 'tv-en');
  data.segmentation_layers = [];
  data.segments = [];
  return data;
}

/** Force-deleting `tv-en` also cascades the now-invalid `alignment-1`. */
function alignedSnapshotWithoutEnglish(): WorkspaceSnapshot {
  return snapshotWithoutEnglish();
}

/**
 * Both versions carry saved sentence + token layers, so a mutation started by
 * one `TextVersion`'s session can be observed from every other session.
 */
function twoLayerSnapshot(): WorkspaceSnapshot {
  const data = m6Snapshot();
  data.segmentation_layers = [
    ...(data.segmentation_layers ?? []),
    {
      id: 'sentence-de', text_version_id: 'tv-de', granularity: 'sentence', basis_layer_id: null,
      requested_locale: 'de', resolved_locale: 'de', origin: 'manual', content_hash: 'h-de',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'token-de', text_version_id: 'tv-de', granularity: 'token', basis_layer_id: 'sentence-de',
      requested_locale: 'de', resolved_locale: 'de', origin: 'manual', content_hash: 'h-de',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  data.segments = [
    ...(data.segments ?? []),
    { id: 'sentence-de-1', segmentation_layer_id: 'sentence-de', ordinal: 0, start_offset: 0, end_offset: 9, exact_text: 'Ein Satz.', is_word_like: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'token-ein', segmentation_layer_id: 'token-de', ordinal: 0, start_offset: 0, end_offset: 3, exact_text: 'Ein', is_word_like: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'token-space-de', segmentation_layer_id: 'token-de', ordinal: 1, start_offset: 3, end_offset: 4, exact_text: ' ', is_word_like: false, created_at: '2026-01-01T00:00:00Z' },
    { id: 'token-satz', segmentation_layer_id: 'token-de', ordinal: 2, start_offset: 4, end_offset: 8, exact_text: 'Satz', is_word_like: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'token-period-de', segmentation_layer_id: 'token-de', ordinal: 3, start_offset: 8, end_offset: 9, exact_text: '.', is_word_like: false, created_at: '2026-01-01T00:00:00Z' },
  ];
  return data;
}

/** Authoritative result of deleting the saved token layer of `tv-en`. */
function snapshotWithoutTokenLayer(): WorkspaceSnapshot {
  const data = m6Snapshot();
  data.segmentation_layers = (data.segmentation_layers ?? []).filter(
    (layer) => layer.id !== 'token-en',
  );
  data.segments = (data.segments ?? []).filter(
    (segment) => segment.segmentation_layer_id !== 'token-en',
  );
  data.token_lemma_annotations = [];
  data.token_pos_annotations = [];
  return data;
}

function renderWorkspace(
  snapshot = m6Snapshot(),
  handlers: Array<[string, Handler]> = [],
  extraRoutes: RouteObject[] = [],
) {
  installFetchMock([...handlers, ['/workspace', () => json(200, snapshot)]]);
  return renderPageAt(
    <WorkspacePage />,
    '/documents/:documentId/workspace',
    '/documents/doc-1/workspace',
    undefined,
    extraRoutes,
  );
}

async function openBoth() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('WorkspacePage M6 mode-oriented IA', () => {
  it('starts in Alignment with exactly five destinations and persistent canonical roots', async () => {
    const view = renderWorkspace();
    await openBoth();

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: 'Alignment' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Alignment task' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'sentence task' })).toBeNull();
    expect(view.container.querySelectorAll('[data-text-content-root]')).toHaveLength(2);
    expect(view.container.querySelectorAll('.panel-slot .segmentation-panel')).toHaveLength(0);
  });

  it('preserves a dirty mounted sentence session across mode, target, hide, reopen and reorder', async () => {
    const view = renderWorkspace();
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));

    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    const englishPanel = englishSession.querySelector('.segmentation-panel');
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    expect(screen.queryByRole('button', { name: 'Save segmentation' })).toBeNull();
    expect(englishSession.querySelector('.segmentation-panel')).toBe(englishPanel);

    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Active text version' }), { target: { value: 'tv-de' } });
    expect(englishSession).not.toBeVisible();
    expect(englishSession.querySelector('.segmentation-panel')).toBe(englishPanel);

    fireEvent.click(screen.getByRole('button', { name: 'Hide English panel' }));
    expect(await screen.findByRole('button', { name: 'Open English' })).toBeInTheDocument();
    expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('English · SentenceUnsaved');

    fireEvent.click(screen.getByRole('button', { name: 'Open English' }));
    expect(screen.getByRole('combobox', { name: 'Active text version' })).toHaveValue('tv-de');
    fireEvent.click(screen.getByRole('button', { name: 'Move English right' }));
    expect(englishSession.querySelector('.segmentation-panel')).toBe(englishPanel);

    fireEvent.change(screen.getByRole('combobox', { name: 'Active text version' }), { target: { value: 'tv-en' } });
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();
  });

  it('keeps on-demand import state mounted across task switches', async () => {
    renderWorkspace();
    await screen.findByRole('button', { name: 'Add text version' });
    fireEvent.click(screen.getByRole('button', { name: 'Add text version' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), { target: { value: 'Italian' } });
    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close add text version' }));
    expect(screen.queryByRole('textbox', { name: 'Label' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add text version' }));
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('Italian');
  });

  it('preserves independent token, lemma and POS drafts across ordinary navigation', async () => {
    const view = renderWorkspace();
    await openBoth();

    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    const tokenSession = view.container.querySelector('[data-session-key="tv-en:token"]') as HTMLElement;
    fireEvent.click(within(tokenSession).getByRole('button', { name: 'Start manual' }));
    expect(within(tokenSession).getByText('Unsaved preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    const lemmaInput = screen.getByRole('textbox', { name: 'Lemma for One' });
    fireEvent.change(lemmaInput, { target: { value: 'one' } });

    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    const posSelect = screen.getByRole('combobox', { name: 'Coarse POS for One' });
    fireEvent.change(posSelect, { target: { value: 'NUM' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    expect(within(tokenSession).getByText('Unsaved preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    expect(screen.getByRole('textbox', { name: 'Lemma for One' })).toHaveValue('one');
    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    expect(screen.getByRole('combobox', { name: 'Coarse POS for One' })).toHaveValue('NUM');
  });

  it('warns before deleting a version with dirty mounted work and preserves it on cancel', async () => {
    const view = renderWorkspace();
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));

    // Ordinary dirty work with no dialog still hides freely (M6-G2-F01 keeps
    // this path while only locking the dialog-owning case).
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dialog = screen.getByRole('alertdialog');
    // M6-G2-F04: the confirmation names the exact affected unsaved category
    // instead of a generic "linguistic work" claim.
    expect(dialog).toHaveTextContent('unsaved work: Sentence');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();
  });

  // M6-G2-F01: a mounted linguistic dialog must never be hidden by a canvas
  // action; the workspace refuses Hide/Delete while navigation is locked.
  it('blocks canvas hide/delete while a session dialog is open and restores them after close', async () => {
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const opener = screen.getByRole('button', { name: 'Delete segmentation' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeVisible();
    // The mounted alertdialog is never inside a hidden/inert ancestor.
    expect(dialog.closest('[hidden]')).toBeNull();

    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: 'Active text version' }),
    ).toBeDisabled();

    const hide = screen.getByRole('button', { name: 'Hide English panel' });
    const deleteButton = screen.getByRole('button', { name: 'Delete English' });
    expect(hide).toBeDisabled();
    expect(deleteButton).toBeDisabled();

    // Even a programmatic activation attempt cannot hide/delete the version
    // that owns the open dialog.
    fireEvent.click(hide);
    fireEvent.click(deleteButton);
    expect(screen.queryByRole('button', { name: 'Open English' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide English panel' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(screen.getByRole('alertdialog').closest('[hidden]')).toBeNull();

    // Escape closes the unlocked dialog and restores opener focus.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener).toHaveFocus();

    // Controls recover once no dialog remains.
    expect(screen.getByRole('button', { name: 'Hide English panel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete English' })).toBeEnabled();
    expect(
      screen.getByRole('combobox', { name: 'Active text version' }),
    ).toBeEnabled();
    expect(screen.getAllByRole('tab').every((tab) => !(tab as HTMLButtonElement).disabled)).toBe(true);
  });

  // M6-G2-F10: a dirty in-app route transition (Link click here; Back/Forward
  // is covered by the Playwright path) is blocked by the router itself with
  // exactly one in-app confirmation.
  it('blocks a dirty in-app route transition and keeps route, session and draft on cancel', async () => {
    const view = renderWorkspace(m6Snapshot(), [], [
      { path: '/projects', element: <div>Projects destination</div> },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));

    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Leave this document workspace?');
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();

    // The single confirmation performs the pending navigation.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    const confirmed = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmed).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Projects destination')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workspace — M6 document' })).toBeNull();
  });

  it('does not prompt for a clean in-app route transition', async () => {
    renderWorkspace(m6Snapshot(), [], [
      { path: '/projects', element: <div>Projects destination</div> },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));

    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(await screen.findByText('Projects destination')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('registers and cleans up the native refresh/close warning for dirty work', async () => {
    const view = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;

    // A clean workspace installs no native unload warning.
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);

    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));
    const dirtyUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    // Leaving the workspace removes the native listener.
    view.unmount();
    const afterUnmount = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  // M6-G2-F09: deleting the saved token layer through the real UI removes the
  // lemma draft's prerequisite. The draft must remain discoverable, conflicted
  // and explicitly discardable, and no stale token may become a mutation
  // target.
  it('keeps a dirty lemma draft discoverable and discardable after its token layer is deleted through the UI', async () => {
    let tokenLayerDeleted = false;
    installFetchMock([
      [
        '/segmentations/token',
        async (_url, init) => {
          if (init?.method === 'DELETE') {
            tokenLayerDeleted = true;
            return json(204, null);
          }
          return json(200, { layer: { id: 'token-en' }, segments: [] });
        },
      ],
      ['/workspace', async () => json(200, tokenLayerDeleted ? snapshotWithoutTokenLayer() : m6Snapshot())],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    const englishLemma = () =>
      view.container.querySelector('[data-session-key="tv-en:lemma"]') as HTMLElement;

    // Dirty lemma draft over the SAVED token layer; never saved.
    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    fireEvent.change(screen.getByLabelText('Lemma for One'), { target: { value: 'house' } });
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));

    // Delete the saved token layer through the confirmed UI flow.
    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete tokens' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete tokens' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() =>
      expect(
        within(englishLemma()).getByText(
          'Save token segmentation before adding lemma annotations.',
        ),
      ).toBeInTheDocument(),
    );

    // The authoritative refetch removed the prerequisite; the draft is still
    // visible, conflicted, unsubmittable and discoverable while inactive.
    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    expect(within(englishLemma()).getByLabelText('Lemma for One')).toHaveValue('house');
    expect(within(englishLemma()).getByRole('button', { name: 'Save lemma' })).toBeDisabled();
    expect(within(englishLemma()).getByRole('alert')).toHaveTextContent(
      'stale targets cannot be submitted',
    );
    expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Conflict');

    // Explicit discard clears the orphaned draft.
    fireEvent.click(within(englishLemma()).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() =>
      expect(
        within(englishLemma()).queryByLabelText('Lemma for One'),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(englishLemma()).getByText(
        'Save token segmentation before adding lemma annotations.',
      ),
    ).toBeInTheDocument();

    // The sentence layer is untouched and no stale token was submitted.
    const snapshotResponse = await fetch('/api/v1/documents/doc-1/workspace');
    const snapshot = (await snapshotResponse.json()) as WorkspaceSnapshot;
    expect((snapshot.segmentation_layers ?? []).map((layer) => layer.granularity)).toEqual(['sentence']);
    expect(snapshot.token_lemma_annotations).toEqual([]);
  });

  it('preserves a dirty Alignment Inspector note across mounted task sessions', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    renderWorkspace(alignedM6Snapshot());
    await openBoth();
    fireEvent.click(screen.getByRole('button', { name: /Activate alignment/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), {
      target: { value: 'mounted inspector draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    expect(screen.queryByRole('textbox', { name: /Note/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved');
    fireEvent.click(screen.getByRole('tab', { name: 'Alignment' }));
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('mounted inspector draft');
  });

  it('pins a destructive session dialog, gives Escape ownership, and restores opener focus', async () => {
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const opener = screen.getByRole('button', { name: 'Delete segmentation' });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps a pending destructive dialog locked against task navigation and Escape', async () => {
    let resolveDelete: ((value: MockResponse) => void) | undefined;
    renderWorkspace(m6Snapshot(), [
      ['/segmentations/sentence', () => new Promise((resolve) => { resolveDelete = resolve; })],
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete segmentation' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete segmentation' }));

    await screen.findByRole('button', { name: 'Deleting…' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    // M6-G2-F01: the pending destructive lock also holds the canvas actions.
    expect(screen.getByRole('button', { name: 'Hide English panel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete English' })).toBeDisabled();

    resolveDelete?.({ status: 204, body: null });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    // Settled: the canvas actions recover.
    expect(screen.getByRole('button', { name: 'Hide English panel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete English' })).toBeEnabled();
  });

  // ---- M6-G2-F03: keyboard-only task navigation --------------------------

  it('switches the visible task panel with the complete tabs keyboard model', async () => {
    const view = renderWorkspace();
    await openBoth();

    const alignmentTab = screen.getByRole('tab', { name: 'Alignment' });
    alignmentTab.focus();
    expect(alignmentTab).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Alignment task' })).toBeVisible();

    fireEvent.keyDown(alignmentTab, { key: 'ArrowRight' });
    const sentenceTab = screen.getByRole('tab', { name: 'Sentence' });
    expect(sentenceTab).toHaveFocus();
    expect(sentenceTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'sentence task' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Alignment task' })).toBeNull();

    fireEvent.keyDown(sentenceTab, { key: 'End' });
    const posTab = screen.getByRole('tab', { name: 'POS' });
    expect(posTab).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'POS task' })).toBeVisible();

    // Ordinary Tab order from the active tab reaches the active-target
    // selector: only the active destination is in the tab order.
    const nav = view.container.querySelector('.workbench-navigation') as HTMLElement;
    const order = Array.from(
      nav.querySelectorAll<HTMLElement>('button, select, input, textarea, [tabindex]'),
    ).filter(
      (element) =>
        !element.hasAttribute('disabled') &&
        element.getAttribute('tabindex') !== '-1',
    );
    expect(order[order.indexOf(posTab) + 1]).toBe(
      screen.getByRole('combobox', { name: 'Active text version' }),
    );
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  // ---- M6-G2-F04: affected dirty sessions named in deletion warnings -----

  it('names a dirty Alignment note when the deleted version can cascade the active alignment', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    renderWorkspace(alignedM6Snapshot());
    await openBoth();
    fireEvent.click(screen.getByRole('button', { name: /Activate alignment/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), {
      target: { value: 'alignment draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Alignment note');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('alignment draft');
  });

  it('does not claim Alignment note loss for a version outside the active alignment', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    renderWorkspace(alignedM6SnapshotWithThird(), [
      [
        '/api/v1/text-versions/',
        async () =>
          json(409, {
            code: 'TEXT_HAS_ANNOTATIONS',
            message: 'text version has annotations',
            details: {},
          }),
      ],
    ]);
    await openBoth();
    fireEvent.click(await screen.findByRole('button', { name: 'Open French' }));
    fireEvent.click(screen.getByRole('button', { name: /Activate alignment/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), {
      target: { value: 'unrelated draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    // The active alignment only contains English/German, so deleting French
    // cannot cascade the note and must not be described as losing it.
    fireEvent.click(screen.getByRole('button', { name: 'Delete French' }));
    const forceDialog = await screen.findByRole('alertdialog');
    expect(forceDialog).toHaveTextContent('persisted annotations');
    expect(forceDialog).not.toHaveTextContent('Alignment note');
    expect(forceDialog).not.toHaveTextContent('Unsaved work in this text version');

    fireEvent.click(within(forceDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('unrelated draft');
  });

  it('carries unsaved-work context into the force confirmation and removes sessions only after authoritative success', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    let snapshot = alignedM6Snapshot();
    let resolveForce: ((value: MockResponse) => void) | undefined;
    installFetchMock([
      [
        '/api/v1/text-versions/',
        async (url, init) => {
          if (init?.method === 'DELETE' && String(url).includes('force=true')) {
            return new Promise((resolve) => {
              resolveForce = resolve;
            });
          }
          return json(409, {
            code: 'TEXT_HAS_ANNOTATIONS',
            message: 'text version has annotations',
            details: {},
          });
        },
      ],
      ['/workspace', async () => json(200, snapshot)],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openBoth();
    fireEvent.click(screen.getByRole('button', { name: /Activate alignment/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), {
      target: { value: 'cascading draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dirtyDialog = screen.getByRole('alertdialog');
    expect(dirtyDialog).toHaveTextContent('unsaved work: Alignment note');
    fireEvent.click(within(dirtyDialog).getByRole('button', { name: 'Continue delete' }));

    // Ordinary DELETE -> TEXT_HAS_ANNOTATIONS -> the force confirmation keeps
    // the same unsaved-work context.
    const forceDialog = await screen.findByRole('alertdialog');
    expect(forceDialog).toHaveTextContent(
      'Unsaved work in this text version (Alignment note)',
    );
    fireEvent.click(within(forceDialog).getByRole('button', { name: 'Delete permanently' }));
    await screen.findByRole('button', { name: 'Deleting…' });

    // Pending force mutation: Escape is inert and the canvas stays locked.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide English panel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete English' })).toBeDisabled();

    // Authoritative success: only now do the session and the cascade-deleted
    // alignment disappear.
    expect(screen.getByRole('button', { name: /Activate alignment/ })).toBeInTheDocument();
    snapshot = alignedSnapshotWithoutEnglish();
    resolveForce?.({ status: 204, body: null });

    await waitFor(() =>
      expect(view.container.querySelector('[data-session-key="tv-en:lemma"]')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Open English' })).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Activate alignment/ })).toBeNull(),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  // ---- data-router navigation request fidelity (test infrastructure) ------

  it('keeps the router navigation signal native instead of shadowing it on a request built without it', async () => {
    renderWorkspace();
    await screen.findByRole('heading', { name: 'Workspace — M6 document' });

    const controller = new AbortController();
    const request = new Request('http://localhost/navigation', {
      signal: controller.signal,
    });

    // The native Request keeps `signal` on its prototype (no own override) and
    // carries a real, abortable signal. The previous environment-wide
    // workaround built the native request WITHOUT the signal and then
    // re-attached it as an own `signal` property, which this rejects.
    expect(Object.prototype.hasOwnProperty.call(request, 'signal')).toBe(false);

    const requestSignal = request.signal;
    expect(requestSignal.aborted).toBe(false);
    let observedAbort = false;
    requestSignal.addEventListener('abort', () => {
      observedAbort = true;
    });

    controller.abort();
    expect(observedAbort).toBe(true);
    expect(requestSignal.aborted).toBe(true);
  });

  it('scopes the native navigation controller to data-router page tests and restores it', async () => {
    const environmentAbortController = globalThis.AbortController;

    renderWorkspace();
    await screen.findByRole('heading', { name: 'Workspace — M6 document' });

    expect(globalThis.AbortController).not.toBe(environmentAbortController);
    expect(() =>
      new Request('http://localhost/navigation', {
        signal: new AbortController().signal,
      }),
    ).not.toThrow();

    restoreDataRouterAbortController();
    expect(globalThis.AbortController).toBe(environmentAbortController);
  });

  // ---- M6-G2-F11: leave confirmation vs an already-open dialog ------------

  it('does not mount a second modal when a dirty leave is attempted while a session dialog is open', async () => {
    const view = renderWorkspace(m6Snapshot(), [], [
      { path: '/projects', element: <div>Projects destination</div> },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));

    // The session's destructive confirmation owns the workspace.
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Delete segmentation' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    const sessionDialog = screen.getByRole('alertdialog');

    // A route leave must neither bypass it nor mount a second modal.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('alertdialog')).toBe(sessionDialog);
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();

    // Closing the original dialog leaves no stale leave confirmation behind.
    fireEvent.click(within(sessionDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Only now does a leave produce exactly one Leave confirmation.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    const leaveDialog = await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(leaveDialog).toHaveTextContent('Leave this document workspace?');
    fireEvent.click(within(leaveDialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }),
    );
    expect(await screen.findByText('Projects destination')).toBeInTheDocument();
  });

  it('does not let a route leave bypass an open dialog even when nothing is dirty', async () => {
    const view = renderWorkspace(m6Snapshot(), [], [
      { path: '/projects', element: <div>Projects destination</div> },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Delete segmentation' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();
    expect(screen.queryByText('Projects destination')).toBeNull();
  });

  it('keeps a pending destructive lock and its feedback when a leave is attempted', async () => {
    let resolveDelete: ((value: MockResponse) => void) | undefined;
    const view = renderWorkspace(
      m6Snapshot(),
      [['/segmentations/sentence', () => new Promise((resolve) => { resolveDelete = resolve; })]],
      [{ path: '/projects', element: <div>Projects destination</div> }],
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Delete segmentation' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete segmentation' }),
    );
    await screen.findByRole('button', { name: 'Deleting…' });

    // The leave attempt must not release the lock, hide the feedback or add a modal.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeInTheDocument();
    expect(screen.queryByText('Projects destination')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    resolveDelete?.({ status: 204, body: null });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();
  });

  // ---- M6-G2-F12: per-session Pending reporting ---------------------------

  it('reports Pending only for the sentence session that started the mutation', async () => {
    let releaseSentence: ((value: MockResponse) => void) | undefined;
    let sentenceSaved = false;
    const base = twoLayerSnapshot();
    const saved = twoLayerSnapshot();
    saved.segmentation_layers = (saved.segmentation_layers ?? []).map((layer) =>
      layer.id === 'sentence-en' ? { ...layer, updated_at: '2026-01-02T00:00:00Z' } : layer,
    );
    const view = renderWorkspace(base, [
      ['/segmentations/sentence', () => new Promise<MockResponse>((resolve) => {
        releaseSentence = (value) => { sentenceSaved = true; resolve(value); };
      })],
      ['/workspace', () => json(200, sentenceSaved ? saved : base)],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSentence = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSentence).getByRole('button', { name: 'Start manual' }));
    fireEvent.click(within(englishSentence).getByRole('button', { name: 'Save segmentation' }));
    await screen.findByRole('button', { name: 'Saving…' });

    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    const summary = screen.getByLabelText('Workbench session status');
    expect(summary).toHaveTextContent('English · SentencePending');
    expect(summary).not.toHaveTextContent('English · Token');
    expect(summary).not.toHaveTextContent('German · Sentence');
    expect(summary).not.toHaveTextContent('German · Token');

    // Settling converges: the whole summary clears because only the real
    // session had ever reported Pending.
    await waitFor(() => expect(releaseSentence).toBeTypeOf('function'));
    releaseSentence?.({ status: 200, body: { layer: {}, segments: [] } });
    await waitFor(() => expect(screen.queryByLabelText('Workbench session status')).toBeNull());
  });

  it('reports Pending only for the lemma session that started the mutation', async () => {
    let releaseLemma: ((value: MockResponse) => void) | undefined;
    let lemmaSaved = false;
    const base = twoLayerSnapshot();
    const saved = twoLayerSnapshot();
    saved.token_lemma_annotations = [
      { id: 'l1', token_segment_id: 'token-one', lemma: 'one', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ];
    const view = renderWorkspace(base, [
      ['/lemma', () => new Promise<MockResponse>((resolve) => {
        releaseLemma = (value) => { lemmaSaved = true; resolve(value); };
      })],
      ['/workspace', () => json(200, lemmaSaved ? saved : base)],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    const englishLemma = view.container.querySelector('[data-session-key="tv-en:lemma"]') as HTMLElement;
    const oneRow = englishLemma.querySelector('[data-token-segment-id="token-one"]') as HTMLElement;
    fireEvent.change(within(oneRow).getByLabelText('Lemma for One'), { target: { value: 'one' } });
    fireEvent.click(within(oneRow).getByRole('button', { name: 'Save lemma' }));
    await screen.findByRole('button', { name: 'Saving…' });

    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    const summary = screen.getByLabelText('Workbench session status');
    expect(summary).toHaveTextContent('English · LemmaPending');
    expect(summary).not.toHaveTextContent('English · POS');
    expect(summary).not.toHaveTextContent('German · Lemma');
    expect(summary).not.toHaveTextContent('German · POS');

    // Settling converges: the confirmed authoritative value makes the session
    // clean again, and no other session was ever noteworthy.
    await waitFor(() => expect(releaseLemma).toBeTypeOf('function'));
    releaseLemma?.({ status: 200, body: { id: 'l1', token_segment_id: 'token-one', lemma: 'one', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' } });
    await waitFor(() => expect(screen.queryByLabelText('Workbench session status')).toBeNull());
  });
});
