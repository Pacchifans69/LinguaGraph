import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('keeps native button semantics and forwards activation', () => {
    const onClick = vi.fn();
    render(
      <Button type="button" variant="primary" onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('locks a pending action and exposes the pending state semantically', () => {
    const onClick = vi.fn();
    render(
      <Button type="button" isPending onClick={onClick}>
        Saving…
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
