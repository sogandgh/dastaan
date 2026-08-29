import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { DeckTabs } from './DeckTabs';

const collections = [
  { id: 'c1', _key: 'c1', name: 'Colors' },
  { id: 'c2', _key: 'c2', name: 'Numbers' },
];

describe('DeckTabs', () => {
  it('renders the builtin tabs and custom collections', () => {
    render(
      <DeckTabs currentCategory="animals" collections={collections} onSelect={vi.fn()} onDeleteCollection={vi.fn()} onAddCollection={vi.fn()} />,
    );
    expect(screen.getByText('Animals')).toBeInTheDocument();
    expect(screen.getByText('Face & body')).toBeInTheDocument();
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('Numbers')).toBeInTheDocument();
  });

  it('calls onSelect when a collection tab is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DeckTabs currentCategory="animals" collections={collections} onSelect={onSelect} onDeleteCollection={vi.fn()} onAddCollection={vi.fn()} />,
    );
    await user.click(screen.getByText('Colors'));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('calls onDeleteCollection without selecting the tab when the delete mark is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDeleteCollection = vi.fn();
    render(
      <DeckTabs currentCategory="animals" collections={collections} onSelect={onSelect} onDeleteCollection={onDeleteCollection} onAddCollection={vi.fn()} />,
    );
    await user.click(screen.getByTitle('Remove "Colors"'));
    expect(onDeleteCollection).toHaveBeenCalledWith(collections[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
