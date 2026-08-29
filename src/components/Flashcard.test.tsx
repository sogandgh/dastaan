import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { Flashcard } from './Flashcard';

const items = [
  { img: 'a.png', word: 'الف' },
  { img: 'b.png', word: 'ب' },
];

describe('Flashcard', () => {
  it('shows the empty state when the deck has no items', () => {
    render(
      <Flashcard items={[]} currentIndex={0} isCustomDeck onNavigate={vi.fn()} onSay={vi.fn()} onDelete={vi.fn()} onAddWord={vi.fn()} />,
    );
    expect(screen.getByText('Add your first word')).toBeInTheDocument();
  });

  it('shows the current word, counter, and no delete/add buttons for a builtin deck', () => {
    render(
      <Flashcard items={items} currentIndex={0} isCustomDeck={false} onNavigate={vi.fn()} onSay={vi.fn()} onDelete={vi.fn()} onAddWord={vi.fn()} />,
    );
    expect(screen.getByText('الف')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove this word')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add another word')).not.toBeInTheDocument();
  });

  it('shows delete and add buttons for a custom deck', () => {
    render(
      <Flashcard items={items} currentIndex={1} isCustomDeck onNavigate={vi.fn()} onSay={vi.fn()} onDelete={vi.fn()} onAddWord={vi.fn()} />,
    );
    expect(screen.getByText('ب')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove this word')).toBeInTheDocument();
    expect(screen.getByLabelText('Add another word')).toBeInTheDocument();
  });

  it('calls onNavigate with the right direction', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <Flashcard items={items} currentIndex={0} isCustomDeck={false} onNavigate={onNavigate} onSay={vi.fn()} onDelete={vi.fn()} onAddWord={vi.fn()} />,
    );
    await user.click(screen.getByLabelText('Next'));
    expect(onNavigate).toHaveBeenCalledWith(1);
    await user.click(screen.getByLabelText('Previous'));
    expect(onNavigate).toHaveBeenCalledWith(-1);
  });
});
