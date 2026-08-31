import { useEffect } from 'react';

export interface WorkspaceKeyboardOptions {
  clearSelection: () => void;
  onCreateAlignment: () => void;
  canCreateAlignment: boolean;
  isCreatingAlignment: boolean;
}

/**
 * True when a global create command would conflict with local text/form input.
 * Kept deliberately narrow to the editable surfaces that exist in M1.
 */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
    ) !== null
  );
}

/**
 * M1's complete workspace keyboard surface:
 * - Escape preserves the existing selection-cancel semantics;
 * - Ctrl/Meta+Enter creates only a valid, unlocked pending alignment.
 *
 * ConfirmDialog owns Escape in capture phase while mounted, so a locked
 * destructive dialog continues to swallow Escape before this window handler.
 */
export function useWorkspaceKeyboard({
  clearSelection,
  onCreateAlignment,
  canCreateAlignment,
  isCreatingAlignment,
}: WorkspaceKeyboardOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        clearSelection();
        window.getSelection()?.removeAllRanges();
        return;
      }

      const isCreateCommand =
        event.key === 'Enter' &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey;

      if (!isCreateCommand) {
        return;
      }
      if (
        !canCreateAlignment ||
        isCreatingAlignment ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      onCreateAlignment();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canCreateAlignment,
    clearSelection,
    isCreatingAlignment,
    onCreateAlignment,
  ]);
}
