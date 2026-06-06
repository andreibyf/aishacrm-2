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
 * Period totals come from the CASH lines (authoritative) — the NET cash change per
 * entry, so internal cash↔cash transfers don't inflate gross. The `by_category`
 * breakdown ATTRIBUTES that net cash to the contra (non-cash) classifications,
 * grouped (cash from Revenue, cash to Expense, …). It is SCALED to the net so it
 * reconciles exactly with the period total: a simple two-leg entry's single contra
 * equals the cash, but an entry mixing cash and non-cash legs on the same side
 * (e.g. Debit Cash 50 + Debit A/R 50 / Credit Revenue 100 → only 50 cash in) must
 * not attribute the full 100 — Σ(by_category) always equals the period inflow/outflow.
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

    // An entry with no NET cash change is not a cash flow — skip it (a pure internal
    // cash↔cash transfer, OR a wash entry whose non-cash legs net out). This is what
    // keeps internal transfers (e.g. Debit Bank / Credit Cash) out of the statement
    // and stops a net-zero entry creating an empty period.
    if (entryNetCents === 0) continue;

    const period = String(entry.posted_at || entry.created_at || '').slice(0, 7) || 'unknown';
    const p = ensurePeriod(period);

    const magnitude = Math.abs(entryNetCents);
    const inflow = entryNetCents > 0;
    if (inflow) p.inflow_cents += magnitude;
    else p.outflow_cents += magnitude;

    // Contra breakdown — attribute the entry's NET cash change across the non-cash
    // (contra) classifications, SCALED so Σ(by_category) reconciles EXACTLY with the
    // period total. For a simple two-leg entry the single contra equals the cash, but
    // an entry mixing cash and non-cash legs on the SAME side (e.g. Debit Cash 50 +
    // Debit A/R 50 / Credit Revenue 100 → only 50 cash in) must NOT attribute the full
    // 100 revenue to cash. Net each contra classification (credit − debit) — those nets
    // sum to entryNetCents — keep the ones contributing in the net cash DIRECTION (the
    // opposite ones are non-cash offsets, e.g. the A/R deferral) and scale them to the
    // cash magnitude with largest-remainder rounding for exact cents (Codex PR #650 P2).
    const catNet = new Map(); // classification -> net cents (credit − debit)
    for (const l of nonCashLines) {
      const cls = l.classification || 'Uncategorized';
      catNet.set(cls, (catNet.get(cls) || 0) + cents(l.credit_cents) - cents(l.debit_cents));
    }
    const dirCats = [...catNet.entries()]
      .map(([cls, net]) => ({ cls, weight: inflow ? net : -net })) // contribution toward the cash magnitude
      .filter((c) => c.weight > 0);
    const weightSum = dirCats.reduce((s, c) => s + c.weight, 0);
    if (weightSum > 0) {
      const alloc = dirCats.map((c) => {
        const exact = (c.weight * magnitude) / weightSum;
        const whole = Math.floor(exact);
        return { cls: c.cls, cents: whole, frac: exact - whole };
      });
      // Largest-remainder: hand the leftover cents to the largest fractional parts so
      // Σ(alloc) === magnitude exactly (no penny lost or invented).
      let remainder = magnitude - alloc.reduce((s, a) => s + a.cents, 0);
      alloc.sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < alloc.length && remainder > 0; i += 1, remainder -= 1) alloc[i].cents += 1;
      for (const a of alloc) {
        if (!p.categories.has(a.cls)) p.categories.set(a.cls, { inflow_cents: 0, outflow_cents: 0 });
        const cat = p.categories.get(a.cls);
        if (inflow) cat.inflow_cents += a.cents;
        else cat.outflow_cents += a.cents;
      }
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
