import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchTaskNavigation } from './WorkbenchTaskNavigation';

const versions = {
  v1: { id: 'v1', document_id: 'd1', language_tag: 'en', label: 'English', content: 'Hello', content_hash: 'h1', sort_order: 0, created_at: '', updated_at: '' },
  v2: { id: 'v2', document_id: 'd1', language_tag: 'fr', label: 'French', content: 'Salut', content_hash: 'h2', sort_order: 1, created_at: '', updated_at: '' },
};

describe('WorkbenchTaskNavigation', () => {
  it('exposes exactly five task destinations and the active target', () => {
    render(<WorkbenchTaskNavigation activeMode="sentence" activeTargetId="v1" visibleVersions={['v1', 'v2']} versionsById={versions} sessionStatuses={{}} trayCount={0} canCreateAlignment={false} navigationLocked={false} onModeChange={vi.fn()} onTargetChange={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('combobox', { name: 'Active text version' })).toHaveValue('v1');
  });

  it('offers one action back to Alignment and reports tray readiness', () => {
    const onModeChange = vi.fn();
    render(<WorkbenchTaskNavigation activeMode="lemma" activeTargetId="v1" visibleVersions={['v1']} versionsById={versions} sessionStatuses={{}} trayCount={2} canCreateAlignment navigationLocked={false} onModeChange={onModeChange} onTargetChange={vi.fn()} />);
    expect(screen.getByLabelText('Pending alignment status')).toHaveTextContent('ready to create');
    fireEvent.click(screen.getByRole('button', { name: 'Open Alignment' }));
    expect(onModeChange).toHaveBeenCalledWith('alignment');
  });

  it('locks every navigation control while a mounted dialog is active', () => {
    render(<WorkbenchTaskNavigation activeMode="token" activeTargetId="v1" visibleVersions={['v1']} versionsById={versions} sessionStatuses={{}} trayCount={0} canCreateAlignment={false} navigationLocked onModeChange={vi.fn()} onTargetChange={vi.fn()} />);
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('keeps inactive pending and error sessions discoverable until recovery', () => {
    const props = {
      activeMode: 'sentence' as const,
      activeTargetId: 'v1',
      visibleVersions: ['v1', 'v2'],
      versionsById: versions,
      trayCount: 0,
      canCreateAlignment: false,
      navigationLocked: false,
      onModeChange: vi.fn(),
      onTargetChange: vi.fn(),
    };
    const { rerender } = render(
      <WorkbenchTaskNavigation
        {...props}
        sessionStatuses={{
          'v2:lemma': { dirty: true, pending: true, error: false, conflict: false, dialogOpen: false },
          'v1:pos': { dirty: true, pending: false, error: true, conflict: false, dialogOpen: false },
        }}
      />,
    );
    const summary = screen.getByLabelText('Workbench session status');
    expect(summary).toHaveTextContent('French · LemmaPending');
    expect(summary).toHaveTextContent('English · POSError');

    rerender(<WorkbenchTaskNavigation {...props} sessionStatuses={{}} />);
    expect(screen.queryByLabelText('Workbench session status')).not.toBeInTheDocument();
  });
});
