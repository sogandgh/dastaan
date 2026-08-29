import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { HomePage } from './HomePage';

vi.mock('../components/AppShell', () => ({
  AppShell: () => <div>the app</div>,
}));

vi.mock('./ChooseLanguagePage', () => ({
  ChooseLanguagePage: ({ onChoose }: { onChoose: () => void }) => (
    <button type="button" onClick={onChoose}>choose a language</button>
  ),
}));

describe('HomePage', () => {
  it('shows the language chooser before the app shell', () => {
    render(<HomePage />);
    expect(screen.getByText('choose a language')).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('shows the app shell once a language is chosen', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByText('choose a language'));
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(screen.queryByText('choose a language')).not.toBeInTheDocument();
  });
});
