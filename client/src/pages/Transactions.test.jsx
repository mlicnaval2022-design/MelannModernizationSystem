import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Transactions from './Transactions';
import API from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockTransactions = [
  {
    id: 101,
    transaction_type: 'Expense',
    transaction_date: '2026-08-27',
    amount: '1500.00',
    category: 'GASOLINE',
    description: 'Fuel for field visit',
    payee: ''
  }
];

const mockCollectors = [
  { id: 1, first_name: 'Juan', last_name: 'Dela Cruz' }
];

describe('Transactions confirmation modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    API.get.mockImplementation((path) => {
      if (path === '/transactions') return Promise.resolve({ data: mockTransactions });
      if (path === '/collectors') return Promise.resolve({ data: mockCollectors });
      return Promise.resolve({ data: [] });
    });
    API.post.mockResolvedValue({ data: { id: 102 } });
    API.put.mockResolvedValue({ data: { success: true } });
    API.delete.mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows confirmation popup when saving a new transaction', async () => {
    const { container } = render(<Transactions />);
    await waitFor(() => expect(API.get).toHaveBeenCalledWith('/transactions'));

    // Fill in required fields for expense
    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'GASOLINE' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('Enter particulars / description'), { target: { value: 'Motor fuel' } });

    // Click Save button
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // Modal should appear
    expect(await screen.findByText('Confirm Save Transaction')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to save this new expense record\?/i)).toBeInTheDocument();

    // Confirm action in modal
    fireEvent.click(screen.getByRole('button', { name: /yes, save transaction/i }));

    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/transactions', expect.objectContaining({
        amount: '500',
        category: 'GASOLINE',
        description: 'Motor fuel',
        transaction_type: 'Expense'
      }));
    });
  });

  it('shows confirmation popup when editing a selected transaction', async () => {
    render(<Transactions />);
    await waitFor(() => expect(screen.getByText('GASOLINE')).toBeInTheDocument());

    // Select row
    fireEvent.click(screen.getByText('Fuel for field visit'));

    // Edit amount
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1800' } });

    // Click Edit button
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    // Modal should appear
    expect(await screen.findByText('Confirm Edit Transaction')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to apply modifications to transaction #101\?/i)).toBeInTheDocument();

    // Confirm update in modal
    fireEvent.click(screen.getByRole('button', { name: /yes, update/i }));

    await waitFor(() => {
      expect(API.put).toHaveBeenCalledWith('/transactions/101', expect.objectContaining({
        id: 101,
        amount: '1800',
        category: 'GASOLINE'
      }));
    });
  });

  it('shows confirmation popup when deleting a transaction', async () => {
    render(<Transactions />);
    await waitFor(() => expect(screen.getByText('Fuel for field visit')).toBeInTheDocument());

    // Select row
    fireEvent.click(screen.getByText('Fuel for field visit'));

    // Click Delete button
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    // Modal should appear
    expect(await screen.findByText('Confirm Delete Transaction')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete \(void\) transaction #101\?/i)).toBeInTheDocument();

    // Confirm delete in modal
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => {
      expect(API.delete).toHaveBeenCalledWith('/transactions/101');
    });
  });

  it('validates fields and shows error when required inputs are empty', async () => {
    render(<Transactions />);
    await waitFor(() => expect(API.get).toHaveBeenCalledWith('/transactions'));

    // Leave amount empty and click save
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/Please enter a valid amount greater than 0/i)).toBeInTheDocument();
    expect(screen.queryByText('Confirm Save Transaction')).not.toBeInTheDocument();
  });
});
