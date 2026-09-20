import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { GameCategoriesModal } from './GameCategoriesModal';

const options = [
  { key: 'animals', label: 'Animals' },
  { key: 'face', label: 'Face & body' },
  { key: 'verbs', label: 'Verbs' },
];

describe('GameCategoriesModal', () => {
  it('renders nothing when closed', () => {
    render(
      <GameCategoriesModal open={false} onClose={vi.fn()} options={options} selected={['animals']} onChange={vi.fn()} />,
    );
    expect(screen.queryByText('Play with')).not.toBeInTheDocument();
  });

  it('checks exactly the selected options', () => {
    render(
      <GameCategoriesModal open onClose={vi.fn()} options={options} selected={['animals', 'verbs']} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Animals' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Face & body' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Verbs' })).toBeChecked();
  });

  it('adds an option when an unchecked box is ticked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GameCategoriesModal open onClose={vi.fn()} options={options} selected={['animals']} onChange={onChange} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Verbs' }));
    expect(onChange).toHaveBeenCalledWith(['animals', 'verbs']);
  });

  it('removes an option when a checked box is unticked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GameCategoriesModal open onClose={vi.fn()} options={options} selected={['animals', 'verbs']} onChange={onChange} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Verbs' }));
    expect(onChange).toHaveBeenCalledWith(['animals']);
  });

  it('refuses to remove the last remaining selected option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GameCategoriesModal open onClose={vi.fn()} options={options} selected={['animals']} onChange={onChange} />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Animals' });
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onClose when Done is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <GameCategoriesModal open onClose={onClose} options={options} selected={['animals']} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
