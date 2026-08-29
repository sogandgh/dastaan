import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Private page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no session', () => {
    vi.mocked(useAuth).mockReturnValue({ session: null, loading: false });
    renderProtected();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders its children when there is a session', () => {
    vi.mocked(useAuth).mockReturnValue({ session: {} as never, loading: false });
    renderProtected();
    expect(screen.getByText('Private page')).toBeInTheDocument();
  });
});
