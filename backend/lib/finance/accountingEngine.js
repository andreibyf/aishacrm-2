import { randomUUID } from 'node:crypto';

export const FINANCE_CLASSIFICATIONS = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

function toInteger(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? Math.trunc(normalized) : 0;
}

function normalizeLine(line = {}, index = 0) {
  return {
    id: line.id || `line_${index + 1}`,
    account_id: line.account_id || null,
    account_name: line.account_name || 'Uncategorized',
    classification: FINANCE_CLASSIFICATIONS.includes(line.classification)
      ? line.classification
      : 'Expense',
    line_number: Number.isInteger(line.line_number) ? line.line_number : index + 1,
    description: line.description || null,
    debit_cents: Math.max(0, toInteger(line.debit_cents)),
    credit_cents: Math.max(0, toInteger(line.credit_cents)),
  };
}

export function validateJournalLines(lines = []) {
  const normalizedLines = Array.isArray(lines) ? lines.map(normalizeLine) : [];
  const errors = [];

  if (normalizedLines.length === 0) {
    errors.push('At least one journal line is required.');
  }

  let debitCents = 0;
  let creditCents = 0;

  normalizedLines.forEach((line) => {
    debitCents += line.debit_cents;
    creditCents += line.credit_cents;

    if (line.debit_cents > 0 && line.credit_cents > 0) {
      errors.push(`Line ${line.line_number} cannot contain both debit and credit amounts.`);
    }

    if (line.debit_cents === 0 && line.credit_cents === 0) {
      errors.push(`Line ${line.line_number} must contain either a debit or a credit amount.`);
    }
  });

  if (debitCents !== creditCents) {
    errors.push(
      `Journal entry is unbalanced: debit ${debitCents} cents does not equal credit ${creditCents} cents.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    debit_cents: debitCents,
    credit_cents: creditCents,
    lines: normalizedLines,
  };
}

export function assertBalancedJournal(lines = []) {
  const validation = validateJournalLines(lines);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(' '));
    error.code = 'FINANCE_UNBALANCED_JOURNAL';
    error.statusCode = 400;
    error.details = validation;
    throw error;
  }
  return validation;
}

function getPostedEntries(entries = []) {
  return (Array.isArray(entries) ? entries : []).filter((entry) =>
    ['posted', 'reversed'].includes(entry?.status),
  );
}

function getAccountBucket(map, line) {
  const key = line.account_id || `${line.classification}:${line.account_name}`;
  if (!map.has(key)) {
    map.set(key, {
      account_id: line.account_id || null,
      account_name: line.account_name,
      classification: line.classification,
      debit_cents: 0,
      credit_cents: 0,
      balance_cents: 0,
    });
  }
  return map.get(key);
}

export function buildLedger(entries = []) {
  const accountMap = new Map();

  getPostedEntries(entries).forEach((entry) => {
    (entry.lines || []).forEach((rawLine, index) => {
      const line = normalizeLine(rawLine, index);
      const account = getAccountBucket(accountMap, line);
      account.debit_cents += line.debit_cents;
      account.credit_cents += line.credit_cents;
      account.balance_cents += line.debit_cents - line.credit_cents;
    });
  });

  const accounts = [...accountMap.values()].sort((a, b) =>
    a.account_name.localeCompare(b.account_name),
  );

  return {
    accounts,
    totals: {
      debit_cents: accounts.reduce((sum, account) => sum + account.debit_cents, 0),
      credit_cents: accounts.reduce((sum, account) => sum + account.credit_cents, 0),
    },
  };
}

export function buildProfitAndLoss(entries = []) {
  return profitAndLossFromLedger(buildLedger(entries));
}

/**
 * P&L derived from an already-built ledger ({ accounts, totals }). Split out so
 * the Phase 4-1 projection-backed read path can derive P&L over the ledger
 * projection's account balances without re-deriving from raw entries — the
 * derivation depends only on account classification + balances, not the store.
 */
export function profitAndLossFromLedger(ledger = { accounts: [] }) {
  const revenue_accounts = [];
  const expense_accounts = [];

  (ledger.accounts || []).forEach((account) => {
    if (account.classification === 'Revenue') {
      revenue_accounts.push({
        ...account,
        amount_cents: account.credit_cents - account.debit_cents,
      });
    }
    if (account.classification === 'Expense') {
      expense_accounts.push({
        ...account,
        amount_cents: account.debit_cents - account.credit_cents,
      });
    }
  });

  const revenue_cents = revenue_accounts.reduce((sum, account) => sum + account.amount_cents, 0);
  const expense_cents = expense_accounts.reduce((sum, account) => sum + account.amount_cents, 0);

  return {
    revenue_accounts,
    expense_accounts,
    totals: {
      revenue_cents,
      expense_cents,
      net_income_cents: revenue_cents - expense_cents,
    },
  };
}

export function buildBalanceSheet(entries = []) {
  return balanceSheetFromLedger(buildLedger(entries));
}

/**
 * Balance sheet derived from an already-built ledger ({ accounts, totals }).
 * Split out for the Phase 4-1 projection-backed read path (see
 * profitAndLossFromLedger).
 */
export function balanceSheetFromLedger(ledger = { accounts: [] }) {
  const assets = [];
  const liabilities = [];
  const equity = [];

  (ledger.accounts || []).forEach((account) => {
    if (account.classification === 'Asset') {
      assets.push({ ...account, amount_cents: account.debit_cents - account.credit_cents });
    }
    if (account.classification === 'Liability') {
      liabilities.push({ ...account, amount_cents: account.credit_cents - account.debit_cents });
    }
    if (account.classification === 'Equity') {
      equity.push({ ...account, amount_cents: account.credit_cents - account.debit_cents });
    }
  });

  const assets_cents = assets.reduce((sum, account) => sum + account.amount_cents, 0);
  const liabilities_cents = liabilities.reduce((sum, account) => sum + account.amount_cents, 0);
  const equity_cents = equity.reduce((sum, account) => sum + account.amount_cents, 0);

  return {
    assets,
    liabilities,
    equity,
    totals: {
      assets_cents,
      liabilities_cents,
      equity_cents,
      // R-3: Expose the fundamental accounting equation check. Posted data that
      // fails this indicates a ledger integrity bug — surfacing it allows callers
      // to detect corruption rather than silently consuming imbalanced sheets.
      is_balanced: assets_cents === liabilities_cents + equity_cents,
    },
  };
}

export function createReversalDraft(entry, overrides = {}) {
  const sourceEntry = entry || {};
  const reversedLines = (sourceEntry.lines || []).map((line, index) => {
    const normalized = normalizeLine(line, index);
    return {
      ...normalized,
      id: `${normalized.id}_reversal`,
      debit_cents: normalized.credit_cents,
      credit_cents: normalized.debit_cents,
    };
  });

  return {
    id: overrides.id || `journal_${randomUUID()}`,
    tenant_id: overrides.tenant_id || sourceEntry.tenant_id,
    source_type: 'journal_reversal',
    source_id: sourceEntry.id || null,
    memo: overrides.memo || `Reversal of ${sourceEntry.id || 'journal entry'}`,
    currency: overrides.currency || sourceEntry.currency || 'usd',
    status: overrides.status || 'pending_approval',
    reversal_of: sourceEntry.id || null,
    created_by: overrides.created_by || null,
    braid_trace_id: overrides.braid_trace_id || null,
    // R-2: Propagate ai_generated from the source entry when the override does not
    // explicitly set it. Previous code used `=== true`, which silently dropped the
    // flag for AI-generated source entries, corrupting the audit trail.
    ai_generated: overrides.ai_generated ?? sourceEntry.ai_generated ?? false,
    governance_policy_snapshot: overrides.governance_policy_snapshot || {},
    lines: reversedLines,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
  };
}
