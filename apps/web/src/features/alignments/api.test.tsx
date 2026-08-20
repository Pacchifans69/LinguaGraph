/**
 * Alignment API hook tests (M0.5).
 *
 * REQUEST CONSTRUCTION (frozen contract sections 6/7): the persistence
 * member boundary contains ONLY text_version_id/start/end — quote,
 * direction and contentHash are frontend-only metadata and must never be
 * serialized into the request.
 *
 * SUCCESS: the ['workspace', documentId] query is invalidated so the
 * authoritative snapshot refetches. FAILURE: the stable envelope is
 * surfaced as an ApiError and nothing is invalidated optimistically.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingToMemberInput, useCreateAlignment } from './api';
import { useWorkspace, type WorkspaceSnapshot } from '../workspace/api';
import { ApiError } from '../../shared/api/client';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json } from '../../test/mockFetch';
import type { PendingSpan } from '../../shared/text/types';

function emptySnapshot(): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1',
      project_id: 'p',
      title: 'D',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: [],
    spans: [],
    alignment_groups: [],
    alignment_members: [],
  };
}

function pending(overrides: Partial<PendingSpan> = {}): PendingSpan {
  return {
    textVersionId: 'tv-en',
    contentHash: 'hash-123',
    start: 2,
    end: 17,
    quote: 'look forward to',
    direction: 'forward',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pendingToMemberInput', () => {
  it('maps ONLY textVersionId/start/end; drops quote, direction and contentHash', () => {
    const input = pendingToMemberInput(pending());
    expect(input).toEqual({ text_version_id: 'tv-en', start: 2, end: 17 });
    expect(input).not.toHaveProperty('quote');
    expect(input).not.toHaveProperty('direction');
    expect(input).not.toHaveProperty('contentHash');
    expect(input).not.toHaveProperty('content_hash');
  });
});

describe('useCreateAlignment', () => {
  it('POSTs coordinates only and invalidates the workspace query on success', async () => {
    let workspaceFetches = 0;
    let postedBody: unknown = null;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, emptySnapshot());
        },
      ],
      [
        '/alignments',
        (_url, init) => {
          postedBody = JSON.parse(String(init?.body));
          return json(201, {
            id: 'al-1',
            document_id: 'doc-1',
            note: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            members: [
              {
                id: 'am-1',
                span_id: 'sp-1',
                text_version_id: 'tv-en',
                start: 2,
                end: 17,
                exact_text: 'look forward to',
              },
            ],
          });
        },
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const create = useCreateAlignment('doc-1');
      return (
        <div>
          <span data-testid="fetches">
            {workspace.data ? workspaceFetches : 'loading'}
          </span>
          <button
            onClick={() =>
              create.mutate({
                members: [
                  pendingToMemberInput(pending()),
                  pendingToMemberInput(
                    pending({
                      textVersionId: 'tv-de',
                      contentHash: 'hash-456',
                      start: 4,
                      end: 22,
                      quote: 'freue mich darauf',
                      direction: 'backward',
                    }),
                  ),
                ],
              })
            }
          >
            create
          </button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('fetches')).toHaveTextContent('1'));

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toEqual({
      members: [
        { text_version_id: 'tv-en', start: 2, end: 17 },
        { text_version_id: 'tv-de', start: 4, end: 22 },
      ],
    });
    // No quote/direction/contentHash anywhere in the request body.
    const serialized = JSON.stringify(postedBody);
    expect(serialized).not.toContain('quote');
    expect(serialized).not.toContain('direction');
    expect(serialized).not.toContain('contentHash');
    expect(serialized).not.toContain('hash-123');

    // The workspace query was invalidated and refetched.
    await waitFor(() => expect(workspaceFetches).toBeGreaterThan(1));
  });

  it('surfaces the stable error envelope on failure', async () => {
    installFetchMock([
      [
        '/alignments',
        () =>
          json(422, {
            code: 'INSUFFICIENT_ALIGNMENT_MEMBERS',
            message: 'an alignment group requires at least 2 members',
            details: {},
          }),
      ],
    ]);

    function Harness() {
      const create = useCreateAlignment('doc-1');
      return (
        <div>
          <button
            onClick={() =>
              create.mutate({
                members: [{ text_version_id: 'tv-en', start: 2, end: 17 }],
              })
            }
          >
            create
          </button>
          <span data-testid="status">
            {create.isError
              ? `${(create.error as ApiError).code}: ${create.error.message}`
              : create.isPending
                ? 'pending'
                : 'idle'}
          </span>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent(
        'INSUFFICIENT_ALIGNMENT_MEMBERS: an alignment group requires at least 2 members',
      ),
    );
  });
});
