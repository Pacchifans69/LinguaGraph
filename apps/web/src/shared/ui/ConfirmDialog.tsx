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
 * - Escape closes the dialog (same semantics as activating Cancel);
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
  /** Callback that closes the dialog (Cancel / Escape). */
  onClose: () => void;
  children: ReactNode;
}

export function ConfirmDialog({
  headingId,
  onClose,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onClose without re-running the mount effect (which
  // would re-focus / re-register listeners on every parent render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
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
        // Capture phase + stopPropagation: the dialog owns Escape while it
        // is open (the workspace-level selection Escape still applies to
        // non-dialog interactions).
        event.stopPropagation();
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
