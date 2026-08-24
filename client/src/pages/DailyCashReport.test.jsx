import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DailyCashReport from './DailyCashReport';
import API from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const emptySummary = {
  dcr: null,
  remarks: '',
  collections: [],
  releases: [],
  expenses: [],
  passbooks: [],
  penalties: [],
  collectorsOver: [],
  otherTransactions: [],
  bankCharges: [],
  interest: [],
  withdrawals: [],
  deposits: [],
  adjustments: [],
  collection_breakdown: {},
};

describe('DailyCashReport date loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T08:00:00'));
    vi.clearAllMocks();
    API.get.mockImplementation(path => Promise.resolve({
      data: path === '/branches' ? [] : emptySummary,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads only the final complete date during keyboard-style changes', async () => {
    render(<DailyCashReport />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const dateInput = screen.getByDisplayValue('2026-08-24');
    API.get.mockClear();

    fireEvent.change(dateInput, { target: { value: '2026-08-02' } });
    fireEvent.change(dateInput, { target: { value: '2026-08-03' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(API.get).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const summaryCalls = API.get.mock.calls.filter(([path]) => path === '/dcr/summary');
    expect(summaryCalls).toEqual([[
      '/dcr/summary',
      { params: { date: '2026-08-03' } },
    ]]);
  });
});
