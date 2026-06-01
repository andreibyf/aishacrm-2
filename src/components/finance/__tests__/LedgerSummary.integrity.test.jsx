/**
 * LedgerSummary — beta integrity hardening.
 *
 * Proves (a) the rendered figures equal the source numbers and (b) the balance
 * state is three-valued: an absent / failed / unbalanced sheet is NEVER shown
 * as "Balanced: Yes" (packet blocker: empty states must not hide calc errors).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mockFinance = {
  getLedger: vi.fn(),
  getProfitLoss: vi.fn(),
  getBalanceSheet: vi.fn(),
};
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return {
    ...actual,
    getLedger: (...a) => mockFinance.getLedger(...a),
    getProfitLoss: (...a) => mockFinance.getProfitLoss(...a),
    getBalanceSheet: (...a) => mockFinance.getBalanceSheet(...a),
  };
});

import LedgerSummary from '../LedgerSummary';

const TENANT_ID = '00000000-0000-4000-8000-000000000011';

beforeEach(() => {
  for (const fn of Object.values(mockFinance)) fn.mockReset();
  mockFinance.getLedger.mockResolvedValue({ accounts: [], totals: {} });
  mockFinance.getProfitLoss.mockResolvedValue({ totals: {} });
  mockFinance.getBalanceSheet.mockResolvedValue({ totals: {} });
});

afterEach(() => cleanup());

describe('LedgerSummary — integrity', () => {
  it('renders net income and assets from source numbers', async () => {
    mockFinance.getLedger.mockResolvedValue({
      accounts: [],
      totals: { debit_cents: 780000, credit_cents: 780000 },
    });
    mockFinance.getProfitLoss.mockResolvedValue({
      revenue_accounts: [],
      expense_accounts: [],
      totals: { revenue_cents: 200000, expense_cents: 80000, net_income_cents: 120000 },
    });
    mockFinance.getBalanceSheet.mockResolvedValue({
      assets: [],
      liabilities: [],
      equity: [],
      totals: {
        assets_cents: 620000,
        liabilities_cents: 0,
        equity_cents: 500000,
        is_balanced: false,
      },
    });

    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => expect(screen.getByText('$1,200.00')).toBeInTheDocument()); // net income
    expect(screen.getByText('$6,200.00')).toBeInTheDocument(); // assets
  });

  it('unbalanced sheet shows a visible warning, not a bare "Yes"', async () => {
    mockFinance.getBalanceSheet.mockResolvedValue({
      assets: [],
      liabilities: [],
      equity: [],
      totals: {
        assets_cents: 620000,
        liabilities_cents: 0,
        equity_cents: 500000,
        is_balanced: false,
      },
    });
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() =>
      expect(screen.getByTestId('ledger-balance-state')).toHaveTextContent(/unbalanced/i),
    );
  });

  it('absent is_balanced field is shown as Unknown, never "Yes"', async () => {
    mockFinance.getBalanceSheet.mockResolvedValue({
      assets: [],
      liabilities: [],
      equity: [],
      totals: { assets_cents: 0, liabilities_cents: 0, equity_cents: 0 },
    });
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() =>
      expect(screen.getByTestId('ledger-balance-state')).toHaveTextContent(/unknown/i),
    );
    expect(screen.getByTestId('ledger-balance-state')).not.toHaveTextContent('Yes');
  });

  it('failed balance-sheet fetch surfaces an error and is never shown as balanced', async () => {
    mockFinance.getBalanceSheet.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 }),
    );
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() =>
      expect(
        screen.getByTestId('finance-ledger-summary-section-balance-error'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('ledger-balance-state')).not.toBeInTheDocument();
  });
});
