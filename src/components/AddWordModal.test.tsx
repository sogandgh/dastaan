import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AddWordModal } from './AddWordModal';
import { generateCard, saveCard } from '../lib/vocabulary';

vi.mock('../lib/vocabulary', () => ({
  generateCard: vi.fn(),
  saveCard: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(generateCard).mockReset();
  vi.mocked(saveCard).mockReset();
});

describe('AddWordModal', () => {
  it('generates a preview card and confirms it', async () => {
    vi.mocked(generateCard).mockResolvedValue({ word_fa: 'سیب', word_en: 'apple', imageUrl: 'apple.png' });
    vi.mocked(saveCard).mockResolvedValue({
      id: '1', _key: '1', word_fa: 'سیب', word_en: 'apple', image: 'apple.png', imageUrl: 'apple.png', collectionId: 'coll1',
    });

    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <AddWordModal open collectionId="coll1" collectionName="Fruits" onClose={vi.fn()} onSaved={onSaved} />,
    );

    await user.type(screen.getByLabelText('Word'), 'apple');
    await user.click(screen.getByRole('button', { name: 'Create card' }));

    expect(await screen.findByText('سیب')).toBeInTheDocument();
    expect(generateCard).toHaveBeenCalledWith('apple');

    await user.click(screen.getByRole('button', { name: 'Add this card' }));

    await waitFor(() => {
      expect(saveCard).toHaveBeenCalledWith({ word_fa: 'سیب', word_en: 'apple', imageUrl: 'apple.png', collectionId: 'coll1' });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows an error instead of generating when the word is empty', async () => {
    const user = userEvent.setup();
    render(<AddWordModal open collectionId="coll1" collectionName="Fruits" onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Create card' }));
    expect(await screen.findByText('Type a word first.')).toBeInTheDocument();
    expect(generateCard).not.toHaveBeenCalled();
  });
});
