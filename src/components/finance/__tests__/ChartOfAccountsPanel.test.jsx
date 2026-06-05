/**
 * ChartOfAccountsPanel (Finance COA Slice 1) — read-only chart of accounts.
 * Asserts data / empty / error states and read-only safety (only Refresh /
 * Export controls; no create/edit/deactivate affordance).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/api/finance', () => ({
  getAccounts: vi.fn(),
}));

import * as finance from '@/api/finance';
import ChartOfAccountsPanel from '../ChartOfAccountsPanel';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

const ACCOUNTS = [
  {
    id: 'a1', account_code: '1000', name: 'Cash', classification: 'Asset',
    account_type: 'Cash', parent_account_id: null, is_system: true, is_active: true,
  },
  {
    id: 'a2', account_code: '4500', name: 'Consulting Fees', classification: 'Revenue',
    account_type: 'Revenue', parent_account_id: null, is_system: false, is_active: true,
  },
];

describe('ChartOfAccountsPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders the chart with codes, types, and a Yes/No system flag', async () => {
    finance.getAccounts.mockResolvedValue({ accounts: ACCOUNTS });
    render(<ChartOfAccountsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-chart-of-accounts-table')).toBeInTheDocument(),
    );
    expect(screen.getByText('1000')).toBeInTheDocument();
    // 'Cash' appears twice for account 1000 (name + account_type column)
    expect(screen.getAllByText('Cash').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('4500')).toBeInTheDocument();
    expect(screen.getByText('Consulting Fees')).toBeInTheDocument();
    // system flag rendered as Yes/No (not raw true/false)
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders the empty state when there are no accounts', async () => {
    finance.getAccounts.mockResolvedValue({ accounts: [] });
    render(<ChartOfAccountsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-chart-of-accounts-empty')).toBeInTheDocument(),
    );
  });

  it('renders the error state when the read fails', async () => {
    finance.getAccounts.mockRejectedValue(new Error('boom'));
    render(<ChartOfAccountsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-chart-of-accounts-error')).toBeInTheDocument(),
    );
  });

  it('exposes no mutation control (read-only)', async () => {
    finance.getAccounts.mockResolvedValue({ accounts: ACCOUNTS });
    const { container } = render(<ChartOfAccountsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-chart-of-accounts-table')).toBeInTheDocument(),
    );
    const labels = Array.from(container.querySelectorAll('button')).map((b) =>
      (b.textContent || '').toLowerCase(),
    );
    for (const verb of ['create', 'edit', 'delete', 'deactivate', 'new account']) {
      expect(labels.some((l) => l.includes(verb))).toBe(false);
    }
  });
});
