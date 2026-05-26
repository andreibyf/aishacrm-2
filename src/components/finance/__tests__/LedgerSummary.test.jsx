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

  it('renders the empty-state copy when all three payloads are empty objects', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(screen.getByText('Ledger is empty for this tenant.')).toBeInTheDocument();
      expect(screen.getByText('No P&L data for this tenant yet.')).toBeInTheDocument();
      expect(screen.getByText('No balance-sheet data for this tenant yet.')).toBeInTheDocument();
    });
  });

  it('renders the loaded data as a key/value table per section', async () => {
    mockFinance.getLedger.mockResolvedValue({ accounts: { 1000: 0 }, currency: 'USD' });
    mockFinance.getProfitLoss.mockResolvedValue({ revenue: 100, expenses: 30, net: 70 });
    mockFinance.getBalanceSheet.mockResolvedValue({ assets: 500, liabilities: 200, equity: 300 });

    render(<LedgerSummary tenantId={TENANT_ID} />);

    await waitFor(() => {
      const ledgerSection = screen.getByTestId('finance-ledger-summary-section-ledger');
      expect(ledgerSection).toHaveTextContent('currency');
      expect(ledgerSection).toHaveTextContent('USD');
    });
    expect(screen.getByTestId('finance-ledger-summary-section-pl')).toHaveTextContent('revenue');
    expect(screen.getByTestId('finance-ledger-summary-section-pl')).toHaveTextContent('100');
    expect(screen.getByTestId('finance-ledger-summary-section-balance')).toHaveTextContent(
      'assets',
    );
    expect(screen.getByTestId('finance-ledger-summary-section-balance')).toHaveTextContent('500');
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

  it('exposes only the Refresh button — no mutating affordance', async () => {
    render(<LedgerSummary tenantId={TENANT_ID} />);
    await waitFor(() => expect(mockFinance.getLedger).toHaveBeenCalledOnce());
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim());
    expect(labels.every((l) => /refresh/i.test(l))).toBe(true);
  });
});
