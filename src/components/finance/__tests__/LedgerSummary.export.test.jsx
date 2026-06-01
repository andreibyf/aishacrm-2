/**
 * LedgerSummary CSV export (Beta Exports slice).
 *
 * Packet regression target: the Ledger Summary export must carry operator-facing
 * labels + formatted $ amounts, NOT raw `*_cents` keys or raw API JSON.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

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

import * as csv from '../financeCsv';
import LedgerSummary from '../LedgerSummary';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => {
  for (const fn of Object.values(mockFinance)) fn.mockReset();
  mockFinance.getLedger.mockResolvedValue({ accounts: [], totals: {} });
  mockFinance.getProfitLoss.mockResolvedValue({ totals: {} });
  mockFinance.getBalanceSheet.mockResolvedValue({ totals: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LedgerSummary — CSV export', () => {
  it('exports operator labels and $ amounts, not raw *_cents or JSON', async () => {
    mockFinance.getLedger.mockResolvedValue({
      accounts: [{ account_name: 'Cash', balance_cents: 620000 }],
      totals: { debit_cents: 780000, credit_cents: 780000 },
    });
    mockFinance.getProfitLoss.mockResolvedValue({
      totals: { revenue_cents: 200000, expense_cents: 80000, net_income_cents: 120000 },
    });
    mockFinance.getBalanceSheet.mockResolvedValue({
      totals: {
        assets_cents: 620000,
        liabilities_cents: 0,
        equity_cents: 500000,
        is_balanced: false,
      },
    });
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});

    render(<LedgerSummary tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-export-ledger')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('finance-export-ledger'));

    const records = spy.mock.calls[0][0];
    const flat = JSON.stringify(records);
    expect(flat).toMatch(/Net income/);
    expect(flat).toMatch(/\$1,200\.00/); // net income
    expect(flat).toMatch(/\$6,200\.00/); // assets
    expect(flat).not.toMatch(/net_income_cents/);
    expect(flat).not.toMatch(/_cents/);
  });

  it('disables export when all three statement fetches fail (nothing loaded)', async () => {
    const boom = Object.assign(new Error('boom'), { status: 500 });
    mockFinance.getLedger.mockRejectedValue(boom);
    mockFinance.getProfitLoss.mockRejectedValue(boom);
    mockFinance.getBalanceSheet.mockRejectedValue(boom);
    render(<LedgerSummary tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-export-ledger')).toBeDisabled());
  });
});
