import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPageAt } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
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

function renderWorkspace() {
  installFetchMock([['/workspace', () => json(200, m6Snapshot())]]);
  return renderPageAt(
    <WorkspacePage />,
    '/documents/:documentId/workspace',
    '/documents/doc-1/workspace',
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

    fireEvent.click(screen.getByRole('button', { name: 'Delete English' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('unsaved linguistic work');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(englishSession).getByText('Unsaved preview')).toBeInTheDocument();
  });

  it('registers native leave protection and requires disposition for document links', async () => {
    const view = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Open English' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sentence' }));
    const englishSession = view.container.querySelector('[data-session-key="tv-en:sentence"]') as HTMLElement;
    fireEvent.click(within(englishSession).getByRole('button', { name: 'Start manual' }));
    await waitFor(() => expect(screen.getByLabelText('Workbench session status')).toHaveTextContent('Unsaved'));

    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Workspace — M6 document' })).toBeInTheDocument();

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
});
