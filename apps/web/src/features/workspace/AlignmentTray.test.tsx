/**
 * AlignmentTray tests (M0.4 + M0.5): renders staged members with their
 * TextVersion language/label and quote, supports remove-one and clear-all,
 * and (M0.5) exposes the persistence-capable Create Alignment action with
 * the frozen validity rule: enabled only with >=2 members from >=2 distinct
 * TextVersions (frozen contract section 20).
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

function renderTray({
  members = [] as PendingSpan[],
  versionsById = {} as Record<string, TextVersion>,
  canCreate = false,
  onCreate = () => {},
  isCreating = false,
  onRemove = () => {},
  onClear = () => {},
} = {}) {
  return render(
    <AlignmentTray
      members={members}
      versionsById={versionsById}
      onRemove={onRemove}
      onClear={onClear}
      canCreate={canCreate}
      onCreate={onCreate}
      isCreating={isCreating}
    />,
  );
}

describe('AlignmentTray', () => {
  it('shows an empty state when there are no pending members', () => {
    renderTray();
    expect(screen.getByText('No pending selections.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear tray' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
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
    renderTray({
      members: [
        member(),
        member({
          textVersionId: 'tv-de',
          contentHash: 'h-de',
          start: 4,
          end: 21,
          quote: 'freue mich darauf',
        }),
      ],
      versionsById,
      canCreate: true,
    });
    expect(screen.getByText('en — English')).toBeInTheDocument();
    expect(screen.getByText('de — German')).toBeInTheDocument();
    expect(screen.getByText('“look forward to”')).toBeInTheDocument();
    expect(screen.getByText('“freue mich darauf”')).toBeInTheDocument();
  });

  it('falls back to the version id when the TextVersion is unknown', () => {
    renderTray({ members: [member({ textVersionId: 'tv-gone' })] });
    expect(screen.getByText('tv-gone')).toBeInTheDocument();
  });

  it('removes one pending member by its identity', () => {
    const onRemove = vi.fn();
    const target = member();
    renderTray({
      members: [target],
      versionsById: { 'tv-en': version() },
      onRemove,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove “look forward to” from tray' }),
    );
    expect(onRemove).toHaveBeenCalledWith(target);
  });

  it('clears the whole tray explicitly', () => {
    const onClear = vi.fn();
    renderTray({
      members: [member()],
      versionsById: { 'tv-en': version() },
      onClear,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear tray' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('makes clear that pending members are browser-only until saved', () => {
    renderTray({ members: [member()], versionsById: { 'tv-en': version() } });
    expect(screen.getByText(/browser only/i)).toBeInTheDocument();
  });

  it('disables Create Alignment with fewer than 2 members', () => {
    renderTray({
      members: [member()],
      versionsById: { 'tv-en': version() },
      canCreate: false,
    });
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /two different text versions/,
    );
  });

  it('disables Create Alignment with 2 members from ONE distinct TextVersion', () => {
    // Two same-version spans are not an alignment (frozen contract section
    // 10/20): the button must stay disabled even though the tray has 2 rows.
    renderTray({
      members: [
        member(),
        member({ start: 18, end: 28, quote: 'seeing you' }),
      ],
      versionsById: { 'tv-en': version() },
      canCreate: false,
    });
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /two different text versions/,
    );
  });

  it('enables Create Alignment with >=2 members from >=2 distinct TextVersions', () => {
    const onCreate = vi.fn();
    renderTray({
      members: [
        member(),
        member({
          textVersionId: 'tv-de',
          contentHash: 'h-de',
          start: 4,
          end: 21,
          quote: 'freue mich darauf',
        }),
      ],
      versionsById: { 'tv-en': version(), 'tv-de': version({ id: 'tv-de' }) },
      canCreate: true,
      onCreate,
    });
    const button = screen.getByRole('button', { name: 'Create Alignment' });
    expect(button).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('freezes the whole tray while a create request is in flight (G2-F01)', () => {
    // Create, Clear and every Remove must be disabled while the POST is
    // pending: a member staged after the request began must never be
    // silently discarded by the success-path tray clear.
    const onCreate = vi.fn();
    const onClear = vi.fn();
    const onRemove = vi.fn();
    renderTray({
      members: [
        member(),
        member({
          textVersionId: 'tv-de',
          contentHash: 'h-de',
          start: 4,
          end: 21,
          quote: 'freue mich darauf',
        }),
      ],
      versionsById: { 'tv-en': version(), 'tv-de': version({ id: 'tv-de' }) },
      canCreate: true,
      onCreate,
      onClear,
      onRemove,
      isCreating: true,
    });
    expect(screen.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear tray' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove “look forward to” from tray' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove “freue mich darauf” from tray' }),
    ).toBeDisabled();
  });
});
