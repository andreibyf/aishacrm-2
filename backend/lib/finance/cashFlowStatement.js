/**
 * cashFlowStatement.js — Cash Flow Bridge B (Slice 2).
 *
 * Pure derivation of a read-only cash-flow STATEMENT from posted finance journal
 * lines on cash/bank accounts. Finance is the source of truth — this reads the
 * tenant's own ledger; it does NOT touch the manual `cash_flow` module.
 *
 * Cash/bank accounts are identified by the COA `account_type` (Slice 1), not by
 * name. Only `posted`/`reversed` entries count — the SAME filter the ledger /
 * balance sheet use (`accountingEngine.js`), so the statement's net cash
 * reconciles to the balance sheet's Cash line. NEVER broaden this filter to
 * approved/pending (that would desync it from the balance sheet).
 *
 * Period totals come from the CASH lines (authoritative). The `by_category`
 * breakdown comes from the contra (non-cash) lines of cash-touching entries: a
 * contra CREDIT ↔ cash inflow, a contra DEBIT ↔ cash outflow, grouped by the
 * contra line's classification (cash from Revenue, cash to Expense, …). For the
 * balanced two-leg entries this system produces, the category sums equal the
 * cash totals.
 */

import { normalizeAccountKey } from './chartOfAccounts.js';

const CASH_ACCOUNT_TYPES = new Set(['Cash', 'Bank']);
const POSTED_STATUSES = new Set(['posted', 'reversed']);

function cents(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<object>} journalEntries
 * @param {Array<object>} accounts  the tenant chart of accounts
 * @returns {{ cash_account_codes: string[], periods: Array, totals: object }}
 */
export function buildCashFlowStatement(journalEntries = [], accounts = []) {
  const list = Array.isArray(accounts) ? accounts : [];

  // A cash account is one the curated COA TYPES as Cash/Bank, OR one whose
  // normalized (classification, name) matches such a curated account. The
  // name-match is anchored to the seeded Cash/Bank accounts — NOT an arbitrary
  // heuristic — so a 'Bank' account that was AUTO-created as a generic `Asset`
  // BEFORE the Bank seed existed (its historical journal lines reference that
  // Asset-typed id) is still recognized as cash and not silently omitted (Codex
  // PR #650 P2). A custom-named bank account ("Operating Account") has no curated
  // namesake and remains out until the deferred editable COA manager (limitation #10).
  const cashKeys = new Set(
    list.filter((a) => CASH_ACCOUNT_TYPES.has(a?.account_type))
      .map((a) => normalizeAccountKey(a.classification, a.name)),
  );
  const isCashAccount = (a) =>
    CASH_ACCOUNT_TYPES.has(a?.account_type) || cashKeys.has(normalizeAccountKey(a?.classification, a?.name));
  const cashAccounts = list.filter(isCashAccount);
  const cashIds = new Set(cashAccounts.map((a) => a.id));
  const cash_account_codes = [...new Set(cashAccounts.map((a) => a.account_code))].sort();

  const periodMap = new Map(); // period -> { inflow_cents, outflow_cents, categories: Map }
  const ensurePeriod = (period) => {
    if (!periodMap.has(period)) {
      periodMap.set(period, { inflow_cents: 0, outflow_cents: 0, categories: new Map() });
    }
    return periodMap.get(period);
  };

  for (const entry of Array.isArray(journalEntries) ? journalEntries : []) {
    if (!POSTED_STATUSES.has(entry?.status)) continue;
    const lines = Array.isArray(entry.lines) ? entry.lines : [];
    const isCash = (l) => l.account_id && cashIds.has(l.account_id);
    const cashLines = lines.filter(isCash);
    if (cashLines.length === 0) continue;

    // Authoritative period totals — the NET cash change for this entry across ALL
    // cash lines. Computing the net (rather than summing each cash line's debit as
    // an inflow and credit as an outflow separately) means an internal cash↔cash
    // transfer (e.g. Debit Bank / Credit Cash, both account_type ∈ {Cash, Bank})
    // nets to zero and does NOT inflate gross inflow/outflow (Codex PR #650 P2).
    let entryNetCents = 0;
    for (const l of cashLines) {
      entryNetCents += cents(l.debit_cents) - cents(l.credit_cents);
    }
    const nonCashLines = lines.filter((l) => !isCash(l));

    // A pure internal cash↔cash transfer (zero net cash effect, no non-cash contra)
    // is not a cash flow — skip it entirely so it adds no (empty) period.
    if (entryNetCents === 0 && nonCashLines.length === 0) continue;

    const period = String(entry.posted_at || entry.created_at || '').slice(0, 7) || 'unknown';
    const p = ensurePeriod(period);

    if (entryNetCents > 0) p.inflow_cents += entryNetCents;
    else if (entryNetCents < 0) p.outflow_cents += -entryNetCents;

    // Contra breakdown — from the non-cash lines.
    for (const l of nonCashLines) {
      const cls = l.classification || 'Uncategorized';
      if (!p.categories.has(cls)) p.categories.set(cls, { inflow_cents: 0, outflow_cents: 0 });
      const cat = p.categories.get(cls);
      cat.inflow_cents += cents(l.credit_cents); // contra credit ↔ cash inflow
      cat.outflow_cents += cents(l.debit_cents); // contra debit ↔ cash outflow
    }
  }

  const periods = [...periodMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([period, v]) => ({
      period,
      inflow_cents: v.inflow_cents,
      outflow_cents: v.outflow_cents,
      net_cents: v.inflow_cents - v.outflow_cents,
      by_category: [...v.categories.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([classification, c]) => ({
          classification,
          inflow_cents: c.inflow_cents,
          outflow_cents: c.outflow_cents,
        })),
    }));

  const totals = periods.reduce(
    (acc, p) => ({
      inflow_cents: acc.inflow_cents + p.inflow_cents,
      outflow_cents: acc.outflow_cents + p.outflow_cents,
      net_cents: acc.net_cents + p.net_cents,
    }),
    { inflow_cents: 0, outflow_cents: 0, net_cents: 0 },
  );

  return { cash_account_codes, periods, totals };
}

export default buildCashFlowStatement;
