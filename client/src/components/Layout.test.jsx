import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Layout backup before sign out', () => {
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { full_name: 'Regular User', role: 'user', role_name: 'User' },
      logout,
    });
    API.get.mockImplementation((path) => {
      if (path === '/monitoring/notifications') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    API.post.mockResolvedValue({ data: { backup_dir: 'C:\\backups\\latest' } });
  });

  it('uses the all-user backup endpoint before logging out', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    fireEvent.click(screen.getByRole('button', { name: /back up & sign out/i }));

    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/system/backup-before-logout');
    });
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1), { timeout: 1500 });
  });
});
