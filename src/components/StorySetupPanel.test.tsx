import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StorySetupPanel } from './StorySetupPanel';
import { getStory } from '../lib/stories';

vi.mock('../lib/stories', () => ({
  getStory: vi.fn(),
  listStories: vi.fn().mockResolvedValue([]),
  deleteStory: vi.fn(),
  normalizeScenes: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getStory).mockReset();
});

describe('StorySetupPanel', () => {
  it('shows a validation note when starting with no theme and no prompt', async () => {
    const user = userEvent.setup();
    render(<StorySetupPanel onStart={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start the story' }));
    expect(await screen.findByText('Pick a focus, or type your own.')).toBeInTheDocument();
    expect(getStory).not.toHaveBeenCalled();
  });

  it('starts a story from a selected theme and calls onStart with the scenes', async () => {
    vi.mocked(getStory).mockResolvedValue({
      id: '1',
      characters: 'A bear',
      scenes: [{ text: 'Once upon a time.', image: null }],
    });

    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StorySetupPanel onStart={onStart} />);

    await user.click(screen.getByText('Brushing teeth'));
    await user.click(screen.getByRole('button', { name: 'Start the story' }));

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(
        [{ text: 'Once upon a time.', image: null }],
        'Brushing teeth',
      );
    });
    expect(getStory).toHaveBeenCalledWith(expect.objectContaining({ focus: expect.stringContaining('teeth') }));
  });

  it('deselects a theme when clicked twice', async () => {
    const user = userEvent.setup();
    render(<StorySetupPanel onStart={vi.fn()} />);

    const theme = screen.getByText('Big feelings').closest('button')!;
    await user.click(theme);
    expect(theme).toHaveClass('is-active');
    await user.click(theme);
    expect(theme).not.toHaveClass('is-active');
  });
});
