/**
 * chartOfAccounts.js — Finance COA Slice 1 (PR #643 design §4 / plan Task 1).
 *
 * Pure, mode-agnostic chart-of-accounts logic: the baseline seed, account-key
 * normalization, reserved-range code generation, and the resolve-or-create
 * resolver. No I/O — callers (in-memory bucket / persistent `finance.accounts`
 * store) own persistence.
 *
 * Account identity is keyed on `account_id` when present, else a normalized
 * `classification:name` (the same emergent key the ledger projection falls back
 * to). Wiring this in stops account codes rendering "—" and stops "Cash"/"cash"
 * fragmenting into distinct accounts.
 */

import { createHash } from 'node:crypto';
import { FINANCE_CLASSIFICATIONS } from './accountingEngine.js';

/**
 * Baseline chart (system accounts, `is_system=true`). `account_type` carries the
 * cash discriminator Bridge B (Slice 2) keys on (`Cash`/`Bank`). These special
 * types belong to the seeded baseline ONLY — never assigned by auto-create.
 */
export const DEFAULT_COA = Object.freeze([
  { account_code: '1000', name: 'Cash', classification: 'Asset', account_type: 'Cash' },
  { account_code: '1100', name: 'Accounts Receivable', classification: 'Asset', account_type: 'Receivable' },
  { account_code: '2000', name: 'Accounts Payable', classification: 'Liability', account_type: 'Payable' },
  { account_code: '3000', name: 'Retained Earnings', classification: 'Equity', account_type: 'Equity' },
  { account_code: '4000', name: 'Revenue', classification: 'Revenue', account_type: 'Revenue' },
  { account_code: '5000', name: 'Expenses', classification: 'Expense', account_type: 'Expense' },
  { account_code: '9000', name: 'Uncategorized', classification: 'Asset', account_type: 'Suspense' },
].map(Object.freeze));

// Reserved auto-create code ranges per classification — disjoint from the system
// codes above so an auto-created account never collides with a seeded one.
const AUTO_CODE_RANGE = Object.freeze({
  Asset: [1500, 1599],
  Liability: [2500, 2599],
  Equity: [3500, 3599],
  Revenue: [4500, 4599],
  Expense: [5500, 5599],
});

// `account_type` default for an auto-created account — generic per classification.
// The special seeded types (Cash/Receivable/Payable/Suspense) are NEVER auto-assigned.
const AUTO_ACCOUNT_TYPE = Object.freeze({
  Asset: 'Asset',
  Liability: 'Liability',
  Equity: 'Equity',
  Revenue: 'Revenue',
  Expense: 'Expense',
});

function safeClassification(classification) {
  return FINANCE_CLASSIFICATIONS.includes(classification) ? classification : 'Expense';
}

function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/** Match key: classification-scoped, whitespace-collapsed, case-folded. */
export function normalizeAccountKey(classification, name) {
  return `${safeClassification(classification)}:${normalizeName(name).toLowerCase()}`;
}

function shortTenantHash(tenantId) {
  return createHash('sha1').update(String(tenantId)).digest('hex').slice(0, 8);
}

/** Deterministic id per (tenant, code) — stable across calls for read-your-write + tests. */
export function deterministicAccountId(tenantId, accountCode) {
  return `acct_${shortTenantHash(tenantId)}_${accountCode}`;
}

/** Lowest free code in the classification's reserved auto-create range. */
export function nextCodeForClassification(classification, existingCodes = []) {
  const cls = safeClassification(classification);
  const [lo, hi] = AUTO_CODE_RANGE[cls];
  const used = new Set((existingCodes || []).map((c) => Number(c)));
  for (let code = lo; code <= hi; code += 1) {
    if (!used.has(code)) return String(code);
  }
  throw new Error(`COA auto-create code range exhausted for ${cls} (${lo}-${hi})`);
}

function buildAccount(tenantId, { account_code, name, classification, account_type, is_system }) {
  return {
    id: deterministicAccountId(tenantId, account_code),
    tenant_id: tenantId,
    account_code,
    name,
    classification,
    account_type,
    parent_account_id: null,
    is_system,
    is_active: true,
  };
}

/** The baseline chart for a tenant (deterministic ids; `is_system=true`). */
export function seedAccountsForTenant(tenantId) {
  return DEFAULT_COA.map((a) => buildAccount(tenantId, { ...a, is_system: true }));
}

/**
 * Resolve a journal line to an account over an in-memory account list. Pure —
 * does NOT mutate `accounts`; the caller persists a `created` account.
 *
 * Priority: explicit account_id → explicit account_code → normalized
 * classification:name → auto-create a non-system account.
 *
 * @returns {{ account: object, created: boolean }}
 */
export function resolveAccount({ tenantId, accounts, classification, account_name, account_code, account_id }) {
  const list = Array.isArray(accounts) ? accounts : [];

  if (account_id) {
    const hit = list.find((a) => a.id === account_id);
    if (hit) return { account: hit, created: false };
  }
  if (account_code !== undefined && account_code !== null && account_code !== '') {
    const hit = list.find((a) => a.account_code === String(account_code));
    if (hit) return { account: hit, created: false };
  }

  const cls = safeClassification(classification);
  const key = normalizeAccountKey(cls, account_name);
  const hit = list.find((a) => normalizeAccountKey(a.classification, a.name) === key);
  if (hit) return { account: hit, created: false };

  const code = nextCodeForClassification(cls, list.map((a) => a.account_code));
  const account = buildAccount(tenantId, {
    account_code: code,
    name: normalizeName(account_name) || 'Unnamed',
    classification: cls,
    account_type: AUTO_ACCOUNT_TYPE[cls],
    is_system: false,
  });
  return { account, created: true };
}

export default {
  DEFAULT_COA,
  normalizeAccountKey,
  deterministicAccountId,
  nextCodeForClassification,
  seedAccountsForTenant,
  resolveAccount,
};
