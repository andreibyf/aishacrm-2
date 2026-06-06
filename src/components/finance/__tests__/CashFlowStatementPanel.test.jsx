/**
 * CashFlowStatementPanel (Cash Flow Bridge B / Slice 2) — read-only cash-flow
 * statement. Asserts data / empty / error states and read-only safety.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/api/finance', () => ({ getCashFlow: vi.fn() }));

import * as finance from '@/api/finance';
import CashFlowStatementPanel from '../CashFlowStatementPanel';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

const STMT = {
  cash_flow: {
    cash_account_codes: ['1000'],
    periods: [
      {
        period: '2026-06',
        inflow_cents: 250000,
        outflow_cents: 0,
        net_cents: 250000,
        by_category: [{ classification: 'Revenue', inflow_cents: 250000, outflow_cents: 0 }],
      },
    ],
    totals: { inflow_cents: 250000, outflow_cents: 0, net_cents: 250000 },
  },
};

const EMPTY = { cash_flow: { cash_account_codes: [], periods: [], totals: { inflow_cents: 0, outflow_cents: 0, net_cents: 0 } } };

describe('CashFlowStatementPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders the statement with totals, period, and category breakdown (formatted USD)', async () => {
    finance.getCashFlow.mockResolvedValue(STMT);
    render(<CashFlowStatementPanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-cash-flow-statement')).toBeInTheDocument());
    expect(screen.getByTestId('finance-cash-flow-period-2026-06')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByTestId('finance-cash-flow-total-inflow')).toHaveTextContent('$2,500.00');
    expect(screen.getByTestId('finance-cash-flow-total-net')).toHaveTextContent('$2,500.00');
  });

  it('renders the honest empty state when nothing is posted', async () => {
    finance.getCashFlow.mockResolvedValue(EMPTY);
    render(<CashFlowStatementPanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-cash-flow-empty')).toBeInTheDocument());
    expect(screen.getByTestId('finance-cash-flow-empty')).toHaveTextContent(/once journals are posted/i);
  });

  it('renders the error state on failure', async () => {
    finance.getCashFlow.mockRejectedValue(new Error('boom'));
    render(<CashFlowStatementPanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-cash-flow-error')).toBeInTheDocument());
  });

  it('exposes no mutation control (read-only)', async () => {
    finance.getCashFlow.mockResolvedValue(STMT);
    const { container } = render(<CashFlowStatementPanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-cash-flow-statement')).toBeInTheDocument());
    const labels = Array.from(container.querySelectorAll('button')).map((b) => (b.textContent || '').toLowerCase());
    for (const verb of ['create', 'edit', 'delete', 'post', 'approve', 'reverse']) {
      expect(labels.some((l) => l.includes(verb))).toBe(false);
    }
  });
});
