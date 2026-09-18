import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * M6-HSDR-F03: ONE active alignment containing a member from each of three
 * TextVersions (English, German, French).
 */
function alignedM6SnapshotWithThreeMembers(): WorkspaceSnapshot {
  const data = alignedM6SnapshotWithThird();
  data.spans = [
    ...data.spans,
    { id: 'span-fr', text_version_id: 'tv-fr', start_offset: 0, end_offset: 5, exact_text: 'Trois', prefix: '', suffix: '.', created_at: '2026-01-01T00:00:00Z' },
  ];
  data.alignment_members = [
    ...data.alignment_members,
    { id: 'member-fr', alignment_group_id: 'alignment-1', span_id: 'span-fr', created_at: '2026-01-01T00:00:00Z' },
  ];
  return data;
}

/**
 * M6-HSDR-F03: authoritative result of force-deleting `tv-en` from the
 * three-member alignment. Only English's own span/member disappear; the SAME
 * `alignment-1` survives with the German + French members (2 members across 2
 * distinct TextVersions), so it is NOT cascade-deleted.
 */
/**
 * M6-PRR-F01 (C1.1): a THREE-member active alignment with an EXISTING
 * persisted note. The Inspector starts with a clean note (so the TextVersion
 * delete lifecycle can begin without a dirty-delete confirmation) and removing
 * one member is still a valid operation, so the member-removal control is
 * genuinely interactive before the freeze.
 */
