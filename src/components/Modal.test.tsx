import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={vi.fn()}>Content</Modal>);
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders its children when open', () => {
    render(<Modal open onClose={vi.fn()}>Content</Modal>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('calls onClose on a backdrop click but not a click inside the sheet', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );

    await user.click(screen.getByText('Inside'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByText('Inside').closest('.sheet-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
