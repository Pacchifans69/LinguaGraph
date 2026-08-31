import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isEditableShortcutTarget,
  useWorkspaceKeyboard,
} from './useWorkspaceKeyboard';

function options(overrides: Partial<Parameters<typeof useWorkspaceKeyboard>[0]> = {}) {
  return {
    clearSelection: vi.fn(),
    onCreateAlignment: vi.fn(),
    canCreateAlignment: true,
    isCreatingAlignment: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('useWorkspaceKeyboard', () => {
  it('preserves Escape selection cancellation without touching tray state', () => {
    const clearSelection = vi.fn();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
    } as unknown as Selection);

    renderHook(() =>
      useWorkspaceKeyboard(options({ clearSelection })),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it('creates with Ctrl+Enter only when the pending alignment is valid and unlocked', () => {
    const onCreateAlignment = vi.fn();
    renderHook(() =>
      useWorkspaceKeyboard(options({ onCreateAlignment })),
    );

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(onCreateAlignment).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('supports Meta+Enter as the primary-modifier equivalent', () => {
    const onCreateAlignment = vi.fn();
    renderHook(() =>
      useWorkspaceKeyboard(options({ onCreateAlignment })),
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onCreateAlignment).toHaveBeenCalledTimes(1);
  });

  it('does nothing for invalid or pending alignment creation', () => {
    const invalidCreate = vi.fn();
    const pendingCreate = vi.fn();

    const invalid = renderHook(() =>
      useWorkspaceKeyboard(
        options({
          onCreateAlignment: invalidCreate,
          canCreateAlignment: false,
        }),
      ),
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }),
      );
    });
    expect(invalidCreate).not.toHaveBeenCalled();
    invalid.unmount();

    renderHook(() =>
      useWorkspaceKeyboard(
        options({
          onCreateAlignment: pendingCreate,
          isCreatingAlignment: true,
        }),
      ),
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }),
      );
    });
    expect(pendingCreate).not.toHaveBeenCalled();
  });

  it('suppresses the create shortcut for editable controls', () => {
    const onCreateAlignment = vi.fn();
    renderHook(() =>
      useWorkspaceKeyboard(options({ onCreateAlignment })),
    );

    const targets: HTMLElement[] = [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      Object.assign(document.createElement('div'), { contentEditable: 'true' }),
    ];

    for (const target of targets) {
      document.body.appendChild(target);
      act(() => {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      target.remove();
    }

    expect(onCreateAlignment).not.toHaveBeenCalled();
  });
});

describe('isEditableShortcutTarget', () => {
  it('recognizes nested editable targets and leaves ordinary actions alone', () => {
    const wrapper = document.createElement('label');
    const input = document.createElement('input');
    const child = document.createElement('span');
    wrapper.append(input, child);
    document.body.appendChild(wrapper);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(child)).toBe(false);
    expect(isEditableShortcutTarget(document.createElement('button'))).toBe(false);
  });
});
