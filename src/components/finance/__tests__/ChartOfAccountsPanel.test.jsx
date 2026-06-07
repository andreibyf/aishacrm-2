/**
 * ChartOfAccountsPanel — editable Chart of Accounts manager (design 2026-06-06,
 * Phase 5 / Tasks 17-19). Covers: read states; the create form (type options
 * filter by classification; submit calls the client); LOCK-STATE rendering
 * (system → no edit; posted-history → classification/code disabled + reason
 * required; no-history → all enabled); deactivate/reactivate toggle; the
 * active/inactive filter; and FINANCE_COA_* error surfacing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/api/finance', () => ({
  getAccounts: vi.fn(),
}));
vi.mock('@/api/financeWrites', () => ({
  createAccount: vi.fn(() => Promise.resolve({})),
  updateAccount: vi.fn(() => Promise.resolve({})),
  deactivateAccount: vi.fn(() => Promise.resolve({})),
  reactivateAccount: vi.fn(() => Promise.resolve({})),
}));

import * as finance from '@/api/finance';
import * as writes from '@/api/financeWrites';
import ChartOfAccountsPanel from '../ChartOfAccountsPanel';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

const SYSTEM_ACCT = {
  id: 'sys1',
  account_code: '1000',
  name: 'Cash',
  classification: 'Asset',
  account_type: 'Cash',
  is_system: true,
  is_active: true,
  has_posted_history: false,
  source: 'system',
};
const NO_HISTORY_ACCT = {
  id: 'nh1',
  account_code: '4500',
  name: 'Consulting Fees',
  classification: 'Revenue',
  account_type: 'Revenue',
  is_system: false,
  is_active: true,
  has_posted_history: false,
  source: 'manual',
};
const POSTED_ACCT = {
  id: 'ph1',
  account_code: '1500',
  name: 'Operating Bank',
  classification: 'Asset',
  account_type: 'Bank',
  is_system: false,
  is_active: true,
  has_posted_history: true,
  source: 'manual',
};
const INACTIVE_ACCT = {
  id: 'in1',
  account_code: '5500',
  name: 'Old Expense',
  classification: 'Expense',
  account_type: 'Expense',
  is_system: false,
  is_active: false,
  has_posted_history: false,
  source: 'manual',
};

const ALL = [SYSTEM_ACCT, NO_HISTORY_ACCT, POSTED_ACCT, INACTIVE_ACCT];

describe('ChartOfAccountsPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  async function renderWith(accounts) {
    finance.getAccounts.mockResolvedValue({ accounts });
    render(<ChartOfAccountsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-chart-of-accounts-table')).toBeInTheDocument(),
    );
  }

  describe('read states', () => {
    it('renders the chart rows', async () => {
      await renderWith(ALL);
      expect(screen.getByText('Consulting Fees')).toBeInTheDocument();
      expect(screen.getByText('Operating Bank')).toBeInTheDocument();
    });

    it('preserves the per-panel CSV export affordance (regression: the COA tab was exportable)', async () => {
      await renderWith(ALL);
      // FinanceCsvExportButton renders data-testid `finance-export-<area>`
      expect(screen.getByTestId('finance-export-chart-of-accounts')).toBeInTheDocument();
    });

    it('exposes a PDF export alongside the CSV export', async () => {
      await renderWith(ALL);
      // FinancePdfExportButton renders data-testid `finance-pdf-<area>`
      expect(screen.getByTestId('finance-pdf-chart-of-accounts')).toBeInTheDocument();
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
  });

  describe('Task 17 — create form', () => {
    it('renders the new-account form', async () => {
      await renderWith(ALL);
      expect(screen.getByTestId('coa-create-form')).toBeInTheDocument();
      expect(screen.getByTestId('coa-create-name')).toBeInTheDocument();
      expect(screen.getByTestId('coa-create-classification')).toBeInTheDocument();
      expect(screen.getByTestId('coa-create-type')).toBeInTheDocument();
    });

    it('the account_type options change with the selected classification', async () => {
      await renderWith(ALL);
      const typeSelect = screen.getByTestId('coa-create-type');
      // Asset (default) → Asset/Cash/Bank/Receivable/Suspense
      let opts = within(typeSelect)
        .getAllByRole('option')
        .map((o) => o.value);
      expect(opts).toEqual(['Asset', 'Cash', 'Bank', 'Receivable', 'Suspense']);

      fireEvent.change(screen.getByTestId('coa-create-classification'), {
        target: { value: 'Liability' },
      });
      opts = within(typeSelect)
        .getAllByRole('option')
        .map((o) => o.value);
      expect(opts).toEqual(['Liability', 'Payable']);

      fireEvent.change(screen.getByTestId('coa-create-classification'), {
        target: { value: 'Revenue' },
      });
      opts = within(typeSelect)
        .getAllByRole('option')
        .map((o) => o.value);
      expect(opts).toEqual(['Revenue']);
    });

    it('submit calls createAccount with the entered values', async () => {
      await renderWith(ALL);
      fireEvent.change(screen.getByTestId('coa-create-name'), {
        target: { value: 'Operating Account' },
      });
      fireEvent.change(screen.getByTestId('coa-create-classification'), {
        target: { value: 'Asset' },
      });
      fireEvent.change(screen.getByTestId('coa-create-type'), { target: { value: 'Bank' } });
      fireEvent.click(screen.getByTestId('coa-create-submit'));
      await waitFor(() =>
        expect(writes.createAccount).toHaveBeenCalledWith(TENANT, {
          name: 'Operating Account',
          classification: 'Asset',
          account_type: 'Bank',
        }),
      );
    });
  });

  describe('Task 18 — edit + lock rendering', () => {
    it('shows an Edit affordance for a SYSTEM account row (rename is allowed)', async () => {
      finance.getAccounts.mockResolvedValue({
        accounts: [
          {
            id: 'sys1',
            account_code: '1000',
            name: 'Cash',
            classification: 'Asset',
            account_type: 'Cash',
            is_system: true,
            is_active: true,
            has_posted_history: true,
          },
        ],
      });
      render(<ChartOfAccountsPanel tenantId={TENANT} />);
      expect(await screen.findByTestId('coa-edit-sys1')).toBeInTheDocument();
      // no deactivate control for a system account
      expect(screen.queryByTestId('coa-deactivate-sys1')).not.toBeInTheDocument();
      // labelled "System" rather than "Locked"
      expect(screen.getByTestId('coa-row-system-sys1')).toBeInTheDocument();
    });

    it('locks classification + code and requires a reason when editing a SYSTEM account', async () => {
      finance.getAccounts.mockResolvedValue({
        accounts: [
          {
            id: 'sys1',
            account_code: '1000',
            name: 'Cash',
            classification: 'Asset',
            account_type: 'Cash',
            is_system: true,
            is_active: true,
            has_posted_history: false,
          },
        ],
      });
      render(<ChartOfAccountsPanel tenantId={TENANT} />);
      fireEvent.click(await screen.findByTestId('coa-edit-sys1'));
      expect(screen.getByTestId('coa-edit-classification-sys1')).toBeDisabled();
      expect(screen.getByTestId('coa-edit-code-sys1')).toBeDisabled();
      expect(screen.getByTestId('coa-edit-reason-sys1')).toBeInTheDocument();
    });

    it('a SYSTEM edit save includes the reason and omits classification/code', async () => {
      finance.getAccounts.mockResolvedValue({
        accounts: [
          {
            id: 'sys1',
            account_code: '1000',
            name: 'Cash',
            classification: 'Asset',
            account_type: 'Cash',
            is_system: true,
            is_active: true,
            has_posted_history: false,
          },
        ],
      });
      render(<ChartOfAccountsPanel tenantId={TENANT} />);
      fireEvent.click(await screen.findByTestId('coa-edit-sys1'));
      fireEvent.change(screen.getByTestId('coa-edit-name-sys1'), {
        target: { value: 'Operating Cash' },
      });
      fireEvent.change(screen.getByTestId('coa-edit-reason-sys1'), {
        target: { value: 'beta display rename' },
      });
      fireEvent.click(screen.getByTestId('coa-edit-save-sys1'));
      await waitFor(() => expect(writes.updateAccount).toHaveBeenCalled());
      const payload = writes.updateAccount.mock.calls[0][2];
      expect(payload.name).toBe('Operating Cash');
      expect(payload.reason).toBe('beta display rename');
      expect(payload).not.toHaveProperty('classification');
      expect(payload).not.toHaveProperty('account_code');
    });

    it('a posted-history row renders classification + code DISABLED with a reason field', async () => {
      await renderWith([POSTED_ACCT]);
      fireEvent.click(screen.getByTestId('coa-edit-ph1'));
      expect(screen.getByTestId('coa-edit-classification-ph1')).toBeDisabled();
      expect(screen.getByTestId('coa-edit-code-ph1')).toBeDisabled();
      // name + type stay editable
      expect(screen.getByTestId('coa-edit-name-ph1')).not.toBeDisabled();
      expect(screen.getByTestId('coa-edit-type-ph1')).not.toBeDisabled();
      // reason field is shown (required to submit)
      expect(screen.getByTestId('coa-edit-reason-ph1')).toBeInTheDocument();
    });

    it('a no-history row renders classification + code ENABLED and no required reason field', async () => {
      await renderWith([NO_HISTORY_ACCT]);
      fireEvent.click(screen.getByTestId('coa-edit-nh1'));
      expect(screen.getByTestId('coa-edit-classification-nh1')).not.toBeDisabled();
      expect(screen.getByTestId('coa-edit-code-nh1')).not.toBeDisabled();
      expect(screen.queryByTestId('coa-edit-reason-nh1')).not.toBeInTheDocument();
    });

    it('saving an edit calls updateAccount with the payload', async () => {
      await renderWith([NO_HISTORY_ACCT]);
      fireEvent.click(screen.getByTestId('coa-edit-nh1'));
      fireEvent.change(screen.getByTestId('coa-edit-name-nh1'), {
        target: { value: 'Advisory Fees' },
      });
      fireEvent.click(screen.getByTestId('coa-edit-save-nh1'));
      await waitFor(() => expect(writes.updateAccount).toHaveBeenCalled());
      const [tid, id, payload] = writes.updateAccount.mock.calls[0];
      expect(tid).toBe(TENANT);
      expect(id).toBe('nh1');
      expect(payload.name).toBe('Advisory Fees');
      // no-history edit omits classification/code locks (they're sent, since editable)
      expect(payload.classification).toBe('Revenue');
    });

    it('a posted-history edit includes the reason and omits classification/code', async () => {
      await renderWith([POSTED_ACCT]);
      fireEvent.click(screen.getByTestId('coa-edit-ph1'));
      fireEvent.change(screen.getByTestId('coa-edit-name-ph1'), {
        target: { value: 'Main Bank' },
      });
      fireEvent.change(screen.getByTestId('coa-edit-reason-ph1'), {
        target: { value: 'rename for clarity' },
      });
      fireEvent.click(screen.getByTestId('coa-edit-save-ph1'));
      await waitFor(() => expect(writes.updateAccount).toHaveBeenCalled());
      const payload = writes.updateAccount.mock.calls[0][2];
      expect(payload.name).toBe('Main Bank');
      expect(payload.reason).toBe('rename for clarity');
      expect(payload).not.toHaveProperty('classification');
      expect(payload).not.toHaveProperty('account_code');
    });
  });

  describe('Task 19 — deactivate / reactivate + filter + errors', () => {
    it('the deactivate control is hidden for system accounts', async () => {
      await renderWith([SYSTEM_ACCT]);
      expect(screen.queryByTestId('coa-deactivate-sys1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('coa-reactivate-sys1')).not.toBeInTheDocument();
    });

    it('deactivate requires a reason and calls deactivateAccount', async () => {
      await renderWith([NO_HISTORY_ACCT]);
      fireEvent.click(screen.getByTestId('coa-deactivate-nh1'));
      const confirm = screen.getByTestId('coa-deactivate-confirm-nh1');
      // empty reason → disabled
      expect(confirm).toBeDisabled();
      fireEvent.change(screen.getByTestId('coa-deactivate-reason-nh1'), {
        target: { value: 'no longer used' },
      });
      expect(confirm).not.toBeDisabled();
      fireEvent.click(confirm);
      await waitFor(() =>
        expect(writes.deactivateAccount).toHaveBeenCalledWith(TENANT, 'nh1', {
          reason: 'no longer used',
        }),
      );
    });

    it('an inactive row offers Reactivate (hidden by default; shown via the filter)', async () => {
      await renderWith(ALL);
      // default: inactive hidden
      expect(screen.queryByTestId('coa-row-in1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('coa-show-inactive'));
      await waitFor(() => expect(screen.getByTestId('coa-row-in1')).toBeInTheDocument());
      expect(screen.getByTestId('coa-reactivate-in1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('coa-reactivate-in1'));
      fireEvent.change(screen.getByTestId('coa-reactivate-reason-in1'), {
        target: { value: 'back in use' },
      });
      fireEvent.click(screen.getByTestId('coa-reactivate-confirm-in1'));
      await waitFor(() =>
        expect(writes.reactivateAccount).toHaveBeenCalledWith(TENANT, 'in1', {
          reason: 'back in use',
        }),
      );
    });

    it('the filter hides inactive accounts by default and reveals them when toggled', async () => {
      await renderWith(ALL);
      expect(screen.queryByText('Old Expense')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('coa-show-inactive'));
      await waitFor(() => expect(screen.getByText('Old Expense')).toBeInTheDocument());
    });

    it('surfaces a mapped FINANCE_COA_* reason when a mutation is rejected', async () => {
      writes.createAccount.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { status: 409, code: 'FINANCE_COA_DUPLICATE_NAME' }),
      );
      await renderWith(ALL);
      fireEvent.change(screen.getByTestId('coa-create-name'), { target: { value: 'Cash' } });
      fireEvent.click(screen.getByTestId('coa-create-submit'));
      await waitFor(() =>
        expect(screen.getByTestId('coa-error')).toHaveTextContent(/already exists/i),
      );
    });

    it('falls back to the backend message for an unknown error code', async () => {
      writes.deactivateAccount.mockRejectedValueOnce(
        Object.assign(new Error('weird backend failure'), { status: 500, code: 'SOMETHING_ELSE' }),
      );
      await renderWith([NO_HISTORY_ACCT]);
      fireEvent.click(screen.getByTestId('coa-deactivate-nh1'));
      fireEvent.change(screen.getByTestId('coa-deactivate-reason-nh1'), {
        target: { value: 'x' },
      });
      fireEvent.click(screen.getByTestId('coa-deactivate-confirm-nh1'));
      await waitFor(() =>
        expect(screen.getByTestId('coa-error')).toHaveTextContent('weird backend failure'),
      );
    });
  });
});
