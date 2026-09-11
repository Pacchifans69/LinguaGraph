import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchTaskNavigation } from './WorkbenchTaskNavigation';
import type { WorkbenchMode } from './workbenchIa';

const versions = {
  v1: { id: 'v1', document_id: 'd1', language_tag: 'en', label: 'English', content: 'Hello', content_hash: 'h1', sort_order: 0, created_at: '', updated_at: '' },
  v2: { id: 'v2', document_id: 'd1', language_tag: 'fr', label: 'French', content: 'Salut', content_hash: 'h2', sort_order: 1, created_at: '', updated_at: '' },
};

const baseProps = {
  activeTargetId: 'v1',
  visibleVersions: ['v1', 'v2'],
  versionsById: versions,
  sessionStatuses: {},
  trayCount: 0,
  canCreateAlignment: false,
  navigationLocked: false,
  onTargetChange: vi.fn(),
};

/**
 * Controlled tab deck: mirrors how the Workspace owns `activeMode`, so the
 * complete roving-focus keyboard model (activation + aria-selected + focus)
 * can be observed end to end inside a single component test.
 */
function ControlledDeck({
  initialMode = 'alignment' as WorkbenchMode,
  navigationLocked = false,
  onModeChange,
}: {
  initialMode?: WorkbenchMode;
  navigationLocked?: boolean;
  onModeChange?: (mode: WorkbenchMode) => void;
}) {
  const [mode, setMode] = useState<WorkbenchMode>(initialMode);
  return (
    <WorkbenchTaskNavigation
      {...baseProps}
      activeMode={mode}
      navigationLocked={navigationLocked}
      onModeChange={(next) => {
        onModeChange?.(next);
        setMode(next);
      }}
    />
  );
}

function focusedTabName(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.textContent : null;
}

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

  // ---- M6-G2-F03: complete horizontal-tabs keyboard model ----------------

  it('starts with a roving tabindex on the active destination only', () => {
    render(<ControlledDeck initialMode="token" />);
    expect(screen.getByRole('tab', { name: 'Token' })).toHaveAttribute('tabindex', '0');
    for (const name of ['Alignment', 'Sentence', 'Lemma', 'POS']) {
      expect(screen.getByRole('tab', { name })).toHaveAttribute('tabindex', '-1');
    }
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('moves with ArrowRight/ArrowLeft and wraps around with automatic activation', () => {
    const onModeChange = vi.fn();
    render(<ControlledDeck initialMode="alignment" onModeChange={onModeChange} />);

    const active = () => screen.getByRole('tab', { selected: true });

    fireEvent.keyDown(active(), { key: 'ArrowRight' });
    expect(onModeChange).toHaveBeenLastCalledWith('sentence');
    expect(active()).toHaveAccessibleName('Sentence');
    expect(active()).toHaveFocus();
    expect(active()).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(active(), { key: 'ArrowLeft' });
    expect(onModeChange).toHaveBeenLastCalledWith('alignment');
    expect(active()).toHaveAccessibleName('Alignment');

    // Wrap-around in both directions.
    fireEvent.keyDown(active(), { key: 'ArrowLeft' });
    expect(active()).toHaveAccessibleName('POS');
    expect(focusedTabName()).toBe('POS');
    fireEvent.keyDown(active(), { key: 'ArrowRight' });
    expect(active()).toHaveAccessibleName('Alignment');
  });

  it('jumps to the first and last destination with Home and End', () => {
    render(<ControlledDeck initialMode="lemma" />);
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'Home' });
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Alignment');
    expect(screen.getByRole('tab', { selected: true })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'End' });
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('POS');
    expect(screen.getByRole('tab', { selected: true })).toHaveFocus();
  });

  it('keeps aria-selected, focus and roving tabindex on the same destination', () => {
    render(<ControlledDeck initialMode="alignment" />);
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowRight' });

    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveAccessibleName('Token');
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('cannot switch mode from the keyboard while navigation is locked', () => {
    const onModeChange = vi.fn();
    render(
      <ControlledDeck
        initialMode="sentence"
        navigationLocked
        onModeChange={onModeChange}
      />,
    );
    const selected = screen.getByRole('tab', { selected: true });
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      fireEvent.keyDown(selected, { key });
    }
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('Sentence');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
  });
});
