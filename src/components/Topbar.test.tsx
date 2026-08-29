import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('marks the Learn tab active in learn mode', () => {
    render(
      <Topbar mode="learn" nativeLanguageName="فارسی" onModeChange={vi.fn()} onBack={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the Story tab active for both setup and play', () => {
    const { rerender } = render(
      <Topbar mode="setup" nativeLanguageName="فارسی" onModeChange={vi.fn()} onBack={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');

    rerender(
      <Topbar mode="play" nativeLanguageName="فارسی" onModeChange={vi.fn()} onBack={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the Talk tab active in talk mode, and nothing else', () => {
    render(
      <Topbar mode="talk" nativeLanguageName="فارسی" onModeChange={vi.fn()} onBack={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onModeChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <Topbar mode="learn" nativeLanguageName="فارسی" onModeChange={onModeChange} onBack={vi.fn()} onOpenSettings={vi.fn()} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Story' }));
    expect(onModeChange).toHaveBeenCalledWith('setup');
    await user.click(screen.getByRole('tab', { name: 'Talk' }));
    expect(onModeChange).toHaveBeenCalledWith('talk');
  });

  it('calls onOpenSettings when the settings button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(
      <Topbar mode="learn" nativeLanguageName="فارسی" onModeChange={vi.fn()} onBack={vi.fn()} onOpenSettings={onOpenSettings} />,
    );
    await user.click(screen.getByRole('button', { name: 'Voice settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
