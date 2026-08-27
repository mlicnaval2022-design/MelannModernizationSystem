import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CustomerWizard from './CustomerWizard';

vi.mock('../services/philippineAddress', () => ({
  regions: vi.fn(() => Promise.resolve([])),
  provinces: vi.fn(() => Promise.resolve([])),
  cities: vi.fn(() => Promise.resolve([])),
  barangays: vi.fn(() => Promise.resolve([]))
}));

describe('CustomerWizard', () => {
  it('renders the registration workflow with collector selection', () => {
    render(
      <CustomerWizard
        collectors={[{ id: 1, first_name: 'Ana', last_name: 'Santos' }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: /new customer registration/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ana santos/i })).toBeInTheDocument();
  });

  it('shows the collateral field in Business Information', () => {
    render(
      <CustomerWizard
        collectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText('Business Information')[0]);

    expect(screen.getByRole('textbox', { name: 'Collateral' })).toBeInTheDocument();
  });
});
