import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StoryHistory } from './StoryHistory';
import { listStories, deleteStory, normalizeScenes } from '../lib/stories';

vi.mock('../lib/stories', () => ({
  listStories: vi.fn(),
  deleteStory: vi.fn(),
  normalizeScenes: vi.fn(rec => rec.scenes),
}));

beforeEach(() => {
  vi.mocked(listStories).mockReset();
  vi.mocked(deleteStory).mockReset();
});

const record = { id: 's1', _key: 's1', label: 'The brave bear', minutes: 2, scenes: [{ text: 'hi', image: null }] };

describe('StoryHistory', () => {
  it('renders nothing when there are no saved stories', async () => {
    vi.mocked(listStories).mockResolvedValue([]);
    const { container } = render(<StoryHistory onPlay={vi.fn()} reloadToken={0} />);
    await waitFor(() => expect(listStories).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders saved stories and plays one on click', async () => {
    vi.mocked(listStories).mockResolvedValue([record]);
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(<StoryHistory onPlay={onPlay} reloadToken={0} />);

    expect(await screen.findByText('The brave bear')).toBeInTheDocument();
    expect(screen.getByText('2 mins')).toBeInTheDocument();

    await user.click(screen.getByText('The brave bear'));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ label: 'The brave bear' }));
    expect(normalizeScenes).toHaveBeenCalled();
  });

  it('deletes a story and refreshes the list', async () => {
    vi.mocked(listStories).mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<StoryHistory onPlay={vi.fn()} reloadToken={0} />);

    await screen.findByText('The brave bear');
    await user.click(screen.getByLabelText('Remove The brave bear'));

    expect(deleteStory).toHaveBeenCalledWith('s1');
    await waitFor(() => expect(screen.queryByText('The brave bear')).not.toBeInTheDocument());
  });
});
