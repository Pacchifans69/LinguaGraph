/**
 * AlignmentTray tests (M0.4): the pending-only tray renders staged members
 * with their TextVersion language/label and quote, supports remove-one and
 * clear-all, and NEVER offers a persistence-capable Create Alignment action
 * (client state only; ADR-007).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingSpan } from '../../shared/text/types';
import { AlignmentTray } from './AlignmentTray';
import type { TextVersion } from './api';

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

function member(overrides: Partial<PendingSpan> = {}): PendingSpan {
  return {
    textVersionId: 'tv-en',
    contentHash: 'abc',
    start: 2,
    end: 17,
    quote: 'look forward to',
    direction: 'forward',
    ...overrides,
  };
}

describe('AlignmentTray', () => {
  it('shows an empty state when there are no pending members', () => {
    render(
      <AlignmentTray
        members={[]}
        versionsById={{}}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear tray' })).toBeDisabled();
  });

  it('lists pending members with language tag, label and quote', () => {
    const versionsById: Record<string, TextVersion> = {
      'tv-en': version(),
      'tv-de': version({
        id: 'tv-de',
        language_tag: 'de',
        label: 'German',
        content: 'Ich freue mich darauf.',
        content_hash: 'h-de',
      }),
    };
    render(
      <AlignmentTray
        members={[
          member(),
          member({
            textVersionId: 'tv-de',
            contentHash: 'h-de',
            start: 4,
            end: 21,
            quote: 'freue mich darauf',
          }),
        ]}
        versionsById={versionsById}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('en — English')).toBeInTheDocument();
    expect(screen.getByText('de — German')).toBeInTheDocument();
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
    expect(screen.getByText('“freue mich darauf”')).toBeInTheDocument();
  });

  it('falls back to the version id when the TextVersion is unknown', () => {
    render(
      <AlignmentTray
        members={[member({ textVersionId: 'tv-gone' })]}
        versionsById={{}}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('tv-gone')).toBeInTheDocument();
  });

  it('removes one pending member by its identity', () => {
    const onRemove = vi.fn();
    const target = member();
    render(
      <AlignmentTray
        members={[target]}
        versionsById={{ 'tv-en': version() }}
        onRemove={onRemove}
        onClear={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove “look forward to” from tray' }),
    );
    expect(onRemove).toHaveBeenCalledWith(target);
  });

  it('clears the whole tray explicitly', () => {
    const onClear = vi.fn();
    render(
      <AlignmentTray
        members={[member()]}
        versionsById={{ 'tv-en': version() }}
        onRemove={() => {}}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear tray' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('makes clear that members are pending-only (no persistence action)', () => {
    render(
      <AlignmentTray
        members={[member()]}
        versionsById={{ 'tv-en': version() }}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    // No Create Alignment / Save action exists in M0.4.
    expect(
      screen.queryByRole('button', { name: /create alignment/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/browser only/i)).toBeInTheDocument();
  });
});
