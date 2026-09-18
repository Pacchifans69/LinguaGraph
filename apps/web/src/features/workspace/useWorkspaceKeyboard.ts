import { useEffect } from 'react';

export interface WorkspaceKeyboardOptions {
  clearSelection: () => void;
  onCreateAlignment: () => void;
  canCreateAlignment: boolean;
  isCreatingAlignment: boolean;
  /**
   * M6-PRR-F02: the workspace owns a modal/destructive interaction (a mounted
   * session dialog, a workspace confirmation, or an active TextVersion delete
   * lifecycle). While held, the background create-alignment shortcut is
   * refused instead of starting a mutation behind the dialog that owns the
   * interaction.
   */
  navigationLocked?: boolean;
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
  navigationLocked = false,
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
        navigationLocked ||
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
    navigationLocked,
    onCreateAlignment,
  ]);
}
