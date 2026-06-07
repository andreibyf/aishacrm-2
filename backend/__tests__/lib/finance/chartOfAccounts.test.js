import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COA,
  ACCOUNT_TYPES_BY_CLASSIFICATION,
  isValidAccountType,
  buildManualAccount,
  normalizeAccountKey,
  deterministicAccountId,
  autoAccountId,
  nextCodeForClassification,
  seedAccountsForTenant,
  resolveAccount,
} from '../../../lib/finance/chartOfAccounts.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';

describe('chartOfAccounts — normalization & keys', () => {
  test('normalizeAccountKey case-folds + collapses whitespace, scoped by classification', () => {
    const a = normalizeAccountKey('Asset', 'Cash');
    assert.equal(normalizeAccountKey('Asset', 'cash'), a);
    assert.equal(normalizeAccountKey('Asset', '  Cash  '), a);
    assert.equal(normalizeAccountKey('Asset', 'CASH'), a);
    // classification-scoped: Asset:Cash !== Revenue:Cash
    assert.notEqual(normalizeAccountKey('Revenue', 'Cash'), a);
  });

  test('deterministicAccountId is stable for the same tenant + code', () => {
    assert.equal(deterministicAccountId(TENANT, '1000'), deterministicAccountId(TENANT, '1000'));
    assert.notEqual(deterministicAccountId(TENANT, '1000'), deterministicAccountId(TENANT, '1100'));
    assert.notEqual(deterministicAccountId('other-tenant', '1000'), deterministicAccountId(TENANT, '1000'));
  });
});

describe('chartOfAccounts — seed', () => {
  test('seedAccountsForTenant returns the 8 system accounts with deterministic ids', () => {
    const seed = seedAccountsForTenant(TENANT);
    assert.equal(seed.length, DEFAULT_COA.length);
    assert.equal(seed.length, 8);
    const cash = seed.find((a) => a.account_code === '1000');
    assert.equal(cash.name, 'Cash');
    assert.equal(cash.account_type, 'Cash');
    assert.equal(cash.is_system, true);
    assert.equal(cash.id, deterministicAccountId(TENANT, '1000'));
    // seeding twice is identical (deterministic)
    assert.deepEqual(seedAccountsForTenant(TENANT), seed);
  });
});

describe('chartOfAccounts — nextCodeForClassification', () => {
  test('allocates the lowest free code in the reserved range', () => {
    assert.equal(nextCodeForClassification('Revenue', []), '4500');
    assert.equal(nextCodeForClassification('Revenue', ['4500']), '4501');
    assert.equal(nextCodeForClassification('Asset', ['1500', '1502']), '1501');
  });

  test('throws when the reserved range is exhausted', () => {
    const full = Array.from({ length: 100 }, (_, i) => String(5500 + i)); // Expense 5500-5599
    assert.throws(() => nextCodeForClassification('Expense', full), /exhausted/i);
  });
});

describe('chartOfAccounts — account_type curation (Task 1)', () => {
  test('ACCOUNT_TYPES_BY_CLASSIFICATION maps each classification to its curated list', () => {
    assert.deepEqual(ACCOUNT_TYPES_BY_CLASSIFICATION.Asset, ['Asset', 'Cash', 'Bank', 'Receivable', 'Suspense']);
    assert.deepEqual(ACCOUNT_TYPES_BY_CLASSIFICATION.Liability, ['Liability', 'Payable']);
    assert.deepEqual(ACCOUNT_TYPES_BY_CLASSIFICATION.Equity, ['Equity']);
    assert.deepEqual(ACCOUNT_TYPES_BY_CLASSIFICATION.Revenue, ['Revenue']);
    assert.deepEqual(ACCOUNT_TYPES_BY_CLASSIFICATION.Expense, ['Expense']);
  });

  test('isValidAccountType accepts curated type/classification pairs', () => {
    assert.equal(isValidAccountType('Asset', 'Bank'), true);
    assert.equal(isValidAccountType('Asset', 'Cash'), true);
    assert.equal(isValidAccountType('Liability', 'Payable'), true);
  });

  test('isValidAccountType rejects wrong classification or uncurated type', () => {
    assert.equal(isValidAccountType('Revenue', 'Bank'), false); // wrong classification
    assert.equal(isValidAccountType('Asset', 'Checking'), false); // not curated
  });
});

describe('chartOfAccounts — buildManualAccount (Task 2)', () => {
  test('builds a non-system Asset/Bank account with a name-derived id and reserved code', () => {
    const acct = buildManualAccount({
      tenantId: TENANT,
      classification: 'Asset',
      name: 'Operating Account',
      account_type: 'Bank',
      existingCodes: [],
    });
    assert.equal(acct.is_system, false);
    assert.equal(acct.is_active, true);
    assert.equal(acct.classification, 'Asset');
    assert.equal(acct.account_type, 'Bank');
    assert.equal(acct.name, 'Operating Account');
    assert.equal(acct.parent_account_id, null);
    // name-derived id (immutable, concurrency-safe), NOT code-derived
    assert.equal(acct.id, autoAccountId(TENANT, 'Asset', 'Operating Account'));
    // account_code in the Asset reserved auto-create range (1500–1599)
    const codeNum = Number(acct.account_code);
    assert.ok(codeNum >= 1500 && codeNum <= 1599, `code ${acct.account_code} in 1500–1599`);
  });

  test('does not mutate the existingCodes input', () => {
    const existing = ['1500'];
    buildManualAccount({ tenantId: TENANT, classification: 'Asset', name: 'Reserve', account_type: 'Asset', existingCodes: existing });
    assert.deepEqual(existing, ['1500']);
  });

  test('defaults a blank name to "Unnamed" (matches resolveAccount)', () => {
    const acct = buildManualAccount({ tenantId: TENANT, classification: 'Expense', name: '   ', account_type: 'Expense', existingCodes: [] });
    assert.equal(acct.name, 'Unnamed');
  });
});

