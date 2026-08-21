/**
 * ConfirmDialog (M0.7 W4 accessibility hardening) — the shared
 * destructive-confirmation dialog with a reasonable focus lifecycle:
 *
 * - semantic dialog markup: `role="alertdialog"`, `aria-modal="true"`,
 *   `aria-labelledby` (heading);
 * - on open, keyboard focus moves INSIDE the dialog (the first focusable
 *   control, which every current caller places on the safe "Cancel"
 *   button) — the destructive action is never auto-focused, so a
 *   destructive confirmation can never fire one Enter press away from an
 *   open dialog;
 * - Escape closes the dialog (same semantics as activating Cancel) UNLESS
 *   `closeDisabled` is true;
 * - `closeDisabled` (G2-F02): while a destructive mutation is pending, the
 *   caller locks the dialog — Escape MUST NOT call onClose and the dialog
 *   stays mounted until the mutation settles. The caller is also
 *   responsible for disabling its action buttons; the dialog never infers
 *   lock state from child-button disabled attributes;
 * - on close (any path), focus is restored to the element that opened the
 *   dialog.
 *
 * No focus trap is implemented: the dialogs are small and M0 does not claim
 * full WCAG certification (frozen contract W4).
 */

import { useEffect, useRef, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  /** Stable id used for `aria-labelledby` (must match a heading in children). */
  headingId: string;
  /** Callback that closes the dialog (Cancel / Escape when unlocked). */
  onClose: () => void;
  /**
   * Lock the dialog (G2-F02): when true, Escape does NOT call onClose and
   * the dialog remains mounted. Use while a destructive mutation is
   * pending. Must be false for Escape-to-close to work.
   */
  closeDisabled?: boolean;
  children: ReactNode;
}

export function ConfirmDialog({
  headingId,
  onClose,
  closeDisabled = false,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onClose / closeDisabled without re-running the mount
  // effect (which would re-focus / re-register listeners on every parent
  // render). The refs also make a lock-state change (true -> false) take
  // effect on the next render WITHOUT remounting the dialog.
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Move focus into the dialog on open.
    const dialog = dialogRef.current;
    if (dialog !== null) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Capture phase + stopPropagation: while this dialog is mounted it
        // OWNS Escape — the event never falls through to other handlers
        // (e.g. the workspace-level selection Escape). When locked, Escape
        // is swallowed without closing; when unlocked it closes the dialog
        // exactly like activating Cancel.
        event.stopPropagation();
        if (closeDisabledRef.current) {
          return;
        }
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Restore focus to the element that opened the dialog.
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {children}
      </div>
    </div>
  );
}
