import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/api/financeWrites', () => ({
  simulateDealWon: vi.fn(() => Promise.resolve({})),
  createJournalDraft: vi.fn(() => Promise.resolve({})),
  createDraftInvoice: vi.fn(() => Promise.resolve({})),
}));

import * as writes from '@/api/financeWrites';
import FinanceCreatePanel from '../FinanceCreatePanel';

const T = 'tenant-1';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FinanceCreatePanel', () => {
  it('simulate deal-won converts dollars→cents and fires onCreated', async () => {
    const onCreated = vi.fn();
    render(<FinanceCreatePanel tenantId={T} onCreated={onCreated} />);
    fireEvent.change(screen.getByTestId('finance-create-deal-amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('finance-create-deal-btn'));
    await waitFor(() =>
      expect(writes.simulateDealWon).toHaveBeenCalledWith(T, {
        amount_cents: 2500,
        currency: 'usd',
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.getByTestId('finance-create-feedback')).toBeInTheDocument();
  });

  it('journal draft builds balanced debit/credit lines', async () => {
    render(<FinanceCreatePanel tenantId={T} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('finance-create-journal-amount'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByTestId('finance-create-journal-btn'));
    await waitFor(() => expect(writes.createJournalDraft).toHaveBeenCalled());
    const payload = writes.createJournalDraft.mock.calls[0][1];
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[0].debit_cents).toBe(1000);
    expect(payload.lines[0].credit_cents).toBe(0);
    expect(payload.lines[1].debit_cents).toBe(0);
    expect(payload.lines[1].credit_cents).toBe(1000);
  });

  it('rejects a non-positive amount with an error and no API call', async () => {
    render(<FinanceCreatePanel tenantId={T} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('finance-create-invoice-amount'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('finance-create-invoice-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('finance-create-feedback')).toHaveTextContent(/positive/i),
    );
    expect(writes.createDraftInvoice).not.toHaveBeenCalled();
  });

  it('surfaces a backend error in the feedback', async () => {
    writes.simulateDealWon.mockRejectedValueOnce(new Error('governance blocked'));
    render(<FinanceCreatePanel tenantId={T} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByTestId('finance-create-deal-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('finance-create-feedback')).toHaveTextContent('governance blocked'),
    );
  });
});
