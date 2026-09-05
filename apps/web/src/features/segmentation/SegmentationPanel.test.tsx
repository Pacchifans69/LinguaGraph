import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentationPanel } from './SegmentationPanel';
import type {
  LinguisticSegment,
  SegmentationLayer,
  TextVersion,
} from '../workspace/api';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';

const version: TextVersion = {
  id: 'tv-en',
  document_id: 'doc-1',
  language_tag: 'en',
  label: 'English',
  content: 'One. Two.',
  content_hash: 'a'.repeat(64),
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SegmentationPanel', () => {
  it('supports manual preview, code-point split, discard, and atomic save', async () => {
    const { calls } = installFetchMock([
      [
        '/segmentations/sentence',
        async (_url, init) => {
          const payload = JSON.parse(String(init?.body));
          return json(200, {
            layer: {
              id: 'layer-1',
              text_version_id: version.id,
              granularity: 'sentence',
              requested_locale: payload.requested_locale,
              resolved_locale: payload.resolved_locale,
              origin: payload.origin,
              content_hash: payload.content_hash,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
            segments: [],
          });
        },
      ],
    ]);
    renderWithProviders(
      <SegmentationPanel
        documentId="doc-1"
        version={version}
        savedSegments={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    expect(screen.getByText('1. [0, 9)')).toBeInTheDocument();
    expect(screen.getByText('Unsaved preview')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Split at'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(screen.getByText('1. [0, 5)')).toBeInTheDocument();
    expect(screen.getByText('2. [5, 9)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard preview' }));
    expect(screen.queryByText('1. [0, 5)')).not.toBeInTheDocument();
    expect(screen.getByText(/No preview/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start manual' }));
    fireEvent.change(screen.getByLabelText('Split at'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save segmentation' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      content_hash: version.content_hash,
      requested_locale: 'en',
      resolved_locale: 'en',
      origin: 'manual',
      segments: [
        { start: 0, end: 5 },
        { start: 5, end: 9 },
      ],
    });
  });

  it('reloads an authoritative partition, merges adjacent rows, and confirms delete', async () => {
    const layer: SegmentationLayer = {
      id: 'layer-1',
      text_version_id: version.id,
      granularity: 'sentence',
      requested_locale: 'en',
      resolved_locale: 'en-US',
      origin: 'intl_segmenter',
      content_hash: version.content_hash,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const segments: LinguisticSegment[] = [
      {
        id: 'segment-1',
        segmentation_layer_id: layer.id,
        ordinal: 0,
        start_offset: 0,
        end_offset: 5,
        exact_text: 'One. ',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'segment-2',
        segmentation_layer_id: layer.id,
        ordinal: 1,
        start_offset: 5,
        end_offset: 9,
        exact_text: 'Two.',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const { calls } = installFetchMock([
      [
        '/segmentations/sentence',
        () => Promise.resolve({ status: 204, body: null }),
      ],
    ]);
    renderWithProviders(
      <SegmentationPanel
        documentId="doc-1"
        version={version}
        savedLayer={layer}
        savedSegments={segments}
      />,
    );

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('2. [5, 9)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge previous' }));
    expect(screen.getByText('1. [0, 9)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete segmentation' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Alignment spans and groups are preserved');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete segmentation' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.method).toBe('DELETE');
  });
});
