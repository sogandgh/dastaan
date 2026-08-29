import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { NewCollectionModal } from './NewCollectionModal';

describe('NewCollectionModal', () => {
  it('shows an error instead of creating when the name is empty', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewCollectionModal open onClose={vi.fn()} onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(await screen.findByText('Give the collection a name.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('calls onCreate with the trimmed name', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NewCollectionModal open onClose={vi.fn()} onCreate={onCreate} />);

    await user.type(screen.getByLabelText('Collection name'), '  Colors  ');
    await user.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(onCreate).toHaveBeenCalledWith('Colors');
  });
});