describe('chartOfAccounts — resolveAccount', () => {
  const seed = seedAccountsForTenant(TENANT);

  test('explicit account_id wins', () => {
    const target = seed.find((a) => a.account_code === '4000');
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed, account_id: target.id,
      classification: 'Asset', account_name: 'whatever',
    });
    assert.equal(created, false);
    assert.equal(account.account_code, '4000');
  });

  test('explicit account_code wins over name', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed, account_code: '1100',
      classification: 'Asset', account_name: 'Mislabeled',
    });
    assert.equal(created, false);
    assert.equal(account.name, 'Accounts Receivable');
  });

  test('matches a seeded account by normalized classification:name', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Revenue', account_name: '  revenue ',
    });
    assert.equal(created, false);
    assert.equal(account.account_code, '4000');
  });

  test('a name miss auto-creates a NON-system account in the reserved range', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Revenue', account_name: 'Consulting Fees',
    });
    assert.equal(created, true);
    assert.equal(account.is_system, false);
    assert.equal(account.account_code, '4500'); // first free in Revenue range
    assert.notEqual(account.account_code, '4000'); // distinct from the seeded Revenue code
    assert.equal(account.classification, 'Revenue');
    // special seeded types are NEVER auto-assigned — generic per classification
    assert.equal(account.account_type, 'Revenue');
    assert.equal(account.name, 'Consulting Fees');
    // name-derived id (concurrency-safe), NOT code-derived (Codex PR #647 P1)
    assert.equal(account.id, autoAccountId(TENANT, 'Revenue', 'Consulting Fees'));
  });

  test('a DUPLICATED account_code is not used as an identifier — falls through (Codex PR #647)', () => {
    // Simulate the persistent concurrent-create residual: two accounts transiently
    // share display code 4500 (distinct name-derived ids).
    const dupList = [
      ...seed,
      { id: 'acct_a', account_code: '4500', name: 'Consulting', classification: 'Revenue', account_type: 'Revenue', is_system: false, is_active: true },
      { id: 'acct_b', account_code: '4500', name: 'Marketing', classification: 'Revenue', account_type: 'Revenue', is_system: false, is_active: true },
    ];
    // a code-only-ish line referencing 4500 must NOT bind by code; it resolves by NAME
    const byName = resolveAccount({ tenantId: TENANT, accounts: dupList, classification: 'Revenue', account_name: 'Consulting', account_code: '4500' });
    assert.equal(byName.account.id, 'acct_a');
    // a fresh name with the ambiguous code auto-creates rather than mis-binding to a dup
    const fresh = resolveAccount({ tenantId: TENANT, accounts: dupList, classification: 'Revenue', account_name: 'Brand New', account_code: '4500' });
    assert.equal(fresh.created, true);
    assert.notEqual(fresh.account.account_code, '4500');
    // a UNIQUE code (seeded) still resolves by code as before
    const unique = resolveAccount({ tenantId: TENANT, accounts: dupList, classification: 'Asset', account_name: 'x', account_code: '1000' });
    assert.equal(unique.created, false);
    assert.equal(unique.account.name, 'Cash');
  });

  test('whitespace-only names reuse one "Unnamed" account — key/id/name aligned (Codex PR #647)', () => {
    const a = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Expense', account_name: '   ' });
    assert.equal(a.created, true);
    assert.equal(a.account.name, 'Unnamed');
    // a second whitespace-only line (account now in the COA) must REUSE it, not re-create
    const b = resolveAccount({
      tenantId: TENANT,
      accounts: [...seed, a.account],
      classification: 'Expense',
      account_name: '\t \n',
    });
    assert.equal(b.created, false);
    assert.equal(b.account.id, a.account.id);
    assert.equal(b.account.account_code, a.account.account_code);
  });

  test('auto-created ids are NAME-derived so two different names never share an id even on the same code', () => {
    // Simulate the concurrent race: both requests see the same pre-write COA and
    // independently allocate the lowest free Revenue code (4500) for DIFFERENT names.
    const a = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Consulting Fees' });
    const b = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Marketing' });
    assert.equal(a.account.account_code, '4500');
    assert.equal(b.account.account_code, '4500'); // same display code (cosmetic)
    assert.notEqual(a.account.id, b.account.id); // but DISTINCT identities — no attribution collision
  });

  test('an auto-created Asset is generic Asset type, not Cash (cash set stays curated)', () => {
    const { account } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Asset', account_name: 'Petty Cash Drawer',
    });
    assert.equal(account.account_type, 'Asset');
    assert.notEqual(account.account_type, 'Cash');
  });

  test('Asset:Cash and Revenue:Cash resolve to distinct accounts (classification-scoped)', () => {
    const asset = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Asset', account_name: 'Cash' });
    const rev = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Cash' });
    assert.equal(asset.created, false); // seeded 1000
    assert.equal(asset.account.account_code, '1000');
    assert.equal(rev.created, true); // no Revenue:Cash seeded → auto-create
    assert.notEqual(rev.account.account_code, '1000');
  });
});
