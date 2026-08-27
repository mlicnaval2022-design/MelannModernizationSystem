import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Loans from './Loans';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    defaults: { baseURL: '/api' },
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/ReloanModal', () => ({ default: () => null }));
vi.mock('../components/ConfirmModal', () => ({ default: () => null }));
vi.mock('./FullyPaid', () => ({ default: () => <div>Fully Paid</div> }));

const relaxLoan = {
  id: 41,
  customer_id: 17,
  customer_code: '3700',
  customer_name: 'RETURBAR, JESSICA TORRES',
  customer_status: 'RELAX',
  loan_code: '36348',
  loan_type: 'Reloan',
  principal: 3000,
  interest_amount: 450,
  total_amortization: 3450,
  balance: 0,
  status: 'fullpaid',
  date_released: '2026-07-27',
  date_maturity: '2026-09-11',
  collector_name: 'Sem Jesson Narido',
  status_note: 'WALA PAY GAMITAN',
};

describe('Loans Relax printing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ hasRole: () => false });
    API.get.mockImplementation(path => Promise.resolve({
      data: path.includes('status=relax') ? [relaxLoan] : [],
    }));
    window.print = vi.fn();
  });

  it('prints the filtered Relax report with the required client fields and reason', async () => {
    render(<MemoryRouter><Loans /></MemoryRouter>);

    fireEvent.click(screen.getByText('Relax', { selector: '.custom-tabs > div' }));
    await waitFor(() => expect(API.get).toHaveBeenCalledWith('/loans?status=relax'));

    const report = await screen.findByLabelText('Relax clients printable report');
    const reportView = within(report);

    expect(reportView.getByText('3700')).toBeInTheDocument();
    expect(reportView.getByText('RETURBAR, JESSICA TORRES')).toBeInTheDocument();
    expect(reportView.getByText('Jul 27, 2026')).toBeInTheDocument();
    expect(reportView.getByText('Sep 11, 2026')).toBeInTheDocument();
    expect(reportView.getAllByText('₱ 3,450.00')).toHaveLength(2);
    expect(reportView.getByText('Sem Jesson Narido')).toBeInTheDocument();
    expect(reportView.getByText('WALA PAY GAMITAN')).toBeInTheDocument();

    const printButtons = screen.getAllByRole('button', { name: /print/i });
    fireEvent.click(printButtons[0]);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
