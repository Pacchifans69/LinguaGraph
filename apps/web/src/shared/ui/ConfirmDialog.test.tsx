/**
 * ConfirmDialog tests (M0.7 W4 accessibility hardening): semantic dialog
 * markup, focus lifecycle (focus moves into the dialog on open, focus is
 * restored to the trigger on close), and Escape-to-close — including the
 * G2-F02 lock semantics: while `closeDisabled` is true, Escape must NOT
 * close the dialog, and unlocking (true -> false) restores Escape without
 * a remount.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function renderDialog(onClose = vi.fn(), props: Partial<ConfirmDialogProps> = {}) {
  render(
    <div>
      <button type="button">Trigger</button>
      <ConfirmDialog
        headingId="test-heading"
        onClose={onClose}
        {...props}
      >
        <h3 id="test-heading">Delete this?</h3>
        <p>Destructive action warning.</p>
        <div className="confirm-dialog-actions">
          <button type="button">Cancel</button>
          <button type="button" className="danger">
            Confirm
          </button>
        </div>
      </ConfirmDialog>
    </div>,
  );
  return { onClose };
}

describe('ConfirmDialog', () => {
  it('renders with alertdialog semantics and a labelled heading', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('test-heading');
    expect(screen.getByText('Delete this?')).toBeInTheDocument();
  });

  it('moves keyboard focus into the dialog on open (first focusable control)', () => {
    renderDialog();
    // The safe Cancel button is the first focusable control and must receive
    // focus — the destructive Confirm must never be auto-focused.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveFocus();
  });

  it('restores focus to the element that opened the dialog when it closes', () => {
    // Focus a trigger element BEFORE the dialog mounts: the mount effect
    // must capture it and return focus to it on unmount.
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <ConfirmDialog headingId="test-heading" onClose={() => undefined}>
        <h3 id="test-heading">Delete this?</h3>
        <div className="confirm-dialog-actions">
          <button type="button">Cancel</button>
          <button type="button" className="danger">
            Confirm
          </button>
        </div>
      </ConfirmDialog>,
    );

    // On open, focus moved into the dialog...
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    // ...and on close it returns to the trigger.
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('closes on Escape like activating Cancel (G2-F02 A: unlocked dialog)', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on Escape while locked (G2-F02 B: closeDisabled)', () => {
    const { onClose } = renderDialog(vi.fn(), { closeDisabled: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The dialog stays mounted.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('restores Escape after the lock is released without a remount (G2-F02 C)', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <div>
        <button type="button">Trigger</button>
        <ConfirmDialog
          headingId="test-heading"
          onClose={onClose}
          closeDisabled
        >
          <h3 id="test-heading">Delete this?</h3>
          <div className="confirm-dialog-actions">
            <button type="button">Cancel</button>
            <button type="button" className="danger">
              Confirm
            </button>
          </div>
        </ConfirmDialog>
      </div>,
    );

    // Locked: Escape is swallowed.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    // Unlock (mutation settled): the SAME mounted dialog instance becomes
    // closable — no remount, no re-registration, no focus loss.
    rerender(
      <div>
        <button type="button">Trigger</button>
        <ConfirmDialog
          headingId="test-heading"
          onClose={onClose}
          closeDisabled={false}
        >
          <h3 id="test-heading">Delete this?</h3>
          <div className="confirm-dialog-actions">
            <button type="button">Cancel</button>
            <button type="button" className="danger">
              Confirm
            </button>
          </div>
        </ConfirmDialog>
      </div>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
