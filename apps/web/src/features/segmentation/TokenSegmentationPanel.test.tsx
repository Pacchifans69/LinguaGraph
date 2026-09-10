import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import type { SegmentationLayer, TextVersion } from '../workspace/api';
import { SegmentationPanel } from './SegmentationPanel';
import { TokenSegmentationPanel } from './TokenSegmentationPanel';

const version: TextVersion = {
  id: 'tv-1', document_id: 'doc-1', language_tag: 'en', label: 'English',
  content: 'One. Two.', content_hash: 'a'.repeat(64), sort_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const sentenceLayer: SegmentationLayer = {
  id: 'sentence-1', text_version_id: version.id, granularity: 'sentence',
  basis_layer_id: null, requested_locale: 'en', resolved_locale: 'en',
  origin: 'manual', content_hash: version.content_hash,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const sentenceSegments = [
  { id: 's1', segmentation_layer_id: sentenceLayer.id, ordinal: 0, start_offset: 0, end_offset: 5, exact_text: 'One. ', is_word_like: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 's2', segmentation_layer_id: sentenceLayer.id, ordinal: 1, start_offset: 5, end_offset: 9, exact_text: 'Two.', is_word_like: null, created_at: '2026-01-01T00:00:00Z' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Render the token panel bound to a mocked token-layer mutation that fails with
 * ``SEGMENTATION_HAS_DEPENDENTS`` and the supplied ``details`` payload, then
 * trigger the blocked save. Returns the render result for direct DOM queries.
 */
function renderBlockedTokenSave(details: unknown) {
  installFetchMock([
    [
      '/segmentations/token',
      async () =>
        json(409, {
          code: 'SEGMENTATION_HAS_DEPENDENTS',
          message:
            'delete the dependent occurrence annotations before changing token segmentation',
          details,
        }),
    ],
  ]);
  const view = renderWithProviders(
    <TokenSegmentationPanel
      documentId="doc-1"
      version={version}
      sentenceLayer={sentenceLayer}
      sentenceSegments={sentenceSegments}
      savedSegments={[]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save tokens' }));
  return view;
}

/**
 * Assert the blocked-save rendering for a ``SEGMENTATION_HAS_DEPENDENTS``
 * payload whose ``details`` must NOT be specialized: the stable API error
 * surface is retained verbatim and no dependency guidance is invented.
 */
async function expectGenericStableErrorOnly(details: unknown) {
  const view = renderBlockedTokenSave(details);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
  expect(alert).toHaveTextContent(
    'delete the dependent occurrence annotations before changing token segmentation',
  );
  expect(
    view.container.querySelector('.token-annotation-dependency'),
  ).toBeNull();
}

describe('TokenSegmentationPanel', () => {
  it('explains the sentence prerequisite', () => {
    renderWithProviders(<TokenSegmentationPanel documentId="doc-1" version={version} sentenceSegments={[]} savedSegments={[]} />);
    expect(screen.getByText(/Save a sentence segmentation first/)).toBeInTheDocument();
  });

  it('constructs, classifies, splits, and sends an exact-basis token replacement', async () => {
    const { calls } = installFetchMock([['/segmentations/token', async () => json(200, { layer: {}, segments: [] })]]);
    renderWithProviders(<TokenSegmentationPanel documentId="doc-1" version={version} sentenceLayer={sentenceLayer} sentenceSegments={sentenceSegments} savedSegments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    const wordLike = screen.getAllByLabelText('Word-like');
    fireEvent.click(wordLike[0]!);
    fireEvent.change(screen.getAllByLabelText('Split at')[0]!, { target: { value: '3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Split' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save tokens' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      content_hash: version.content_hash,
      basis_sentence_layer_id: sentenceLayer.id,
      origin: 'manual',
      segments: [
        { start: 0, end: 3, is_word_like: false },
        { start: 3, end: 5, is_word_like: false },
        { start: 5, end: 9, is_word_like: true },
      ],
    });
  });

  it('shows unsupported word suggestions while manual construction and discard remain available', () => {
    vi.stubGlobal('Intl', { Segmenter: undefined });
    renderWithProviders(<TokenSegmentationPanel documentId="doc-1" version={version} sentenceLayer={sentenceLayer} sentenceSegments={sentenceSegments} savedSegments={[]} />);

    expect(screen.getByRole('button', { name: 'Generate word suggestion' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Intl.Segmenter word mode is unavailable. Manual construction remains available.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    expect(screen.getByText('Unsaved preview')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Discard preview' }));
    expect(screen.getByText('Not saved')).toBeInTheDocument();
    expect(screen.getByText('No token preview.')).toBeInTheDocument();
  });

  it('renders the stable stale-basis error returned by the API', async () => {
    installFetchMock([
      [
        '/segmentations/token',
        async () =>
          json(409, {
            code: 'STALE_SEGMENTATION_BASIS',
            message: 'token segmentation basis is not the current sentence layer',
            details: {},
          }),
      ],
    ]);
    renderWithProviders(<TokenSegmentationPanel documentId="doc-1" version={version} sentenceLayer={sentenceLayer} sentenceSegments={sentenceSegments} savedSegments={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tokens' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'STALE_SEGMENTATION_BASIS');
    expect(alert).toHaveTextContent('token segmentation basis is not the current sentence layer');
  });

  it('renders the stable multi-dependent conflict for lemma + POS dependents', async () => {
    // M5: the token layer cannot be replaced while ANY occurrence annotation
    // (lemma and/or coarse POS) depends on it. The panel presents the stable
    // envelope AND names the actual dependency set so the Human can see both
    // required cleanups.
    installFetchMock([
      [
        '/segmentations/token',
        async () =>
          json(409, {
            code: 'SEGMENTATION_HAS_DEPENDENTS',
            message:
              'delete the dependent occurrence annotations before changing token segmentation',
            details: {
              text_version_id: 'tv-1',
              token_layer_id: 'token-1',
              dependency_types: ['lemma_annotations', 'pos_annotations'],
            },
          }),
      ],
    ]);
    const view = renderWithProviders(<TokenSegmentationPanel documentId="doc-1" version={version} sentenceLayer={sentenceLayer} sentenceSegments={sentenceSegments} savedSegments={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tokens' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
    expect(alert).toHaveTextContent(
      'delete the dependent occurrence annotations before changing token segmentation',
    );
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent lemma and POS annotations before changing token segmentation.',
    );
  });

  it('names the POS cleanup when only a POS annotation depends on the token layer', async () => {
    const view = renderBlockedTokenSave({
      text_version_id: 'tv-1',
      token_layer_id: 'token-1',
      dependency_types: ['pos_annotations'],
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent POS annotations before changing token segmentation.',
    );
  });

  it('names the lemma cleanup from the legacy scalar dependency_type payload', async () => {
    // Inherited single-dependency payloads carry the scalar only: normalize it
    // to a one-element list rather than inventing a primary dependency.
    const view = renderBlockedTokenSave({
      text_version_id: 'tv-1',
      token_layer_id: 'token-1',
      dependency_type: 'lemma_annotations',
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent lemma annotations before changing token segmentation.',
    );
  });

  it('presents the canonical lemma + POS order regardless of the reported order', async () => {
    const view = renderBlockedTokenSave({
      dependency_types: ['pos_annotations', 'lemma_annotations'],
    });

    await screen.findByRole('alert');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent lemma and POS annotations before changing token segmentation.',
    );
  });

  it('names the lemma cleanup when only a lemma annotation depends on the token layer', async () => {
    const view = renderBlockedTokenSave({
      dependency_types: ['lemma_annotations'],
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent lemma annotations before changing token segmentation.',
    );
  });

  it('collapses a duplicated recognized identifier to the lemma-only cleanup', async () => {
    // Duplicates inside an otherwise complete set are collapsed, not treated as
    // an extra or unknown dependency.
    const view = renderBlockedTokenSave({
      dependency_types: ['lemma_annotations', 'lemma_annotations'],
    });

    await screen.findByRole('alert');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent lemma annotations before changing token segmentation.',
    );
  });

  it.each<[string, unknown]>([
    ['an unknown identifier only', { dependency_types: ['morphology_annotations'] }],
    ['a non-string array entry', { dependency_types: [42, null] }],
    ['an unknown legacy scalar', { dependency_type: 'syntax_annotations' }],
    ['the inherited sentence->token shape', { text_version_id: 'tv-1', sentence_layer_id: 'sentence-1' }],
    ['an empty details object', {}],
    ['null details', null],
    ['non-object details', 'lemma_annotations'],
  ])(
    'keeps the generic stable error and invents no dependency for %s',
    async (_label, details) => {
      const view = renderBlockedTokenSave(details);

      const alert = await screen.findByRole('alert');
      // The stable API error surface is retained unchanged...
      expect(alert).toHaveAttribute('data-error-code', 'SEGMENTATION_HAS_DEPENDENTS');
      expect(alert).toHaveTextContent(
        'delete the dependent occurrence annotations before changing token segmentation',
      );
      // ...and no dependency is inferred from unrecognized/malformed details.
      expect(
        view.container.querySelector('.token-annotation-dependency'),
      ).toBeNull();
    },
  );

  it('treats a recognized identifier mixed with an unknown one as a malformed complete set', async () => {
    // G2-F02: `dependency_types` is the COMPLETE authoritative set, so a
    // malformed payload must not be filtered down to its recognized subset.
    await expectGenericStableErrorOnly({
      dependency_types: ['lemma_annotations', 'morphology_annotations'],
    });
  });

  it('treats a recognized identifier mixed with a non-string member as a malformed complete set', async () => {
    await expectGenericStableErrorOnly({
      dependency_types: ['pos_annotations', 42],
    });
  });

  it('suppresses the legacy scalar when a malformed list is present alongside it', async () => {
    await expectGenericStableErrorOnly({
      dependency_types: ['lemma_annotations', 'syntax_annotations'],
      dependency_type: 'lemma_annotations',
    });
  });

  it('suppresses the legacy scalar when a non-array value is present instead of a list', async () => {
    await expectGenericStableErrorOnly({
      dependency_types: 'pos_annotations',
      dependency_type: 'pos_annotations',
    });
  });

  it('suppresses the legacy scalar when an empty list is present', async () => {
    await expectGenericStableErrorOnly({
      dependency_types: [],
      dependency_type: 'lemma_annotations',
    });
  });

  it.each<[string, unknown]>([
    ['a present null list', { dependency_types: null, dependency_type: 'lemma_annotations' }],
    ['a present numeric list', { dependency_types: 7, dependency_type: 'lemma_annotations' }],
    ['a present object list', { dependency_types: { 0: 'lemma_annotations' }, dependency_type: 'lemma_annotations' }],
    ['a list of unknown identifiers only alongside a valid scalar', { dependency_types: ['syntax_annotations'], dependency_type: 'lemma_annotations' }],
  ])(
    'keeps the generic stable error for %s',
    async (_label, details) => {
      await expectGenericStableErrorOnly(details);
    },
  );

  it('names the remaining POS cleanup after the deletion path is blocked', async () => {
    const tokenLayer: SegmentationLayer = {
      id: 'token-1', text_version_id: version.id, granularity: 'token',
      basis_layer_id: sentenceLayer.id, requested_locale: 'en',
      resolved_locale: 'en', origin: 'manual', content_hash: version.content_hash,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    installFetchMock([
      [
        '/segmentations/token',
        async () =>
          json(409, {
            code: 'SEGMENTATION_HAS_DEPENDENTS',
            message:
              'delete the dependent occurrence annotations before changing token segmentation',
            details: { dependency_types: ['pos_annotations'] },
          }),
      ],
    ]);
    const view = renderWithProviders(
      <TokenSegmentationPanel
        documentId="doc-1"
        version={version}
        sentenceLayer={sentenceLayer}
        sentenceSegments={sentenceSegments}
        savedLayer={tokenLayer}
        savedSegments={[]}
      />,
    );

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete tokens' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete tokens' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await screen.findByRole('alert');
    expect(
      view.container.querySelector('.token-annotation-dependency'),
    ).toHaveTextContent(
      'Delete the dependent POS annotations before changing token segmentation.',
    );
  });

  it('disables sentence and token controls while any segmentation mutation is pending', async () => {
    let release!: () => void;
    installFetchMock([
      [
        '/segmentations/token',
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                status: 200,
                body: { layer: {}, segments: [] },
              });
          }),
      ],
    ]);

    const view = renderWithProviders(
      <>
        <SegmentationPanel documentId="doc-1" version={version} savedSegments={[]} />
        <TokenSegmentationPanel documentId="doc-1" version={version} sentenceLayer={sentenceLayer} sentenceSegments={sentenceSegments} savedSegments={[]} />
      </>,
    );
    const tokenPanel = view.container.querySelector('.token-segmentation-panel');
    const sentencePanel = view.container.querySelector(
      '.segmentation-panel:not(.token-segmentation-panel)',
    );
    expect(tokenPanel).not.toBeNull();
    expect(sentencePanel).not.toBeNull();

    fireEvent.click(within(tokenPanel as HTMLElement).getByRole('button', { name: 'Start manual' }));
    fireEvent.click(within(tokenPanel as HTMLElement).getByRole('button', { name: 'Save tokens' }));

    await waitFor(() => {
      expect(
        within(sentencePanel as HTMLElement).getByRole('button', { name: 'Start manual' }),
      ).toBeDisabled();
      expect(
        within(tokenPanel as HTMLElement).getByRole('button', { name: 'Discard preview' }),
      ).toBeDisabled();
    });

    release();
    await waitFor(() =>
      expect(
        within(sentencePanel as HTMLElement).getByRole('button', { name: 'Start manual' }),
      ).toBeEnabled(),
    );
  });

});
