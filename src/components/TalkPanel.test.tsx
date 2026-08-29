import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TalkPanel } from './TalkPanel';
import { sendTalkMessage } from '../lib/talk';
import { useRecorder } from '../lib/useRecorder';
import { narrator } from '../lib/narrator';
import { ToastProvider } from '../context/ToastContext';
import { AppShellProvider } from '../context/AppShellContext';

vi.mock('../lib/talk', () => ({ sendTalkMessage: vi.fn() }));
vi.mock('../lib/useRecorder', () => ({ useRecorder: vi.fn() }));
vi.mock('../lib/narrator', () => ({ narrator: { speakText: vi.fn() } }));

function renderPanel() {
  return render(
    <AppShellProvider>
      <ToastProvider>
        <TalkPanel />
      </ToastProvider>
    </AppShellProvider>,
  );
}

beforeEach(() => {
  vi.mocked(sendTalkMessage).mockReset();
  vi.mocked(narrator.speakText).mockReset();
});

describe('TalkPanel', () => {
  it('starts recording when the mic is tapped', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useRecorder).mockReturnValue({ recording: false, start, stop: vi.fn() });

    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    expect(start).toHaveBeenCalled();
  });

  it('stops recording when tapped again while recording', async () => {
    const stop = vi.fn();
    vi.mocked(useRecorder).mockReturnValue({ recording: true, start: vi.fn(), stop });

    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText('Listening…')).toBeInTheDocument();
  });

  it('sends the recording, shows the exchange, and speaks the reply', async () => {
    vi.mocked(sendTalkMessage).mockResolvedValue({ transcript: 'سلام', reply: 'سَلامْ عَزیزَم!' });
    let doneCallback: ((blob: Blob) => void) | undefined;
    const start = vi.fn().mockImplementation(async (onDone: (blob: Blob) => void) => {
      doneCallback = onDone;
    });
    vi.mocked(useRecorder).mockReturnValue({ recording: false, start, stop: vi.fn() });

    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(doneCallback).toBeDefined());
    doneCallback!(new Blob(['x'], { type: 'audio/webm' }));

    expect(await screen.findByText('You said: سلام')).toBeInTheDocument();
    expect(await screen.findByText('سَلامْ عَزیزَم!')).toBeInTheDocument();
    expect(narrator.speakText).toHaveBeenCalledWith('سَلامْ عَزیزَم!', expect.any(Function));
  });

  it('ignores an empty recording without calling the API', async () => {
    let doneCallback: ((blob: Blob) => void) | undefined;
    const start = vi.fn().mockImplementation(async (onDone: (blob: Blob) => void) => {
      doneCallback = onDone;
    });
    vi.mocked(useRecorder).mockReturnValue({ recording: false, start, stop: vi.fn() });

    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(doneCallback).toBeDefined());
    doneCallback!(new Blob([], { type: 'audio/webm' }));

    await new Promise(r => setTimeout(r, 10));
    expect(sendTalkMessage).not.toHaveBeenCalled();
  });
});
