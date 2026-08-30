import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GamePanel } from './GamePanel';
import { useVocabulary } from '../lib/useVocabulary';
import { pickRound } from '../lib/game';
import { narrator } from '../lib/narrator';
import { AppShellProvider } from '../context/AppShellContext';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../lib/useVocabulary', () => ({ useVocabulary: vi.fn() }));
vi.mock('../lib/game', () => ({ pickRound: vi.fn() }));
vi.mock('../lib/narrator', () => ({
  narrator: {
    speakText: vi.fn(),
    beginSpeaking: vi.fn(),
    prefetchLine: vi.fn(),
    lipSync: { announce: vi.fn(), celebrate: vi.fn() },
  },
}));

const items = [
  { img: 'a.png', word: 'الف' },
  { img: 'b.png', word: 'ب' },
  { img: 'c.png', word: 'ج' },
  { img: 'd.png', word: 'د' },
];

function renderPanel() {
  return render(
    <AppShellProvider>
      <ToastProvider>
        <GamePanel />
      </ToastProvider>
    </AppShellProvider>,
  );
}

beforeEach(() => {
  vi.mocked(pickRound).mockReset().mockReturnValue({ target: items[0], choices: items });
  vi.mocked(useVocabulary).mockReturnValue({
    categories: { animals: items },
    collections: [],
    loading: false,
    reload: vi.fn(),
    addCollection: vi.fn(),
    removeCollection: vi.fn(),
  });
  vi.mocked(narrator.speakText).mockReset();
  vi.mocked(narrator.beginSpeaking).mockReset();
  vi.mocked(narrator.prefetchLine).mockReset();
  vi.mocked(narrator.lipSync.announce).mockReset();
  vi.mocked(narrator.lipSync.celebrate).mockReset();
  vi.useRealTimers();
});

describe('GamePanel', () => {
  it('shows a friendly message instead of a round when there are not enough cards', () => {
    vi.mocked(pickRound).mockReturnValue(null);
    renderPanel();
    expect(screen.getByText('Not quite enough cards yet')).toBeInTheDocument();
  });

  it('renders four picture tiles and says the target word on mount', async () => {
    renderPanel();
    const images = screen.getAllByRole('button', { name: 'Pick this picture' });
    expect(images).toHaveLength(4);
    await waitFor(() => expect(narrator.speakText).toHaveBeenCalledWith('الف', expect.any(Function)));
    expect(narrator.lipSync.announce).toHaveBeenCalled();
  });

  it('re-says the word when the resay button is tapped', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(narrator.speakText).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Say the word again' }));
    expect(narrator.speakText).toHaveBeenCalledTimes(2);
  });

  it('celebrates on a correct pick with the deterministic celebration line and starts a new round after', async () => {
    vi.useFakeTimers();
    renderPanel();
    const tiles = screen.getAllByRole('button', { name: 'Pick this picture' });

    await tiles[0].click();

    expect(narrator.lipSync.celebrate).toHaveBeenCalled();
    expect(tiles[0]).toHaveClass('is-correct');
    expect(narrator.speakText).toHaveBeenLastCalledWith('آفرین، آفرین!', expect.any(Function));

    act(() => { vi.advanceTimersByTime(2400); });
    expect(pickRound).toHaveBeenCalledWith(items, 'الف');
  });

  it('shakes and disables a wrong tile without ending the round, saying the same deterministic line every time', async () => {
    const user = userEvent.setup();
    renderPanel();
    const tiles = screen.getAllByRole('button', { name: 'Pick this picture' });

    await user.click(tiles[1]);

    expect(tiles[1]).toHaveClass('is-wrong');
    expect(tiles[1]).toBeDisabled();
    expect(tiles[0]).not.toBeDisabled();
    expect(narrator.speakText).toHaveBeenLastCalledWith('یک بار دیگر!', expect.any(Function));

    await user.click(tiles[2]);
    expect(narrator.speakText).toHaveBeenLastCalledWith('یک بار دیگر!', expect.any(Function));
  });

  it('prefetches the celebration and try-again lines as soon as the panel opens', async () => {
    renderPanel();
    await waitFor(() => {
      expect(narrator.prefetchLine).toHaveBeenCalledWith('آفرین، آفرین!');
      expect(narrator.prefetchLine).toHaveBeenCalledWith('یک بار دیگر!');
    });
  });

  it('shows the celebration overlay only while celebrating, portaled to the body so it is never clipped by an animated ancestor', async () => {
    vi.useFakeTimers();
    renderPanel();
    const tiles = screen.getAllByRole('button', { name: 'Pick this picture' });

    expect(document.body.querySelector('.celebration-overlay')).not.toBeInTheDocument();

    await tiles[0].click();
    const overlay = document.body.querySelector('.celebration-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay?.parentElement).toBe(document.body);

    act(() => { vi.advanceTimersByTime(2400); });
    expect(document.body.querySelector('.celebration-overlay')).not.toBeInTheDocument();
  });

  it('shows the deterministic celebration line as on-screen text during the burst', async () => {
    vi.useFakeTimers();
    renderPanel();
    const tiles = screen.getAllByRole('button', { name: 'Pick this picture' });

    await tiles[0].click();

    expect(screen.getByText('آفرین، آفرین!')).toBeInTheDocument();
  });

  it('centers the celebration burst on the tapped card', async () => {
    vi.useFakeTimers();
    renderPanel();
    const tiles = screen.getAllByRole('button', { name: 'Pick this picture' });

    tiles[0].getBoundingClientRect = () => ({
      left: 100, top: 50, width: 80, height: 80, right: 180, bottom: 130, x: 100, y: 50, toJSON: () => {},
    });
    window.innerWidth = 400;
    window.innerHeight = 800;

    await tiles[0].click();

    const overlay = document.body.querySelector('.celebration-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--origin-x')).toBe('35%');
    expect(overlay.style.getPropertyValue('--origin-y')).toBe('11.25%');
  });

  it('moves to a new round when Skip is clicked, without penalty', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Skip, next word' }));
    expect(narrator.beginSpeaking).toHaveBeenCalled();
    expect(pickRound).toHaveBeenLastCalledWith(items, 'الف');
  });
});
