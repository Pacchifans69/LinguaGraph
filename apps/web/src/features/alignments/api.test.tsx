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
import {
  pendingToMemberInput,
  useCreateAlignment,
  useDeleteAlignment,
  useUpdateAlignment,
} from './api';
import { useWorkspace, type WorkspaceSnapshot } from '../workspace/api';
import { ApiError } from '../../shared/api/client';
import { renderWithProviders } from '../../test/harness';
import { installFetchMock, json, type MockResponse } from '../../test/mockFetch';
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

describe('useUpdateAlignment / useDeleteAlignment (M0.6 Round 2)', () => {
  const updatedAlignment = {
    id: 'al-1',
    document_id: 'doc-1',
    note: 'new note',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    members: [],
  };

  it('PATCHes the alignment endpoint with the exact body and invalidates the workspace on success', async () => {
    let workspaceFetches = 0;
    let patchedUrl = '';
    let patchedBody: unknown = null;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, emptySnapshot());
        },
      ],
      [
        '/alignments/',
        (url, init) => {
          patchedUrl = url;
          patchedBody = JSON.parse(String(init?.body));
          return json(200, updatedAlignment);
        },
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const update = useUpdateAlignment('doc-1', 'al-1');
      return (
        <div>
          <span data-testid="fetches">
            {workspace.data ? workspaceFetches : 'loading'}
          </span>
          <button onClick={() => update.mutate({ note: 'new note' })}>update</button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('fetches')).toHaveTextContent('1'));

    fireEvent.click(screen.getByRole('button', { name: 'update' }));

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedUrl).toBe('/api/v1/alignments/al-1');
    expect(patchedBody).toEqual({ note: 'new note' });

    // The workspace query was invalidated and refetched.
    await waitFor(() => expect(workspaceFetches).toBeGreaterThan(1));
  });

  it('DELETEs the alignment endpoint and invalidates the workspace on success', async () => {
    let workspaceFetches = 0;
    let deletedUrl = '';
    let deletedMethod = '';
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, emptySnapshot());
        },
      ],
      [
        '/alignments/',
        (url, init) => {
          deletedUrl = url;
          deletedMethod = String(init?.method);
          return json(204, undefined);
        },
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const del = useDeleteAlignment('doc-1', 'al-1');
      return (
        <div>
          <span data-testid="fetches">
            {workspace.data ? workspaceFetches : 'loading'}
          </span>
          <button onClick={() => del.mutate()}>delete</button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('fetches')).toHaveTextContent('1'));

    fireEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => expect(deletedUrl).toBe('/api/v1/alignments/al-1'));
    expect(deletedMethod).toBe('DELETE');
    await waitFor(() => expect(workspaceFetches).toBeGreaterThan(1));
  });

  it('surfaces the stable error envelope on PATCH failure without invalidation', async () => {
    let workspaceFetches = 0;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceFetches += 1;
          return json(200, emptySnapshot());
        },
      ],
      [
        '/alignments/',
        () =>
          json(422, {
            code: 'VALIDATION_ERROR',
            message: 'bad payload',
            details: {},
          }),
      ],
    ]);

    function Harness() {
      const workspace = useWorkspace('doc-1');
      const update = useUpdateAlignment('doc-1', 'al-1');
      return (
        <div>
          <span data-testid="fetches">
            {workspace.data ? workspaceFetches : 'loading'}
          </span>
          <button onClick={() => update.mutate({ note: 'x' })}>update</button>
          <span data-testid="status">
            {update.isError
              ? `${(update.error as ApiError).code}: ${update.error.message}`
              : 'idle'}
          </span>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId('fetches')).toHaveTextContent('1'));

    fireEvent.click(screen.getByRole('button', { name: 'update' }));

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent(
        'VALIDATION_ERROR: bad payload',
      ),
    );
    // Failure never triggers a refetch beyond the initial load.
    expect(workspaceFetches).toBe(1);
  });
});

describe('mutation settlement awaits the authoritative refetch (R2-F01)', () => {
  const updatedAlignment = {
    id: 'al-1',
    document_id: 'doc-1',
    note: 'new note',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    members: [],
  };

  it('keeps the update mutation unsettled until the workspace refetch resolves', async () => {
    let workspaceCalls = 0;
    let resolveRefetch!: (v: MockResponse) => void;
    const refetchPromise = new Promise<MockResponse>((resolve) => {
      resolveRefetch = resolve;
    });
    let patched = false;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceCalls += 1;
          if (workspaceCalls === 1) {
            return json(200, emptySnapshot());
          }
          // The authoritative refetch triggered by the mutation: deferred.
          return refetchPromise;
        },
      ],
      [
        '/alignments/',
        () => {
          patched = true;
          return json(200, updatedAlignment);
        },
      ],
    ]);

    let settled = 0;
    function Harness() {
      useWorkspace('doc-1');
      const update = useUpdateAlignment('doc-1', 'al-1');
      return (
        <div>
          <button
            onClick={() =>
              update.mutate(
                { note: 'new note' },
                { onSettled: () => settled++ },
              )
            }
          >
            update
          </button>
          <span data-testid="status">{update.status}</span>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(workspaceCalls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'update' }));

    // The HTTP PATCH has already succeeded...
    await waitFor(() => expect(patched).toBe(true));
    // ...but the mutation must NOT settle while the workspace refetch is
    // still unresolved.
    expect(settled).toBe(0);

    // Only after the authoritative refetch resolves does the mutation settle.
    await waitFor(() => {
      resolveRefetch({ status: 200, body: emptySnapshot() });
    });
    await waitFor(() => expect(settled).toBe(1));
  });

  it('keeps the delete mutation unsettled until the workspace refetch resolves', async () => {
    let workspaceCalls = 0;
    let resolveRefetch!: (v: MockResponse) => void;
    const refetchPromise = new Promise<MockResponse>((resolve) => {
      resolveRefetch = resolve;
    });
    let deleted = false;
    installFetchMock([
      [
        '/workspace',
        () => {
          workspaceCalls += 1;
          if (workspaceCalls === 1) {
            return json(200, emptySnapshot());
          }
          return refetchPromise;
        },
      ],
      [
        '/alignments/',
        () => {
          deleted = true;
          return json(204, undefined);
        },
      ],
    ]);

    let settled = 0;
    function Harness() {
      useWorkspace('doc-1');
      const del = useDeleteAlignment('doc-1', 'al-1');
      return (
        <div>
          <button
            onClick={() => del.mutate(undefined, { onSettled: () => settled++ })}
          >
            delete
          </button>
        </div>
      );
    }

    renderWithProviders(<Harness />);
    await waitFor(() => expect(workspaceCalls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(settled).toBe(0);

    await waitFor(() => {
      resolveRefetch({ status: 200, body: emptySnapshot() });
    });
    await waitFor(() => expect(settled).toBe(1));
  });
});
