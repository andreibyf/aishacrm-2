import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/api/financeWrites', () => ({
  createJournalDraft: vi.fn(() => Promise.resolve({})),
  createDraftInvoice: vi.fn(() => Promise.resolve({})),
  submitJournalDraft: vi.fn(() => Promise.resolve({})),
  submitDraftInvoice: vi.fn(() => Promise.resolve({})),
  approveFinanceAction: vi.fn(() => Promise.resolve({})),
  reverseJournalEntry: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/api/finance', () => ({
  getApprovals: vi.fn(() => Promise.resolve({ approvals: [] })),
  getJournalDrafts: vi.fn(() => Promise.resolve({ journal_drafts: [] })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import * as writes from '@/api/financeWrites';
import * as finance from '@/api/finance';
import NewJournalEntryForm from '../NewJournalEntryForm';
import ApprovalQueuePanel from '../ApprovalQueuePanel';
import JournalDraftsPanel from '../JournalDraftsPanel';

const T = 'tenant-1';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NewJournalEntryForm', () => {
  it('disables submit until the entry is balanced + named, then sends cents', async () => {
    render(<NewJournalEntryForm tenantId={T} onCreated={vi.fn()} />);
    const submit = screen.getByTestId('finance-new-journal-submit');
    expect(submit).toBeDisabled();

    // Two default lines (Asset / Revenue). Name + balance them.
    fireEvent.change(screen.getByLabelText('Account 1'), { target: { value: 'Cash' } });
    fireEvent.change(screen.getByLabelText('Account 2'), { target: { value: 'Sales Revenue' } });
    fireEvent.change(screen.getByLabelText('Debit 1'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Credit 2'), { target: { value: '25' } });

    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(writes.createJournalDraft).toHaveBeenCalledTimes(1));
    const [tenant, payload] = writes.createJournalDraft.mock.calls[0];
    expect(tenant).toBe(T);
    expect(payload.lines[0]).toMatchObject({
      account_name: 'Cash',
      classification: 'Asset',
      debit_cents: 2500,
      credit_cents: 0,
    });
    expect(payload.lines[1]).toMatchObject({ credit_cents: 2500, debit_cents: 0 });
  });

  it('keeps submit disabled when debit ≠ credit', () => {
    render(<NewJournalEntryForm tenantId={T} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Account 1'), { target: { value: 'Cash' } });
    fireEvent.change(screen.getByLabelText('Account 2'), { target: { value: 'Revenue' } });
    fireEvent.change(screen.getByLabelText('Debit 1'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Credit 2'), { target: { value: '20' } });
    expect(screen.getByTestId('finance-new-journal-submit')).toBeDisabled();
  });
});

describe('ApprovalQueuePanel write gating', () => {
  const pending = {
    approvals: [
      { id: 'appr-1', status: 'pending', subject_type: 'journal_entry', subject_id: 'j1' },
    ],
  };

  it('shows an Approve action on pending rows when canWrite, and posts on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true); // approve has a confirm prompt
    finance.getApprovals.mockResolvedValueOnce(pending);
    render(<ApprovalQueuePanel tenantId={T} canWrite />);
    const btn = await screen.findByTestId('finance-approve-appr-1');
    fireEvent.click(btn);
    await waitFor(() => expect(writes.approveFinanceAction).toHaveBeenCalledWith(T, 'appr-1'));
  });

  it('renders no Approve action when canWrite is false (read-only)', async () => {
    finance.getApprovals.mockResolvedValueOnce(pending);
    render(<ApprovalQueuePanel tenantId={T} canWrite={false} />);
    await screen.findByText('appr-1');
    expect(screen.queryByTestId('finance-approve-appr-1')).toBeNull();
  });
});

describe('JournalDraftsPanel write gating', () => {
  it('shows Submit only on draft rows when canWrite', async () => {
    finance.getJournalDrafts.mockResolvedValueOnce({
      journal_drafts: [
        { id: 'd1', status: 'draft' },
        { id: 'd2', status: 'pending_approval' },
      ],
    });
    render(<JournalDraftsPanel tenantId={T} canWrite />);
    expect(await screen.findByTestId('finance-submit-journal-d1')).toBeInTheDocument();
    // pending_approval row has no submit action
    expect(screen.queryByTestId('finance-submit-journal-d2')).toBeNull();
  });
});
