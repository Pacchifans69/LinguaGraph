/**
 * ConfirmDialog tests (M0.7 W4 accessibility hardening): semantic dialog
 * markup, focus lifecycle (focus moves into the dialog on open, focus is
 * restored to the trigger on close), and Escape-to-close.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(onClose = vi.fn()) {
  render(
    <div>
      <button type="button">Trigger</button>
      <ConfirmDialog headingId="test-heading" onClose={onClose}>
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

  it('closes on Escape like activating Cancel', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
