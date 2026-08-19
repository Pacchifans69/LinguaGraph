/**
 * TextPanel tests (M0.3): canonical plain-text rendering, panel header,
 * hide control, whitespace/newline preservation and XSS-safe rendering.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextPanel } from './TextPanel';
import type { TextVersion } from './api';

function version(overrides: Partial<TextVersion> = {}): TextVersion {
  return {
    id: 'tv-en',
    document_id: 'doc-1',
    language_tag: 'en',
    label: 'English A',
    content: 'I look forward to seeing you tomorrow.',
    content_hash: 'abc',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TextPanel', () => {
  it('shows language tag, label and a hide control', () => {
    render(<TextPanel version={version()} onHide={() => {}} />);
    expect(screen.getByText('en')).toBeInTheDocument();
    expect(screen.getByText('English A')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide English A panel' }),
    ).toBeInTheDocument();
  });

  it('calls onHide when the hide control is activated', () => {
    const onHide = vi.fn();
    render(<TextPanel version={version()} onHide={onHide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide English A panel' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('renders the exact canonical content as plain text', () => {
    render(<TextPanel version={version()} onHide={() => {}} />);
    expect(
      screen.getByText('I look forward to seeing you tomorrow.'),
    ).toBeInTheDocument();
  });

  it('preserves whitespace and newlines (pre-wrap, plain text node)', () => {
    const { container } = render(
      <TextPanel
        version={version({ content: 'line one\nline two\tend' })}
        onHide={() => {}}
      />,
    );
    const body = container.querySelector('.text-panel-body');
    expect(body).not.toBeNull();
    // The exact canonical string is rendered verbatim in a single text node,
    // and the body keeps whitespace visible via pre-wrap.
    expect(body?.textContent).toBe('line one\nline two\tend');
    expect((body as HTMLElement).style.whiteSpace).toBe('pre-wrap');
  });

  it('renders XSS-like input as inert text (no script, no html execution)', () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const { container } = render(
      <TextPanel version={version({ content: payload })} onHide={() => {}} />,
    );
    const body = container.querySelector('.text-panel-body');
    expect(body?.textContent).toBe(payload);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });
});
