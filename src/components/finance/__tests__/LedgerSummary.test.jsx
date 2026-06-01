/**
 * LedgerSummary (UI-1C) — live data panel covering ledger / P&L /
 * balance-sheet sections via Promise.allSettled fetch.
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

import LedgerSummary from '../LedgerSummary';

const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => {
  for (const fn of Object.values(mockFinance)) fn.mockReset();
  mockFinance.getLedger.mockResolvedValue({});
  mockFinance.getProfitLoss.mockResolvedValue({});
  mockFinance.getBalanceSheet.mockResolvedValue({});
});

afterEach(() => cleanup());

describe('LedgerSummary', () => {
  it('fetches all three endpoints on mount with the tenant id', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(mockFinance.getLedger).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ signal: expect.anything() }),
      );
      expect(mockFinance.getProfitLoss).toHaveBeenCalledOnce();
      expect(mockFinance.getBalanceSheet).toHaveBeenCalledOnce();
    });
  });

  it('renders operator-friendly empty-state copy when all three payloads are empty', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(
        screen.getByText('No ledger accounts available for this tenant yet.'),
      ).toBeInTheDocument();
      expect(screen.getByText('No revenue or expense accounts available yet.')).toBeInTheDocument();
      expect(
        screen.getByText('No assets, liabilities, or equity accounts available yet.'),
      ).toBeInTheDocument();
    });
  });

  it('formats cents data as currency with readable labels — not raw API field names', async () => {
    mockFinance.getLedger.mockResolvedValue({
      accounts: [{ account_name: 'Accounts Receivable', balance_cents: 540000 }],
      totals: { debit_cents: 627550, credit_cents: 660000 },
    });
    mockFinance.getProfitLoss.mockResolvedValue({
      revenue_accounts: [{ account_name: 'Sales', amount_cents: 660000 }],
      expense_accounts: [{ account_name: 'COGS', amount_cents: 130550 }],
      totals: { revenue_cents: 660000, expense_cents: 130550, net_income_cents: 529450 },
    });
    mockFinance.getBalanceSheet.mockResolvedValue({
      assets: [{ account_name: 'AR', amount_cents: 540000 }],
      liabilities: [],
      equity: [{ account_name: 'RE', amount_cents: 540000 }],
      totals: {
        assets_cents: 540000,
        liabilities_cents: 0,
        equity_cents: 540000,
        is_balanced: true,
      },
    });

    render(<LedgerSummary tenantId={TENANT_ID} />);

    const pl = await screen.findByTestId('finance-ledger-summary-section-pl');
    expect(pl).toHaveTextContent('Net income');
    expect(pl).toHaveTextContent('$5,294.50');
    expect(pl).not.toHaveTextContent('net_income_cents');

    const ledger = screen.getByTestId('finance-ledger-summary-section-ledger');
    expect(ledger).toHaveTextContent('Debits');
    expect(ledger).toHaveTextContent('$6,275.50');
    expect(ledger).not.toHaveTextContent('debit_cents');

    const balance = screen.getByTestId('finance-ledger-summary-section-balance');
    expect(balance).toHaveTextContent('Balanced');
    expect(balance).toHaveTextContent('Yes');
    expect(balance).not.toHaveTextContent('is_balanced');
  });

  it('renders the per-section error block when a single fetch fails', async () => {
    mockFinance.getLedger.mockResolvedValue({ accounts: {} });
    mockFinance.getProfitLoss.mockRejectedValue(
      Object.assign(new Error('Boom'), { status: 500, code: null }),
    );
    mockFinance.getBalanceSheet.mockResolvedValue({ assets: 1 });

    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ledger-summary-section-pl-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-ledger-summary-section-pl-error')).toHaveTextContent('Boom');
    // Other sections still rendered
    expect(screen.getByTestId('finance-ledger-summary-section-ledger')).toBeInTheDocument();
    expect(screen.getByTestId('finance-ledger-summary-section-balance')).toBeInTheDocument();
  });

  it('refresh re-issues all three GETs', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => expect(mockFinance.getLedger).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByTestId('finance-ledger-summary-refresh'));
    await waitFor(() => {
      expect(mockFinance.getLedger).toHaveBeenCalledTimes(2);
      expect(mockFinance.getProfitLoss).toHaveBeenCalledTimes(2);
      expect(mockFinance.getBalanceSheet).toHaveBeenCalledTimes(2);
    });
  });

  it('does not call the API when tenantId is missing', async () => {
    render(<LedgerSummary tenantId={null} />);
    // Give a tick so any fetch would have dispatched
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFinance.getLedger).not.toHaveBeenCalled();
  });

  it('exposes only read-only controls (Refresh + Export CSV) — no mutating affordance', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => expect(mockFinance.getLedger).toHaveBeenCalledOnce());
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim());
    // Refresh (re-read) and Export CSV (read-only recordkeeping serialization) only.
    expect(labels.every((l) => /refresh|export/i.test(l))).toBe(true);
  });
});