function threeMemberAlignedSnapshotWithNote(): WorkspaceSnapshot {
  const data = alignedM6SnapshotWithThreeMembers();
  // `shortId` truncates to 8 chars, so distinct groups must differ inside that
  // prefix ('grp-zeta' vs 'grp-eta') for activation controls to be addressable.
  data.alignment_groups = [
    ...data.alignment_groups.map((group) => ({
      ...group,
      id: 'grp-zeta',
      note: 'baseline note',
    })),
    {
      id: 'grp-eta',
      document_id: 'doc-1',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  data.alignment_members = data.alignment_members.map((member) => ({
    ...member,
    alignment_group_id: 'grp-zeta',
  }));
  return data;
}

/**
 * M6-PRR-F01 (C1.1): the same note-bearing active alignment plus a SECOND
 * persisted group, so "switch the active alignment" is a genuinely available
 * operation that the freeze must also block.
 */
/**
 * M6-PRR-F01 (C1.2 / item 3): two persisted groups where English's FIRST
 * canonical run belongs to BOTH groups (the ambiguity path) and its SECOND run
 * belongs ONLY to `grp-eta`. That gives a real canonical run-click target
 * that would switch the active alignment away from `grp-zeta`.
 *
 * Also carries the active note, so the same fixture exercises the note freeze.
 */
function ambiguityAlignedSnapshotWithNote(): WorkspaceSnapshot {
  const data = alignedM6SnapshotWithThreeMembers();
  data.alignment_groups = data.alignment_groups.map((group) => ({
    ...group,
    id: 'grp-zeta',
    note: 'baseline note',
  }));
  data.alignment_members = data.alignment_members.map((member) => ({
    ...member,
    alignment_group_id: 'grp-zeta',
  }));
  data.alignment_groups = [
    ...data.alignment_groups,
    {
      id: 'grp-eta',
      document_id: 'doc-1',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  // Run [0,3): ambiguous — member of BOTH groups.
  data.alignment_members = [
    ...data.alignment_members,
    { id: 'member-en-eta', alignment_group_id: 'grp-eta', span_id: 'span-en', created_at: '2026-01-01T00:00:00Z' },
  ];
  // Run [4,12) "sentence": member of grp-eta ONLY.
  data.spans = [
    ...data.spans,
    { id: 'span-en-sentence', text_version_id: 'tv-en', start_offset: 4, end_offset: 12, exact_text: 'sentence', prefix: 'One ', suffix: '.', created_at: '2026-01-01T00:00:00Z' },
  ];
  data.alignment_members = [
    ...data.alignment_members,
    { id: 'member-en-sentence-eta', alignment_group_id: 'grp-eta', span_id: 'span-en-sentence', created_at: '2026-01-01T00:00:00Z' },
  ];
  return data;
}

function threeMemberAlignedSnapshotWithNoteAndOther(): WorkspaceSnapshot {
  // Already carries the second group; kept as a named alias so the C1.1
  // alignment-surface test and the C1.2 warning-window test share one fixture.
  return threeMemberAlignedSnapshotWithNote();
}

function alignedSnapshotWithoutEnglishSurvivingGroup(): WorkspaceSnapshot {
  const data = alignedM6SnapshotWithThreeMembers();
  data.text_versions = data.text_versions.filter((version) => version.id !== 'tv-en');
  data.spans = data.spans.filter((span) => span.text_version_id !== 'tv-en');
  data.alignment_members = data.alignment_members.filter(
    (member) => member.span_id !== 'span-en',
  );
  data.segmentation_layers = (data.segmentation_layers ?? []).filter(
    (layer) => layer.text_version_id !== 'tv-en',
  );
  data.segments = (data.segments ?? []).filter(
    (segment) => segment.segmentation_layer_id !== 'token-en' && segment.segmentation_layer_id !== 'sentence-en',
  );
  data.token_lemma_annotations = [];
  data.token_pos_annotations = [];
  return data;
}

/** Authoritative workspace after a successful Italian import. */
function snapshotWithItalian(): WorkspaceSnapshot {
  const data = m6Snapshot();
  data.text_versions = [
    ...data.text_versions,
    {
      id: 'tv-it', document_id: 'doc-1', language_tag: 'it', label: 'Italian',
      content: 'Ciao mondo.', content_hash: 'h-it', sort_order: 2,
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

/**
 * Stub a native selection over the FIRST canonical text run so the panel's
 * explicit "Add to Alignment" staging path can be exercised in jsdom.
 */
function stubSelection(container: HTMLElement, startUtf16: number, endUtf16: number) {
  const panel = container.querySelector('.text-panel');
  if (!panel) {
    throw new Error('no text panel rendered');
  }
  const root = panel.querySelector('[data-text-content-root]');
  const run = root?.firstChild;
  const textNode = run?.firstChild;
  if (
    textNode === null ||
    textNode === undefined ||
    textNode.nodeType !== Node.TEXT_NODE
  ) {
    throw new Error('no text node in the content root');
  }
  // Clamp to the run's actual length: the canonical runs are split at span
  // boundaries, so the FIRST text node is one run, not the whole content.
  const limit = textNode.nodeValue?.length ?? 0;
  const start = Math.min(startUtf16, limit);
  const end = Math.min(endUtf16, limit);
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  vi.stubGlobal('getSelection', () => ({
    rangeCount: 1,
    getRangeAt: () => range,
    anchorNode: textNode,
    focusNode: textNode,
    anchorOffset: start,
    focusOffset: end,
    removeAllRanges: vi.fn(),
  }));
}

async function openBoth() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open German' }));
}

beforeEach(() => {
  // Panel preferences are per-document localStorage state. Clear them before
  // each case so a preceding case's reconciled preference (for example, after
  // an authoritative TextVersion deletion) can never leak into the next one.
  window.localStorage.clear();
});

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

  // M6-HSDR-F02: a successful NON-English import must return the Import session
  // to a clean state. The dirty definition includes `languageTag !== 'en'`, so
  // a `resetForm()` that restored only label/content/file left the completed
  // form reporting Unsaved and blocked an otherwise clean route leave.
  it('returns a successful non-English import to clean state without blocking a clean route leave', async () => {
    let imported = false;
    installFetchMock([
      [
        '/api/v1/documents/doc-1/text-versions',
        async () => {
          imported = true;
          return json(201, {
            id: 'tv-it', document_id: 'doc-1', language_tag: 'it', label: 'Italian',
            content: 'Ciao mondo.', content_hash: 'h-it', sort_order: 2,
            created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          });
        },
      ],
      ['/workspace', async () => json(200, imported ? snapshotWithItalian() : m6Snapshot())],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
      undefined,
      [{ path: '/projects', element: <div>Projects destination</div> }],
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text version' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), { target: { value: 'Italian' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Language tag (BCP-47)' }), { target: { value: 'it' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Ciao mondo.' } });

    // The pending non-English form is genuinely dirty before the import lands.
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Add text versionUnsaved'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add version' }));

    // Authoritative success reconciles the new TextVersion into the canvas...
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-text-content-root][data-text-version-id="tv-it"]'),
      ).not.toBeNull(),
    );
    // ...the completed form is clean (including the restored language field)...
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Language tag (BCP-47)' })).toHaveValue('en');
    // ...no stale Unsaved summary remains from the successful Import session...
    expect(screen.queryByLabelText('Workbench session status')).toBeNull();

    // ...so an otherwise-clean route leave is NOT blocked by that import.
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(await screen.findByText('Projects destination')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
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

  // ---- M6-HSDR-F03: surviving active alignment is not destructive loss -----

  it('keeps the dirty Alignment note when deleting one member leaves the active group valid', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    let snapshot = alignedM6SnapshotWithThreeMembers();
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
      target: { value: 'surviving draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    const inspector = screen.getByRole('region', { name: 'Alignment inspector' });
    expect(within(inspector).getByText('Members (3)')).toBeInTheDocument();
    const activeGroupHeading = inspector.querySelector('h3')?.textContent;
    expect(view.container.querySelector('[data-session-key="tv-en:lemma"]')).not.toBeNull();

    // English is one of THREE members. German + French remain and span two
    // distinct TextVersions, so the authoritative group survives the cascade.
    // The mounted Inspector draft is therefore NOT at risk and the deletion
    // must not be described as discarding unsaved Alignment-note work.
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const forceDialog = await screen.findByRole('alertdialog');
    expect(forceDialog).toHaveTextContent('persisted annotations');
    expect(forceDialog).not.toHaveTextContent('Alignment note');
    expect(forceDialog).not.toHaveTextContent('Unsaved work in this text version');

    // The ordinary DELETE still returns TEXT_HAS_ANNOTATIONS; force is confirmed.
    fireEvent.click(within(forceDialog).getByRole('button', { name: 'Delete permanently' }));
    await screen.findByRole('button', { name: 'Deleting…' });

    // Authoritative refetch: English is gone, but the SAME alignment group
    // survives with the German + French members.
    snapshot = alignedSnapshotWithoutEnglishSurvivingGroup();
    resolveForce?.({ status: 204, body: null });

    await waitFor(() =>
      expect(view.container.querySelector('[data-session-key="tv-en:lemma"]')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Delete English' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete German' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    // The SAME active group is still inspectable, and the unsaved note draft
    // survived the authoritative refetch instead of being reset to persisted.
    const survivingInspector = screen.getByRole('region', { name: 'Alignment inspector' });
    expect(survivingInspector.querySelector('h3')?.textContent).toBe(activeGroupHeading);
    expect(within(survivingInspector).getByText('Members (2)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('surviving draft');
    expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved');
  });

  it('keeps the dirty Alignment note at risk when authoritative member identity is unresolved', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    // A member references a span that is absent from authoritative data, so the
    // post-deletion survival of the group cannot be proven: the correction must
    // fail conservative and keep reporting the dirty note as potentially lost.
    const malformed = alignedM6SnapshotWithThreeMembers();
    malformed.spans = malformed.spans.filter((span) => span.id !== 'span-fr');
    renderWorkspace(malformed);
    await openBoth();
    fireEvent.click(screen.getByRole('button', { name: /Activate alignment/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), {
      target: { value: 'malformed draft' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('AlignmentUnsaved'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dirtyDialog = screen.getByRole('alertdialog');
    expect(dirtyDialog).toHaveTextContent('Alignment note');
    fireEvent.click(within(dirtyDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('malformed draft');
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

  it('reports a token mutation only for its owning session while other segmentation controls stay locked', async () => {
    let releaseToken: ((value: MockResponse) => void) | undefined;
    const view = renderWorkspace(twoLayerSnapshot(), [
      ['/segmentations/token', () => new Promise<MockResponse>((resolve) => {
        releaseToken = resolve;
      })],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    const englishToken = view.container.querySelector('[data-session-key="tv-en:token"]') as HTMLElement;
    fireEvent.click(within(englishToken).getByRole('button', { name: 'Start manual' }));
    fireEvent.click(within(englishToken).getByRole('button', { name: 'Save tokens' }));
    await within(englishToken).findByRole('button', { name: 'Saving…' });

    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    const summary = screen.getByLabelText('Workbench session status');
    expect(summary).toHaveTextContent('English · TokenPending');
    expect(summary).not.toHaveTextContent('English · Sentence');
    expect(summary).not.toHaveTextContent('German · Token');
    expect(summary).not.toHaveTextContent('German · Sentence');

    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Active text version' }), { target: { value: 'tv-de' } });
    const germanToken = view.container.querySelector('[data-session-key="tv-de:token"]') as HTMLElement;
    expect(within(germanToken).getByRole('button', { name: 'Start manual' })).toBeDisabled();

    await waitFor(() => expect(releaseToken).toBeTypeOf('function'));
    releaseToken?.({ status: 500, body: { code: 'INTERNAL_ERROR', message: 'token save failed', details: {} } });
    await waitFor(() => expect(summary).toHaveTextContent('English · TokenError'));
    expect(summary).not.toHaveTextContent('German · Token');
  });

  it('reports a POS mutation only for its owning session while other POS controls stay locked', async () => {
    let releasePos: ((value: MockResponse) => void) | undefined;
    const view = renderWorkspace(twoLayerSnapshot(), [
      ['/pos', () => new Promise<MockResponse>((resolve) => {
        releasePos = resolve;
      })],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    const englishPos = view.container.querySelector('[data-session-key="tv-en:pos"]') as HTMLElement;
    const oneRow = englishPos.querySelector('[data-token-segment-id="token-one"]') as HTMLElement;
    fireEvent.change(within(oneRow).getByLabelText('Coarse POS for One'), { target: { value: 'NOUN' } });
    fireEvent.click(within(oneRow).getByRole('button', { name: 'Save POS' }));
    await within(oneRow).findByRole('button', { name: 'Saving…' });

    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    const summary = screen.getByLabelText('Workbench session status');
    expect(summary).toHaveTextContent('English · POSPending');
    expect(summary).not.toHaveTextContent('English · Lemma');
    expect(summary).not.toHaveTextContent('German · POS');
    expect(summary).not.toHaveTextContent('German · Lemma');

    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Active text version' }), { target: { value: 'tv-de' } });
    const germanPos = view.container.querySelector('[data-session-key="tv-de:pos"]') as HTMLElement;
    expect(within(germanPos).getByLabelText('Coarse POS for Ein')).toBeDisabled();

    await waitFor(() => expect(releasePos).toBeTypeOf('function'));
    releasePos?.({ status: 500, body: { code: 'INTERNAL_ERROR', message: 'POS save failed', details: {} } });
    await waitFor(() => expect(summary).toHaveTextContent('English · POSError'));
    expect(summary).not.toHaveTextContent('German · POS');
  });

  // ---- M6-PRR-F01: TextVersion delete lifecycle lock ---------------------

  // ---- M6-PRR-F01 (C1.2 / item 6): the ORIGINAL clean-version race --------
  // The target starts CLEAN: no dirty-delete confirmation arms at all. This is
  // the exact race the corpus finding describes — `Start manual` is usable,
  // the Human starts the ordinary DELETE, and a draft created while the
  // request/refetch is in flight would be silently swallowed by the
  // authoritative reconciliation. This test MUST NOT open any confirmation.
  it('locks a CLEAN target task editor from the DELETE request until the authoritative snapshot drops the version', async () => {
    let resolveDelete: ((value: MockResponse) => void) | undefined;
    let refetchCalls = 0;
    let releaseRefetch: (() => void) | undefined;
    const refetched = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let snapshot = m6Snapshot();
    installFetchMock([
      [
        '/api/v1/text-versions/',
        (_url, init) =>
          new Promise<MockResponse>((resolve) => {
            if (init?.method === 'DELETE') {
              resolveDelete = resolve;
              return;
            }
            resolve({ status: 204, body: null });
          }),
      ],
      [
        '/workspace',
        async () => {
          refetchCalls += 1;
          // Only the post-delete authoritative refetch is held; the initial
          // load must resolve so the workspace can mount.
          if (refetchCalls > 1) {
            await refetched;
          }
          return json(200, snapshot);
        },
      ],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    const startManual = within(englishSession).getByRole('button', { name: 'Start manual' });
    const deleteEnglish = screen.getByRole('button', { name: 'Delete English' });
    expect(startManual).toBeEnabled();
    expect(deleteEnglish).toBeEnabled();

    // No dirty work anywhere, so the ordinary DELETE starts immediately and
    // NO confirmation may appear.
    fireEvent.click(deleteEnglish);
    await waitFor(() => expect(resolveDelete).toBeTypeOf('function'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Pending: the clean target can no longer START a draft.
    expect(startManual).toBeDisabled();
    fireEvent.click(startManual);
    expect(within(englishSession).queryByText('Unsaved preview')).toBeNull();

    // Resolve the ordinary DELETE while the authoritative refetch is HELD.
    // `deleteMutation.isPending` is now false, but the editor must stay locked
    // and still must not be able to create a swallowed draft.
    await act(async () => {
      resolveDelete?.({ status: 204, body: null });
      await Promise.resolve();
    });
    expect(deleteEnglish).toBeDisabled();
    expect(startManual).toBeDisabled();
    fireEvent.click(startManual);
    expect(within(englishSession).queryByText('Unsaved preview')).toBeNull();
    expect(document.body).toHaveTextContent('linguistic drafting is frozen');

    // Only the authoritative snapshot removing English ends the lifecycle.
    await waitFor(() => expect(refetchCalls).toBeGreaterThan(1));
    snapshot = snapshotWithoutEnglish();
    releaseRefetch?.();
    await waitFor(() =>
      expect(view.container.querySelector('[data-session-key="tv-en:sentence"]')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Delete English' })).toBeNull();
  });

  // ---- M6-PRR-F01 (C1.2 / item 4): destructive openers never stack -------
  it('freezes the sentence/token destructive openers and cannot start a second destructive mutation', async () => {
    const segmentationCalls: string[] = [];
    renderWorkspace(twoLayerSnapshot(), [
      [
        '/api/v1/text-versions/',
        (_url, init) =>
          new Promise<MockResponse>((resolve) => {
            if (init?.method === 'DELETE') {
              return; // ordinary TextVersion DELETE stays pending
            }
            resolve({ status: 204, body: null });
          }),
      ],
      [
        '/segmentations/',
        async (url, init) => {
          segmentationCalls.push(`${init?.method ?? 'GET'} ${url}`);
          return json(204, null);
        },
      ],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = document.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() =>
      expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument(),
    );

    const deleteSegmentation = screen.getByRole('button', { name: 'Delete segmentation' });
    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    const deleteTokens = screen.getByRole('button', { name: 'Delete tokens' });
    expect(deleteSegmentation).toBeEnabled();
    expect(deleteTokens).toBeEnabled();

    // Dirty target -> dirty-delete warning window. The openers must already be
    // frozen so no second destructive surface can stack behind that dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dirtyDialog = await screen.findByRole('alertdialog');
    expect(within(dirtyDialog).getByRole('button', { name: 'Continue delete' })).toBeInTheDocument();
    expect(deleteSegmentation).toBeDisabled();
    expect(deleteTokens).toBeDisabled();
    fireEvent.click(deleteSegmentation);
    fireEvent.click(deleteTokens);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    // Continue into the ordinary DELETE lifecycle: still frozen, and the dirty
    // warning closes as the request starts (no stacked destructive surface).
    fireEvent.click(within(dirtyDialog).getByRole('button', { name: 'Continue delete' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteSegmentation).toBeDisabled();
    expect(deleteTokens).toBeDisabled();
    fireEvent.click(deleteSegmentation);
    fireEvent.click(deleteTokens);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // No segmentation/token destructive request could start.
    expect(
      segmentationCalls.filter((entry) => entry.startsWith('DELETE')),
    ).toHaveLength(0);
  });

  // ---- M6-PRR-F01 (C1.3): force SUCCESS must not release the lifecycle ----
  // `onSettled` runs on success AND failure. On success the authoritative
  // refetch is still pending, so releasing there let the target editor become
  // writable again while the OLD snapshot (still containing English) was
  // mounted — a new draft could then be lost by the reconciliation. Only the
  // authoritative `versionsById` reconciliation may end the lifecycle.
  it('holds the destructive lifecycle across force success until the authoritative snapshot drops the version', async () => {
    let resolveForce: ((value: MockResponse) => void) | undefined;
    let refetchCalls = 0;
    let releaseRefetch: (() => void) | undefined;
    const refetched = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let snapshot = alignedM6Snapshot();
    installFetchMock([
      [
        '/api/v1/text-versions/',
        async (url, init) => {
          if (init?.method === 'DELETE' && String(url).includes('force=true')) {
            return new Promise<MockResponse>((resolve) => {
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
      [
        '/workspace',
        async () => {
          refetchCalls += 1;
          // Only the post-force authoritative refetch is held; the initial load
          // must resolve so the workspace can mount.
          if (refetchCalls > 1) {
            await refetched;
          }
          return json(200, snapshot);
        },
      ],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    const startManual = () =>
      within(
        view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement,
      ).getByRole('button', { name: 'Start manual' });
    const deleteEnglish = screen.getByRole('button', { name: 'Delete English' });
    expect(startManual()).toBeEnabled();

    // Ordinary DELETE -> TEXT_HAS_ANNOTATIONS -> force confirmation.
    fireEvent.click(deleteEnglish);
    const forceDialog = await screen.findByRole('alertdialog');
    expect(
      within(forceDialog).getByRole('heading', {
        name: 'Delete text version permanently?',
      }),
    ).toBeInTheDocument();

    // Hold the FORCE request, then confirm it.
    fireEvent.click(
      within(forceDialog).getByRole('button', { name: 'Delete permanently' }),
    );
    await waitFor(() => expect(resolveForce).toBeTypeOf('function'));
    expect(startManual()).toBeDisabled();

    // Resolve the force DELETE with 204 while the authoritative refetch is
    // HELD and still returns the OLD snapshot that contains English.
    await act(async () => {
      resolveForce?.({ status: 204, body: null });
      await Promise.resolve();
    });

    // The workspace dialog may close, but the destructive lifecycle must NOT.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(refetchCalls).toBeGreaterThan(1));
    // Old authoritative snapshot still has English mounted...
    expect(
      view.container.querySelector('[data-session-key="tv-en:sentence"]'),
    ).not.toBeNull();
    // ...and every destructive-lifecycle interaction is STILL frozen.
    expect(startManual()).toBeDisabled();
    fireEvent.click(startManual());
    expect(englishSession.textContent).not.toContain('Unsaved preview');
    // Add to Alignment cannot stage while the lifecycle is held.
    const currentEnglishPanel = () =>
      view.container.querySelector(
        '.text-panel[data-text-version-id="tv-en"]',
      ) as HTMLElement;
    await waitFor(() =>
      expect(
        within(currentEnglishPanel()).getByRole('button', {
          name: 'Add to Alignment',
        }),
      ).toBeDisabled(),
    );
    expect(
      within(currentEnglishPanel()).getByRole('button', {
        name: 'Add to Alignment',
      }),
    ).toBeDisabled();

    // Release the authoritative snapshot WITHOUT English: only now does the
    // lifecycle end and the interaction recover.
    snapshot = snapshotWithoutEnglish();
    releaseRefetch?.();
    await waitFor(() =>
      expect(view.container.querySelector('[data-session-key="tv-en:sentence"]')).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Delete English' })).toBeNull();
    // The surviving German version recovers its interaction.
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    await waitFor(() => {
      const germanSession = view.container.querySelector(
        '[data-session-key="tv-de:sentence"]',
      ) as HTMLElement;
      expect(
        Array.from(germanSession.querySelectorAll('button')).find(
          (button) => button.textContent?.trim() === 'Start manual',
        ),
      ).toBeEnabled();
    });
  });

  // ---- M6-PRR-F01 (C1.2 / item 7): force failure releases the lifecycle --
  it('closes the force confirmation and releases the lock when the forced deletion fails', async () => {
    renderWorkspace(m6Snapshot(), [
      [
        '/api/v1/text-versions/',
        async (url, init) => {
          if (init?.method === 'DELETE' && String(url).includes('force=true')) {
            return json(500, {
              code: 'INTERNAL_ERROR',
              message: 'forced deletion failed',
              details: {},
            });
          }
          return json(409, {
            code: 'TEXT_HAS_ANNOTATIONS',
            message: 'text version has annotations',
            details: {},
          });
        },
      ],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const forceDialog = await screen.findByRole('alertdialog');
    expect(
      within(forceDialog).getByRole('heading', {
        name: 'Delete text version permanently?',
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(forceDialog).getByRole('button', { name: 'Delete permanently' }),
    );
    // A failed force request is not recoverable by retrying the same
    // confirmation: the dialog closes, the lifecycle lock is released, and the
    // existing workspace error surface stays available.
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).toBeNull(),
    );
    const sentenceSession = document.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(
        within(sentenceSession).getByRole('button', { name: 'Start manual' }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText('Workspace errors')).toBeInTheDocument();
  });

  it('keeps the interaction locked across the ordinary to force delete handoff and releases it on cancel', async () => {
    const view = renderWorkspace(m6Snapshot(), [
      [
        '/api/v1/text-versions/',
        async () => json(409, {
          code: 'TEXT_HAS_ANNOTATIONS',
          message: 'text version has annotations',
          details: {},
        }),
      ],
    ]);
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    expect(
      await screen.findByRole('heading', { name: 'Delete text version permanently?' }),
    ).toBeInTheDocument();

    const sentenceSession = await waitFor(() => {
      const session = view.container.querySelector('[data-session-key="tv-en:sentence"]');
      expect(session).not.toBeNull();
      return session as HTMLElement;
    });
    const startManual = await waitFor(() =>
      within(sentenceSession).getByRole('button', { name: 'Start manual' }),
    );
    await waitFor(() => expect(startManual).toBeDisabled());
    fireEvent.click(startManual);
    expect(within(sentenceSession).queryByText('Unsaved preview')).toBeNull();

    const forceDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(forceDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(startManual).toBeEnabled());
  });

  // ---- M6-PRR-F01 (C1.2 / item 5): hidden badge global severity ---------
  it('reports the highest-severity hidden session state instead of the last mode', async () => {
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
      [
        '/workspace',
        async () =>
          json(200, tokenLayerDeleted ? snapshotWithoutTokenLayer() : m6Snapshot()),
      ],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));

    // English gets TWO noteworthy sessions: an unsaved POS draft and a lemma
    // draft that is forced into CONFLICT when its saved token layer disappears.
    fireEvent.click(screen.getByRole('tab', { name: 'POS' }));
    const posSession = view.container.querySelector(
      '[data-session-key="tv-en:pos"]',
    ) as HTMLElement;
    const oneRow = posSession.querySelector(
      '[data-token-segment-id="token-one"]',
    ) as HTMLElement;
    fireEvent.change(within(oneRow).getByLabelText('Coarse POS for One'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Lemma' }));
    fireEvent.change(screen.getByLabelText('Lemma for One'), {
      target: { value: 'house' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent(
        'Unsaved',
      ),
    );

    // Delete the saved token layer through the confirmed UI flow.
    fireEvent.click(screen.getByRole('tab', { name: 'Token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete tokens' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete tokens',
      }),
    );
    // The lemma session becomes conflicted; the POS session stays unsaved.
    await waitFor(() =>
      expect(screen.getByLabelText('Workbench session status')).toHaveTextContent(
        'Conflict',
      ),
    );

    // Hide English and read the HIDDEN management surface itself. POS is the
    // last linguistic mode, so a last-mode-wins aggregate would say "Unsaved".
    fireEvent.click(screen.getByRole('tab', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide English panel' }));
    const hiddenToolbar = await screen.findByRole('group', { name: 'Hidden panels' });
    const reopen = await within(hiddenToolbar).findByRole('button', {
      name: 'Open English',
    });
    const hiddenEntry = reopen.parentElement as HTMLElement;
    expect(within(hiddenEntry).getByLabelText('English session status')).toHaveTextContent(
      'English — Conflict',
    );
  });

  // ---- M6-PRR-F01 (C1.2 / item 2): dirty-delete window freeze ------------
  it('freezes the Alignment surface for the whole dirty-delete warning window and recovers on cancel', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const view = renderWorkspace(threeMemberAlignedSnapshotWithNote());
    await openBoth();
    fireEvent.click(
      screen.getByRole('button', { name: 'Activate alignment grp-zeta' }),
    );
    expect(screen.getByRole('button', { name: 'Activate alignment grp-eta' })).toBeEnabled();

    // Dirty Sentence work so the ordinary DELETE must first warn, WITHOUT
    // leaving Alignment mode (the Inspector is the pivot of this test and is
    // only rendered while the Alignment task is the active destination).
    const englishSession = view.container.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    // The session is mounted but its task destination is inactive, so it is
    // `hidden`; drive the real control through the DOM directly.
    const startManual = Array.from(
      englishSession.querySelectorAll('button'),
    ).find((button) => button.textContent?.trim() === 'Start manual') as HTMLButtonElement;
    expect(startManual).toBeDefined();
    fireEvent.click(startManual);
    await waitFor(() =>
      expect(englishSession.textContent).toContain('Unsaved preview'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dirtyDialog = await screen.findByRole('alertdialog');
    expect(dirtyDialog).toHaveTextContent('unsaved work: Sentence');
    expect(dirtyDialog).not.toHaveTextContent('Alignment note');

    // WHILE THE DIRTY WARNING IS STILL OPEN the whole Alignment task surface is
    // frozen — the note cannot be edited (which is the race: a note made dirty
    // here would be cascaded away without a dirty-delete disposition).
    const note = screen.getByRole('textbox', { name: /Note/ }) as HTMLTextAreaElement;
    const removeMember = screen.getByRole('button', { name: 'Remove member “One”' });
    const deleteAlignment = screen.getByRole('button', { name: 'Delete Alignment' });
    const closeInspector = screen.getByRole('button', { name: 'Close inspector' });
    const activateOther = screen.getByRole('button', {
      name: 'Activate alignment grp-eta',
    });
    expect(note).toBeDisabled();
    fireEvent.change(note, { target: { value: 'note drafted during the warning' } });
    expect(note).toHaveValue('baseline note');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    expect(removeMember).toBeDisabled();
    expect(deleteAlignment).toBeDisabled();
    expect(closeInspector).toBeDisabled();
    expect(activateOther).toBeDisabled();

    // Cancel the workspace warning: the Alignment surface recovers and the
    // pre-existing note state is preserved.
    fireEvent.click(within(dirtyDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(note).toBeEnabled());
    expect(note).toHaveValue('baseline note');
    expect(removeMember).toBeEnabled();
    expect(deleteAlignment).toBeEnabled();
    expect(closeInspector).toBeEnabled();
    expect(activateOther).toBeEnabled();
    // The Sentence draft the warning protected is still there too.
    expect(englishSession.textContent).toContain('Unsaved preview');
  });

  // ---- M6-PRR-F01 (C1.2 / item 3): canonical activation entrances --------
  it('freezes canonical staging and canonical run/ambiguity activation while the delete lifecycle is active', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    installFetchMock([
      [
        '/api/v1/text-versions/',
        (_url, init) =>
          init?.method === 'DELETE'
            ? // Hold the ordinary DELETE so the destructive lifecycle stays
              // active for the whole assertion window below.
              new Promise<MockResponse>(() => {})
            : json(204, null),
      ],
      ['/workspace', () => json(200, ambiguityAlignedSnapshotWithNote())],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openBoth();
    const englishPanel = view.container.querySelector(
      '.text-panel[data-text-version-id="tv-en"]',
    ) as HTMLElement;
    const runs = Array.from(englishPanel.querySelectorAll('[data-run]')) as HTMLElement[];
    const ambiguousRun = runs.find(
      (run) => (run.textContent ?? '') === 'One',
    ) as HTMLElement;
    const betaOnlyRun = runs.find(
      (run) => (run.textContent ?? '') === 'sentence',
    ) as HTMLElement;
    expect(ambiguousRun).toBeDefined();
    expect(betaOnlyRun).toBeDefined();

    // Baseline: the grp-eta-only run really can change the active alignment.
    const activateAlpha = screen.getByRole('button', {
      name: 'Activate alignment grp-zeta',
    });
    fireEvent.click(activateAlpha);
    fireEvent.click(betaOnlyRun);
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Alignment inspector' })).getByRole(
          'heading',
          { level: 3 },
        ),
      ).toHaveTextContent('Alignment grp-eta'),
    );
    fireEvent.click(activateAlpha);
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Alignment inspector' })).getByRole(
          'heading',
          { level: 3 },
        ),
      ).toHaveTextContent('Alignment grp-zeta'),
    );

    // Baseline: native selection capture still works and stages.
    stubSelection(view.container, 0, 3);
    const englishRoot = englishPanel.querySelector('[data-text-content-root]') as HTMLElement;
    fireEvent.mouseUp(englishRoot);
    const addToAlignment = within(englishPanel).getByRole('button', {
      name: 'Add to Alignment',
    });
    await waitFor(() => expect(addToAlignment).toBeEnabled());
    fireEvent.click(addToAlignment);
    await screen.findByRole('button', { name: /Remove “One” from tray/ });

    // Start the CLEAN-version TextVersion delete lifecycle (no confirmation).
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete English' })).toBeDisabled(),
    );

    // 1. Staging cannot grow the tray: another canonical selection may still
    //    be captured natively, but the action is inert and the tray never grows.
    //    Re-query each time — the panel subtree is re-rendered by the lock.
    const currentAddToAlignment = () =>
      within(
        view.container.querySelector(
          '.text-panel[data-text-version-id="tv-en"]',
        ) as HTMLElement,
      ).getByRole('button', { name: 'Add to Alignment' });
    stubSelection(view.container, 1, 3);
    fireEvent.mouseUp(englishRoot);
    await waitFor(() => expect(currentAddToAlignment()).toBeDisabled());
    fireEvent.click(currentAddToAlignment());
    expect(screen.getAllByRole('button', { name: /from tray/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Remove “One” from tray/ })).toBeInTheDocument();

    // 2. A canonical run click cannot switch the active alignment.
    fireEvent.click(betaOnlyRun);
    expect(
      within(screen.getByRole('region', { name: 'Alignment inspector' })).getByRole(
        'heading',
        { level: 3 },
      ),
    ).toHaveTextContent('Alignment grp-zeta');

    // 3. The ambiguity chooser cannot even open while frozen, and if it were
    //    already open its options would be inert.
    fireEvent.click(ambiguousRun);
    expect(screen.queryByRole('group', { name: /Choose an alignment group/ })).toBeNull();
  });

  // ---- M6-PRR-F03: hidden management surface exposes session state -------

  it('exposes a hidden TextVersion unsaved session state on the hidden management surface itself', async () => {
    const view = renderWorkspace(m6Snapshot());
    await openBoth();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector(
      '[data-session-key="tv-en:sentence"]',
    ) as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() =>
      expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide English panel' }));
    const hiddenToolbar = screen.getByRole('group', { name: 'Hidden panels' });
    const reopen = await within(hiddenToolbar).findByRole('button', { name: 'Open English' });

    // The hidden-version management surface itself — not the global Workbench
    // session summary — must identify the dirty hidden version.
    const hiddenEntry = reopen.parentElement as HTMLElement;
    expect(hiddenEntry).not.toBe(hiddenToolbar);
    expect(within(hiddenEntry).getByLabelText('English session status')).toHaveTextContent(
      'English — Unsaved',
    );
    // The button's accessible name is unchanged.
    expect(reopen).toHaveTextContent('Open English');

    fireEvent.click(reopen);
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();
  });

  // ---- M6-PRR-F01 (C1.1): Alignment task surface lifecycle lock ----------

  it('freezes the complete Alignment task surface across the TextVersion delete lifecycle', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    let resolveDelete: ((value: MockResponse) => void) | undefined;
    let patchCalls = 0;
    installFetchMock([
      [
        '/api/v1/text-versions/',
        (_url, init) => {
          if (init?.method === 'DELETE') {
            return new Promise<MockResponse>((resolve) => {
              resolveDelete = resolve;
            });
          }
          return json(204, null);
        },
      ],
      [
        '/alignments/',
        (_url, init) => {
          if (init?.method === 'PATCH') {
            patchCalls += 1;
          }
          return json(200, {
            id: 'alignment-1',
            document_id: 'doc-1',
            note: 'baseline note',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            members: [],
          });
        },
      ],
      ['/workspace', () => json(200, threeMemberAlignedSnapshotWithNoteAndOther())],
    ]);
    const view = renderPageAt(
      <WorkspacePage />,
      '/documents/:documentId/workspace',
      '/documents/doc-1/workspace',
    );
    await openBoth();
    // Stage one pending tray member so the tray has real state to protect.
    stubSelection(view.container, 0, 3);
    const englishRoot = view.container.querySelector(
      '.text-panel [data-text-content-root]',
    );
    fireEvent.mouseUp(englishRoot as HTMLElement);
    const englishTextPanel = view.container.querySelector(
      '[data-text-version-id="tv-en"]',
    )?.closest('.panel-slot') as HTMLElement;
    fireEvent.click(
      within(englishTextPanel).getByRole('button', { name: 'Add to Alignment' }),
    );
    const trayRemove = await screen.findByRole('button', {
      name: /Remove “One” from tray/,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Activate alignment grp-zeta' }),
    );

    const note = screen.getByRole('textbox', { name: /Note/ }) as HTMLTextAreaElement;
    const saveNote = screen.getByRole('button', { name: 'Save note' });
    const removeMember = screen.getByRole('button', {
      name: 'Remove member “One”',
    });
    const deleteAlignment = screen.getByRole('button', { name: 'Delete Alignment' });
    const closeInspector = screen.getByRole('button', { name: 'Close inspector' });
    const activateOther = screen.getByRole('button', {
      name: 'Activate alignment grp-eta',
    });
    expect(note).toBeEnabled();
    expect(removeMember).toBeEnabled();
    expect(deleteAlignment).toBeEnabled();
    expect(trayRemove).toBeEnabled();

    // The Inspector note is CLEAN, so no dirty confirmation arms and the
    // ordinary DELETE starts immediately; the request is held pending.
    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    await waitFor(() => expect(resolveDelete).toBeTypeOf('function'));

    // While the TextVersion destructive lifecycle is active, the ENTIRE
    // Alignment task interaction surface is frozen against new drafts and
    // persisted alignment mutations.
    expect(note).toBeDisabled();
    fireEvent.change(note, { target: { value: 'draft created during delete' } });
    expect(note).toHaveValue('baseline note');
    expect(saveNote).toBeDisabled();
    fireEvent.click(saveNote);
    expect(removeMember).toBeDisabled();
    fireEvent.click(removeMember);
    expect(deleteAlignment).toBeDisabled();
    fireEvent.click(deleteAlignment);
    expect(closeInspector).toBeDisabled();
    expect(trayRemove).toBeDisabled();
    fireEvent.click(trayRemove);
    expect(screen.getByText('“One”')).toBeInTheDocument();
    // Switching to another saved alignment cannot bypass the freeze either.
    expect(activateOther).toBeDisabled();
    fireEvent.click(activateOther);
    // The active group never switched away from the one owning the draft.
    const inspector = screen.getByRole('region', { name: 'Alignment inspector' });
    expect(within(inspector).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Alignment grp-zeta',
    );
    expect(note).toHaveValue('baseline note');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Cancel this attempt: the alignment surface recovers, the note draft is
    // preserved and a real edit + save still works.
    await act(async () => {
      resolveDelete?.({
        status: 409,
        body: {
          code: 'TEXT_HAS_ANNOTATIONS',
          message: 'text version has annotations',
          details: {},
        },
      });
      await Promise.resolve();
    });
    const forceDialog = await screen.findByRole('alertdialog');
    expect(
      screen.getByRole('heading', { name: 'Delete text version permanently?' }),
    ).toBeInTheDocument();
    fireEvent.click(within(forceDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await waitFor(() => expect(note).toBeEnabled());
    expect(note).toHaveValue('baseline note');
    expect(removeMember).toBeEnabled();
    expect(deleteAlignment).toBeEnabled();
    expect(closeInspector).toBeEnabled();

    fireEvent.change(note, { target: { value: 'edited after cancellation' } });
    expect(note).toHaveValue('edited after cancellation');
    expect(saveNote).toBeEnabled();
    fireEvent.click(saveNote);
    await waitFor(() => expect(patchCalls).toBe(1));
    expect(view.container.querySelector('[data-session-key="tv-en:lemma"]')).not.toBeNull();
  });
});
