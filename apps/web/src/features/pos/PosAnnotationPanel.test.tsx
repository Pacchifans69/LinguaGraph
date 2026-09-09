/**
 * M5 PosAnnotationPanel tests.
 *
 * Proves the bounded Human workflow over SAVED token authority only: saved
 * token prerequisite, word-like-only eligibility, exact token preview, the
 * exact fifteen-value controlled selector, unannotated/annotated states,
 * create/edit/logical no-op/delete, pending states, stable error presentation
 * (invalid value, invalid target, stale target), sibling independence from
 * lemma, and that no unsaved token draft can ever become a POS target.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
  TokenPosAnnotation,
} from '../workspace/api';
import { POS_TAGS } from '../workspace/api';
import { PosAnnotationPanel } from './PosAnnotationPanel';

const version: TextVersion = {
  id: 'tv-1',
  document_id: 'doc-1',
  language_tag: 'en',
  label: 'English',
  content: 'Hello world. Bye!',
  content_hash: 'a'.repeat(64),
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const tokenLayer: SegmentationLayer = {
  id: 'token-1',
  text_version_id: version.id,
  granularity: 'token',
  basis_layer_id: 'sentence-1',
  requested_locale: 'en',
  resolved_locale: 'en',
  origin: 'manual',
  content_hash: version.content_hash,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function segment(
  id: string,
  ordinal: number,
  start: number,
  end: number,
  exact_text: string,
  is_word_like: boolean | null,
): LinguisticSegment {
  return {
    id,
    segmentation_layer_id: tokenLayer.id,
    ordinal,
    start_offset: start,
    end_offset: end,
    exact_text,
    is_word_like,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const savedSegments: LinguisticSegment[] = [
  segment('tok-hello', 0, 0, 5, 'Hello', true),
  segment('tok-space', 1, 5, 6, ' ', false),
  segment('tok-world', 2, 6, 11, 'world', true),
  segment('tok-stop', 3, 11, 12, '.', false),
];

const annotation: TokenPosAnnotation = {
  id: 'pos-1',
  token_segment_id: 'tok-hello',
  pos_tag: 'NOUN',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(
  options: {
    tokenSegments?: LinguisticSegment[];
    annotations?: Record<string, TokenPosAnnotation>;
    withLayer?: boolean;
    lemmaTokenSegmentIds?: ReadonlySet<string>;
  } = {},
) {
  return renderWithProviders(
    <PosAnnotationPanel
      documentId="doc-1"
      version={version}
      tokenLayer={options.withLayer === false ? undefined : tokenLayer}
      tokenSegments={options.tokenSegments ?? savedSegments}
      posAnnotationsByTokenSegmentId={options.annotations ?? {}}
      lemmaTokenSegmentIds={options.lemmaTokenSegmentIds}
    />,
  );
}

describe('PosAnnotationPanel', () => {
  it('explains the saved token prerequisite when no token layer exists', () => {
    renderPanel({ withLayer: false, tokenSegments: [] });
    expect(
      screen.getByText('Save token segmentation before adding POS annotations.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders only saved word-like tokens as POS targets with exact text', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('.pos-row');
    expect(rows).toHaveLength(2);
    expect(
      Array.from(rows).map((row) => row.getAttribute('data-token-segment-id')),
    ).toEqual(['tok-hello', 'tok-world']);
    // Backend-authoritative exact_text and coordinates are displayed verbatim.
    expect(screen.getByText(JSON.stringify('Hello'))).toBeInTheDocument();
    expect(screen.getByText('[0, 5)')).toBeInTheDocument();
    expect(screen.getByText(JSON.stringify('world'))).toBeInTheDocument();
    // Separator tokens are never editable POS targets.
    expect(screen.queryByLabelText('Coarse POS for  ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Coarse POS for .')).not.toBeInTheDocument();
  });

  it('reports when no word-like token is saved', () => {
    renderPanel({ tokenSegments: [segment('tok-space', 0, 0, 1, ' ', false)] });
    expect(
      screen.getByText('No saved word-like tokens are available for POS annotation.'),
    ).toBeInTheDocument();
  });

  it('exposes a controlled selector with exactly the fifteen frozen tags', () => {
    renderPanel();
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const placeholder = Array.from(select.options).filter(
      (option) => option.value === '',
    );
    // The empty placeholder is not a tag value and is not selectable.
    expect(placeholder).toHaveLength(1);
    expect(placeholder[0]).toBeDisabled();
    const values = Array.from(select.options)
      .map((option) => option.value)
      .filter((value) => value !== '');
    expect(values).toEqual([...POS_TAGS]);
    expect(values).toHaveLength(15);
    expect(values).not.toContain('PUNCT');
    expect(values).not.toContain('SYM');
    // Controlled: no free-text POS input exists anywhere in the panel.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the unannotated state and disables save until a value is chosen', () => {
    renderPanel();
    expect(screen.getAllByText('No POS saved')).toHaveLength(2);
    const save = screen.getAllByRole('button', { name: 'Save POS' })[0]!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    expect(save).toBeEnabled();
  });

  it('shows the saved annotation state and only offers delete for it', () => {
    renderPanel({ annotations: { 'tok-hello': annotation } });
    expect(screen.getByText('NOUN', { selector: '.pos-saved-value' })).toBeInTheDocument();
    expect(screen.getByLabelText('Coarse POS for Hello')).toHaveValue('NOUN');
    expect(screen.getAllByRole('button', { name: 'Delete POS' })).toHaveLength(1);
  });

  it('creates a POS annotation through the saved token id only', async () => {
    const { calls } = installFetchMock([['/pos', async () => json(200, annotation)]]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/v1/token-segments/tok-hello/pos');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ pos_tag: 'NOUN' });
  });

  it('edits an existing annotation', async () => {
    const { calls } = installFetchMock([
      ['/pos', async () => json(200, { ...annotation, pos_tag: 'VERB' })],
    ]);
    renderPanel({ annotations: { 'tok-hello': annotation } });
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'VERB' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ pos_tag: 'VERB' });
  });

  it('treats re-selecting the persisted value as a logical no-op', async () => {
    const { calls } = installFetchMock([['/pos', async () => json(200, annotation)]]);
    renderPanel({ annotations: { 'tok-hello': annotation } });
    const save = screen.getAllByRole('button', { name: 'Save POS' })[0]!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'VERB' },
    });
    expect(save).toBeEnabled();
    // Returning to the persisted value restores the logical no-op state.
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    expect(save).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it('deletes an annotation explicitly', async () => {
    const { calls } = installFetchMock([['/pos', async () => json(204, null)]]);
    renderPanel({ annotations: { 'tok-hello': annotation } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete POS' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/v1/token-segments/tok-hello/pos');
    expect(calls[0]?.init?.method).toBe('DELETE');
  });

  it('shows a pending state while saving and locks every row', async () => {
    let release!: () => void;
    installFetchMock([
      [
        '/pos',
        () =>
          new Promise((resolve) => {
            release = () => resolve({ status: 200, body: annotation });
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);

    const pending = await screen.findByRole('button', { name: 'Saving…' });
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText('Coarse POS for Hello')).toBeDisabled();
    expect(screen.getByLabelText('Coarse POS for world')).toBeDisabled();

    release();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument(),
    );
  });

  it('presents INVALID_POS_VALUE with the stable error code and guidance', async () => {
    installFetchMock([
      [
        '/pos',
        async () =>
          json(422, {
            code: 'INVALID_POS_VALUE',
            message: 'pos_tag is not one of the fifteen frozen coarse POS values',
            details: { reason: 'not_in_frozen_pos_vocabulary' },
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'INVALID_POS_VALUE');
    expect(
      await screen.findByText('Choose one of the fifteen frozen coarse POS values.'),
    ).toBeInTheDocument();
  });

  it('presents INVALID_POS_TARGET for an ineligible target', async () => {
    installFetchMock([
      [
        '/pos',
        async () =>
          json(422, {
            code: 'INVALID_POS_TARGET',
            message: 'token segment is not an eligible word-like POS target',
            details: { reason: 'not_word_like' },
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'INVALID_POS_TARGET');
    expect(
      await screen.findByText(
        'Only saved word-like tokens can carry a coarse POS annotation.',
      ),
    ).toBeInTheDocument();
  });

  it('presents a stale/NOT_FOUND target after refetch', async () => {
    installFetchMock([
      [
        '/pos',
        async () =>
          json(404, {
            code: 'NOT_FOUND',
            message: 'token segment not found',
            details: {},
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Coarse POS for Hello'), {
      target: { value: 'NOUN' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save POS' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'NOT_FOUND');
    expect(
      await screen.findByText(
        'This token is no longer part of the saved token layer. Reload and annotate a current token.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps POS independent from lemma: POS without lemma', () => {
    renderPanel({ annotations: { 'tok-hello': annotation } });
    expect(screen.getByText('1 annotated / 2 word-like')).toBeInTheDocument();
    expect(
      screen.getByText('NOUN', { selector: '.pos-saved-value' }),
    ).toBeInTheDocument();
    // No lemma value or lemma control is derived from POS state.
    expect(screen.queryByLabelText(/lemma/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps POS independent from lemma: lemma without POS', () => {
    renderPanel({ lemmaTokenSegmentIds: new Set(['tok-world']) });
    expect(screen.getAllByText('No POS saved')).toHaveLength(2);
    expect(screen.queryAllByRole('button', { name: 'Delete POS' })).toHaveLength(0);
  });

  it('keeps POS independent from lemma: lemma and POS coexist', () => {
    renderPanel({
      annotations: { 'tok-hello': annotation },
      lemmaTokenSegmentIds: new Set(['tok-hello', 'tok-world']),
    });
    expect(screen.getByText('NOUN', { selector: '.pos-saved-value' })).toBeInTheDocument();
    expect(screen.getAllByText('No POS saved')).toHaveLength(1);
  });

  it('presents the multi-dependent retokenization constraint and recovery', () => {
    const { rerender } = renderWithProviders(
      <PosAnnotationPanel
        documentId="doc-1"
        version={version}
        tokenLayer={tokenLayer}
        tokenSegments={savedSegments}
        posAnnotationsByTokenSegmentId={{ 'tok-hello': annotation }}
        lemmaTokenSegmentIds={new Set(['tok-hello'])}
      />,
    );
    expect(
      screen.getByText(
        'Saved tokens with lemma and/or POS annotations cannot be replaced or deleted until every one of those occurrence annotations is removed.',
      ),
    ).toBeInTheDocument();

    // Recovery: with every sibling annotation removed, the constraint is gone.
    rerender(
      <PosAnnotationPanel
        documentId="doc-1"
        version={version}
        tokenLayer={tokenLayer}
        tokenSegments={savedSegments}
        posAnnotationsByTokenSegmentId={{}}
        lemmaTokenSegmentIds={new Set()}
      />,
    );
    expect(
      screen.queryByText(
        'Saved tokens with lemma and/or POS annotations cannot be replaced or deleted until every one of those occurrence annotations is removed.',
      ),
    ).not.toBeInTheDocument();
  });

  it('never binds a POS target to unsaved token draft identity', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('.pos-row');
    const ids = Array.from(rows).map((row) =>
      row.getAttribute('data-token-segment-id'),
    );
    // Every row identity comes from the saved segment collection; there is no
    // draft/ordinal-based identity in the DOM.
    expect(ids).toEqual(['tok-hello', 'tok-world']);
    expect(container.querySelector('[data-token-draft-id]')).toBeNull();
    expect(
      (container.querySelector('.pos-annotation-panel select') as HTMLSelectElement)
        .value,
    ).toBe('');
  });
});
