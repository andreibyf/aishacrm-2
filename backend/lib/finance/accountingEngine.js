export const FINANCE_ACTIONS = Object.freeze({
  CREATE_INVOICE_DRAFT: 'finance.invoice.create_draft',
  POST_LEDGER_ENTRY: 'finance.ledger.post',
  APPROVE_PAYMENT: 'finance.payment.approve',
  ISSUE_REFUND: 'finance.refund.issue',
});

export const AI_BLOCKED_ACTIONS = new Set([
  FINANCE_ACTIONS.POST_LEDGER_ENTRY,
  FINANCE_ACTIONS.APPROVE_PAYMENT,
  FINANCE_ACTIONS.ISSUE_REFUND,
]);

export function validateJournalEntry(entry) {
  if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 2) {
    return {
      balanced: false,
      debitTotal: 0,
      creditTotal: 0,
      errors: ['journal entry requires at least two lines'],
    };
  }

  const debitTotal = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const creditTotal = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const errors = [];

  for (const line of entry.lines) {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (!line.account) errors.push('journal line account is required');
    if (!line.classification) errors.push('journal line classification is required');
    if (debit < 0 || credit < 0) errors.push('journal line amounts cannot be negative');
    if (debit > 0 && credit > 0) errors.push('journal line cannot have both debit and credit');
    if (debit === 0 && credit === 0) errors.push('journal line must include debit or credit');
  }

  if (Math.abs(debitTotal - creditTotal) >= 0.001) {
    errors.push('debits must equal credits');
  }

  return {
    balanced: errors.length === 0,
    debitTotal,
    creditTotal,
    errors,
  };
}

export function assertBalancedJournalEntry(entry) {
  const validation = validateJournalEntry(entry);
  if (!validation.balanced) {
    const err = new Error(`Invalid journal entry: ${validation.errors.join('; ')}`);
    err.code = 'FINANCE_JOURNAL_UNBALANCED';
    err.validation = validation;
    throw err;
  }
  return validation;
}

export function createInvoiceDraftJournalEntry({
  tenant_id,
  opportunity_id,
  customer_id,
  amount_cents,
  currency = 'usd',
  actor_id,
  request_id,
}) {
  if (!tenant_id) throw new Error('tenant_id is required');
  if (!amount_cents || Number(amount_cents) <= 0) throw new Error('amount_cents must be greater than 0');

  const amount = Number(amount_cents);
  const entry = {
    id: `je_${Date.now()}`,
    tenant_id,
    source_type: 'crm.opportunity.closed_won',
    source_id: opportunity_id || null,
    customer_id: customer_id || null,
    memo: 'Draft invoice journal generated from closed opportunity',
    currency,
    status: 'draft_pending_approval',
    actor_id: actor_id || null,
    request_id: request_id || null,
    lines: [
      {
        account: 'Accounts Receivable',
        classification: 'Asset',
        statement: 'balanceSheet',
        debit: amount,
        credit: 0,
      },
      {
        account: 'Revenue',
        classification: 'Revenue',
        statement: 'profitLoss',
        debit: 0,
        credit: amount,
      },
    ],
  };

  assertBalancedJournalEntry(entry);
  return entry;
}

export function createReversalJournalEntry(entry, { actor_id, request_id } = {}) {
  if (!entry) throw new Error('journal entry is required');
  if (!['posted', 'approved'].includes(entry.status)) {
    const err = new Error('only approved or posted journal entries can be reversed');
    err.code = 'FINANCE_REVERSAL_INVALID_STATUS';
    throw err;
  }

  const reversal = {
    ...entry,
    id: `je_reversal_${Date.now()}`,
    source_type: 'finance.journal.reversal',
    source_id: entry.id,
    memo: `Reversal of ${entry.id}: ${entry.memo || ''}`.trim(),
    status: 'pending_approval',
    reversal_of: entry.id,
    actor_id: actor_id || null,
    request_id: request_id || null,
    lines: entry.lines.map((line) => ({
      ...line,
      debit: Number(line.credit || 0),
      credit: Number(line.debit || 0),
    })),
  };

  assertBalancedJournalEntry(reversal);
  return reversal;
}

export function deriveLedgerRows(entries = []) {
  return entries.flatMap((entry) =>
    entry.lines.map((line, index) => ({
      tenant_id: entry.tenant_id,
      journal_entry_id: entry.id,
      line_number: index + 1,
      account: line.account,
      classification: line.classification,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      source_type: entry.source_type,
      source_id: entry.source_id,
      status: entry.status,
      currency: entry.currency || 'usd',
      ai_generated: Boolean(entry.ai_generated),
    })),
  );
}

export function deriveAccountTotals(entries = []) {
  return entries.flatMap((entry) => entry.lines).reduce((acc, line) => {
    const creditNormal = ['Revenue', 'Liability', 'Equity'].includes(line.classification);
    const signed = creditNormal
      ? Number(line.credit || 0) - Number(line.debit || 0)
      : Number(line.debit || 0) - Number(line.credit || 0);
    acc[line.account] = (acc[line.account] || 0) + signed;
    return acc;
  }, {});
}

export function deriveProfitLoss(entries = []) {
  const totals = deriveAccountTotals(entries);
  const revenue = totals.Revenue || 0;
  const costOfServices = -(totals['Cost of Services'] || 0);
  const operatingExpenses = -(totals['Operating Expenses'] || 0);
  const grossProfit = revenue + costOfServices;
  const netIncome = grossProfit + operatingExpenses;

  return [
    { category: 'Revenue', amount_cents: revenue },
    { category: 'Cost of Services', amount_cents: costOfServices },
    { category: 'Gross Profit', amount_cents: grossProfit },
    { category: 'Operating Expenses', amount_cents: operatingExpenses },
    { category: 'Net Income', amount_cents: netIncome },
  ];
}

export function deriveBalanceSheet(entries = []) {
  const totals = deriveAccountTotals(entries);
  const netIncome = deriveProfitLoss(entries).find((row) => row.category === 'Net Income')?.amount_cents || 0;

  return [
    { section: 'Assets', account: 'Cash', amount_cents: totals.Cash || 0 },
    { section: 'Assets', account: 'Accounts Receivable', amount_cents: totals['Accounts Receivable'] || 0 },
    { section: 'Liabilities', account: 'Accounts Payable', amount_cents: -(totals['Accounts Payable'] || 0) },
    { section: 'Equity', account: 'Retained Earnings', amount_cents: -netIncome },
  ];
}

export function evaluateAiFinanceAction({ action, actor_type }) {
  const isAiActor = actor_type === 'ai_agent';
  const blocked = isAiActor && AI_BLOCKED_ACTIONS.has(action);
  return {
    allowed: !blocked,
    blocked,
    reason: blocked ? 'AI actors cannot perform restricted financial writes or money movement' : 'allowed',
  };
}
