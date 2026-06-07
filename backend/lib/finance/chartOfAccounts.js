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
  // Seeded Bank account (Codex PR #650 P2): without it, a tenant posting to a
  // 'Bank' line would auto-create it as a generic `Asset` (auto-create never
  // assigns the curated Cash/Bank types) and the cash-flow statement — which keys
  // on `account_type ∈ {Cash, Bank}` — would silently omit those bank
  // receipts/payments. Seeding Bank makes a 'Bank' line resolve to a real Bank
  // account. (Custom-named bank accounts, e.g. "Operating Account", still resolve
  // to `Asset` and need the deferred editable COA manager to be marked `Bank`.)
  { account_code: '1050', name: 'Bank', classification: 'Asset', account_type: 'Bank' },
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

/**
 * Curated, closed `account_type` enum per classification (design §2). Grounded in
 * the types the baseline DEFAULT_COA seeds plus the generic AUTO_ACCOUNT_TYPE per
 * classification — the editable COA manager may only set a type from this list, and
 * only one valid for the chosen classification (e.g. `Bank` cannot be Revenue). The
 * generic per-classification type is listed first so it reads as the default.
 */
export const ACCOUNT_TYPES_BY_CLASSIFICATION = Object.freeze({
  Asset: Object.freeze(['Asset', 'Cash', 'Bank', 'Receivable', 'Suspense']),
  Liability: Object.freeze(['Liability', 'Payable']),
  Equity: Object.freeze(['Equity']),
  Revenue: Object.freeze(['Revenue']),
  Expense: Object.freeze(['Expense']),
});

/** True iff `accountType` is curated AND valid for `classification`. */
export function isValidAccountType(classification, accountType) {
  const allowed = ACCOUNT_TYPES_BY_CLASSIFICATION[classification];
  return Array.isArray(allowed) && allowed.includes(accountType);
}

function safeClassification(classification) {
  return FINANCE_CLASSIFICATIONS.includes(classification) ? classification : 'Expense';
}

export function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/** Match key: classification-scoped, whitespace-collapsed, case-folded. */
export function normalizeAccountKey(classification, name) {
  return `${safeClassification(classification)}:${normalizeName(name).toLowerCase()}`;
}

// Non-secret deterministic digest used only to derive stable account-id prefixes
// (not for any security purpose). SHA-256 (not SHA-1/MD5) to satisfy static
// analysis; truncated because we only need a short stable token.
function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/** Deterministic id per (tenant, code) — used for the fixed-code SEEDED accounts. */
export function deterministicAccountId(tenantId, accountCode) {
  return `acct_${shortHash(tenantId)}_${accountCode}`;
}

/**
 * Auto-created accounts get a NAME-derived id (unique per tenant + classification
 * + normalized name), NOT a code-derived one (Codex PR #647 P1). Two concurrent
 * persistent writes that auto-create DIFFERENT account names can therefore never
 * collide on the same `account_id` even if the non-atomic lowest-free code
 * allocation hands them the same display `account_code`. Identity + all
 * ledger/line attribution stay correct; under that rare race the display code may
 * cosmetically duplicate until a durable `finance.accounts` materializer
 * (unique `tenant_id, account_code`) reconciles it.
 */
export function autoAccountId(tenantId, classification, name) {
  return `acct_${shortHash(tenantId)}_a_${shortHash(normalizeAccountKey(classification, name))}`;
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

function buildAccount(tenantId, { account_code, name, classification, account_type, is_system, id }) {
  return {
    id: id || deterministicAccountId(tenantId, account_code),
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
    // Only treat a code as an identifier when it UNAMBIGUOUSLY maps to one account
    // (Codex PR #647). Codes are unique within a process, but two concurrent
    // persistent writes can transiently mint the same display code for DIFFERENT
    // names (identity still differs via the name-derived id). A duplicated code
    // can't reliably identify an account, so fall through to name resolution
    // rather than binding to whichever copy `find` hits first. Durable code
    // uniqueness needs the deferred finance.accounts materializer (unique
    // tenant_id, account_code).
    const matches = list.filter((a) => a.account_code === String(account_code));
    if (matches.length === 1) return { account: matches[0], created: false };
  }

  const cls = safeClassification(classification);
  // Apply the fallback display name BEFORE deriving the match key + id, and store
  // that SAME name (Codex PR #647). Otherwise a whitespace-only name keys/ids off
  // "" but is stored as "Unnamed", so the next whitespace-only line never matches
  // the stored account and re-creates a same-id/different-code account.
  const displayName = normalizeName(account_name) || 'Unnamed';
  const key = normalizeAccountKey(cls, displayName);
  const hit = list.find((a) => normalizeAccountKey(a.classification, a.name) === key);
  if (hit) return { account: hit, created: false };

  const code = nextCodeForClassification(cls, list.map((a) => a.account_code));
  const account = buildAccount(tenantId, {
    account_code: code,
    name: displayName,
    classification: cls,
    account_type: AUTO_ACCOUNT_TYPE[cls],
    is_system: false,
    // name-derived id (not code-derived) — concurrency-safe identity, see autoAccountId.
    id: autoAccountId(tenantId, cls, displayName),
  });
  return { account, created: true };
}

/**
 * Pure factory for a MANUALLY-created account (editable COA manager, design §2).
 * Mints a name-derived id (immutable, concurrency-safe per Codex #647) — never a
 * code-derived one — and an `account_code` from the classification's reserved
 * auto-create range. The display name falls back to 'Unnamed' for a blank name,
 * matching resolveAccount so the same name keys/ids/stores consistently.
 *
 * Does NOT mutate inputs and does NOT validate `account_type` — type/per-
 * classification validation (`isValidAccountType`) is the caller's job.
 *
 * @returns {object} a new non-system, active account object
 */
export function buildManualAccount({ tenantId, classification, name, account_type, existingCodes }) {
  const cls = safeClassification(classification);
  const displayName = normalizeName(name) || 'Unnamed';
  const code = nextCodeForClassification(cls, Array.isArray(existingCodes) ? existingCodes : []);
  return {
    id: autoAccountId(tenantId, cls, displayName),
    tenant_id: tenantId,
    account_code: code,
    name: displayName,
    classification: cls,
    account_type,
    parent_account_id: null,
    is_system: false,
    is_active: true,
  };
}

export default {
  DEFAULT_COA,
  ACCOUNT_TYPES_BY_CLASSIFICATION,
  isValidAccountType,
  buildManualAccount,
  normalizeName,
  normalizeAccountKey,
  deterministicAccountId,
  autoAccountId,
  nextCodeForClassification,
  seedAccountsForTenant,
  resolveAccount,
};
