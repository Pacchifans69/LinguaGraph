/**
 * WorkspaceProvider visualization-state tests (M0.6 Round 1).
 *
 * Provider-level semantics that the reducer alone cannot prove:
 *
 * - document workspace remount/reset clears hovered/active alignment state
 *   (the provider is keyed by documentId at the call site; ephemeral state
 *   must never survive into another document);
 * - hovered/active ids referencing groups that disappear from the server
 *   snapshot are reconciled to null via the serverAlignmentGroupIds prop;
 * - hovered/active state is never written to localStorage.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceProvider } from './WorkspaceProvider';
import { useWorkspaceState } from './workspaceContext';

function StateProbe() {
  const {
    hoveredAlignmentId,
    activeAlignmentId,
    setHoveredAlignment,
    setActiveAlignment,
  } = useWorkspaceState();
  return (
    <div>
      <span data-testid="hovered">{hoveredAlignmentId ?? '(null)'}</span>
      <span data-testid="active">{activeAlignmentId ?? '(null)'}</span>
      <button type="button" onClick={() => setHoveredAlignment('group-a')}>
        hover-a
      </button>
      <button type="button" onClick={() => setActiveAlignment('group-b')}>
        active-b
      </button>
    </div>
  );
}

function renderProvider(
  documentId: string,
  serverAlignmentGroupIds: string[] = ['group-a', 'group-b'],
) {
  return render(
    <WorkspaceProvider
      documentId={documentId}
      serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
      serverAlignmentGroupIds={serverAlignmentGroupIds}
    >
      <StateProbe />
    </WorkspaceProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe('WorkspaceProvider (M0.6 hovered/active lifecycle)', () => {
  it('a document workspace remount clears both ids (ephemeral reset)', () => {
    const first = renderProvider('doc-1');
    act(() => {
      screen.getByRole('button', { name: 'hover-a' }).click();
      screen.getByRole('button', { name: 'active-b' }).click();
    });
    expect(screen.getByTestId('hovered').textContent).toBe('group-a');
    expect(screen.getByTestId('active').textContent).toBe('group-b');

    // Unmount the whole document workspace and mount a NEW document: the
    // provider initial state is fresh — both ids are cleared.
    first.unmount();
    renderProvider('doc-2');
    expect(screen.getByTestId('hovered').textContent).toBe('(null)');
    expect(screen.getByTestId('active').textContent).toBe('(null)');
  });

  it('a fresh provider never restores hovered/active from localStorage', () => {
    // Seed storage with a preference-shaped value that must be IGNORED for
    // the ephemeral visualization ids.
    window.localStorage.setItem(
      'linguagraph.workspace.preferences.v1.doc-9',
      JSON.stringify({ panelOrder: ['tv-en'], visiblePanels: ['tv-en'] }),
    );
    renderProvider('doc-9');
    expect(screen.getByTestId('hovered').textContent).toBe('(null)');
    expect(screen.getByTestId('active').textContent).toBe('(null)');
  });

  it('reconciles hovered/active to null when the group disappears from the snapshot', () => {
    const { rerender } = renderProvider('doc-1');
    act(() => {
      screen.getByRole('button', { name: 'hover-a' }).click();
      screen.getByRole('button', { name: 'active-b' }).click();
    });
    expect(screen.getByTestId('hovered').textContent).toBe('group-a');
    expect(screen.getByTestId('active').textContent).toBe('group-b');

    // The server snapshot no longer contains group-a (deleted alignment).
    rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
        serverAlignmentGroupIds={['group-b']}
      >
        <StateProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId('hovered').textContent).toBe('(null)');
    expect(screen.getByTestId('active').textContent).toBe('group-b');
  });

  it('keeps ids whose groups still exist when the snapshot changes', () => {
    const { rerender } = renderProvider('doc-1');
    act(() => {
      screen.getByRole('button', { name: 'hover-a' }).click();
      screen.getByRole('button', { name: 'active-b' }).click();
    });
    // Same groups, different ordering — nothing is dropped.
    rerender(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
        serverAlignmentGroupIds={['group-b', 'group-a', 'group-c']}
      >
        <StateProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId('hovered').textContent).toBe('group-a');
    expect(screen.getByTestId('active').textContent).toBe('group-b');
  });

  it('hover/active changes never write to localStorage', () => {
    renderProvider('doc-1');
    act(() => {
      screen.getByRole('button', { name: 'hover-a' }).click();
      screen.getByRole('button', { name: 'active-b' }).click();
    });
    const stored = window.localStorage.getItem(
      'linguagraph.workspace.preferences.v1.doc-1',
    );
    // The provider may persist panel preferences (panelOrder/visiblePanels),
    // but NEVER the hovered/active ids.
    if (stored !== null) {
      expect(stored).not.toContain('hoveredAlignmentId');
      expect(stored).not.toContain('activeAlignmentId');
      expect(stored).not.toContain('group-a');
      expect(stored).not.toContain('group-b');
    }
  });
});

describe('WorkspaceProvider (M0.6 Round 2 mutation freeze flag)', () => {
  function MutationProbe() {
    const { isMutatingAlignment, setAlignmentMutationPending } =
      useWorkspaceState();
    return (
      <div>
        <span data-testid="mutating">
          {isMutatingAlignment ? 'pending' : 'idle'}
        </span>
        <button
          type="button"
          onClick={() => setAlignmentMutationPending(true)}
        >
          freeze
        </button>
        <button
          type="button"
          onClick={() => setAlignmentMutationPending(false)}
        >
          unfreeze
        </button>
      </div>
    );
  }

  it('is ephemeral: set/clear via the workspace layer, never persisted', () => {
    render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
        serverAlignmentGroupIds={['group-a']}
      >
        <MutationProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId('mutating')).toHaveTextContent('idle');
    act(() => {
      screen.getByRole('button', { name: 'freeze' }).click();
    });
    expect(screen.getByTestId('mutating')).toHaveTextContent('pending');
    act(() => {
      screen.getByRole('button', { name: 'unfreeze' }).click();
    });
    expect(screen.getByTestId('mutating')).toHaveTextContent('idle');
    // Never written to localStorage.
    const stored = window.localStorage.getItem(
      'linguagraph.workspace.preferences.v1.doc-1',
    );
    if (stored !== null) {
      expect(stored).not.toContain('isMutatingAlignment');
    }
  });

  it('resets on document workspace remount', () => {
    const first = render(
      <WorkspaceProvider
        documentId="doc-1"
        serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
        serverAlignmentGroupIds={['group-a']}
      >
        <MutationProbe />
      </WorkspaceProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'freeze' }).click();
    });
    expect(screen.getByTestId('mutating')).toHaveTextContent('pending');

    first.unmount();
    render(
      <WorkspaceProvider
        documentId="doc-2"
        serverVersions={[{ id: 'tv-en', contentHash: 'h' }]}
        serverAlignmentGroupIds={['group-a']}
      >
        <MutationProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId('mutating')).toHaveTextContent('idle');
  });
});
