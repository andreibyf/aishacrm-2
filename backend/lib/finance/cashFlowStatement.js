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
 * Per entry, the reportable cash flow is the movement BACKED BY non-cash legs, capped
 * by the cash that actually moved in each direction:
 *   inflow  = min(Σ non-cash credits, Σ cash-line debits)   — sources, capped by cash in
 *   outflow = min(Σ non-cash debits,  Σ cash-line credits)  — uses,    capped by cash out
 * This (a) excludes a pure internal cash↔cash transfer (no non-cash backing), (b)
 * preserves GROSS flows in a compound entry whose cash legs net to zero but are each
 * backed by a real non-cash leg, and (c) caps an accrual portion (a non-cash leg with no
 * matching cash movement adds nothing). The `by_category` breakdown attributes the
 * reportable inflow across non-cash CREDIT classifications (sources) and the outflow
 * across non-cash DEBIT classifications (uses), scaled so Σ(by_category) reconciles
 * EXACTLY with the period inflow/outflow.
 */

import { normalizeAccountKey } from './chartOfAccounts.js';

const CASH_ACCOUNT_TYPES = new Set(['Cash', 'Bank']);
const POSTED_STATUSES = new Set(['posted', 'reversed']);

function cents(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Distribute `amount` cents across `lines` grouped by classification, weighted by each
 * line's `weightField` (credit_cents for sources/inflow, debit_cents for uses/outflow),
 * scaled by amount/weightTotal, with largest-remainder rounding so the per-category sum
 * equals `amount` EXACTLY. Writes onto `p.categories[cls][targetField]`.
 */
function distributeByCategory(p, lines, weightField, amount, weightTotal, targetField) {
  if (amount <= 0 || weightTotal <= 0) return;
  const weights = new Map(); // classification -> Σ weight
  for (const l of lines) {
    const w = cents(l[weightField]);
    if (w <= 0) continue;
    const cls = l.classification || 'Uncategorized';
    weights.set(cls, (weights.get(cls) || 0) + w);
  }
  const alloc = [...weights.entries()].map(([cls, w]) => {
    const exact = (w * amount) / weightTotal;
    const whole = Math.floor(exact);
    return { cls, cents: whole, frac: exact - whole };
  });
  let remainder = amount - alloc.reduce((s, a) => s + a.cents, 0);
  alloc.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < alloc.length && remainder > 0; i += 1, remainder -= 1) alloc[i].cents += 1;
  for (const a of alloc) {
    if (!p.categories.has(a.cls)) p.categories.set(a.cls, { inflow_cents: 0, outflow_cents: 0 });
    p.categories.get(a.cls)[targetField] += a.cents;
  }
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

    const nonCashLines = lines.filter((l) => !isCash(l));

    // GROSS cash movement on this entry: a cash-line DEBIT is cash received (in), a
    // cash-line CREDIT is cash paid (out).
    let cashIn = 0; // Σ cash-line debits
    let cashOut = 0; // Σ cash-line credits
    for (const l of cashLines) {
      cashIn += cents(l.debit_cents);
      cashOut += cents(l.credit_cents);
    }
    // Non-cash legs: a CREDIT is a source of funds (backs a cash inflow), a DEBIT is a
    // use (backs a cash outflow).
    let sourceTotal = 0; // Σ non-cash credits
    let useTotal = 0; // Σ non-cash debits
    for (const l of nonCashLines) {
      sourceTotal += cents(l.credit_cents);
      useTotal += cents(l.debit_cents);
    }

    // Report the cash flow BACKED BY non-cash legs, capped by the cash that actually
    // moved in that direction. min() does three things at once (Codex PR #650 P2):
    //   (a) excludes a pure internal cash↔cash transfer (e.g. Debit Bank / Credit Cash)
    //       — its cash legs have no non-cash backing, so source/useTotal are 0;
    //   (b) PRESERVES gross flows in a compound entry whose cash legs net to zero but
    //       are each backed by a real non-cash leg (e.g. Debit Cash + Debit Expense /
    //       Credit Revenue + Credit Cash → 100 in from Revenue AND 100 out to Expense);
    //   (c) caps an accrual portion — a non-cash leg with no matching cash movement
    //       (e.g. the A/R in Debit Cash 50 + Debit A/R 50 / Credit Revenue 100) adds
    //       nothing, so only the 50 of real cash is reported.
    const inflowCents = Math.min(sourceTotal, cashIn);
    const outflowCents = Math.min(useTotal, cashOut);
    if (inflowCents === 0 && outflowCents === 0) continue;

    const period = String(entry.posted_at || entry.created_at || '').slice(0, 7) || 'unknown';
    const p = ensurePeriod(period);
    p.inflow_cents += inflowCents;
    p.outflow_cents += outflowCents;

    // by_category — distribute the reportable inflow across the non-cash CREDIT
    // classifications (sources) and the reportable outflow across the non-cash DEBIT
    // classifications (uses), each scaled to the reportable amount with largest-remainder
    // rounding so Σ(by_category) reconciles EXACTLY with the period totals.
    distributeByCategory(p, nonCashLines, 'credit_cents', inflowCents, sourceTotal, 'inflow_cents');
    distributeByCategory(p, nonCashLines, 'debit_cents', outflowCents, useTotal, 'outflow_cents');
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
