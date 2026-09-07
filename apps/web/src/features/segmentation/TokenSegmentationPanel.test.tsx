import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import type { SegmentationLayer, TextVersion } from '../workspace/api';
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
});
