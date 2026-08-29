import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LoginPage } from './LoginPage';
import { signIn } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(signIn).mockReset();
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('renders the sign-in form by default', () => {
    renderLoginPage();
    expect(screen.getByRole('tab', { name: 'Sign in', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a validation error when the email is invalid on blur', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab();

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('calls signIn with the entered email and password on submit', async () => {
    vi.mocked(signIn).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'parent@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('parent@example.com', 'correct-horse');
    });
  });
});
