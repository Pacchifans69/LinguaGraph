/**
 * M4 LemmaAnnotationPanel tests.
 *
 * Proves the bounded Human workflow over SAVED token authority only: saved
 * token prerequisite, word-like-only eligibility, exact token preview,
 * unannotated/annotated states, create/edit/logical no-op/delete, pending
 * states, stable error presentation (validation, stale target, dependency
 * guidance), and that no unsaved token draft can ever become a lemma target.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
  TokenLemmaAnnotation,
} from '../workspace/api';
import { LemmaAnnotationPanel } from './LemmaAnnotationPanel';

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

const annotation: TokenLemmaAnnotation = {
  id: 'lemma-1',
  token_segment_id: 'tok-hello',
  lemma: 'house',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(options: {
  tokenSegments?: LinguisticSegment[];
  annotations?: Record<string, TokenLemmaAnnotation>;
  withLayer?: boolean;
} = {}) {
  return renderWithProviders(
    <LemmaAnnotationPanel
      documentId="doc-1"
      version={version}
      tokenLayer={options.withLayer === false ? undefined : tokenLayer}
      tokenSegments={options.tokenSegments ?? savedSegments}
      annotationsByTokenSegmentId={options.annotations ?? {}}
    />,
  );
}

describe('LemmaAnnotationPanel', () => {
  it('explains the saved token prerequisite when no token layer exists', () => {
    renderPanel({ withLayer: false, tokenSegments: [] });
    expect(
      screen.getByText('Save token segmentation before adding lemma annotations.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders only saved word-like tokens as lemma targets with exact text', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('.lemma-row');
    expect(rows).toHaveLength(2);
    expect(
      Array.from(rows).map((row) => row.getAttribute('data-token-segment-id')),
    ).toEqual(['tok-hello', 'tok-world']);
    // Backend-authoritative exact_text and coordinates are displayed verbatim.
    expect(screen.getByText(JSON.stringify('Hello'))).toBeInTheDocument();
    expect(screen.getByText('[0, 5)')).toBeInTheDocument();
    expect(screen.getByText(JSON.stringify('world'))).toBeInTheDocument();
    // Separator tokens are never editable lemma targets.
    expect(screen.queryByLabelText('Lemma for  ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lemma for .')).not.toBeInTheDocument();
  });

  it('reports when no word-like token is saved', () => {
    renderPanel({
      tokenSegments: [segment('tok-space', 0, 0, 1, ' ', false)],
    });
    expect(
      screen.getByText('No saved word-like tokens are available for lemma annotation.'),
    ).toBeInTheDocument();
  });

  it('shows the unannotated state and disables save until the input changes', () => {
    renderPanel();
    expect(screen.getAllByText('No lemma saved')).toHaveLength(2);
    const save = screen.getAllByRole('button', { name: 'Save lemma' })[0]!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: 'house' },
    });
    expect(save).toBeEnabled();
    // Logical no-op: reverting to the saved value disables save again.
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: '' },
    });
    expect(save).toBeDisabled();
  });

  it('shows the saved annotation state and only offers delete for it', () => {
    renderPanel({ annotations: { 'tok-hello': annotation } });
    expect(screen.getByText('house')).toBeInTheDocument();
    expect(screen.getByLabelText('Lemma for Hello')).toHaveValue('house');
    expect(screen.getAllByRole('button', { name: 'Delete lemma' })).toHaveLength(1);
  });

  it('creates a lemma through the saved token id only', async () => {
    const { calls } = installFetchMock([
      ['/lemma', async () => json(200, annotation)],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: 'house' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save lemma' })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/v1/token-segments/tok-hello/lemma');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ lemma: 'house' });
  });

  it('edits an existing annotation', async () => {
    const { calls } = installFetchMock([
      ['/lemma', async () => json(200, { ...annotation, lemma: 'houses' })],
    ]);
    renderPanel({ annotations: { 'tok-hello': annotation } });
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: 'houses' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save lemma' })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ lemma: 'houses' });
  });

  it('deletes an annotation explicitly', async () => {
    const { calls } = installFetchMock([['/lemma', async () => json(204, null)]]);
    renderPanel({ annotations: { 'tok-hello': annotation } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete lemma' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe('/api/v1/token-segments/tok-hello/lemma');
    expect(calls[0]?.init?.method).toBe('DELETE');
  });

  it('shows a pending state while saving and locks the row', async () => {
    let release!: () => void;
    installFetchMock([
      [
        '/lemma',
        () =>
          new Promise((resolve) => {
            release = () => resolve({ status: 200, body: annotation });
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: 'house' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save lemma' })[0]!);

    const pending = await screen.findByRole('button', { name: 'Saving…' });
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText('Lemma for Hello')).toBeDisabled();
    expect(screen.getByLabelText('Lemma for world')).toBeDisabled();

    release();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument(),
    );
  });

  it('presents a validation failure with the stable error code', async () => {
    installFetchMock([
      [
        '/lemma',
        async () =>
          json(422, {
            code: 'INVALID_LEMMA_VALUE',
            message: 'lemma value is invalid',
            details: { reason: 'lemma must not be empty' },
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: '  ' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save lemma' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'INVALID_LEMMA_VALUE');
    expect(alert).toHaveTextContent('lemma value is invalid');
  });

  it('presents a stale/NOT_FOUND target after refetch', async () => {
    installFetchMock([
      [
        '/lemma',
        async () =>
          json(404, {
            code: 'NOT_FOUND',
            message: 'token segment not found',
            details: {},
          }),
      ],
    ]);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Lemma for Hello'), {
      target: { value: 'house' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save lemma' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'NOT_FOUND');
    expect(
      await screen.findByText(
        'This token is no longer part of the saved token layer. Reload and annotate a current token.',
      ),
    ).toBeInTheDocument();
  });

  it('presents the retokenization dependency constraint for annotated tokens', () => {
    renderPanel({ annotations: { 'tok-hello': annotation } });
    expect(
      screen.getByText(
        'Saved tokens with lemma annotations cannot be replaced or deleted until those annotations are removed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 annotated / 2 word-like')).toBeInTheDocument();
  });

  it('never binds a lemma target to unsaved token draft identity', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('.lemma-row');
    // Every row identity comes from the saved segment collection; there is no
    // draft/ordinal-based identity in the DOM.
    const ids = Array.from(rows).map((row) =>
      row.getAttribute('data-token-segment-id'),
    );
    expect(ids).toEqual(['tok-hello', 'tok-world']);
    expect(container.querySelector('[data-token-draft-id]')).toBeNull();
    expect(
      within(
        container.querySelector('.lemma-annotation-panel') as HTMLElement,
      ).getAllByRole('button', { name: 'Save lemma' })[0],
    ).toBeDisabled();
  });
});
