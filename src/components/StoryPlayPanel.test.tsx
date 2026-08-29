import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StoryPlayPanel } from './StoryPlayPanel';
import { narrator } from '../lib/narrator';
import { ToastProvider } from '../context/ToastContext';
import type { ComponentProps } from 'react';

function renderPanel(props: ComponentProps<typeof StoryPlayPanel>) {
  return render(<ToastProvider><StoryPlayPanel {...props} /></ToastProvider>);
}

vi.mock('../lib/narrator', async () => {
  const actual = await vi.importActual<typeof import('../lib/narrator')>('../lib/narrator');
  return {
    ...actual,
    narrator: {
      lipSync: { levelsEl: null },
      speakStory: vi.fn(),
      togglePause: vi.fn(),
      beginSpeaking: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.mocked(narrator.speakStory).mockReset();
  vi.mocked(narrator.togglePause).mockReset();
});

const scenes = [{ text: 'Once upon a time.', image: null }];

describe('StoryPlayPanel', () => {
  it('plays the scenes on mount and shows the narrated text', async () => {
    vi.mocked(narrator.speakStory).mockImplementation(async (_scenes, onScene) => {
      onScene(scenes[0]);
      return 'finished';
    });

    renderPanel({ scenes, label: "Bedtime", onLeaveToSetup: vi.fn() });

    expect(await screen.findByText('Once upon a time.')).toBeInTheDocument();
    expect(screen.getByText('Bedtime')).toBeInTheDocument();
  });

  it('shows Play again once the story finishes', async () => {
    vi.mocked(narrator.speakStory).mockResolvedValue('finished');

    renderPanel({ scenes, label: "Bedtime", onLeaveToSetup: vi.fn() });

    expect(await screen.findByText('Play again')).toBeInTheDocument();
  });

  it('leaves to setup when playback fails outright', async () => {
    vi.mocked(narrator.speakStory).mockResolvedValue('error');
    const onLeaveToSetup = vi.fn();

    renderPanel({ scenes, label: "Bedtime", onLeaveToSetup });

    await waitFor(() => expect(onLeaveToSetup).toHaveBeenCalled());
  });

  it('does not leave to setup when playback was merely stopped (cancelled)', async () => {
    vi.mocked(narrator.speakStory).mockResolvedValue('stopped');
    const onLeaveToSetup = vi.fn();

    renderPanel({ scenes, label: "Bedtime", onLeaveToSetup });

    await waitFor(() => expect(narrator.speakStory).toHaveBeenCalled());
    expect(onLeaveToSetup).not.toHaveBeenCalled();
  });

  it('toggles pause via the stop button once playing', async () => {
    vi.mocked(narrator.speakStory).mockImplementation(() => new Promise(() => {}));
    vi.mocked(narrator.togglePause).mockReturnValue(true);

    const user = userEvent.setup();
    renderPanel({ scenes, label: "Bedtime", onLeaveToSetup: vi.fn() });

    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(narrator.togglePause).toHaveBeenCalled();
    expect(await screen.findByText('Play')).toBeInTheDocument();
  });
});
