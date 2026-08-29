import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StoryPlayPanel } from './StoryPlayPanel';
import { narrator } from '../lib/narrator';
import { ToastProvider } from '../context/ToastContext';
import type { ComponentProps } from 'react';

vi.mock('../lib/narrator', async () => {
  const actual = await vi.importActual<typeof import('../lib/narrator')>('../lib/narrator');
  return {
    ...actual,
    narrator: {
      lipSync: { levelsEl: null },
      playStoryScene: vi.fn(),
      togglePause: vi.fn(),
      beginSpeaking: vi.fn(),
    },
  };
});

function renderPanel(props: ComponentProps<typeof StoryPlayPanel>) {
  return render(<ToastProvider><StoryPlayPanel {...props} /></ToastProvider>);
}

beforeEach(() => {
  vi.mocked(narrator.playStoryScene).mockReset();
  vi.mocked(narrator.togglePause).mockReset();
});

const scenes = [
  { text: 'Once upon a time.', image: null },
  { text: 'The end.', image: null },
];

describe('StoryPlayPanel', () => {
  it('plays scene 0 on mount and shows the narrated text', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation(async (expanded, index, onScene) => {
      onScene(expanded[index], index);
      return { outcome: 'ended', index };
    });

    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    expect(await screen.findByText('Once upon a time.')).toBeInTheDocument();
    expect(screen.getByText('Bedtime')).toBeInTheDocument();
  });

  it('auto-advances to the next scene when one ends', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation(async (expanded, index, onScene) => {
      onScene(expanded[index], index);
      return { outcome: 'ended', index };
    });

    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    expect(await screen.findByText('The end.')).toBeInTheDocument();
    expect(narrator.playStoryScene).toHaveBeenCalledTimes(2);
  });

  it('shows Play again once the last scene finishes', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation(async (expanded, index, onScene) => {
      onScene(expanded[index], index);
      return { outcome: 'ended', index };
    });

    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    expect(await screen.findByText('Play again')).toBeInTheDocument();
  });

  it('leaves to setup when playback fails outright', async () => {
    vi.mocked(narrator.playStoryScene).mockResolvedValue({ outcome: 'error', index: 0 });
    const onLeaveToSetup = vi.fn();

    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup });

    await waitFor(() => expect(onLeaveToSetup).toHaveBeenCalled());
  });

  it('does not leave to setup when playback was merely stopped (interrupted)', async () => {
    vi.mocked(narrator.playStoryScene).mockResolvedValue({ outcome: 'stopped', index: 0 });
    const onLeaveToSetup = vi.fn();

    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup });

    await waitFor(() => expect(narrator.playStoryScene).toHaveBeenCalled());
    expect(onLeaveToSetup).not.toHaveBeenCalled();
  });

  it('jumps to the next scene when the next arrow is clicked', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation((expanded, index, onScene) => {
      onScene(expanded[index], index);
      return new Promise(() => {});
    });

    const user = userEvent.setup();
    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    await screen.findByText('Once upon a time.');
    await user.click(screen.getByLabelText('Next scene'));

    await waitFor(() => {
      expect(vi.mocked(narrator.playStoryScene).mock.calls.at(-1)?.[1]).toBe(1);
    });
  });

  it('wraps from the first scene back to the last when Previous is clicked', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation((expanded, index, onScene) => {
      onScene(expanded[index], index);
      return new Promise(() => {});
    });

    const user = userEvent.setup();
    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    await screen.findByText('Once upon a time.');
    await user.click(screen.getByLabelText('Previous scene'));

    await waitFor(() => {
      expect(vi.mocked(narrator.playStoryScene).mock.calls.at(-1)?.[1]).toBe(1);
    });
  });

  it('toggles pause via the stop button once playing', async () => {
    vi.mocked(narrator.playStoryScene).mockImplementation(() => new Promise(() => {}));
    vi.mocked(narrator.togglePause).mockReturnValue(true);

    const user = userEvent.setup();
    renderPanel({ scenes, label: 'Bedtime', onLeaveToSetup: vi.fn() });

    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(narrator.togglePause).toHaveBeenCalled();
    expect(await screen.findByText('Play')).toBeInTheDocument();
  });
});
