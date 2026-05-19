import { assertBalancedJournal } from '../accountingEngine.js';

function normalizeAccountType(classification, accountType) {
  if (accountType) return accountType;

  switch (classification) {
    case 'Asset':
      return 'Other Current Asset';
    case 'Liability':
      return 'Other Current Liability';
    case 'Equity':
      return 'Equity';
    case 'Revenue':
      return 'Income';
    case 'Expense':
      return 'Expense';
    default:
      return 'Expense';
  }
}

export function mapAccountToQuickBooksCanonical(account = {}) {
  return {
    id: account.id || null,
    code: account.account_code || null,
    name: account.name || 'Unnamed Account',
    classification: account.classification || 'Expense',
    account_type: normalizeAccountType(account.classification, account.account_type),
    active: account.is_active !== false,
    parent_account_id: account.parent_account_id || null,
  };
}

export function mapJournalEntryToQuickBooksCanonical(entry = {}) {
  const validation = assertBalancedJournal(entry.lines || []);

  return {
    doc_number: entry.entry_number || entry.id || null,
    txn_date: entry.posted_at || entry.created_at || new Date().toISOString(),
    private_note: entry.memo || null,
    currency: (entry.currency || 'usd').toUpperCase(),
    lines: validation.lines.map((line) => ({
      description: line.description || line.account_name,
      amount_cents: line.debit_cents > 0 ? line.debit_cents : line.credit_cents,
      posting_type: line.debit_cents > 0 ? 'Debit' : 'Credit',
      account_ref: {
        id: line.account_id || null,
        name: line.account_name,
      },
      classification: line.classification,
    })),
    draft_only: true,
  };
}

export default {
  mapAccountToQuickBooksCanonical,
  mapJournalEntryToQuickBooksCanonical,
};
